const DEFAULT_UA_2026 = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0'
];

export function parseUaPool(raw) {
  if (!raw) return DEFAULT_UA_2026;
  return raw.split('\n').map((s) => s.trim()).filter(Boolean);
}

export function parseGatewayConfig(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry.name === 'string');
  } catch {
    return [];
  }
}

export function createNetworkStrategy({ uaPool, gateways }) {
  let rr = 0;
  const uas = uaPool?.length ? uaPool : DEFAULT_UA_2026;
  const pool = gateways || [];

  function nextUa() {
    return uas[Math.floor(Math.random() * uas.length)];
  }

  function nextGateway() {
    if (!pool.length) return null;
    const selected = pool[rr % pool.length];
    rr += 1;
    return selected;
  }

  function gatewayUrl(gateway, targetUrl, type) {
    const template = type === 'segment' ? gateway.segmentProxyTemplate : gateway.manifestProxyTemplate;
    if (!template || typeof template !== 'string') return null;
    return template.replace('{url}', encodeURIComponent(targetUrl));
  }

  return {
    nextUa,
    nextGateway,
    gatewayUrl
  };
}
