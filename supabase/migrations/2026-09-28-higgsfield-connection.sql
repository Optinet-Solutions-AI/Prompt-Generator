-- Higgsfield MCP login for the Video tab (one row, id = 'default').
--
-- WHY A TABLE AND NOT A VERCEL ENV VAR:
-- Higgsfield's refresh token is single-use — every renewal returns a new one
-- and the old one stops working (reusing it cancels the whole login). So the
-- server must save the newest token after every renewal; env vars are fixed.
--
-- Only the backend (service-role key, bypasses RLS) touches this table via
-- api/video.ts. RLS is on with no policies, so the public anon key can't read it.

create table if not exists higgsfield_connection (
  id                 text primary key default 'default',
  client_id          text,          -- OAuth client registered with Higgsfield's login server
  access_token       text,
  refresh_token      text,
  expires_at         timestamptz,   -- when access_token stops working
  account_email      text,          -- shown in the UI as "Connected as …"
  refreshing_until   timestamptz,   -- short lock so two servers never renew at once
  -- in-flight "Connect" attempt (PKCE)
  pending_state      text,
  pending_verifier   text,
  pending_client_id  text,
  pending_redirect   text,
  updated_at         timestamptz not null default now()
);

alter table higgsfield_connection enable row level security;
