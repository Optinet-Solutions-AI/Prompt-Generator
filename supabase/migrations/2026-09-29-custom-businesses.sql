-- Saved "Custom business" profiles for the Video tab (e.g. Dr Demajo, a dental
-- clinic). Shared by the whole team so anyone can reuse one. The logo is kept
-- as a small data URL (the app limits it to ~1 MB).
-- Only the backend (service-role key) reads/writes this via api/video.ts.

create table if not exists custom_businesses (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  industry          text,
  promote           text,          -- what to advertise, e.g. "Teeth whitening — 20% off"
  color             text,          -- main brand colour (#RRGGBB)
  accent            text,          -- accent colour (#RRGGBB)
  tagline           text,          -- end-card line, e.g. "Book today · demajodental.org"
  logo              text,          -- data:image/...;base64,... (optional)
  created_by        uuid references profiles(id) on delete set null,
  created_by_email  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table custom_businesses enable row level security;
