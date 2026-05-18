import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './refine.js';

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

const CURRENT_FIELDS = {
  format_layout: 'banner 16:9',
  primary_object: 'hero in armor',
  subject: 'athletic male hero',
  lighting: 'golden hour',
  mood: 'victorious',
  background: 'cumulus clouds',
  positive_prompt: 'Cinematic hero against golden sky with rockets',
  negative_prompt: 'no text, no watermarks',
};

const REFINED_FIELDS = {
  ...CURRENT_FIELDS,
  background: 'tropical beach at sunset',
  positive_prompt: 'Cinematic hero standing on a tropical beach at sunset with smaller rockets',
};

describe('POST /api/assistant/refine', () => {
  beforeEach(() => {
    process.env.VITE_ASSISTANT_TOKENS = 'tester-her-x9k2';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });
  afterEach(() => { global.fetch = originalFetch; });

  it('returns 401 on invalid token', async () => {
    const { req, res } = mockReqRes({
      token: 'nope', brand: 'RocketSpin', currentFields: CURRENT_FIELDS,
      userMessage: 'change it', model: 'gemini',
    });
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when required fields missing', async () => {
    const { req, res } = mockReqRes({ token: 'tester-her-x9k2', model: 'gemini' });
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('returns action=refine with refinedFields when user feedback is specific', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          action: 'refine',
          message: 'Switching the scene to a tropical beach and shrinking the rockets.',
          refinedFields: REFINED_FIELDS,
        }) }] } }],
        usageMetadata: { promptTokenCount: 600, candidatesTokenCount: 300 },
      }),
    }) as unknown as typeof fetch;

    const { req, res } = mockReqRes({
      token: 'tester-her-x9k2',
      brand: 'RocketSpin',
      currentFields: CURRENT_FIELDS,
      chatHistory: [{ role: 'assistant', content: 'Generated v1' }],
      userMessage: 'change to a beach, make rockets smaller',
      model: 'gemini',
    });
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.action).toBe('refine');
    expect(body.message).toMatch(/tropical beach/i);
    expect(body.refinedFields.background).toBe('tropical beach at sunset');
    expect(body.refinedFields.positive_prompt).toMatch(/tropical beach/i);
    expect(body.usage).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      input_tokens: 600,
      cached_input_tokens: 0,
      output_tokens: 300,
    });
  });

  it('returns action=clarify with 3 options when user feedback is vague', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          action: 'clarify',
          message: '"Better" can mean a few things. Which direction?',
          options: [
            { label: 'More dramatic',  description: 'Darker sky, stronger god rays, taller hero pose.' },
            { label: 'More colorful',  description: 'Stronger cyan-gold contrast, brighter highlights.' },
            { label: 'Calmer',         description: 'Softer lighting, fewer particles, gentler stance.' },
          ],
        }) }] } }],
        usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 200 },
      }),
    }) as unknown as typeof fetch;

    const { req, res } = mockReqRes({
      token: 'tester-her-x9k2',
      brand: 'RocketSpin',
      currentFields: CURRENT_FIELDS,
      userMessage: 'make it better',
      model: 'gemini',
    });
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.action).toBe('clarify');
    expect(body.options).toHaveLength(3);
    expect(body.options[0]).toHaveProperty('label');
    expect(body.options[0]).toHaveProperty('description');
    expect(body.refinedFields).toBeUndefined();
  });
});
