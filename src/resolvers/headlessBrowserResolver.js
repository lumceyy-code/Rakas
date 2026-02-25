import { normalizeResolverResult } from './base.js';

/**
 * Template connector for authorized pages where manifest URL is only discoverable in runtime network activity.
 * Requires playwright to be installed in deployment environments that enable this connector.
 * Stealth-evasion plugins are intentionally not included; use authorized sources/access.
 */
export function createHeadlessBrowserResolver(config) {
  const {
    name = 'headless-browser',
    targetUrlTemplate,
    overlaySelectors = [],
    timeoutMs = 12000,
    headers = {}
  } = config;

  if (!targetUrlTemplate) {
    throw new Error(`${name}: targetUrlTemplate is required`);
  }

  return {
    name,
    async resolve(context) {
      let playwright;
      try {
        playwright = await import('playwright');
      } catch {
        return null;
      }

      const targetUrl = targetUrlTemplate
        .replace('{tmdb_id}', encodeURIComponent(context.metadataId))
        .replace('{season}', String(context.season || 1))
        .replace('{episode}', String(context.episode || 1));

      const browser = await playwright.chromium.launch({ headless: true });
      const page = await browser.newPage({ extraHTTPHeaders: headers });

      let foundManifest = null;
      const onResponse = (response) => {
        const url = response.url();
        if (url.includes('.m3u8') || url.includes('.mp4')) {
          foundManifest = url;
        }
      };

      page.on('response', onResponse);

      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

        // Optional overlay dismiss automation for first-party pages with splash/modals.
        for (const selector of overlaySelectors) {
          const handle = await page.$(selector);
          if (handle) {
            await handle.click({ timeout: 1500 }).catch(() => {});
          }
        }

        // Give runtime scripts time to initialize the media requests.
        await page.waitForTimeout(3000);
      } finally {
        page.off('response', onResponse);
        await page.close().catch(() => {});
        await browser.close().catch(() => {});
      }

      return normalizeResolverResult(
        foundManifest
          ? {
              manifestUrl: foundManifest,
              meta: { targetUrl }
            }
          : null,
        name
      );
    }
  };
}
