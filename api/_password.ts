/**
 * _password.ts — username + password sign-in helpers (the alternative to
 * "Sign in with Google").
 *
 * HOW PASSWORDS ARE STORED
 *   Never as plain text. Each password is run through scrypt (a deliberately
 *   slow, memory-hungry hash built into Node) with a random "salt", and only
 *   the result is saved:  scrypt$16384$8$1$<salt>$<hash>
 *   To check a login we hash what was typed the same way and compare.
 *
 * HOW ACCOUNTS ARE MADE
 *   An admin creates the account and the app generates a temporary password,
 *   shown to the admin ONCE. On first sign-in the person must pick their own.
 *
 * Underscore file = helper, not its own Vercel route.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const N = 16384, R = 8, P = 1, KEYLEN = 64;

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 200;
/** After this many wrong passwords in a row the account is paused… */
export const MAX_FAILED_LOGINS = 5;
/** …for this long. */
export const LOCK_MINUTES = 15;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64url'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * A stored hash of a random password. When someone types a username that
 * doesn't exist we still check against this, so a wrong username takes as long
 * as a wrong password and the timing doesn't reveal which usernames exist.
 */
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword(crypto.randomBytes(16).toString('hex')));

/** Letters and digits that can't be confused when read aloud or copied (no 0/O, 1/l/I). */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A temporary password like "k7Qm-3xRp-9vTd" (12 random characters, about 69 bits). */
export function generateTempPassword(): string {
  const chars = Array.from({ length: 12 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map(g => g.join('')).join('-');
}

/** "Maria.Santos " → "maria.santos". Usernames are case-insensitive. */
export function normalizeUsername(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

/** Why this username can't be used, or '' when it's fine. */
export function usernameProblem(username: string): string {
  if (username.length < 3 || username.length > 32) return 'Username must be 3–32 characters.';
  if (!/^[a-z0-9._-]+$/.test(username)) return 'Username can only use letters, numbers, dots, dashes and underscores.';
  return '';
}

/** Why this new password can't be used, or '' when it's fine. */
export function passwordProblem(password: string): string {
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return `Password must be at most ${MAX_PASSWORD} characters.`;
  if (!password.trim()) return 'Password cannot be only spaces.';
  return '';
}

/** Minutes left on a lock (rounded up), or 0 when the account isn't locked. */
export function lockMinutesLeft(lockedUntil: string | null | undefined, now = Date.now()): number {
  const until = lockedUntil ? Date.parse(lockedUntil) : NaN;
  return Number.isFinite(until) && until > now ? Math.ceil((until - now) / 60_000) : 0;
}

/**
 * What to save after a WRONG password: one more strike, and once the strikes
 * reach MAX_FAILED_LOGINS, a lock and a fresh count.
 */
export function afterFailedLogin(failedSoFar: number | null | undefined, now = Date.now()): { failed_logins: number; locked_until: string | null } {
  const failed = (failedSoFar || 0) + 1;
  return failed >= MAX_FAILED_LOGINS
    ? { failed_logins: 0, locked_until: new Date(now + LOCK_MINUTES * 60_000).toISOString() }
    : { failed_logins: failed, locked_until: null };
}
