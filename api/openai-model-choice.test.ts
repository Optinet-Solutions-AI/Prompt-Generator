// The ChatGPT model dropdown: the three OpenAI routes (generate, edit,
// variations) must send the model the user picked to OpenAI and record it
// for the usage page, and fall back to gpt-image-2 for anything else.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Profile } from './_session.js';

const h = vi.hoisted(() => ({
  profile: { id: 'profile-1', email: 'qa@example.com' },
  recordImageUsage: vi.fn(async () => {}),
  generateGeminiImage: vi.fn(async () => ({
    bytes: Buffer.from('gemini-bytes'),
    mime: 'image/jpeg',
    usage: { text_input_tokens: 10, image_output_tokens: 1680 },
  })),
}));

vi.mock('./_session.js', async (importActual) => {
  const actual = await importActual<typeof import('./_session.js')>();
  return {
    ...actual,
    guard: vi.fn(async () => h.profile as unknown as Profile),
    requireUser: vi.fn(async () => h.profile as unknown as Profile),
  };
});

vi.mock('./_user-drive.js', () => ({
  ensureFolder: vi.fn(async () => 'folder-1'),
  uploadToUserDrive: vi.fn(async () => 'drive-file-1'),
  makeUserFilePublic: vi.fn(async () => {}),
}));

vi.mock('./_image-usage.js', async (importActual) => {
  const actual = await importActual<typeof import('./_image-usage.js')>();
  return { ...actual, recordImageUsage: h.recordImageUsage };
});

vi.mock('./_spend-cap.js', () => ({
  checkSpendCap: vi.fn(async () => ({ allowed: true, spent_today_usd: 0, cap_usd: 10 })),
}));

vi.mock('./_gemini-image.js', () => ({ generateGeminiImage: h.generateGeminiImage }));

import generateImage from './generate-image.js';
import editImage from './edit-image.js';
import generateVariations from './generate-variations.js';

// A real 1×1 PNG, so size detection and image processing run for real.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SOURCE = `data:image/png;base64,${PNG_B64}`;

interface OpenAiCall { url: string; init: RequestInit }
let openAiCalls: OpenAiCall[] = [];

function fakeRes() {
  const r = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader() { return r; },
    status(c: number) { r.statusCode = c; return r; },
    json(b: unknown) { r.body = b; return r; },
    end() { return r; },
  };
  return r;
}

async function call(
  handler: (req: VercelRequest, res: VercelResponse) => unknown,
  body: Record<string, unknown>,
) {
  const res = fakeRes();
  const req = { method: 'POST', headers: { host: 'localhost:8080', cookie: '' }, body };
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  return res;
}

/** The model each OpenAI request asked for: JSON body (generate) or multipart field (edit, variations). */
function sentModels(): string[] {
  return openAiCalls.map(({ init }) =>
    init.body instanceof FormData
      ? String(init.body.get('model'))
      : (JSON.parse(String(init.body)) as { model: string }).model,
  );
}

function recordedModels(): string[] {
  return h.recordImageUsage.mock.calls.map((c) => (c as unknown[])[1] as { model: string }).map((e) => e.model);
}

const savedKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  openAiCalls = [];
  h.recordImageUsage.mockClear();
  h.generateGeminiImage.mockClear();
  process.env.OPENAI_API_KEY = 'test-openai-key';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    if (url.startsWith('https://api.openai.com/')) {
      openAiCalls.push({ url, init });
      return new Response(
        JSON.stringify({ data: [{ b64_json: PNG_B64 }], usage: { input_tokens: 10, output_tokens: 100 } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedKey;
});

describe('generate-image: ChatGPT model choice', () => {
  it('generate-image sends and records the chosen ChatGPT test model', async () => {
    const res = await call(generateImage, { prompt: 'a hero', provider: 'chatgpt', openaiModel: 'gpt-image-2.6-flare' });
    expect(res.statusCode).toBe(200);
    expect(sentModels()).toEqual(['gpt-image-2.6-flare']);
    expect(recordedModels()).toEqual(['gpt-image-2.6-flare']);
  });

  it('generate-image uses gpt-image-2 when no ChatGPT model is sent', async () => {
    const res = await call(generateImage, { prompt: 'a hero', provider: 'chatgpt' });
    expect(res.statusCode).toBe(200);
    expect(sentModels()).toEqual(['gpt-image-2']);
    expect(recordedModels()).toEqual(['gpt-image-2']);
  });

  it('generate-image ignores a Gemini id sent as the ChatGPT model', async () => {
    const res = await call(generateImage, { prompt: 'a hero', provider: 'chatgpt', openaiModel: 'gemini-nano-banana-2.1' });
    expect(res.statusCode).toBe(200);
    expect(sentModels()).toEqual(['gpt-image-2']);
    expect(recordedModels()).toEqual(['gpt-image-2']);
  });
});

describe('edit-image: ChatGPT model choice', () => {
  it('edit-image sends and records the chosen ChatGPT test model', async () => {
    const res = await call(editImage, {
      imageUrl: SOURCE, editInstructions: 'make the kit green', provider: 'chatgpt', openaiModel: 'gpt-image-2.6-flare',
    });
    expect(res.statusCode).toBe(200);
    expect(openAiCalls.map((c) => c.url)).toEqual(['https://api.openai.com/v1/images/edits']);
    expect(sentModels()).toEqual(['gpt-image-2.6-flare']);
    expect(recordedModels()).toEqual(['gpt-image-2.6-flare']);
  });

  it('edit-image uses gpt-image-2 when no ChatGPT model is sent', async () => {
    const res = await call(editImage, { imageUrl: SOURCE, editInstructions: 'make the kit green', provider: 'chatgpt' });
    expect(res.statusCode).toBe(200);
    expect(sentModels()).toEqual(['gpt-image-2']);
    expect(recordedModels()).toEqual(['gpt-image-2']);
  });

  it('edit-image keeps a Gemini image on Gemini even when a ChatGPT test model is chosen', async () => {
    const res = await call(editImage, {
      imageUrl: SOURCE, editInstructions: 'make the kit green', provider: 'gemini',
      geminiModel: 'gemini-nano-banana-2.1', openaiModel: 'gpt-image-2.6-flare',
    });
    expect(res.statusCode).toBe(200);
    expect(openAiCalls).toHaveLength(0);
    expect(h.generateGeminiImage).toHaveBeenCalledTimes(1);
    expect((h.generateGeminiImage.mock.calls[0] as unknown[])[0]).toMatchObject({ modelId: 'gemini-nano-banana-2.1' });
    expect(recordedModels()).toEqual(['gemini-nano-banana-2.1']);
  });
});

describe('generate-variations: ChatGPT model choice', () => {
  it('generate-variations sends the chosen model on every variation and records it once', async () => {
    const res = await call(generateVariations, { imageUrl: SOURCE, count: 2, openaiModel: 'gpt-image-2.6-flare' });
    expect(res.statusCode).toBe(200);
    expect(sentModels()).toEqual(['gpt-image-2.6-flare', 'gpt-image-2.6-flare']);
    expect(h.recordImageUsage).toHaveBeenCalledTimes(1);
    expect((h.recordImageUsage.mock.calls[0] as unknown[])[1]).toMatchObject({ model: 'gpt-image-2.6-flare', images: 2 });
  });

  it('generate-variations uses gpt-image-2 when no ChatGPT model is sent', async () => {
    const res = await call(generateVariations, { imageUrl: SOURCE, count: 1 });
    expect(res.statusCode).toBe(200);
    expect(sentModels()).toEqual(['gpt-image-2']);
    expect(recordedModels()).toEqual(['gpt-image-2']);
  });
});
