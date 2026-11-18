import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './generate.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { makeSessionValue, SESSION_COOKIE } from '../_session.js';

function mockReqRes(body: unknown) {
  const req = { method: 'POST', body } as unknown as { method: string; body: unknown };
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
  return { req, res };
}

const originalFetch = global.fetch;
const STRUCTURED = {
  format_layout: 'Wide cinematic banner (16:9), hero centered.',
  primary_object: 'White-and-gold Iron Man-style armor.',
  subject: 'Athletic male hero, late 20s, blue eyes, tousled brown hair.',
  lighting: 'Warm golden-hour rays, volumetric god rays, soft cyan rim from chest reactor.',
  mood: 'Premium, victorious, cinematic.',
  background: 'Massive sunlit cumulus clouds during golden hour.',
  positive_prompt: 'Cinematic CGI of RocketSpin hero diving through a storm of gold coins…',
  negative_prompt: 'no text, no logos, no watermarks, no cartoon, no anime, no plastic skin.',
};

describe('POST /api/assistant/generate', () => {
  beforeEach(() => {
    process.env.VITE_ASSISTANT_TOKENS = 'tester-her-x9k2';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });
  afterEach(() => { global.fetch = originalFetch; });

  it('returns 401 on invalid token', async () => {
    const { req, res } = mockReqRes({ token: 'no', brand: 'RocketSpin', task: 't', model: 'gemini', pickedConcept: { title: 'x', description: 'y' } });
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(401);
  });

  it('returns structured fields + usage on valid Gemini call', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(STRUCTURED) }] } }],
        usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 400 },
      }),
    }) as unknown as typeof fetch;

    const { req, res } = mockReqRes({
      token: 'tester-her-x9k2',
      brand: 'RocketSpin',
      task: 'banner for weekend rocket boost',
      pickedConcept: { title: 'Sky Strike', description: 'Hero dives through gold coin storm.' },
      model: 'gemini',
    });
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.metadata).toMatchObject({
      brand: 'RocketSpin',
      format_layout: STRUCTURED.format_layout,
      positive_prompt: STRUCTURED.positive_prompt,
      negative_prompt: STRUCTURED.negative_prompt,
    });
    expect(body.prompt).toBe(STRUCTURED.positive_prompt);
    expect(body.usage).toEqual({
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      input_tokens: 800,
      cached_input_tokens: 0,
      output_tokens: 400,
    });
  });
});

describe('generate for signed-in people (main tool)', () => {
  const APPROVED = '96bd042c-0000-4000-8000-0000000000a1';
  const picked = { title: 'Sky Strike', description: 'Hero dives through gold coin storm.' };
  let logged: Array<Record<string, unknown>> = [];
  const call = (req: unknown, res: unknown) => handler(req as VercelRequest, res as VercelResponse);
  const withCookie = (body: unknown, cookie: string) => {
    const r = mockReqRes(body);
    return { req: { ...r.req, headers: { host: 'localhost:5173', cookie } }, res: r.res };
  };
  beforeEach(() => {
    logged = [];
    process.env.VITE_ASSISTANT_TOKENS = 'tester-her-x9k2';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.SESSION_SECRET = 'x'.repeat(40);
    process.env.SUPABASE_URL = 'https://db.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    // One fake for everything: the profile lookup, the spend-cap reads and the
    // cost-log insert (Supabase), and the Gemini answer.
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/rest/v1/profiles')) return new Response(JSON.stringify([{ id: APPROVED, status: 'approved' }]), { status: 200 });
      if (u.includes('/rest/v1/assistant_llm_calls') && init?.method === 'POST') { logged.push(JSON.parse(String(init.body))); return new Response('', { status: 201 }); }
      if (u.includes('db.example')) return new Response('[]', { status: 200 });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(STRUCTURED) }] } }],
        usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 400 },
      }), { status: 200 });
    }) as unknown as typeof fetch;
  });

  it('answers a signed-in person with no token and logs the cost under their id', async () => {
    const { req, res } = withCookie({ brand: 'SpinJo', task: 'weekend boost', pickedConcept: picked, model: 'gemini' }, `${SESSION_COOKIE}=${makeSessionValue(APPROVED)}`);
    await call(req, res);
    expect(res.statusCode).toBe(200);
    expect((res.body as { metadata: { subject: string } }).metadata.subject).toBe(STRUCTURED.subject);
    expect(logged.map((r) => r.test_user_id)).toEqual([APPROVED]);
  });

  it('refuses a signed-out request with no token (401)', async () => {
    const { req, res } = withCookie({ brand: 'SpinJo', task: 'weekend boost', pickedConcept: picked, model: 'gemini' }, '');
    await call(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('refuses a brand we do not have (400)', async () => {
    const { req, res } = mockReqRes({ token: 'tester-her-x9k2', brand: 'Unknown Casino', task: 't', pickedConcept: picked, model: 'gemini' });
    await call(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Unknown brand' });
  });
});

// The main tool asks for on-brief prompt parts (Lena's Black Friday report).
describe('on-brief prompt parts (main tool)', () => {
  let sent: string[] = [];
  beforeEach(() => {
    sent = [];
    process.env.VITE_ASSISTANT_TOKENS = 'tester-her-x9k2';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (!String(url).includes('generativelanguage')) return new Response('[]', { status: 200 }); // spend-cap / cost log
      sent.push(String(init?.body ?? ''));
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(STRUCTURED) }] } }],
        usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 400 },
      }), { status: 200 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => { global.fetch = originalFetch; });
  const body = { token: 'tester-her-x9k2', brand: 'PlayMojo', task: 'Black Friday Main Banner', pickedConcept: { title: 'Sale Night', description: 'Price tags rain down.' }, model: 'gemini' };

  it('onBrief: the model is told to show the occasion and not to exclude its cues', async () => {
    const { req, res } = mockReqRes({ ...body, onBrief: true });
    await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
    expect(res.statusCode).toBe(200);
    expect(sent.some((b) => b.includes('STAY ON BRIEF'))).toBe(true);
  });

  it('without onBrief (tester page): instructions unchanged', async () => {
    const { req, res } = mockReqRes(body);
    await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
    expect(res.statusCode).toBe(200);
    expect(sent.some((b) => b.includes('STAY ON BRIEF'))).toBe(false);
  });
});
