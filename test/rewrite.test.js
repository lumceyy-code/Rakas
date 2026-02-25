import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeHeaderHints, encodeHeaderHints, parseResolverEndpoints, resolveFromEndpoints, rewriteManifest } from '../src/media.js';

test('rewriteManifest rewrites segment and nested manifests through proxy', () => {
  const source = 'https://media.example.com/master.m3u8';
  const manifest = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nlevel.m3u8\n#EXTINF:4,\nseg-1.ts';
  const output = rewriteManifest(manifest, source, 'abc');
  assert.match(output, /\/api\/proxy\/manifest\?url=.*level.m3u8.*&h=abc/);
  assert.match(output, /\/api\/proxy\/segment\?url=.*seg-1.ts.*&h=abc/);
});

test('resolveFromEndpoints falls back when first endpoint is expired', async () => {
  const endpoints = [
    { name: 'one', template: 'https://one.test/resolve?id={id}' },
    { name: 'two', template: 'https://two.test/resolve?id={id}' }
  ];

  const fakeFetch = async (url) => {
    if (url.includes('one.test')) {
      return new Response(JSON.stringify({ status: 'expired' }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ status: 'ok', manifestUrl: 'https://cdn.example.com/master.m3u8', headers: { Referer: 'https://app.local' } }),
      { status: 200 }
    );
  };

  const result = await resolveFromEndpoints('tmdb-550', endpoints, fakeFetch);
  assert.equal(result.ok, true);
  assert.equal(result.source, 'two');
  assert.equal(result.manifestUrl, 'https://cdn.example.com/master.m3u8');
  assert.deepEqual(result.attempts, [{ source: 'one', status: 'expired' }]);
});

test('header hints encode/decode keeps allowed headers only', () => {
  const encoded = encodeHeaderHints({ Referer: 'https://x', Origin: 'https://y', Cookie: 'drop-me' });
  const decoded = decodeHeaderHints(encoded);
  assert.equal(decoded.Referer, 'https://x');
  assert.equal(decoded.Origin, 'https://y');
  assert.equal(decoded.Cookie, undefined);
});

test('parseResolverEndpoints expands templates', () => {
  const endpoints = parseResolverEndpoints('https://one.local/path,https://two.local/resolve?id={id}');
  assert.equal(endpoints.length, 2);
  assert.match(endpoints[0].template, /\{id\}/);
  assert.equal(endpoints[1].template, 'https://two.local/resolve?id={id}');
});
