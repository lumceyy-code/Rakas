export function normalizeResolverResult(raw, connectorName) {
  if (!raw) return null;
  if (!raw.manifestUrl || typeof raw.manifestUrl !== 'string') return null;

  return {
    source: connectorName,
    manifestUrl: raw.manifestUrl,
    headers: raw.headers || {},
    meta: raw.meta || {}
  };
}

export function buildContext({ metadataId, season, episode }) {
  return {
    metadataId,
    season: Number(season || 1),
    episode: Number(episode || 1)
  };
}
