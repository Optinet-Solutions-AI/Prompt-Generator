-- User accounts: Sign in with Google, each user's own Google Drive, approval,
-- in-app library sharing. Safe to run once; every statement is idempotent.
--
-- Only the backend (service-role key, bypasses RLS) reads/writes these via the
-- /api routes. RLS is on with no policies, so the public anon key can't read
-- the Drive tokens stored here.

-- 1) One row per person who has signed in.
create table if not exists profiles (
  id                      uuid primary key default gen_random_uuid(),
  google_sub              text unique not null,     -- Google's stable account id
  email                   text unique not null,
  name                    text,
  avatar_url              text,
  -- APPROVAL: company accounts start 'approved'; everyone else 'pending'.
  -- Approve someone: Table editor → profiles → set status to 'approved'.
  -- Block someone:   set status to 'blocked'.
  status                  text not null default 'pending' check (status in ('pending', 'approved', 'blocked')),
  is_admin                boolean not null default false,
  -- Their Google Drive connection (scope: only files this app creates)
  drive_refresh_token     text,
  drive_access_token      text,
  drive_token_expires_at  timestamptz,
  drive_root_folder_id    text,                     -- My Drive → Prompt Generator
  drive_images_folder_id  text,                     --   → Images
  drive_videos_folder_id  text,                     --   → Videos
  created_at              timestamptz not null default now(),
  last_seen_at            timestamptz
);
alter table profiles enable row level security;

-- 2) "Share my library with …" — owner lets viewer see their images + videos.
create table if not exists library_shares (
  owner_id   uuid not null references profiles(id) on delete cascade,
  viewer_id  uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id)
);
alter table library_shares enable row level security;

-- 3) Favorites belong to a person now. Existing rows keep owner_id = null
--    (they stay visible as shared/team favorites).
alter table liked_images add column if not exists owner_id uuid references profiles(id) on delete set null;
alter table liked_videos add column if not exists owner_id uuid references profiles(id) on delete set null;

-- 4) Higgsfield logins become per person: the row id is now the profile id
--    (the old single 'default' row is simply no longer used).
alter table higgsfield_connection add column if not exists owner_id uuid references profiles(id) on delete cascade;
