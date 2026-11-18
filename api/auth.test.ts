import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler, { approvalFor } from './auth.js';
import { makeSessionValue, SESSION_COOKIE } from './_session.js';

describe('approvalFor — who gets in without waiting', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.AUTO_APPROVE_DOMAINS = 'optinetsolutions.com';
    process.env.AUTO_APPROVE_EMAILS = 'Lena@roosterpartners.com';
    process.env.ADMIN_EMAILS = 'john@optinetsolutions.com';
  });
  afterEach(() => { process.env = { ...saved }; });

  it('pre-approves a listed outside email, ignoring upper/lower case', () => {
    expect(approvalFor('lena@roosterpartners.com').preApproved).toBe(true);
    expect(approvalFor('LENA@RoosterPartners.com').preApproved).toBe(true);
  });

  it('does NOT let in other people from the same outside domain', () => {
    expect(approvalFor('someone@roosterpartners.com').preApproved).toBe(false);
  });

  it('lets in company accounts and marks listed admins', () => {
    expect(approvalFor('maria@optinetsolutions.com')).toEqual({ isAdmin: false, preApproved: true });
    expect(approvalFor('john@optinetsolutions.com')).toEqual({ isAdmin: true, preApproved: true });
  });

  it('leaves everyone else pending', () => {
    expect(approvalFor('random@gmail.com').preApproved).toBe(false);
  });
});

describe('the "Everyone (admin)" list in the library menu', () => {
  const ADMIN = '96bd042c-0000-4000-8000-00000000ad01';
  const USER = '96bd042c-0000-4000-8000-00000000ad02';
  const people = [{ id: '96bd042c-0000-4000-8000-00000000ad03', email: 'meny@example.com', name: 'Meny', avatar_url: null }];
  let asked: string[] = [];
  beforeEach(() => {
    process.env.SESSION_SECRET = 'x'.repeat(40);
    process.env.SUPABASE_URL = 'https://db.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    asked = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = decodeURIComponent(String(url)); asked.push(u);
      const me = u.match(/profiles\?id=eq\.([^&]+)&select=\*/)?.[1];
      if (me) return new Response(JSON.stringify([{ id: me, status: 'approved', is_admin: me === ADMIN }]), { status: 200 });
      if (u.includes('library_shares')) return new Response('[]', { status: 200 });
      if (u.includes('drive_images_folder_id')) return new Response(JSON.stringify(people), { status: 200 });
      return new Response('[]', { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  async function sharesAs(id: string) {
    const out: { status?: number; body?: Record<string, unknown> } = {};
    const res = { setHeader: () => {}, status: (s: number) => { out.status = s; return res; }, json: (b: Record<string, unknown>) => { out.body = b; return res; } };
    await handler({ method: 'GET', query: { action: 'shares' }, headers: { host: 'app.example', cookie: `${SESSION_COOKIE}=${makeSessionValue(id)}` } } as unknown as VercelRequest, res as unknown as VercelResponse);
    return out;
  }

  it('lists everyone who has a library for an admin', async () => {
    const r = await sharesAs(ADMIN);
    expect(r.status).toBe(200);
    expect(r.body?.everyone).toEqual(people);
  });

  it('never gives the list to a regular user (and does not even look it up)', async () => {
    const r = await sharesAs(USER);
    expect(r.status).toBe(200);
    expect(r.body?.everyone).toBeUndefined();
    expect(asked.some(u => u.includes('drive_images_folder_id'))).toBe(false);
  });
});

describe('Sign in with Google after the Google account got a new email', () => {
  // Gal's Google account was linked to an OLD profile under its old email. Google now
  // reports gal@onwardmessage.com — and an admin already made a username account for it.
  const OLD = '96bd042c-0000-4000-8000-0000000000a1';
  const NEW = '96bd042c-0000-4000-8000-0000000000b2';
  type Row = Record<string, unknown>;
  let rows: Row[];

  /** A tiny stand-in for the Supabase profiles table, with the same uniqueness + "has a login" rules. */
  function fakeSupabase(url: string, init: RequestInit = {}): Response {
    const u = new URL(url);
    const filters = [...u.searchParams].filter(([k]) => k !== 'select');
    const matches = (r: Row) => filters.every(([col, v]) => (v === 'is.null' ? r[col] == null : String(r[col]) === v.replace(/^eq\./, '')));
    const conflict = (next: Row, self?: Row) => {
      for (const col of ['email', 'google_sub', 'username']) {
        if (next[col] != null && rows.some(r => r !== self && r[col] === next[col])) {
          return new Response(JSON.stringify({ code: '23505', details: `Key (${col})=(${next[col]}) already exists.`, message: `duplicate key value violates unique constraint "profiles_${col}_key"` }), { status: 409 });
        }
      }
      const hasLogin = next.google_sub != null || (next.username != null && next.password_hash != null) || next.status === 'blocked';
      return hasLogin ? null : new Response(JSON.stringify({ code: '23514', message: 'new row for relation "profiles" violates check constraint "profiles_has_login"' }), { status: 400 });
    };
    if (init.method === 'PATCH') {
      for (const r of rows.filter(matches)) {
        const next = { ...r, ...JSON.parse(String(init.body)) };
        const bad = conflict(next, r);
        if (bad) return bad;
        Object.assign(r, next);
      }
      return new Response(null, { status: 204 });
    }
    if (init.method === 'POST') {
      const next = { id: 'inserted', ...JSON.parse(String(init.body)) };
      const bad = conflict(next);
      if (bad) return bad;
      rows.push(next);
      return new Response(JSON.stringify([next]), { status: 201 });
    }
    return new Response(JSON.stringify(rows.filter(matches)), { status: 200 });
  }

  beforeEach(() => {
    process.env.SESSION_SECRET = 'x'.repeat(40);
    process.env.SUPABASE_URL = 'https://db.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
    rows = [
      { id: OLD, google_sub: 'google-123', email: 'gal@oldcompany.com', username: null, password_hash: null, status: 'approved', name: 'Gal' },
      { id: NEW, google_sub: null, email: 'gal@onwardmessage.com', username: 'gal.onward', password_hash: 'scrypt-hash', status: 'approved', name: null },
    ];
    const claims = { sub: 'google-123', email: 'gal@onwardmessage.com', email_verified: true, name: 'Gal' };
    const idToken = `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.x`;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (String(url).startsWith('https://oauth2.googleapis.com/token')
      ? new Response(JSON.stringify({ id_token: idToken, access_token: 'a', scope: 'openid email profile' }), { status: 200 })
      : fakeSupabase(String(url), init))));
  });
  afterEach(() => vi.unstubAllGlobals());

  async function googleCallback() {
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; }, status: () => res, end: () => res, json: () => res };
    await handler({ method: 'GET', query: { action: 'google-callback', state: 's1', code: 'c1' }, headers: { host: 'app.example', cookie: 'pg_oauth_state=s1' } } as unknown as VercelRequest, res as unknown as VercelResponse);
    const session = headers['Set-Cookie']?.match(new RegExp(`${SESSION_COOKIE}=([^.;]+)`))?.[1];
    return { location: headers.Location, uid: session ? JSON.parse(Buffer.from(session, 'base64url').toString('utf8')).uid : undefined };
  }

  it('signs them in to the account the admin made for that email', async () => {
    const r = await googleCallback();
    expect(r.location).toBe('/?auth=no-drive'); // signed in (this fake Google gave no Drive access)
    expect(r.uid).toBe(NEW);
    expect(rows.find(p => p.id === NEW)).toMatchObject({ google_sub: 'google-123', username: 'gal.onward', status: 'approved' });
  });

  it('retires the old profile so it can no longer be signed in to (its data stays)', async () => {
    await googleCallback();
    expect(rows.find(p => p.id === OLD)).toMatchObject({ google_sub: null, status: 'blocked', email: 'gal@oldcompany.com' });
  });
});
