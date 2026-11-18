import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VercelRequest } from '@vercel/node';
import { makeSessionValue, SESSION_COOKIE } from './_session.js';
import { recordImageUsage } from './_image-usage.js';

// Signed-in people's images are recorded for My usage / Team usage. Only a
// REAL AI Assistant tester (valid tester token) is logged elsewhere instead —
// marking a request "assistant" must not hide a signed-in person's cost.
const ME = '96bd042c-0000-4000-8000-0000000000a1';
let inserts: Array<Record<string, unknown>> = [];
const req = (body: Record<string, unknown>) =>
  ({ headers: { host: 'localhost:5173', cookie: `${SESSION_COOKIE}=${makeSessionValue(ME)}` }, body }) as unknown as VercelRequest;
const usage = { action: 'generate' as const, provider: 'chatgpt' as const, model: 'gpt-image-1', images: 1, tokens: null, brand: 'SpinJo' };

describe('recordImageUsage', () => {
  beforeEach(() => {
    inserts = [];
    process.env.SESSION_SECRET = 'x'.repeat(40);
    process.env.SUPABASE_URL = 'https://db.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    process.env.VITE_ASSISTANT_TOKENS = 'tester-her';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/rest/v1/image_usage') && init?.method === 'POST') {
        inserts.push(JSON.parse(String(init.body)));
        return new Response('', { status: 201 });
      }
      return new Response(JSON.stringify([{ id: ME, status: 'approved', email: 'me@example.com', name: 'Me' }]), { status: 200 });
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("records a signed-in person's image", async () => {
    await recordImageUsage(req({}), usage);
    expect(inserts.map((r) => r.user_id)).toEqual([ME]);
  });

  it('still records it when the request claims to be "assistant" without a real tester token', async () => {
    await recordImageUsage(req({ source: 'assistant', test_user_id: 'made-up' }), usage);
    expect(inserts.map((r) => r.user_id)).toEqual([ME]);
  });

  it('leaves a real tester request to the assistant log', async () => {
    await recordImageUsage(req({ source: 'assistant', test_user_id: 'tester-her' }), usage);
    expect(inserts).toEqual([]);
  });
});
