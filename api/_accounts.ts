/**
 * _accounts.ts — username + password accounts. The routes are in api/auth.ts:
 *
 *   POST ?action=password-login        → { username, password }  (username may also be the account's email)
 *        → signs in, OR { must_change_password, change_token } on first sign-in
 *   POST ?action=change-password       → { change_token | current_password, new_password }
 *   GET  ?action=admin-users           → every account (admins only)
 *   POST ?action=admin-create-user     → { username, name, email? } → { temp_password } shown ONCE
 *   POST ?action=admin-reset-password  → { id } → { temp_password } shown ONCE
 *
 * FIRST SIGN-IN: someone signing in with a temporary password gets NO session
 * yet — only a 15-minute "change your password" token. They're signed in only
 * after choosing their own password, so a temporary password can never be used
 * to reach the rest of the app.
 *
 * Underscore file = helper, not its own Vercel route.
 */
import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  AuthError, sb, getProfileById, updateProfile, requireUser, setSessionCookie, makeToken, readToken, type Profile,
} from './_session.js';
import {
  hashPassword, verifyPassword, dummyHash, generateTempPassword, normalizeUsername, usernameProblem,
  passwordProblem, lockMinutesLeft, afterFailedLogin, LOCK_MINUTES,
} from './_password.js';

const CHANGE_TOKEN = 'pw-change';
const CHANGE_TOKEN_MINUTES = 15;
const WRONG = 'Wrong username or password.';
const SETUP = 'Username sign-in is not set up yet — run supabase/migrations/2026-10-08-password-login.sql in Supabase.';

/** Supabase's "that column doesn't exist" (migration not run yet) → a clear setup message. */
export function setupHint(err: unknown): unknown {
  const m = err instanceof Error ? err.message : '';
  return /user-accounts SQL|column profiles\.\w+ does not exist|'(username|password_hash|must_change_password|failed_logins|locked_until)' column/.test(m)
    ? new AuthError(503, SETUP) : err;
}

/** Supabase's "duplicate key" → which field is already taken. */
function duplicateHint(err: unknown): unknown {
  const m = err instanceof Error ? err.message : '';
  if (m.includes('profiles_username_key')) return new AuthError(409, 'That username is already taken.');
  if (m.includes('profiles_email_key')) return new AuthError(409, 'That email already belongs to an account (they can sign in with Google).');
  return err;
}

/**
 * A short fingerprint of the current password hash, put inside the change
 * token. Once the password changes, the fingerprint no longer matches, so the
 * same token can't be used twice.
 */
const fingerprint = (hash: string) => crypto.createHash('sha256').update(hash).digest('base64url').slice(0, 16);

const minutes = (n: number) => `${n} minute${n === 1 ? '' : 's'}`;

/** The profile someone means by what they typed in the "Username or email" box (or undefined). */
async function findLoginProfile(typed: string): Promise<Profile | undefined> {
  // People naturally type their email — accept it when the admin saved one on the account.
  if (typed.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)
      ? (await sb(`profiles?email=eq.${encodeURIComponent(typed)}&password_hash=not.is.null&select=*`) as Profile[])[0]
      : undefined;
  }
  return usernameProblem(typed) ? undefined
    : (await sb(`profiles?username=eq.${encodeURIComponent(typed)}&select=*`) as Profile[])[0];
}

async function passwordLogin(req: VercelRequest, res: VercelResponse, body: Record<string, unknown>) {
  const username = normalizeUsername(body.username); // a username or an email, lower-cased
  const password = String(body.password ?? '');
  if (!username || !password) throw new AuthError(400, 'Enter your username and password.');

  const p = await findLoginProfile(username);
  if (!p || !p.password_hash) {
    await verifyPassword(password, await dummyHash()); // same delay as a real check
    throw new AuthError(401, WRONG);
  }

  const left = lockMinutesLeft(p.locked_until);
  if (left) throw new AuthError(429, `Too many wrong passwords. Try again in ${minutes(left)}, or ask an admin to reset your password.`);

  if (!(await verifyPassword(password, p.password_hash))) {
    const next = afterFailedLogin(p.failed_logins);
    await updateProfile(p.id, next);
    if (next.locked_until) throw new AuthError(429, `Too many wrong passwords — this account is paused for ${minutes(LOCK_MINUTES)}.`);
    throw new AuthError(401, WRONG);
  }

  await updateProfile(p.id, { failed_logins: 0, locked_until: null, last_seen_at: new Date().toISOString() });
  if (p.must_change_password) {
    return {
      must_change_password: true, name: p.name,
      change_token: makeToken(CHANGE_TOKEN, { uid: p.id, fp: fingerprint(p.password_hash) }, CHANGE_TOKEN_MINUTES),
    };
  }
  setSessionCookie(req, res, p.id);
  return { success: true };
}

async function changePassword(req: VercelRequest, res: VercelResponse, body: Record<string, unknown>) {
  const next = String(body.new_password ?? '');
  const problem = passwordProblem(next);
  if (problem) throw new AuthError(400, problem);

  let p: Profile | null;
  if (body.change_token) {
    // First sign-in: the token proves they just typed the temporary password.
    const t = readToken(CHANGE_TOKEN, String(body.change_token));
    p = t && typeof t.uid === 'string' ? await getProfileById(t.uid) : null;
    if (!p || !p.password_hash || t?.fp !== fingerprint(p.password_hash)) {
      throw new AuthError(401, 'This sign-in has expired — please sign in again with your temporary password.');
    }
  } else {
    // Already signed in, changing it from the menu: confirm the current one.
    p = await requireUser(req);
    if (!p.password_hash) throw new AuthError(400, 'This account signs in with Google, so it has no password to change.');
    if (!(await verifyPassword(String(body.current_password ?? ''), p.password_hash))) throw new AuthError(401, 'Your current password is wrong.');
  }
  if (await verifyPassword(next, p.password_hash)) throw new AuthError(400, 'Choose a new password — not the one you have now.');

  await updateProfile(p.id, { password_hash: await hashPassword(next), must_change_password: false, failed_logins: 0, locked_until: null });
  setSessionCookie(req, res, p.id);
  return { success: true };
}

// ── Admin: create accounts, reset passwords ───────────────────────────────

async function requireAdmin(req: VercelRequest): Promise<Profile> {
  const p = await requireUser(req);
  if (!p.is_admin) throw new AuthError(403, 'Only admins can manage accounts.');
  return p;
}

/** One row of the "Manage accounts" list — booleans only, never hashes or tokens. */
export function accountRow(p: Profile) {
  return {
    id: p.id, name: p.name, email: p.email, username: p.username ?? null, status: p.status, is_admin: p.is_admin,
    has_google: !!p.google_sub, has_password: !!p.password_hash, must_change_password: !!p.must_change_password,
    locked: lockMinutesLeft(p.locked_until) > 0, drive_connected: !!p.drive_refresh_token, last_seen_at: p.last_seen_at,
  };
}

async function adminUsers(req: VercelRequest) {
  await requireAdmin(req);
  const rows = await sb('profiles?select=id,name,email,username,status,is_admin,google_sub,password_hash,must_change_password,locked_until,last_seen_at,drive_refresh_token&order=name.asc.nullslast') as Profile[];
  return { users: rows.map(accountRow) };
}

async function adminCreateUser(req: VercelRequest, body: Record<string, unknown>) {
  await requireAdmin(req);
  const username = normalizeUsername(body.username);
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  const email = String(body.email ?? '').trim().toLowerCase();
  const bad = usernameProblem(username);
  if (bad) throw new AuthError(400, bad);
  if (!name || name.length > 80) throw new AuthError(400, 'Enter their name (up to 80 characters).');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError(400, 'That email doesn’t look right — or leave it empty.');

  const tempPassword = generateTempPassword();
  let row: Profile;
  try {
    row = (await sb('profiles', {
      method: 'POST',
      body: JSON.stringify({
        username, name, email: email || null, password_hash: await hashPassword(tempPassword),
        must_change_password: true, status: 'approved', is_admin: false,
      }),
    }) as Profile[])[0];
  } catch (err) { throw duplicateHint(err); }
  return { user: accountRow(row), temp_password: tempPassword };
}

async function adminResetPassword(req: VercelRequest, body: Record<string, unknown>) {
  await requireAdmin(req);
  const p = await getProfileById(String(body.id ?? ''));
  if (!p) throw new AuthError(404, 'That account no longer exists.');
  if (!p.username) throw new AuthError(400, 'This account signs in with Google only, so it has no password to reset.');
  const tempPassword = generateTempPassword();
  await updateProfile(p.id, { password_hash: await hashPassword(tempPassword), must_change_password: true, failed_logins: 0, locked_until: null });
  return { temp_password: tempPassword };
}

/**
 * Runs one of the account actions. Returns undefined when `action` isn't one
 * of them, so auth.ts can carry on with its own list.
 */
export async function accountsAction(
  action: string, req: VercelRequest, res: VercelResponse, body: Record<string, unknown>,
): Promise<unknown> {
  try {
    if (req.method === 'POST' && action === 'password-login') return await passwordLogin(req, res, body);
    if (req.method === 'POST' && action === 'change-password') return await changePassword(req, res, body);
    if (req.method === 'GET' && action === 'admin-users') return await adminUsers(req);
    if (req.method === 'POST' && action === 'admin-create-user') return await adminCreateUser(req, body);
    if (req.method === 'POST' && action === 'admin-reset-password') return await adminResetPassword(req, body);
    return undefined;
  } catch (err) {
    throw setupHint(err);
  }
}
