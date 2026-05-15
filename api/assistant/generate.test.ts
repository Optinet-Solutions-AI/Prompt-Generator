import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './generate';

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
      model: 'gemini-2.5-pro',
      input_tokens: 800,
      cached_input_tokens: 0,
      output_tokens: 400,
    });
  });
});
