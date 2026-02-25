import { buildContext } from './base.js';
import { createGenericProviderResolver } from './genericProviderResolver.js';
import { createHeadlessBrowserResolver } from './headlessBrowserResolver.js';

export function buildResolversFromConfig(rawConfig) {
  if (!rawConfig) return [];

  let parsed;
  try {
    parsed = JSON.parse(rawConfig);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const resolvers = [];
  for (const entry of parsed) {
    try {
      if (entry.type === 'generic') {
        resolvers.push(createGenericProviderResolver(entry));
      } else if (entry.type === 'headless') {
        resolvers.push(createHeadlessBrowserResolver(entry));
      }
    } catch {
      // Skip invalid connector configs.
    }
  }

  return resolvers;
}

export async function resolveWithConnectorsDetailed(connectors, params) {
  if (!connectors?.length) return { result: null, attempts: [] };

  const context = buildContext(params);
  const attempts = [];

  for (const connector of connectors) {
    try {
      const result = await connector.resolve(context);
      if (result?.manifestUrl) {
        attempts.push({ source: connector.name, status: 'ok' });
        return { result, attempts };
      }

      if (result?.errorStatus) {
        attempts.push({ source: connector.name, status: `http_${result.errorStatus}` });
      } else {
        attempts.push({ source: connector.name, status: 'error' });
      }
    } catch {
      attempts.push({ source: connector.name, status: 'error' });
    }
  }

  return { result: null, attempts };
}

export async function resolveWithConnectors(connectors, params) {
  const detailed = await resolveWithConnectorsDetailed(connectors, params);
  return detailed.result;
}
