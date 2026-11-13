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
