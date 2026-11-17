import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VercelRequest } from '@vercel/node';
import { makeSessionValue, SESSION_COOKIE } from './_session.js';
import { resolveIdeasCaller, isKnownBrand } from './_ideas-caller.js';

// Profile ids are UUIDs (getProfileById rejects anything else).
const APPROVED = '96bd042c-0000-4000-8000-0000000000a1';
const PENDING = '96bd042c-0000-4000-8000-0000000000b2';
const STATUS: Record<string, string> = { [APPROVED]: 'approved', [PENDING]: 'pending' };

const req = (cookie = '') => ({ headers: { host: 'localhost:5173', cookie } }) as unknown as VercelRequest;
const cookieFor = (id: string) => `${SESSION_COOKIE}=${makeSessionValue(id)}`;

describe('resolveIdeasCaller — who is asking for ideas', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'x'.repeat(40);
    process.env.SUPABASE_URL = 'https://db.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    process.env.VITE_ASSISTANT_TOKENS = 'tester-a';
    // getProfileById → Supabase: answer with the profile's status for whatever id is asked
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const id = decodeURIComponent(String(url)).match(/id=eq\.([^&]+)/)?.[1] ?? '';
      return new Response(JSON.stringify(STATUS[id] ? [{ id, status: STATUS[id] }] : []), { status: 200 });
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('treats a valid tester token as the tester', async () => {
    expect(await resolveIdeasCaller(req(''), 'tester-a')).toEqual({ who: 'tester-a', kind: 'tester' });
  });

  it('rejects a wrong tester token with 401 even when signed in', async () => {
    await expect(resolveIdeasCaller(req(cookieFor(APPROVED)), 'nope')).rejects.toMatchObject({ status: 401 });
  });

  it('uses the signed-in approved person when there is no token', async () => {
    expect(await resolveIdeasCaller(req(cookieFor(APPROVED)), undefined)).toEqual({ who: APPROVED, kind: 'user' });
  });

  it('refuses signed-out (401) and pending (403)', async () => {
    await expect(resolveIdeasCaller(req(''), undefined)).rejects.toMatchObject({ status: 401 });
    await expect(resolveIdeasCaller(req(cookieFor(PENDING)), undefined)).rejects.toMatchObject({ status: 403 });
  });
});

describe('isKnownBrand', () => {
  it('knows exactly the 10 brands', () => {
    for (const b of ['Roosterbet', 'FortunePlay', 'SpinJo', 'LuckyVibe', 'SpinsUp', 'PlayMojo', 'Lucky7even', 'NovaDreams', 'Rollero', 'RocketSpin']) {
      expect(isKnownBrand(b), b).toBe(true);
    }
    expect(isKnownBrand('rocketspin')).toBe(false);
    expect(isKnownBrand('Unknown Casino')).toBe(false);
  });
});
