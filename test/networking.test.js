import test from 'node:test';
import assert from 'node:assert/strict';

import { createNetworkStrategy, parseGatewayConfig, parseUaPool } from '../src/networking.js';

test('parseGatewayConfig parses JSON array', () => {
  const out = parseGatewayConfig('[{"name":"gw1","manifestProxyTemplate":"https://gw.local/m?u={url}"}]');
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'gw1');
});

test('network strategy rotates gateways', () => {
  const s = createNetworkStrategy({
    uaPool: ['ua-a'],
    gateways: [
      { name: 'g1', manifestProxyTemplate: 'https://g1/?u={url}' },
      { name: 'g2', manifestProxyTemplate: 'https://g2/?u={url}' }
    ]
  });

  assert.equal(s.nextGateway().name, 'g1');
  assert.equal(s.nextGateway().name, 'g2');
});

test('parseUaPool falls back when empty', () => {
  const out = parseUaPool('');
  assert.ok(out.length >= 3);
});
