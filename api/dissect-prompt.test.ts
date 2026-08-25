import { describe, it, expect, vi, beforeEach } from 'vitest';

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));
vi.mock('./_llm.js', () => ({ chat: (...args: unknown[]) => chatMock(...args) }));

import handler from './dissect-prompt.js';

function mockReqRes(body: unknown, method = 'POST') {
  const req = { method, body } as any;
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(p: unknown) { this.body = p; return this; },
  };
  return { req, res };
}

const FIELDS = {
  format_layout: 'Wide cinematic frame',
  primary_object: 'A glowing wheel',
  subject: 'An astronaut',
  lighting: 'Not specified in the source prompt',
  mood: 'Mysterious',
  background: 'Dark industrial bay',
  positive_prompt: 'A cinematic banner of an astronaut',
  negative_prompt: 'Not specified in the source prompt',
};

const OK = {
  text: JSON.stringify(FIELDS),
  usage: { input_tokens: 120, cached_input_tokens: 0, output_tokens: 300 },
};

describe('POST /api/dissect-prompt', () => {
  beforeEach(() => {
    chatMock.mockReset();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('returns the eight extracted fields and the usage', async () => {
    chatMock.mockResolvedValue(OK);
    const { req, res } = mockReqRes({ prompt: 'A cinematic banner of an astronaut', brand: 'RocketSpin' });
    await handler(req, res as any);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.fields.subject).toBe('An astronaut');
    expect(body.usage.output_tokens).toBe(300);
  });

  it('passes the pasted prompt as the user message and the schema to chat()', async () => {
    chatMock.mockResolvedValue(OK);
    const { req, res } = mockReqRes({ prompt: 'MY PASTED PROMPT', brand: 'RocketSpin' });
    await handler(req, res as any);
    const opts = chatMock.mock.calls[0][0] as any;
    expect(opts.user).toContain('MY PASTED PROMPT');
    expect(opts.json).toBe(true);
    expect(opts.jsonSchema).toBeTruthy();
  });

  it('uses gemini-3.7-flash — flash-lite returns 400 for the thinkingBudget the llm helper injects', async () => {
    chatMock.mockResolvedValue(OK);
    const { req, res } = mockReqRes({ prompt: 'x', brand: 'RocketSpin' });
    await handler(req, res as any);
    expect((chatMock.mock.calls[0][0] as any).model).toBe('gemini-3.7-flash');
  });

  it('gives the model enough tokens that a long prompt cannot truncate the JSON', async () => {
    chatMock.mockResolvedValue(OK);
    const { req, res } = mockReqRes({ prompt: 'x', brand: 'RocketSpin' });
    await handler(req, res as any);
    expect((chatMock.mock.calls[0][0] as any).maxTokens).toBeGreaterThanOrEqual(4000);
  });

  it('405s on GET', async () => {
    const { req, res } = mockReqRes({}, 'GET');
    await handler(req, res as any);
    expect(res.statusCode).toBe(405);
  });

  it('400s when prompt is missing', async () => {
    const { req, res } = mockReqRes({ brand: 'RocketSpin' });
    await handler(req, res as any);
    expect(res.statusCode).toBe(400);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('400s when prompt is only whitespace — do not spend money on an empty call', async () => {
    const { req, res } = mockReqRes({ prompt: '   \n  ', brand: 'RocketSpin' });
    await handler(req, res as any);
    expect(res.statusCode).toBe(400);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('400s when brand is missing', async () => {
    const { req, res } = mockReqRes({ prompt: 'x' });
    await handler(req, res as any);
    expect(res.statusCode).toBe(400);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('500s with the underlying detail when the model call fails', async () => {
    chatMock.mockRejectedValue(new Error('model unavailable'));
    const { req, res } = mockReqRes({ prompt: 'x', brand: 'RocketSpin' });
    await handler(req, res as any);
    expect(res.statusCode).toBe(500);
    expect(String((res.body as any).error)).toMatch(/model unavailable/);
  });

  it('500s when the model returns unparseable JSON', async () => {
    chatMock.mockResolvedValue({ text: 'not json', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });
    const { req, res } = mockReqRes({ prompt: 'x', brand: 'RocketSpin' });
    await handler(req, res as any);
    expect(res.statusCode).toBe(500);
  });
});
