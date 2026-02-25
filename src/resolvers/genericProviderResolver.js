import { normalizeResolverResult } from './base.js';

function firstDefined(obj, keys) {
  for (const key of keys) {
    if (obj && typeof obj[key] === 'string' && obj[key]) return obj[key];
  }
  return null;
}

export function createGenericProviderResolver(config) {
  const {
    name = 'generic-provider',
    endpointTemplate,
    timeoutMs = 5000,
    headers = {}
  } = config;

  if (!endpointTemplate) {
    throw new Error(`${name}: endpointTemplate is required`);
  }

  return {
    name,
    async resolve(context) {
      const url = endpointTemplate
        .replace('{tmdb_id}', encodeURIComponent(context.metadataId))
        .replace('{season}', String(context.season || 1))
        .replace('{episode}', String(context.episode || 1));

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          signal: ctrl.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Rakas-GenericResolver/1.0',
            ...headers
          }
        });

        if (!response.ok) return { errorStatus: response.status };
        const payload = await response.json();

        // Supports several common JSON layouts from custom providers.
        const manifestUrl =
          firstDefined(payload, ['manifestUrl', 'm3u8', 'mp4']) ||
          firstDefined(payload?.stream, ['manifestUrl', 'm3u8', 'mp4']) ||
          (Array.isArray(payload?.sources)
            ? firstDefined(payload.sources.find((s) => s?.url?.includes('.m3u8')) || payload.sources[0], ['url', 'file'])
            : null);

        return normalizeResolverResult(
          manifestUrl
            ? {
                manifestUrl,
                headers: payload.headers || payload?.stream?.headers || {},
                meta: { endpointUrl: url }
              }
            : null,
          name
        );
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
