-- UGC Video favorites — kept separate from liked_images so the Image Library
-- and Video Library never mix. Only the backend (service-role key, which
-- bypasses RLS) reads/writes this table via api/video.ts.

create table if not exists liked_videos (
  drive_file_id text primary key,   -- the video's Google Drive file id
  brand_name    text,
  video_url     text,
  prompt        text,
  created_at    timestamptz not null default now()
);

alter table liked_videos enable row level security;
