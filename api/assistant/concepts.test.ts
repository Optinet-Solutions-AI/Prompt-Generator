import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './concepts';

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

describe('POST /api/assistant/concepts', () => {
  beforeEach(() => {
    process.env.VITE_ASSISTANT_TOKENS = 'tester-her-x9k2';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns 401 on invalid token', async () => {
    const { req, res } = mockReqRes({ token: 'nope', brand: 'RocketSpin', task: 't', model: 'gemini' });
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(401);
  });

  it('returns 405 on GET', async () => {
    const { req, res } = mockReqRes({});
    (req as any).method = 'GET';
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(405);
  });

  it('returns 3 concepts + usage on a valid Gemini call', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          concepts: [
            { title: 'Sky Strike',   description: 'Hero dives through gold coin storm.' },
            { title: 'Vault Heist',  description: 'Hero stands inside cyan-lit vault.' },
            { title: 'Cloud Throne', description: 'Hero perched atop golden cumulus.' },
          ],
          recommendation: 'I would pick Sky Strike for the strongest negative space.',
        }) }] } }],
        usageMetadata: { promptTokenCount: 350, candidatesTokenCount: 180 },
      }),
    }) as unknown as typeof fetch;

    const { req, res } = mockReqRes({
      token: 'tester-her-x9k2',
      brand: 'RocketSpin',
      task: 'banner for weekend rocket boost',
      model: 'gemini',
    });
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.concepts).toHaveLength(3);
    expect(body.recommendation).toMatch(/Sky Strike/);
    expect(body.usage).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      input_tokens: 350,
      cached_input_tokens: 0,
      output_tokens: 180,
    });
  });
});
