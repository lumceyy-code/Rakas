-- Playback state schema for cross-device resume.
create table if not exists public.playback_state (
  profile_id text not null,
  metadata_id text not null,
  season integer not null default 1,
  episode integer not null default 1,
  position_seconds integer not null default 0,
  status text not null default 'watching' check (status in ('watching','finished')),
  heartbeat_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  device_id text,
  primary key (profile_id, metadata_id)
);

create index if not exists playback_state_profile_heartbeat_idx
  on public.playback_state (profile_id, heartbeat_at desc);

create index if not exists playback_state_updated_idx
  on public.playback_state (updated_at desc);

-- Optional: keep table compact by pruning stale watching rows older than 120 days.
-- create extension if not exists pg_cron;
-- select cron.schedule('prune-playback-state', '0 3 * * *', $$
--   delete from public.playback_state
--   where status = 'watching' and heartbeat_at < now() - interval '120 days';
-- $$);
