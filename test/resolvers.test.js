import test from 'node:test';
import assert from 'node:assert/strict';

import { buildResolversFromConfig, resolveWithConnectors, resolveWithConnectorsDetailed } from '../src/resolvers/index.js';
import { createGenericProviderResolver } from '../src/resolvers/genericProviderResolver.js';

test('buildResolversFromConfig creates generic connector', () => {
  const connectors = buildResolversFromConfig(JSON.stringify([
    { type: 'generic', name: 'g1', endpointTemplate: 'https://api.local/x?tmdb_id={tmdb_id}&season={season}&episode={episode}' }
  ]));

  assert.equal(connectors.length, 1);
  assert.equal(connectors[0].name, 'g1');
});

test('generic resolver extracts manifest url from sources array', async () => {
  const resolver = createGenericProviderResolver({
    name: 'generic-test',
    endpointTemplate: 'https://api.local/source?tmdb_id={tmdb_id}&season={season}&episode={episode}'
  });

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    sources: [{ file: 'https://cdn.example/video.m3u8' }]
  }), { status: 200 });

  try {
    const result = await resolver.resolve({ metadataId: 'tmdb-550', season: 1, episode: 2 });
    assert.equal(result.source, 'generic-test');
    assert.equal(result.manifestUrl, 'https://cdn.example/video.m3u8');
  } finally {
    global.fetch = originalFetch;
  }
});

test('resolveWithConnectors returns first successful connector', async () => {
  const connectors = [
    { name: 'a', resolve: async () => null },
    { name: 'b', resolve: async () => ({ source: 'b', manifestUrl: 'https://ok.m3u8', headers: {} }) }
  ];

  const result = await resolveWithConnectors(connectors, { metadataId: 'tmdb-1', season: 1, episode: 1 });
  assert.equal(result.source, 'b');
});


test('resolveWithConnectorsDetailed captures status attempts', async () => {
  const connectors = [
    { name: 'x', resolve: async () => ({ errorStatus: 403 }) },
    { name: 'y', resolve: async () => ({ source: 'y', manifestUrl: 'https://ok.m3u8', headers: {} }) }
  ];
  const result = await resolveWithConnectorsDetailed(connectors, { metadataId: 'tmdb-1', season: 1, episode: 1 });
  assert.equal(result.result.source, 'y');
  assert.deepEqual(result.attempts[0], { source: 'x', status: 'http_403' });
});
