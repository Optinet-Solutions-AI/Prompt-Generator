-- Share ONE image or video with specific colleagues (instead of the whole
-- library). The viewer finds it under "Shared with me → Individual items".
-- file_id = the Google Drive file id in the OWNER's Drive.
-- Only the backend (service-role key) reads/writes this via the /api routes.

create table if not exists item_shares (
  owner_id   uuid not null references profiles(id) on delete cascade,
  viewer_id  uuid not null references profiles(id) on delete cascade,
  kind       text not null check (kind in ('image', 'video')),
  file_id    text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id, kind, file_id)
);
create index if not exists item_shares_viewer on item_shares (viewer_id, kind, created_at desc);
alter table item_shares enable row level security;
