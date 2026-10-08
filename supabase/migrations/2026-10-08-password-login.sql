-- ============================================================================
-- Username + password sign-in (alongside "Sign in with Google")
-- Run once in Supabase → SQL Editor. Safe to run twice.
--
-- How it works:
--   * An admin creates an account in the app (avatar menu → "Manage accounts").
--     The app makes a temporary password and shows it to the admin ONCE.
--   * On first sign-in the person must choose their own password.
--   * 5 wrong passwords in a row pause the account for 15 minutes.
--   * Passwords are stored only as scrypt hashes, never as text.
--
-- Until this runs, Google sign-in keeps working exactly as before; only the
-- username form shows "not set up yet".
-- ============================================================================

-- Password-only people have no Google account, and may have no email.
alter table profiles alter column google_sub drop not null;
alter table profiles alter column email      drop not null;

alter table profiles add column if not exists username             text unique;
alter table profiles add column if not exists password_hash        text;
alter table profiles add column if not exists must_change_password boolean not null default false;
alter table profiles add column if not exists failed_logins        integer not null default 0;
alter table profiles add column if not exists locked_until         timestamptz;

-- Usernames are stored lower-case: 3–32 letters, digits, dots, dashes, underscores.
alter table profiles drop constraint if exists profiles_username_format;
alter table profiles add  constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9._-]{3,32}$');

-- Every account needs SOME way to sign in.
alter table profiles drop constraint if exists profiles_has_login;
alter table profiles add  constraint profiles_has_login
  check (google_sub is not null or (username is not null and password_hash is not null));
