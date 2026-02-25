# The Pirater — Product Vision & MVP Requirements

## 1) Overview

- **Product name:** The Pirater
- **Tagline:** *Everything you want to watch. Right now. No waiting. No excuses.*
- **One-liner:** A sleek, ad-minimal video-on-demand platform that aggregates and plays the latest movies, TV series, and trending content via real-time link extraction and proxy streaming, with a premium Netflix-like UX.

## 2) Core Value Proposition

Deliver instant access to a broad catalog (including new releases) in a clean interface with:

- No pop-ups
- No forced redirects
- No injected third-party ads
- High playback reliability
- Selectable quality and subtitle support

## 3) Why Build This in 2026

- Streaming fatigue across many paid subscriptions
- User demand for one-stop content access
- Friction and malware risk on existing mirror experiences
- Mature tooling for scraping, proxying, HLS playback, and caching

## 4) Target Users & Personas

### BingeBoi (18–34)
- Heavy streamer, tech-savvy, already uses ad blockers.
- **Goal:** Start a new release in <30 seconds.
- **Pain points:** Dead links, pop-ups, quality instability.
- **Key metrics:** Session duration, titles watched/session.

### CasualMom (30–45)
- Watches 2–3 shows weekly; family-oriented usage.
- **Goal:** Find safe, easy family-friendly viewing.
- **Pain points:** Complex navigation, security concerns.
- **Key metrics:** Weekly retention, completion rate.

### CordCutterPro (25–40)
- Avoids subscriptions, prioritizes quality and control.
- **Goal:** Highest available quality + multilingual subtitles.
- **Pain points:** Buffering, quality/region constraints.
- **Key metrics:** Average bitrate, stream completion, subtitle usage.

## 5) Success Metrics

### MVP (first 3 months)
- 10,000 MAU
- 70% stream-start success rate
- Average session >45 minutes
- <5% dead-link reports via in-app feedback

### v1 (6–9 months)
- 100,000 MAU
- 85% stream-start success rate
- <2% dead-link reports
- Top 50 requested titles available within 2 hours of release

## 6) Feature Prioritization

## P0 (MVP Must-Haves)

### Homepage & Discovery
- Hero banner (TMDb trending/new)
- Rows: Trending, New Releases, Popular This Week, Top IMDb, Genres
- Infinite scroll + lazy loading

### Search & Catalog
- Global search with TMDb autocomplete and instant results
- Title details page with synopsis, cast, trailer embed (YouTube), ratings, similar titles

### Playback Engine
- Custom HTML5 player (HLS.js + Video.js skin)
- Quality selector (360p → 1080p/4K when available)
- Subtitle selector (embedded + OpenSubtitles .vtt/.srt)
- Continue watching (localStorage for MVP; optional account sync later)
- Proxy backend for HLS chunks to handle origin/referrer restrictions

### Link Sourcing & Reliability
- Real-time multi-provider scraper/aggregator
- Automated dead-link refresh every 15–60 minutes
- Fallback chain: Provider A → B → C

## P1/P2 (Post-MVP)

- User accounts (email / Google / Discord)
- Watchlists and favorites
- Theme toggle (dark/light)
- Multi-profile support (up to 4)
- “Request a title” workflow
- Mobile PWA polish
- Chromecast / AirPlay
- Basic recommendations

## 7) Non-Functional Requirements

- **Performance:** <3s page load, <5s stream start (with proxy)
- **Scalability:** 5,000 concurrent streams (MVP), 50,000 (v1)
- **Availability:** 99.5% uptime target
- **Security:** HTTPS everywhere, no plaintext credentials, scraper rate limiting
- **Device support:** Desktop modern browsers + mobile/tablet browsers + basic smart TV browser support
- **Data sources:** TMDb (metadata), OpenSubtitles (subtitles), multiple stream providers

## 8) Suggested Architecture

### Frontend
- Next.js 15
- Tailwind CSS + shadcn/ui
- Client-side player integration for HLS and subtitle controls

### Backend
- Node.js (Fastify/Express) or FastAPI for scraping + proxy layer
- Modular provider adapters (one module per upstream)
- Health scoring for provider reliability

### Data Layer
- Supabase/PostgreSQL (or MongoDB)
- Store:
  - Cached metadata and artwork references
  - Link availability and quality fingerprints
  - Playback resume positions and feedback telemetry

### Infra
- VPS origin + Cloudflare CDN
- Optional cache tier (Bunny/Backblaze)
- Queue/cron for link refresh, provider health checks, and cleanup

## 9) Dependency & Risk Register

### Dependencies
- Stable upstream stream providers / extractors (rotating)
- TMDb API key
- OpenSubtitles integration
- Optional FFmpeg expertise for future transcoding

### Risks & Mitigations
- **Fast link decay:** Multi-provider fallback + aggressive refresh + cache warmup.
- **Bandwidth cost spikes:** Cache popular segments + rate limits + tiering strategy.
- **Scraper breakage:** Provider isolation + contract tests + feature flags.
- **Playback failures on restrictive networks:** Controlled fallback to direct embeds where needed.

## 10) Day-1 MVP Scope (Ship Criteria)

- Netflix-inspired dark-first UI
- Browse/search/title pages powered by TMDb
- Instant playback for majority catalog via scraped HLS + proxy
- No visible ads/pop-ups/redirects in product UX
- Core player controls with subtitle support
- Mobile-responsive layouts
- In-app dead-link feedback button

## 11) Implementation Roadmap (Suggested)

### Phase 0: Foundation (Week 1–2)
- Repo setup, CI, linting, env handling, secrets strategy
- TMDb integration + UI skeleton
- Proxy service scaffold + provider adapter interface

### Phase 1: MVP Core (Week 3–8)
- Homepage/search/title pages
- Primary playback path + fallback chain
- Subtitle ingestion + player controls
- Telemetry for stream-start, failures, and dead-link reports

### Phase 2: Reliability & Launch (Week 9–12)
- Cron refresh + provider scoring
- Caching strategy + load testing baseline
- Bug hardening + launch dashboard

## 12) MVP Acceptance Criteria

- User can discover and start a title in <= 30 seconds for common use cases.
- Stream-start success >= 70% during beta cohort.
- Dead-link reporting exists and feedback is traceable.
- Mobile and desktop UX pass smoke test for core flows.
- No disruptive ad/popup behavior inside first-party UI.
