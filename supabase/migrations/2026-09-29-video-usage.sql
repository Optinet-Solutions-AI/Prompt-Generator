-- Higgsfield credit usage per person (Video tab).
--
-- One row per video render. `credits` is Higgsfield's own price quote for that
-- exact render (same number shown next to "Generate Video"), recorded at the
-- moment the user clicks Generate. `status` follows the render:
--   submitted → completed | failed
-- Everyone renders on the one TEAM Higgsfield account, so this table is how
-- we know who spent what.
--
-- Only the backend (service-role key) reads/writes it via api/video.ts.

create table if not exists video_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  job_id        text unique not null,     -- Higgsfield job id
  model         text not null,
  duration      integer,
  aspect_ratio  text,
  brand         text,
  start_image   boolean not null default false,
  credits       numeric,                  -- Higgsfield's quote for this render
  status        text not null default 'submitted' check (status in ('submitted', 'completed', 'failed')),
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index if not exists video_usage_user_created on video_usage (user_id, created_at desc);
alter table video_usage enable row level security;
