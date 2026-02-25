import { Readable } from 'node:stream';

export function parseResolverEndpoints(rawConfig) {
  if (!rawConfig) return [];
  return rawConfig
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => ({
      name: new URL(entry).host,
      template: entry.includes('{id}') ? entry : `${entry}${entry.includes('?') ? '&' : '?'}id={id}`
    }));
}

function withTimeout(ms = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
}

function buildUrl(template, metadataId) {
  return template.replace('{id}', encodeURIComponent(metadataId));
}

export async function resolveFromEndpoints(metadataId, endpoints, fetchImpl = fetch) {
  const attempts = [];

  for (const endpoint of endpoints) {
    const url = buildUrl(endpoint.template, metadataId);
    const timeout = withTimeout(5000);
    try {
      const response = await fetchImpl(url, {
        signal: timeout.signal,
        headers: { 'User-Agent': 'Rakas-Resolver/1.0', Accept: 'application/json' }
      });
      timeout.clear();

      if (!response.ok) {
        attempts.push({ source: endpoint.name, status: `http_${response.status}` });
        continue;
      }

      const payload = await response.json();
      const status = (payload.status || '').toLowerCase();
      if (status === 'expired' || payload.expired === true) {
        attempts.push({ source: endpoint.name, status: 'expired' });
        continue;
      }

      const manifestUrl = payload.manifestUrl || payload.stream?.manifestUrl;
      if (!manifestUrl) {
        attempts.push({ source: endpoint.name, status: 'no_manifest' });
        continue;
      }

      return {
        ok: true,
        source: endpoint.name,
        manifestUrl,
        headers: payload.headers || payload.stream?.headers || {},
        attempts
      };
    } catch (err) {
      timeout.clear();
      attempts.push({ source: endpoint.name, status: err.name === 'AbortError' ? 'timeout' : 'error' });
    }
  }

  return { ok: false, attempts };
}

export function encodeHeaderHints(headers = {}) {
  return Buffer.from(JSON.stringify(headers), 'utf-8').toString('base64url');
}

export function decodeHeaderHints(encoded) {
  if (!encoded) return {};
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    const allowed = {};
    for (const key of ['Referer', 'Origin', 'User-Agent', 'Authorization']) {
      if (typeof parsed[key] === 'string' && parsed[key].length < 500) {
        allowed[key] = parsed[key];
      }
    }
    return allowed;
  } catch {
    return {};
  }
}

export function rewriteManifest(manifestText, sourceUrl, headerToken = '') {
  return manifestText
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_, uri) => {
          const absolute = new URL(uri, sourceUrl).toString();
          const route = absolute.includes('.m3u8') ? 'manifest' : 'segment';
          return `URI="/api/proxy/${route}?url=${encodeURIComponent(absolute)}${headerToken ? `&h=${headerToken}` : ''}"`;
        });
      }

      const absolute = new URL(trimmed, sourceUrl).toString();
      const route = absolute.includes('.m3u8') ? 'manifest' : 'segment';
      return `/api/proxy/${route}?url=${encodeURIComponent(absolute)}${headerToken ? `&h=${headerToken}` : ''}`;
    })
    .join('\n');
}

export function pipeWebStreamToNode(response, res, headers = {}) {
  const outHeaders = { ...headers };
  const contentLength = response.headers.get('content-length');
  const contentRange = response.headers.get('content-range');
  const contentType = response.headers.get('content-type');
  if (contentLength) outHeaders['Content-Length'] = contentLength;
  if (contentRange) outHeaders['Content-Range'] = contentRange;
  if (contentType) outHeaders['Content-Type'] = contentType;

  res.writeHead(response.status, outHeaders);
  if (!response.body) {
    res.end();
    return;
  }

  Readable.fromWeb(response.body).pipe(res);
}
