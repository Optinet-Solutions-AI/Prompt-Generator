/**
 * Username + password sign-in, end to end through the real /api/auth handler,
 * with Supabase replaced by a tiny in-memory "profiles" table.
 */
import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import handler from './auth.js';
import { makeSessionValue } from './_session.js';
import { hashPassword, verifyPassword } from './_password.js';

type Row = Record<string, unknown>;
let rows: Row[] = [];
let migrationRun = true;

/** Just enough of Supabase's REST API (PostgREST) for the profiles table. */
async function fakeSupabase(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input));
  if (!url.pathname.endsWith('/profiles')) return new Response('[]');
  const method = init.method || 'GET';
  const filters = [...url.searchParams].filter(([k]) => !['select', 'order', 'on_conflict'].includes(k));
  if (!migrationRun && (filters.some(([k]) => k === 'username') || /password_hash|username/.test(url.searchParams.get('select') || ''))) {
    return new Response(JSON.stringify({ code: '42703', message: 'column profiles.username does not exist' }), { status: 400 });
  }
  const match = (r: Row) => filters.every(([k, v]) => v === 'is.null' ? r[k] == null : v === 'not.is.null' ? r[k] != null
    : v.startsWith('eq.') && String(r[k]) === decodeURIComponent(v.slice(3)));
  if (method === 'GET') return new Response(JSON.stringify(rows.filter(match)));
  if (method === 'PATCH') { rows.filter(match).forEach(r => Object.assign(r, JSON.parse(String(init.body)))); return new Response(null, { status: 204 }); }
  if (method === 'POST') {
    const body = JSON.parse(String(init.body)) as Row;
    if (body.username && rows.some(r => r.username === body.username)) {
      return new Response('{"message":"duplicate key value violates unique constraint \\"profiles_username_key\\""}', { status: 409 });
    }
    const row = { id: crypto.randomUUID(), google_sub: null, email: null, avatar_url: null, failed_logins: 0, locked_until: null, drive_refresh_token: null, ...body };
    rows.push(row);
    return new Response(JSON.stringify([row]), { status: 201 });
  }
  return new Response('[]');
}

interface FakeRes { statusCode: number; body: Record<string, unknown>; headers: Record<string, string | string[]> }

async function call(method: string, action: string, body: Row = {}, cookie = '', query: Row = {}): Promise<FakeRes> {
  const res = {
    statusCode: 200, body: {} as Record<string, unknown>, headers: {} as Record<string, string | string[]>,
    setHeader(k: string, v: string | string[]) { this.headers[k] = v; return this; },
    status(c: number) { this.statusCode = c; return this; },
    json(b: Record<string, unknown>) { this.body = b; return this; },
    end() { return this; },
  };
  const req = { method, query: { action, ...query }, headers: { host: 'localhost:8080', cookie }, body };
  await handler(req as never, res as never);
  return res;
}

const sessionCookie = (r: FakeRes) => String(r.headers['Set-Cookie'] || '').match(/pg_session=([^;]+)/)?.[1] || '';
const asUser = (id: string) => `pg_session=${makeSessionValue(id)}`;
const byUsername = (u: string) => rows.find(r => r.username === u)!;

async function addPasswordUser(username: string, password: string, extra: Row = {}) {
  const row = { id: crypto.randomUUID(), username, name: username, email: null, google_sub: null, status: 'approved', is_admin: false,
    password_hash: await hashPassword(password), must_change_password: false, failed_logins: 0, locked_until: null, drive_refresh_token: null, ...extra };
  rows.push(row);
  return row;
}

describe('username + password sign-in', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    rows = []; migrationRun = true;
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
    process.env.SESSION_SECRET = 'x'.repeat(40);
    vi.stubGlobal('fetch', vi.fn(fakeSupabase));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('signs in with the right password (any letter case in the username)', async () => {
    await addPasswordUser('maria.s', 'my-own-password');
    const r = await call('POST', 'password-login', { username: ' Maria.S ', password: 'my-own-password' });
    expect(r.statusCode).toBe(200);
    expect(sessionCookie(r)).not.toBe('');
  });

  it('also accepts the email the admin saved on the account, in any letter case', async () => {
    await addPasswordUser('nadia.k', 'temp-Pass-1234', { email: 'nadia@example.com', must_change_password: true });
    const r = await call('POST', 'password-login', { username: 'Nadia@Example.com', password: 'temp-Pass-1234' });
    expect(r.statusCode).toBe(200);
    expect(r.body.must_change_password).toBe(true);
  });

  it('an email that belongs to a Google-only account gets the normal "wrong" answer', async () => {
    rows.push({ id: crypto.randomUUID(), google_sub: 'g-1', email: 'boss@optinetsolutions.com', name: 'Boss', status: 'approved', password_hash: null });
    const r = await call('POST', 'password-login', { username: 'boss@optinetsolutions.com', password: 'anything-123' });
    expect(r.statusCode).toBe(401);
    expect(r.body.error).toBe('Wrong username or password.');
  });

  it('gives the same answer for an unknown username and a wrong password', async () => {
    await addPasswordUser('maria.s', 'my-own-password');
    const unknown = await call('POST', 'password-login', { username: 'nobody', password: 'whatever123' });
    const wrong = await call('POST', 'password-login', { username: 'maria.s', password: 'not-my-password' });
    expect([unknown.statusCode, wrong.statusCode]).toEqual([401, 401]);
    expect(unknown.body.error).toBe(wrong.body.error);
    expect(sessionCookie(wrong)).toBe('');
  });

  it('pauses the account after 5 wrong passwords — even the right one is refused until the lock ends', async () => {
    await addPasswordUser('maria.s', 'my-own-password');
    for (let i = 1; i <= 4; i++) {
      expect((await call('POST', 'password-login', { username: 'maria.s', password: `wrong-${i}-xxxx` })).statusCode).toBe(401);
      expect(byUsername('maria.s').failed_logins).toBe(i);
    }
    const fifth = await call('POST', 'password-login', { username: 'maria.s', password: 'wrong-5-xxxx' });
    expect(fifth.statusCode).toBe(429);
    expect(fifth.body.error).toMatch(/paused for 15 minutes/);
    const right = await call('POST', 'password-login', { username: 'maria.s', password: 'my-own-password' });
    expect(right.statusCode).toBe(429);
    expect(sessionCookie(right)).toBe('');
  });

  it('first sign-in with a temporary password gives NO session — only a token to choose a new password', async () => {
    await addPasswordUser('leo', 'temp-Pass-1234', { must_change_password: true });
    const r = await call('POST', 'password-login', { username: 'leo', password: 'temp-Pass-1234' });
    expect(r.statusCode).toBe(200);
    expect(r.body.must_change_password).toBe(true);
    expect(typeof r.body.change_token).toBe('string');
    expect(sessionCookie(r)).toBe('');
  });

  it('choosing the new password signs them in; the token then stops working', async () => {
    await addPasswordUser('leo', 'temp-Pass-1234', { must_change_password: true });
    const { body } = await call('POST', 'password-login', { username: 'leo', password: 'temp-Pass-1234' });
    const token = body.change_token as string;

    expect((await call('POST', 'change-password', { change_token: token, new_password: 'short' })).statusCode).toBe(400);
    expect((await call('POST', 'change-password', { change_token: token, new_password: 'temp-Pass-1234' })).body.error).toMatch(/not the one you have now/);

    const ok = await call('POST', 'change-password', { change_token: token, new_password: 'leos-own-password' });
    expect(ok.statusCode).toBe(200);
    expect(sessionCookie(ok)).not.toBe('');
    expect(byUsername('leo').must_change_password).toBe(false);
    expect(await verifyPassword('leos-own-password', byUsername('leo').password_hash as string)).toBe(true);

    const again = await call('POST', 'change-password', { change_token: token, new_password: 'another-password' });
    expect(again.statusCode).toBe(401);
    expect((await call('POST', 'password-login', { username: 'leo', password: 'leos-own-password' })).body.success).toBe(true);
  });

  it('rejects a forged or tampered change token', async () => {
    const u = await addPasswordUser('leo', 'temp-Pass-1234', { must_change_password: true });
    const forged = `${Buffer.from(JSON.stringify({ uid: u.id, fp: 'x', exp: Date.now() + 60_000 })).toString('base64url')}.bad`;
    expect((await call('POST', 'change-password', { change_token: forged, new_password: 'leos-own-password' })).statusCode).toBe(401);
    // A real sign-in session is not a change token either.
    expect((await call('POST', 'change-password', { change_token: makeSessionValue(u.id), new_password: 'leos-own-password' })).statusCode).toBe(401);
  });

  it('changing it later from the menu needs the current password', async () => {
    const u = await addPasswordUser('maria.s', 'my-own-password');
    expect((await call('POST', 'change-password', { current_password: 'nope-nope-nope', new_password: 'brand-new-password' }, asUser(u.id))).statusCode).toBe(401);
    expect((await call('POST', 'change-password', { current_password: 'my-own-password', new_password: 'brand-new-password' }, asUser(u.id))).statusCode).toBe(200);
    expect(await verifyPassword('brand-new-password', byUsername('maria.s').password_hash as string)).toBe(true);
  });

  it('"me" tells the app this is a password account', async () => {
    const u = await addPasswordUser('maria.s', 'my-own-password');
    const r = await call('GET', 'me', {}, asUser(u.id));
    expect(r.body.user).toMatchObject({ username: 'maria.s', has_password: true, has_google: false, email: null });
    expect(JSON.stringify(r.body)).not.toContain('scrypt');
  });

  it('says clearly when the Supabase migration has not been run yet', async () => {
    migrationRun = false;
    const r = await call('POST', 'password-login', { username: 'maria.s', password: 'my-own-password' });
    expect(r.statusCode).toBe(503);
    expect(r.body.error).toMatch(/2026-10-08-password-login\.sql/);
  });
});

describe('Manage accounts (admins)', () => {
  const saved = { ...process.env };
  let admin: Row, member: Row;
  beforeEach(async () => {
    rows = []; migrationRun = true;
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
    process.env.SESSION_SECRET = 'x'.repeat(40);
    vi.stubGlobal('fetch', vi.fn(fakeSupabase));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    admin = { id: crypto.randomUUID(), google_sub: 'g-1', email: 'boss@optinetsolutions.com', name: 'Boss', status: 'approved', is_admin: true, drive_refresh_token: 'r' };
    member = await addPasswordUser('member', 'member-password', {});
    rows.push(admin);
  });
  afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('only admins can create accounts or see the list', async () => {
    expect((await call('POST', 'admin-create-user', { username: 'new.one', name: 'New One' }, asUser(member.id as string))).statusCode).toBe(403);
    expect((await call('GET', 'admin-users', {}, asUser(member.id as string))).statusCode).toBe(403);
    expect((await call('GET', 'admin-users')).statusCode).toBe(401);
  });

  it('creating an account returns a temporary password ONCE and stores only its hash', async () => {
    const r = await call('POST', 'admin-create-user', { username: 'New.One', name: '  New   One ', email: '' }, asUser(admin.id as string));
    expect(r.statusCode).toBe(200);
    const temp = r.body.temp_password as string;
    expect(temp).toMatch(/^\w{4}-\w{4}-\w{4}$/);
    const row = byUsername('new.one');
    expect(row).toMatchObject({ name: 'New One', email: null, status: 'approved', is_admin: false, must_change_password: true });
    expect(JSON.stringify(row)).not.toContain(temp);
    expect(await verifyPassword(temp, row.password_hash as string)).toBe(true);
    // …and that temporary password leads to "choose your own" — not straight into the app
    expect((await call('POST', 'password-login', { username: 'new.one', password: temp })).body.must_change_password).toBe(true);
  });

  it('refuses a taken username and bad input', async () => {
    const as = asUser(admin.id as string);
    expect((await call('POST', 'admin-create-user', { username: 'member', name: 'Dup' }, as)).body.error).toMatch(/already taken/);
    expect((await call('POST', 'admin-create-user', { username: 'a b', name: 'X' }, as)).statusCode).toBe(400);
    expect((await call('POST', 'admin-create-user', { username: 'okname', name: '' }, as)).statusCode).toBe(400);
    expect((await call('POST', 'admin-create-user', { username: 'okname', name: 'X', email: 'not-an-email' }, as)).statusCode).toBe(400);
  });

  it('resetting a password unlocks the account and makes them choose a new one', async () => {
    Object.assign(member, { locked_until: new Date(Date.now() + 600_000).toISOString(), failed_logins: 3 });
    const r = await call('POST', 'admin-reset-password', { id: member.id }, asUser(admin.id as string));
    expect(r.statusCode).toBe(200);
    expect(member).toMatchObject({ locked_until: null, failed_logins: 0, must_change_password: true });
    expect((await call('POST', 'password-login', { username: 'member', password: 'member-password' })).statusCode).toBe(401);
    expect((await call('POST', 'password-login', { username: 'member', password: r.body.temp_password })).body.must_change_password).toBe(true);
  });

  it('cannot reset a Google-only account', async () => {
    expect((await call('POST', 'admin-reset-password', { id: admin.id }, asUser(admin.id as string))).statusCode).toBe(400);
  });

  it('the list never includes password hashes or Drive tokens', async () => {
    const r = await call('GET', 'admin-users', {}, asUser(admin.id as string));
    expect(r.statusCode).toBe(200);
    const text = JSON.stringify(r.body);
    expect(text).not.toContain('scrypt');
    expect(text).not.toContain('drive_refresh_token');
    expect((r.body.users as Row[]).find(u => u.id === admin.id)).toMatchObject({ has_google: true, has_password: false, drive_connected: true });
  });
});

describe('"Connect Google Drive" for a password account', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    rows = [];
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
    process.env.SESSION_SECRET = 'x'.repeat(40);
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csecret';
    vi.stubGlobal('fetch', vi.fn(fakeSupabase));
  });
  afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); });

  it('asks Google for Drive access only, tied to the signed-in account', async () => {
    const u = await addPasswordUser('maria.s', 'my-own-password');
    const r = await call('GET', 'google-start', {}, asUser(u.id as string), { link: 'drive' });
    expect(r.statusCode).toBe(302);
    const google = new URL(String(r.headers.Location));
    expect(google.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
    const state = google.searchParams.get('state');
    expect(String(r.headers['Set-Cookie'])).toContain(`pg_oauth_state=${state}.${u.id};`);
  });

  it('sends a signed-out person back with a message instead', async () => {
    const r = await call('GET', 'google-start', {}, '', { link: 'drive' });
    expect(r.statusCode).toBe(302);
    expect(String(r.headers.Location)).toMatch(/^\/\?auth=error:/);
  });

  it('a normal Google sign-in is unchanged (identity + Drive, no account in the state)', async () => {
    const r = await call('GET', 'google-start');
    const google = new URL(String(r.headers.Location));
    expect(google.searchParams.get('scope')).toBe('openid email profile https://www.googleapis.com/auth/drive.file');
    expect(String(r.headers['Set-Cookie'])).toMatch(/^pg_oauth_state=[0-9a-f]{32};/);
  });
});

describe('coming back from Google', () => {
  const saved = { ...process.env };
  let googleTokens: Row = {};
  /** Supabase (in memory) + Google's token endpoint; Google Drive is "down" (folder pre-creation is best effort). */
  async function fakeEverything(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
    const url = String(input);
    if (url.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify(googleTokens));
    if (url.startsWith('https://www.googleapis.com/')) return new Response('drive down', { status: 500 });
    return fakeSupabase(input, init);
  }
  const idToken = (claims: Row) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

  beforeEach(() => {
    rows = []; migrationRun = true;
    Object.assign(process.env, {
      SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key', SESSION_SECRET: 'x'.repeat(40),
      GOOGLE_OAUTH_CLIENT_ID: 'cid', GOOGLE_OAUTH_CLIENT_SECRET: 'csecret', AUTO_APPROVE_DOMAINS: 'optinetsolutions.com',
    });
    vi.stubGlobal('fetch', vi.fn(fakeEverything));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('"Connect Google Drive" saves Drive on the password account — it does not become a Google login', async () => {
    const u = await addPasswordUser('maria.s', 'my-own-password');
    googleTokens = { access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' };
    const r = await call('GET', 'google-callback', {}, `pg_oauth_state=abc.${u.id}; ${asUser(u.id as string)}`, { state: 'abc', code: 'c' });
    expect(r.headers.Location).toBe('/?auth=drive-connected');
    expect(byUsername('maria.s')).toMatchObject({ drive_refresh_token: 'rt', drive_access_token: 'at', google_sub: null });
    expect(rows).toHaveLength(1);
  });

  it('refuses when someone else is signed in by the time Google sends them back', async () => {
    const maria = await addPasswordUser('maria.s', 'my-own-password');
    const leo = await addPasswordUser('leo', 'leos-password-1');
    googleTokens = { access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' };
    const r = await call('GET', 'google-callback', {}, `pg_oauth_state=abc.${maria.id}; ${asUser(leo.id as string)}`, { state: 'abc', code: 'c' });
    expect(String(r.headers.Location)).toMatch(/^\/\?auth=error:/);
    expect(rows.every(x => x.drive_refresh_token == null)).toBe(true);
  });

  it('Drive box left unticked → "no-drive", nothing saved', async () => {
    const u = await addPasswordUser('maria.s', 'my-own-password');
    googleTokens = { access_token: 'at', expires_in: 3600, scope: '' };
    const r = await call('GET', 'google-callback', {}, `pg_oauth_state=abc.${u.id}; ${asUser(u.id as string)}`, { state: 'abc', code: 'c' });
    expect(r.headers.Location).toBe('/?auth=no-drive');
    expect(byUsername('maria.s').drive_refresh_token).toBeNull();
  });

  it('"Sign in with Google" with the email an admin put on a password account opens THAT account (no duplicate)', async () => {
    await addPasswordUser('maria.s', 'my-own-password', { email: 'maria@optinetsolutions.com' });
    googleTokens = {
      access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'openid email https://www.googleapis.com/auth/drive.file',
      id_token: idToken({ sub: 'g-maria', email: 'Maria@optinetsolutions.com', email_verified: true, name: 'Maria Santos' }),
    };
    const r = await call('GET', 'google-callback', {}, 'pg_oauth_state=abc', { state: 'abc', code: 'c' });
    expect(r.headers.Location).toBe('/?auth=signed-in');
    expect(rows).toHaveLength(1);
    expect(byUsername('maria.s')).toMatchObject({ google_sub: 'g-maria', drive_refresh_token: 'rt' });
    expect(await verifyPassword('my-own-password', byUsername('maria.s').password_hash as string)).toBe(true);
  });

  it('a brand-new Google user is still created exactly as before', async () => {
    googleTokens = {
      access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'openid email https://www.googleapis.com/auth/drive.file',
      id_token: idToken({ sub: 'g-new', email: 'new@optinetsolutions.com', email_verified: true, name: 'New Person' }),
    };
    const r = await call('GET', 'google-callback', {}, 'pg_oauth_state=abc', { state: 'abc', code: 'c' });
    expect(r.headers.Location).toBe('/?auth=signed-in');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ google_sub: 'g-new', email: 'new@optinetsolutions.com', status: 'approved' });
    expect(sessionCookie(r)).not.toBe('');
  });
});
