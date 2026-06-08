import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chat } from './_llm.js';

const originalFetch = global.fetch;

describe('_llm.chat — OpenAI', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('calls OpenAI chat completions with the expected body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"concepts":[]}' } }],
        usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 0 } },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await chat({
      provider: 'openai',
      model: 'gpt-4o-mini',
      system: 'sys',
      user: 'usr',
      maxTokens: 600,
      json: true,
      jsonSchema: { type: 'object', properties: { concepts: { type: 'array' } }, required: ['concepts'] },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.max_completion_tokens).toBe(600);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe('sys');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toBe('usr');
    expect(body.response_format.type).toBe('json_schema');

    expect(result.text).toBe('{"concepts":[]}');
    expect(result.usage).toEqual({ input_tokens: 120, cached_input_tokens: 0, output_tokens: 30 });
  });

  it('captures cached_tokens when OpenAI returns them', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 2000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 1500 } },
      }),
    }) as unknown as typeof fetch;
    const r = await chat({ provider: 'openai', model: 'gpt-4o', system: 's', user: 'u', maxTokens: 100 });
    expect(r.usage.cached_input_tokens).toBe(1500);
  });

  it('throws on non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'err' }) as unknown as typeof fetch;
    await expect(
      chat({ provider: 'openai', model: 'gpt-4o', system: 's', user: 'u', maxTokens: 100 })
    ).rejects.toThrow(/OpenAI/);
  });

  it('sends reasoning_effort for gpt-5.2 when reasoningEffort is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 0 } } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await chat({ provider: 'openai', model: 'gpt-5.2', system: 's', user: 'u', maxTokens: 100, reasoningEffort: 'low' });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.reasoning_effort).toBe('low');
    expect(body.temperature).toBeUndefined();
  });

  it('omits a custom temperature for gpt-5.x models even when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 0 } } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await chat({ provider: 'openai', model: 'gpt-5.2', system: 's', user: 'u', maxTokens: 100, temperature: 0.9 });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.temperature).toBeUndefined();
  });

  it('includes temperature in the OpenAI body when provided, omits it otherwise', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 0 } } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await chat({ provider: 'openai', model: 'gpt-4o-mini', system: 's', user: 'u', maxTokens: 100, temperature: 0.9 });
    let body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.temperature).toBe(0.9);

    fetchMock.mockClear();
    await chat({ provider: 'openai', model: 'gpt-4o-mini', system: 's', user: 'u', maxTokens: 100 });
    body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.temperature).toBeUndefined();
  });
});

describe('_llm.chat — Gemini', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('calls the Gemini generateContent endpoint with system + user content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"concepts":[]}' }] } }],
        usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await chat({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      system: 'sys',
      user: 'usr',
      maxTokens: 600,
      json: true,
      jsonSchema: { type: 'object', properties: { concepts: { type: 'array' } }, required: ['concepts'] },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('models/gemini-2.5-flash:generateContent');
    expect(url).toContain('key=test-gemini-key');

    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.contents[0].parts[0].text).toBe('usr');
    expect(body.generationConfig.maxOutputTokens).toBe(600);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toBeDefined();
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });

    expect(result.text).toBe('{"concepts":[]}');
    expect(result.usage).toEqual({ input_tokens: 120, cached_input_tokens: 0, output_tokens: 30 });
  });

  it('omits thinkingConfig for Pro models (Pro requires thinking mode)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{}' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await chat({ provider: 'gemini', model: 'gemini-2.5-pro', system: 's', user: 'u', maxTokens: 4000 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(init.body as string);
    expect(sent.generationConfig.thinkingConfig).toBeUndefined();
    expect(sent.generationConfig.maxOutputTokens).toBe(4000);
  });

  it('retries once on 503 and succeeds on the retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'busy' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await chat({
      provider: 'gemini', model: 'gemini-2.5-pro', system: 's', user: 'u', maxTokens: 100,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('{"ok":true}');
  });

  it('surfaces the 5xx error after exhausting retries', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue({ ok: false, status: 503, text: async () => 'still busy' });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      chat({ provider: 'gemini', model: 'gemini-2.5-pro', system: 's', user: 'u', maxTokens: 100 })
    ).rejects.toThrow(/503.*still busy/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws when finishReason is not STOP (truncation guard)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          finishReason: 'MAX_TOKENS',
          content: { parts: [{ text: '{"concepts":[{"title":"Sky Stri' }] },
        }],
        usageMetadata: { promptTokenCount: 400, candidatesTokenCount: 600 },
      }),
    }) as unknown as typeof fetch;

    await expect(
      chat({ provider: 'gemini', model: 'gemini-2.5-flash', system: 's', user: 'u', maxTokens: 600, json: true })
    ).rejects.toThrow(/finishReason=MAX_TOKENS/);
  });

  it('includes temperature in the Gemini generationConfig when provided, omits it otherwise', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await chat({ provider: 'gemini', model: 'gemini-2.5-flash', system: 's', user: 'u', maxTokens: 100, temperature: 0.9 });
    let body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.generationConfig.temperature).toBe(0.9);

    fetchMock.mockClear();
    await chat({ provider: 'gemini', model: 'gemini-2.5-flash', system: 's', user: 'u', maxTokens: 100 });
    body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.generationConfig.temperature).toBeUndefined();
  });

  it('strips additionalProperties from the schema before sending to Gemini', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{}' }] } }],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10 },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await chat({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      system: 's',
      user: 'u',
      maxTokens: 100,
      json: true,
      jsonSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['concepts'],
        properties: {
          concepts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { title: { type: 'string' } },
            },
          },
        },
      },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(init.body as string);
    const json = JSON.stringify(sent.generationConfig.responseSchema);
    expect(json).not.toContain('additionalProperties');
    // Verify the surrounding schema survived the strip:
    expect(sent.generationConfig.responseSchema.required).toEqual(['concepts']);
    expect(sent.generationConfig.responseSchema.properties.concepts.items.properties.title.type).toBe('string');
  });
});
