import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setSessionCookie, clearSessionCookie, currentProfile, libraryOwner, itemOwner, SESSION_COOKIE, type Profile } from './_session.js';

const DAY = 24 * 3600 * 1000;
const UID = '96bd042c-0000-4000-8000-000000000001';   // profile ids are UUIDs (getProfileById rejects anything else)
const req = (host = 'prompt-generator-virid-delta.vercel.app', cookie = '') =>
  ({ headers: { host, cookie } }) as unknown as VercelRequest;
function res() {
  const headers: Record<string, string> = {};
  return { headers, setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v; } } as unknown as VercelResponse & { headers: Record<string, string> };
}

describe('staying signed in', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'x'.repeat(40);
    process.env.SUPABASE_URL = 'https://db.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    // getProfileById → Supabase: answer with an approved profile for whatever id is asked
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const id = decodeURIComponent(String(url)).match(/id=eq\.([^&]+)/)?.[1];
      return new Response(JSON.stringify([{ id, status: 'approved' }]), { status: 200 });
    }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('keeps the sign-in cookie for 30 days, so closing the browser does not sign you out', () => {
    const r = res();
    setSessionCookie(req(), r, UID);
    const cookie = r.headers['set-cookie'];
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).toContain('Max-Age=2592000');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
  });

  it('still accepts the sign-in 29 days later, and refuses it after 30 days', async () => {
    const r = res();
    setSessionCookie(req(), r, UID);
    const value = r.headers['set-cookie'].split(';')[0].split('=').slice(1).join('=');
    const withCookie = req(undefined, `${SESSION_COOKIE}=${value}`);

    vi.setSystemTime(Date.now() + 29 * DAY);
    expect((await currentProfile(withCookie))?.id).toBe(UID);

    vi.setSystemTime(Date.now() + 2 * DAY);   // 31 days after signing in
    expect(await currentProfile(withCookie)).toBeNull();
  });

  it('signing out still deletes the cookie straight away', () => {
    const r = res();
    clearSessionCookie(req(), r);
    expect(r.headers['set-cookie']).toContain('Max-Age=0');
  });
});

describe('whose library someone may open', () => {
  const OWNER = '96bd042c-0000-4000-8000-0000000000aa';
  const BLOCKED = '96bd042c-0000-4000-8000-0000000000bb';
  const viewer = (is_admin: boolean) => ({ id: UID, status: 'approved', is_admin }) as unknown as Profile;
  const profiles: Record<string, { id: string; status: string }> = {
    [OWNER]: { id: OWNER, status: 'approved' },
    [BLOCKED]: { id: BLOCKED, status: 'blocked' },
  };
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://db.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    // Supabase: nobody has shared anything with the viewer; profiles answer by id
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = decodeURIComponent(String(url));
      if (u.includes('library_shares') || u.includes('item_shares')) return new Response('[]', { status: 200 });
      const id = u.match(/profiles\?id=eq\.([^&]+)/)?.[1] || '';
      return new Response(JSON.stringify(profiles[id] ? [profiles[id]] : []), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a regular user still cannot open a library nobody shared with them', async () => {
    await expect(libraryOwner(viewer(false), OWNER)).rejects.toMatchObject({ status: 403 });
  });

  it('an admin can open anyone\'s library without it being shared', async () => {
    expect((await libraryOwner(viewer(true), OWNER)).id).toBe(OWNER);
  });

  it('an admin can also open a blocked person\'s library, so their past work stays visible', async () => {
    expect((await libraryOwner(viewer(true), BLOCKED)).id).toBe(BLOCKED);
  });

  it('an admin asking for someone who does not exist gets "not found"', async () => {
    await expect(libraryOwner(viewer(true), '96bd042c-0000-4000-8000-0000000000cc')).rejects.toMatchObject({ status: 404 });
  });

  it('an admin can play one of someone else\'s videos; a regular user still cannot', async () => {
    expect((await itemOwner(viewer(true), OWNER, 'video', 'drive-file-1')).id).toBe(OWNER);
    await expect(itemOwner(viewer(false), OWNER, 'video', 'drive-file-1')).rejects.toMatchObject({ status: 403 });
  });
});
