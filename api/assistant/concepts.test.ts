import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from './concepts.js';

// Mocking `chat` (rather than `global.fetch`) is what lets these tests assert
// HOW MANY calls are made and WHAT lens each one carries — the whole point of
// the fan-out is 3 concept calls + 1 recommendation call, each concept call
// under a different creative lens.
const chatMock = vi.fn();
vi.mock('../_llm.js', () => ({ chat: (...args: unknown[]) => chatMock(...args) }));

const logMock = vi.fn();
vi.mock('../_assistant-log.js', () => ({ logLlmCall: (...args: unknown[]) => logMock(...args) }));

vi.mock('../_spend-cap.js', () => ({
  checkSpendCap: async () => ({ allowed: true, spent_today_usd: 0, cap_usd: 1 }),
}));

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

describe('POST /api/assistant/concepts', () => {
  beforeEach(() => {
    process.env.VITE_ASSISTANT_TOKENS = 'tester-her-x9k2';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
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
});

function conceptReply(title: string) {
  return {
    text: JSON.stringify({ concepts: [{ title, description: `${title} description here.` }] }),
    usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 200 },
  };
}

const validBody = {
  token: 'tester-her-x9k2',
  brand: 'RocketSpin',
  task: 'banner for weekend rocket boost',
  model: 'gemini' as const,
};

describe('concepts fan-out', () => {
  beforeEach(() => {
    chatMock.mockReset();
    logMock.mockReset();
    process.env.VITE_ASSISTANT_TOKENS = 'tester-her-x9k2';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  it('makes 3 concept calls plus 1 recommendation call', async () => {
    chatMock
      .mockResolvedValueOnce(conceptReply('One'))
      .mockResolvedValueOnce(conceptReply('Two'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockResolvedValueOnce({ text: 'I would pick One.', usage: { input_tokens: 50, cached_input_tokens: 0, output_tokens: 10 } });

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(chatMock).toHaveBeenCalledTimes(4);
    const body = res.body as any;
    expect(body.concepts).toHaveLength(3);
    expect(body.recommendation).toBe('I would pick One.');
  });

  it('gives each concept call a DIFFERENT lens — this is the core of the design', async () => {
    chatMock
      .mockResolvedValueOnce(conceptReply('One'))
      .mockResolvedValueOnce(conceptReply('Two'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockResolvedValueOnce({ text: 'pick', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    // Extract the lens line from each of the 3 concept calls' user messages.
    const lenses = chatMock.mock.calls.slice(0, 3).map(c => {
      const m = String((c[0] as any).user).match(/CREATIVE LENS[^\n]*/);
      return m ? m[0] : '';
    });
    expect(new Set(lenses).size).toBe(3);
  });

  it('uses the Pro concepts model for the concept calls and the cheap tier for the recommendation', async () => {
    chatMock
      .mockResolvedValueOnce(conceptReply('One'))
      .mockResolvedValueOnce(conceptReply('Two'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockResolvedValueOnce({ text: 'pick', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    expect((chatMock.mock.calls[0][0] as any).model).toBe('gemini-3.1-pro-preview');
    expect((chatMock.mock.calls[3][0] as any).model).toBe('gemini-3.7-flash');
  });

  it('sums usage across all four calls', async () => {
    chatMock
      .mockResolvedValueOnce(conceptReply('One'))
      .mockResolvedValueOnce(conceptReply('Two'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockResolvedValueOnce({ text: 'pick', usage: { input_tokens: 50, cached_input_tokens: 0, output_tokens: 10 } });

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    // 3 x (100 in / 200 out) + 1 x (50 in / 10 out)
    expect((res.body as any).usage.input_tokens).toBe(350);
    expect((res.body as any).usage.output_tokens).toBe(610);
  });

  it('logs one row per call — four rows', async () => {
    chatMock
      .mockResolvedValueOnce(conceptReply('One'))
      .mockResolvedValueOnce(conceptReply('Two'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockResolvedValueOnce({ text: 'pick', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    expect(logMock).toHaveBeenCalledTimes(4);
    const steps = logMock.mock.calls.map(c => c[1]);
    expect(steps.filter(s => s === 'concepts')).toHaveLength(3);
    expect(steps.filter(s => s === 'concepts-recommend')).toHaveLength(1);
  });

  it('returns the survivors when one concept call fails, instead of failing everything', async () => {
    chatMock
      .mockResolvedValueOnce(conceptReply('One'))
      .mockRejectedValueOnce(new Error('model unavailable'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockResolvedValueOnce({ text: 'pick', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).concepts).toHaveLength(2);
  });

  it('500s only when every concept call fails', async () => {
    chatMock
      .mockRejectedValueOnce(new Error('boom a'))
      .mockRejectedValueOnce(new Error('boom b'))
      .mockRejectedValueOnce(new Error('boom c'));

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(500);
  });

  it('still returns concepts when only the recommendation call fails', async () => {
    chatMock
      .mockResolvedValueOnce(conceptReply('One'))
      .mockResolvedValueOnce(conceptReply('Two'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockRejectedValueOnce(new Error('synthesis down'));

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).concepts).toHaveLength(3);
    expect((res.body as any).recommendation).toBe('');
  });

  it('survives a concept call returning unparseable JSON', async () => {
    chatMock
      .mockResolvedValueOnce({ text: 'not json at all', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } })
      .mockResolvedValueOnce(conceptReply('Two'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockResolvedValueOnce({ text: 'pick', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).concepts).toHaveLength(2);
  });
});
