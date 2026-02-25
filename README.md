# Rakas

Project planning docs:
- [Product Vision](./PRODUCT_VISION.md)

## Legal Streaming Discovery Prototype (2026 UI concept)

This build focuses on a polished legal discovery experience with self-healing source infrastructure:

- Smooth animated top-center expanding search (dynamic-island style)
- Platform and genre filters
- Tabs for Discover, Recently Watched, Recently Finished
- Resume metadata simulation (season/episode/timeline)
- Optional cloud-download request placeholder flow
- Remote Source Aggregator with source fallback on expired sessions
- HLS manifest/segment proxy routes for authorized remote media origins
- Background source health monitoring + refresh queue
- Issue reporting endpoint to trigger immediate source refresh
- Supabase-backed playback sync endpoints (cross-device resume)
- PWA support via `manifest.webmanifest` + `sw.js`

## API

- `GET /admin-console` hidden admin dashboard UI
- `GET /api/catalog`
- `GET /api/admin/status` (admin auth required)
- `POST /api/admin/refresh` (admin auth required)
- `GET /api/resolve?id=<metadataId>`
- `POST /api/report` body `{ metadataId, reason }`
- `GET /api/playback-state?profileId=<profileId>`
- `POST /api/playback-state`
- `POST /api/playback-heartbeat`
- `GET /api/proxy/manifest?url=<remoteM3U8>&h=<headerHintToken>`
- `GET /api/proxy/segment?url=<remoteChunkOrKey>&h=<headerHintToken>`

## Environment

- `RESOLVER_ENDPOINTS` comma-separated endpoint templates with `{id}` placeholder
- `RESOLVER_CONNECTORS_JSON` JSON array of connector modules (see `src/resolvers/README.md`)
- `PROXY_ALLOW_HOSTS` optional host allowlist for proxy targets
- `RESOLVER_CACHE_TTL_MS` cache TTL for resolved manifests (default 1h)
- `HEALTH_CHECK_INTERVAL_MS` self-healing interval (default 10m)
- `DISCORD_WEBHOOK_URL` optional alerts when all resolver sources fail
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` for playback sync APIs
- `OUTBOUND_GATEWAYS_JSON` optional JSON array of authorized egress gateways (round-robin)
- `USER_AGENT_POOL` optional newline-separated browser UA strings (compatibility pool)
- `ADMIN_CONSOLE_PASSWORD` password expected in `X-Admin-Password` for admin APIs

## Supabase schema

Apply: `sql/supabase_playback_state.sql`

## Run

```bash
npm start
```

Open `http://localhost:8080`.

## Test

```bash
npm test
```

## Safety/Legal

Use only with media you are authorized to access and proxy.


## Resolver modules

- Source connector framework lives in `src/resolvers/`.
- `genericProviderResolver.js` is an example JSON connector with tmdb/season/episode parameters.
- `headlessBrowserResolver.js` is a template for authorized headless extraction flows.


Compliance note: This project does not include anti-bot bypass tooling (stealth/undetected automation).
