import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import {
  decodeHeaderHints,
  encodeHeaderHints,
  parseResolverEndpoints,
  resolveFromEndpoints,
  rewriteManifest
} from './media.js';
import { buildResolversFromConfig, resolveWithConnectorsDetailed } from './resolvers/index.js';
import { createNetworkStrategy, parseGatewayConfig, parseUaPool } from './networking.js';

const PORT = Number(process.env.PORT || 8080);
const catalogUrl = new URL('../data/legal_catalog.json', import.meta.url);
const popularityCatalogUrl = new URL('../data/catalog.json', import.meta.url);
const resolverEndpoints = parseResolverEndpoints(process.env.RESOLVER_ENDPOINTS || '');
const allowedHosts = new Set((process.env.PROXY_ALLOW_HOSTS || '').split(',').map((v) => v.trim()).filter(Boolean));
const resolverCacheTtlMs = Number(process.env.RESOLVER_CACHE_TTL_MS || 60 * 60 * 1000);
const healthIntervalMs = Number(process.env.HEALTH_CHECK_INTERVAL_MS || 10 * 60 * 1000);
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || '';
const connectorConfigJson = process.env.RESOLVER_CONNECTORS_JSON || '';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const outboundGatewaysJson = process.env.OUTBOUND_GATEWAYS_JSON || '';
const userAgentPoolRaw = process.env.USER_AGENT_POOL || '';
const adminPassword = process.env.ADMIN_CONSOLE_PASSWORD || '';

const resolverCache = new Map();
const refreshQueue = new Set();
const sourceConnectors = buildResolversFromConfig(connectorConfigJson);
const networkStrategy = createNetworkStrategy({
  uaPool: parseUaPool(userAgentPoolRaw),
  gateways: parseGatewayConfig(outboundGatewaysJson)
});

const connectorStatus = new Map();
const endpointStatus = new Map();
const traffic = {
  activeStreams: 0,
  totalBytes: 0,
  buckets: []
};
const activeViewers = new Map();

function cors(headers = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Range,Authorization,X-Admin-Password',
    ...headers
  };
}

function json(res, status, payload) {
  res.writeHead(status, cors({ 'Content-Type': 'application/json' }));
  res.end(JSON.stringify(payload));
}

function isAllowedTarget(targetUrl) {
  if (!allowedHosts.size) return true;
  try {
    return allowedHosts.has(new URL(targetUrl).host);
  } catch {
    return false;
  }
}

function sourceCacheGet(id) {
  const row = resolverCache.get(id);
  if (!row) return null;
  if (Date.now() - row.updatedAt > resolverCacheTtlMs) {
    resolverCache.delete(id);
    return null;
  }
  return row;
}

function sourceCacheSet(id, resolved) {
  resolverCache.set(id, {
    ...resolved,
    updatedAt: Date.now()
  });
}

function recordStatus(map, source, status) {
  const current = map.get(source) || { ok: 0, forbidden: 0, notFound: 0, errors: 0, lastStatus: 'never' };
  if (status === 'ok' || status === 'http_200') current.ok += 1;
  else if (status === 'http_403') current.forbidden += 1;
  else if (status === 'http_404') current.notFound += 1;
  else current.errors += 1;
  current.lastStatus = status;
  current.lastCheckedAt = new Date().toISOString();
  map.set(source, current);
}

function addTrafficBytes(bytes) {
  traffic.totalBytes += bytes;
  const minute = Math.floor(Date.now() / 60000) * 60000;
  const last = traffic.buckets[traffic.buckets.length - 1];
  if (last && last.minute === minute) {
    last.bytes += bytes;
  } else {
    traffic.buckets.push({ minute, bytes });
    if (traffic.buckets.length > 240) traffic.buckets.shift();
  }
}

function markViewer(req) {
  const key = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  activeViewers.set(key, Date.now());
}

function activeViewerCount(windowMs = 45_000) {
  const now = Date.now();
  for (const [k, t] of activeViewers.entries()) {
    if (now - t > windowMs) activeViewers.delete(k);
  }
  return activeViewers.size;
}

function isAdmin(req) {
  if (!adminPassword) return false;
  const token = req.headers['x-admin-password'];
  return typeof token === 'string' && token === adminPassword;
}

async function fetchUpstream(targetUrl, type, extraHeaders = {}) {
  const gateway = networkStrategy.nextGateway();
  const ua = networkStrategy.nextUa();

  let url = targetUrl;
  let gatewayHeaders = {};
  if (gateway) {
    const routed = networkStrategy.gatewayUrl(gateway, targetUrl, type);
    if (routed) {
      url = routed;
      gatewayHeaders = gateway.headers || {};
    }
  }

  return fetch(url, {
    headers: {
      'User-Agent': ua,
      ...gatewayHeaders,
      ...extraHeaders
    }
  });
}

async function sendDiscordAlert(message, metadata = {}) {
  if (!discordWebhookUrl) return;
  try {
    await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Rakas Resolver',
        content: `⚠️ ${message}`,
        embeds: [{ title: 'Resolver Failure', fields: Object.entries(metadata).map(([name, value]) => ({ name, value: String(value), inline: false })) }]
      })
    });
  } catch {
    // avoid crash on webhook failures
  }
}

async function resolveAndCache(metadataId, { force = false, season = 1, episode = 1 } = {}) {
  if (!force) {
    const cached = sourceCacheGet(metadataId);
    if (cached) return { ok: true, ...cached, attempts: [] };
  }

  const connectorOutcome = await resolveWithConnectorsDetailed(sourceConnectors, { metadataId, season, episode });
  for (const attempt of connectorOutcome.attempts) recordStatus(connectorStatus, attempt.source, attempt.status);

  if (connectorOutcome.result) {
    const headersToken = encodeHeaderHints(connectorOutcome.result.headers || {});
    const proxyUrl = `/api/proxy/manifest?url=${encodeURIComponent(connectorOutcome.result.manifestUrl)}${headersToken ? `&h=${headersToken}` : ''}`;
    sourceCacheSet(metadataId, {
      source: connectorOutcome.result.source,
      manifestUrl: connectorOutcome.result.manifestUrl,
      headers: connectorOutcome.result.headers || {},
      proxyUrl
    });
    return { ok: true, source: connectorOutcome.result.source, manifestUrl: connectorOutcome.result.manifestUrl, headers: connectorOutcome.result.headers || {}, attempts: connectorOutcome.attempts, proxyUrl };
  }

  const result = await resolveFromEndpoints(metadataId, resolverEndpoints);
  for (const attempt of result.attempts) recordStatus(endpointStatus, attempt.source, attempt.status);

  if (result.ok) {
    recordStatus(endpointStatus, result.source, 'http_200');
    const headersToken = encodeHeaderHints(result.headers);
    const proxyUrl = `/api/proxy/manifest?url=${encodeURIComponent(result.manifestUrl)}${headersToken ? `&h=${headersToken}` : ''}`;
    sourceCacheSet(metadataId, {
      source: result.source,
      manifestUrl: result.manifestUrl,
      headers: result.headers,
      proxyUrl
    });
    return { ...result, proxyUrl };
  }

  const hasHardNotFound = result.attempts.some((a) => a.status === 'http_403' || a.status === 'http_404');
  if (hasHardNotFound && !force) {
    return resolveAndCache(metadataId, { force: true, season, episode });
  }

  await sendDiscordAlert('All resolver sources failed for metadata id', {
    metadataId,
    attempts: JSON.stringify(result.attempts)
  });

  return result;
}

async function topPopularMetadataIds(limit = 20) {
  try {
    const text = await readFile(popularityCatalogUrl, 'utf-8');
    const items = JSON.parse(text);
    return items
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, limit)
      .map((i) => i.id);
  } catch {
    return [];
  }
}

async function runHealthCheckCycle() {
  const ids = new Set(await topPopularMetadataIds(20));
  for (const id of refreshQueue) ids.add(id);
  refreshQueue.clear();

  for (const metadataId of ids) {
    await resolveAndCache(metadataId, { force: true });
  }
}

async function serveCatalog(res) {
  const text = await readFile(catalogUrl, 'utf-8');
  const items = JSON.parse(text);
  const platforms = [...new Set(items.flatMap((item) => item.platforms))].sort();
  const genres = [...new Set(items.flatMap((item) => item.genres))].sort();

  json(res, 200, { items, platforms, genres });
}

async function serveResolver(reqUrl, res) {
  const metadataId = reqUrl.searchParams.get('id');
  const season = reqUrl.searchParams.get('season') || '1';
  const episode = reqUrl.searchParams.get('episode') || '1';
  if (!metadataId) return json(res, 400, { error: 'Missing id query parameter' });

  const result = await resolveAndCache(metadataId, { season, episode });
  if (!result.ok) return json(res, 502, { error: 'No active source available', attempts: result.attempts });

  return json(res, 200, {
    metadataId,
    source: result.source,
    manifestUrl: result.manifestUrl,
    proxyUrl: result.proxyUrl,
    attempts: result.attempts
  });
}

async function serveReport(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body = {};
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
  } catch {
    return json(res, 400, { error: 'Invalid JSON' });
  }

  const metadataId = body.metadataId;
  if (!metadataId) return json(res, 400, { error: 'metadataId is required' });

  refreshQueue.add(metadataId);
  resolverCache.delete(metadataId);
  resolveAndCache(metadataId, { force: true }).catch(() => {});

  return json(res, 202, { ok: true, queued: metadataId });
}

async function supabaseRequest(path, { method = 'GET', body, params = '' } = {}) {
  if (!supabaseUrl || !supabaseServiceKey) {
    return { ok: false, status: 503, data: { error: 'Supabase not configured' } };
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}${params}`, {
    method,
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'resolution=merge-duplicates,return=representation' : 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  return { ok: response.ok, status: response.status, data };
}

async function servePlaybackGet(reqUrl, res) {
  const profileId = reqUrl.searchParams.get('profileId');
  if (!profileId) return json(res, 400, { error: 'profileId is required' });

  const result = await supabaseRequest('playback_state', { params: `?profile_id=eq.${encodeURIComponent(profileId)}&select=*` });
  return json(res, result.status, result.data);
}

async function servePlaybackUpsert(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
  } catch {
    return json(res, 400, { error: 'Invalid JSON' });
  }

  if (!body.profile_id || !body.metadata_id) {
    return json(res, 400, { error: 'profile_id and metadata_id are required' });
  }

  const payload = {
    profile_id: body.profile_id,
    metadata_id: body.metadata_id,
    season: body.season ?? 1,
    episode: body.episode ?? 1,
    position_seconds: body.position_seconds ?? 0,
    status: body.status || 'watching',
    heartbeat_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    device_id: body.device_id || null
  };

  const result = await supabaseRequest('playback_state', {
    method: 'POST',
    params: '?on_conflict=profile_id,metadata_id',
    body: payload
  });

  return json(res, result.status, result.data);
}

async function serveManifestProxy(reqUrl, res) {
  const targetUrl = reqUrl.searchParams.get('url');
  const h = reqUrl.searchParams.get('h') || '';
  if (!targetUrl) return json(res, 400, { error: 'Missing url query parameter' });
  if (!isAllowedTarget(targetUrl)) return json(res, 403, { error: 'Target host is not allowed' });

  const headerHints = decodeHeaderHints(h);
  let upstream;
  try {
    upstream = await fetchUpstream(targetUrl, 'manifest', headerHints);
  } catch (err) {
    return json(res, 502, { error: `Manifest fetch failed: ${err.message}` });
  }

  if (!upstream.ok) return json(res, upstream.status, { error: `Manifest upstream returned ${upstream.status}` });

  const manifest = await upstream.text();
  const rewritten = rewriteManifest(manifest, targetUrl, h);
  res.writeHead(200, cors({ 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' }));
  res.end(rewritten);
}

async function serveSegmentProxy(req, reqUrl, res) {
  const targetUrl = reqUrl.searchParams.get('url');
  const h = reqUrl.searchParams.get('h') || '';
  if (!targetUrl) return json(res, 400, { error: 'Missing url query parameter' });
  if (!isAllowedTarget(targetUrl)) return json(res, 403, { error: 'Target host is not allowed' });

  const headerHints = decodeHeaderHints(h);
  let upstream;
  try {
    upstream = await fetchUpstream(targetUrl, 'segment', {
      ...(req.headers.range ? { Range: req.headers.range } : {}),
      ...headerHints
    });
  } catch (err) {
    return json(res, 502, { error: `Segment fetch failed: ${err.message}` });
  }

  if (!upstream.ok && upstream.status !== 206) return json(res, upstream.status, { error: `Segment upstream returned ${upstream.status}` });

  traffic.activeStreams += 1;
  markViewer(req);
  let settled = false;
  const cleanup = () => {
    if (settled) return;
    settled = true;
    traffic.activeStreams = Math.max(0, traffic.activeStreams - 1);
  };
  res.on('close', cleanup);
  res.on('finish', cleanup);

  const headers = cors({ 'Cache-Control': 'public, max-age=60' });
  const contentLength = upstream.headers.get('content-length');
  const contentRange = upstream.headers.get('content-range');
  const contentType = upstream.headers.get('content-type');
  if (contentLength) headers['Content-Length'] = contentLength;
  if (contentRange) headers['Content-Range'] = contentRange;
  if (contentType) headers['Content-Type'] = contentType;

  res.writeHead(upstream.status, headers);

  if (!upstream.body) {
    res.end();
    return;
  }

  let bytes = 0;
  const stream = Readable.fromWeb(upstream.body);
  stream.on('data', (chunk) => {
    bytes += chunk.length;
    res.write(chunk);
  });
  stream.on('end', () => {
    addTrafficBytes(bytes);
    res.end();
  });
  stream.on('error', () => {
    res.destroy();
  });
}

async function serveAdminStatus(req, res) {
  if (!isAdmin(req)) return json(res, 401, { error: 'Unauthorized' });

  json(res, 200, {
    connectors: Object.fromEntries(connectorStatus.entries()),
    endpoints: Object.fromEntries(endpointStatus.entries()),
    traffic: {
      activeStreams: traffic.activeStreams,
      activeViewers: activeViewerCount(),
      totalBytes: traffic.totalBytes,
      buckets: traffic.buckets
    }
  });
}

async function serveAdminRefresh(req, res) {
  if (!isAdmin(req)) return json(res, 401, { error: 'Unauthorized' });

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body = {};
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
  } catch {
    return json(res, 400, { error: 'Invalid JSON' });
  }

  if (!body.metadataId) return json(res, 400, { error: 'metadataId is required' });
  resolverCache.delete(body.metadataId);
  refreshQueue.add(body.metadataId);
  const result = await resolveAndCache(body.metadataId, {
    force: true,
    season: body.season || 1,
    episode: body.episode || 1
  });

  return json(res, 200, { ok: result.ok, metadataId: body.metadataId, attempts: result.attempts || [] });
}

async function staticFile(pathname, res) {
  const filePath = pathname === '/' ? '/index.html' : pathname;
  const full = new URL(`../public${filePath}`, import.meta.url);

  try {
    const content = await readFile(full);
    const ext = extname(filePath);
    const type =
      ext === '.html' ? 'text/html; charset=utf-8' :
      ext === '.js' ? 'text/javascript; charset=utf-8' :
      ext === '.css' ? 'text/css; charset=utf-8' :
      ext === '.json' ? 'application/json; charset=utf-8' :
      ext === '.webmanifest' ? 'application/manifest+json; charset=utf-8' :
      'application/octet-stream';
    res.writeHead(200, cors({ 'Content-Type': type }));
    res.end(content);
  } catch {
    json(res, 404, { error: 'Not found' });
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors());
    res.end();
    return;
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    if (url.pathname === '/api/catalog' && req.method === 'GET') return serveCatalog(res);
    if (url.pathname === '/api/resolve' && req.method === 'GET') return serveResolver(url, res);
    if (url.pathname === '/api/report' && req.method === 'POST') return serveReport(req, res);
    if (url.pathname === '/api/playback-state' && req.method === 'GET') return servePlaybackGet(url, res);
    if (url.pathname === '/api/playback-state' && req.method === 'POST') return servePlaybackUpsert(req, res);
    if (url.pathname === '/api/playback-heartbeat' && req.method === 'POST') return servePlaybackUpsert(req, res);
    if (url.pathname === '/api/proxy/manifest' && req.method === 'GET') return serveManifestProxy(url, res);
    if (url.pathname === '/api/proxy/segment' && req.method === 'GET') return serveSegmentProxy(req, url, res);
    if (url.pathname === '/api/admin/status' && req.method === 'GET') return serveAdminStatus(req, res);
    if (url.pathname === '/api/admin/refresh' && req.method === 'POST') return serveAdminRefresh(req, res);
    if (url.pathname === '/admin-console' && req.method === 'GET') return staticFile('/admin-console.html', res);

    await staticFile(url.pathname, res);
  } catch (err) {
    json(res, 500, { error: `Internal server error: ${err.message}` });
  }
});

setInterval(() => {
  runHealthCheckCycle().catch(() => {});
}, healthIntervalMs);

runHealthCheckCycle().catch(() => {});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Rakas legal discovery prototype listening on http://localhost:${PORT}`);
});
