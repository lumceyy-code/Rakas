# Source Connectors (Resolver Modules)

This folder contains pluggable resolver modules used by `server.js` before fallback endpoint resolution.

## Connector types

- `generic` (`genericProviderResolver.js`): Fetches JSON-based source APIs using `tmdb_id`, `season`, `episode`.
- `headless` (`headlessBrowserResolver.js`): Template connector for authorized browser-automation extraction when runtime network requests reveal media URLs.

## Runtime config

Set environment variable `RESOLVER_CONNECTORS_JSON` to a JSON array.

Example:

```json
[
  {
    "type": "generic",
    "name": "generic-provider",
    "endpointTemplate": "https://example.local/api/source?tmdb_id={tmdb_id}&season={season}&episode={episode}"
  },
  {
    "type": "headless",
    "name": "browser-provider",
    "targetUrlTemplate": "https://example.local/watch/{tmdb_id}?s={season}&e={episode}",
    "overlaySelectors": ["button[data-action='play']", ".consent-accept"]
  }
]
```

Notes:
- `headless` connector requires `playwright` installed in the runtime environment.
- Connectors should only be used with sources you are authorized to access.

Safety note:
- This project does not include stealth-evasion plugins (e.g., undetected chromedriver) for bypassing anti-bot protections.
- Use only authorized APIs/pages and provider-approved access methods.
