/**
 * _session.ts — who is signed in?
 *
 * After "Sign in with Google" (api/auth.ts) the browser holds one cookie,
 * `pg_session`, containing the user's profile id + an expiry, signed with
 * SESSION_SECRET (HMAC-SHA256) so it can't be forged or edited. Because it's a
 * cookie, every existing fetch('/api/…') in the app sends it automatically —
 * no frontend changes needed for protected routes.
 *
 * The cookie is httpOnly (page scripts can't read it) and lasts 30 days.
 *
 * Underscore file = helper, not its own Vercel route.
 */
import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const SESSION_COOKIE = 'pg_session';
const SESSION_DAYS = 30;

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export interface Profile {
  id: string;
  google_sub: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  status: 'pending' | 'approved' | 'blocked';
  is_admin: boolean;
  drive_refresh_token: string | null;
  drive_access_token: string | null;
  drive_token_expires_at: string | null;
  drive_root_folder_id: string | null;
  drive_images_folder_id: string | null;
  drive_videos_folder_id: string | null;
  last_seen_at: string | null;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new AuthError(503, 'SESSION_SECRET is not configured (needs 32+ characters)');
  return s;
}

const sign = (payload: string) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

/** "<base64 payload>.<signature>" */
export function makeSessionValue(profileId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: profileId, exp: Date.now() + SESSION_DAYS * 86400_000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readSessionValue(value: string): string | null {
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof uid === 'string' && Date.now() < exp ? uid : null;
  } catch { return null; }
}

function isLocal(req: VercelRequest): boolean {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '').startsWith('localhost');
}

export function setSessionCookie(req: VercelRequest, res: VercelResponse, profileId: string) {
  const secure = isLocal(req) ? '' : '; Secure';
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${makeSessionValue(profileId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}

export function clearSessionCookie(req: VercelRequest, res: VercelResponse) {
  const secure = isLocal(req) ? '' : '; Secure';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export function readCookie(req: VercelRequest, name: string): string | null {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

// ── Supabase (service role) ───────────────────────────────────────────────

export async function sb(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new AuthError(503, 'Supabase is not configured');
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation', ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    if (/profiles|library_shares/.test(text) && text.includes('schema cache')) {
      throw new AuthError(503, 'Run the user-accounts SQL in Supabase first (supabase/migrations/2026-09-29-user-accounts.sql).');
    }
    throw new AuthError(res.status, `Supabase ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : [];
}

export async function getProfileById(id: string): Promise<Profile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await sb(`profiles?id=eq.${id}&select=*`) as Profile[];
  return rows[0] || null;
}

export async function updateProfile(id: string, fields: Partial<Profile>) {
  await sb(`profiles?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(fields) });
}

/** The signed-in profile, or null (no/invalid/expired cookie, or deleted profile). */
export async function currentProfile(req: VercelRequest): Promise<Profile | null> {
  const value = readCookie(req, SESSION_COOKIE);
  const uid = value ? readSessionValue(value) : null;
  return uid ? getProfileById(uid) : null;
}

/** For protected routes: an APPROVED signed-in user, or a 401/403 error. */
export async function requireUser(req: VercelRequest): Promise<Profile> {
  const p = await currentProfile(req);
  if (!p) throw new AuthError(401, 'Please sign in with Google first.');
  if (p.status === 'blocked') throw new AuthError(403, 'Your access to this app has been turned off.');
  if (p.status !== 'approved') throw new AuthError(403, 'Your account is waiting for approval.');
  return p;
}

/**
 * The profile whose library `viewer` wants to see: themselves, or someone who
 * shared their library with them. Throws 403 otherwise.
 */
export async function libraryOwner(viewer: Profile, ownerId: string | undefined | null): Promise<Profile> {
  if (!ownerId || ownerId === viewer.id) return viewer;
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) throw new AuthError(400, 'invalid owner');
  const share = (await sb(`library_shares?owner_id=eq.${ownerId}&viewer_id=eq.${viewer.id}&select=owner_id`) as unknown[])[0];
  if (!share) throw new AuthError(403, "That library hasn't been shared with you.");
  const owner = await getProfileById(ownerId);
  if (!owner || owner.status !== 'approved') throw new AuthError(404, 'That library is no longer available.');
  return owner;
}

/** Public-safe view of a profile (never includes tokens). */
export function publicProfile(p: Profile) {
  return { id: p.id, email: p.email, name: p.name, avatar_url: p.avatar_url, status: p.status, is_admin: p.is_admin };
}
