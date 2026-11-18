-- ============================================================================
-- Let "Sign in with Google" move to the account an admin made for the same email
-- Run once in Supabase → SQL Editor. Safe to run twice.
--
-- When someone's Google account gets a new email (for example their company
-- moves to a new domain) and an admin already made a username account for
-- that NEW email, signing in with Google now moves the Google link to the
-- admin's account. The old profile keeps its data but is set to 'blocked',
-- with no way left to sign in to it.
--
-- The rule below used to demand that EVERY account keeps a way to sign in.
-- It now also allows a blocked account with none. Until this runs, those
-- people see "needs a database update" instead of being signed in.
-- ============================================================================

alter table profiles drop constraint if exists profiles_has_login;
alter table profiles add  constraint profiles_has_login
  check (google_sub is not null or (username is not null and password_hash is not null) or status = 'blocked');
