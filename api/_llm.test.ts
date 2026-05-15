import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chat } from './_llm';

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

    expect(result.text).toBe('{"concepts":[]}');
    expect(result.usage).toEqual({ input_tokens: 120, cached_input_tokens: 0, output_tokens: 30 });
  });
});
