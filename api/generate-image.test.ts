import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import { logAssistantImageGen, resizeToExact, pickOpenAiImageSize } from './generate-image.js';
import { resolveGeminiModel } from './_image-models.js';

const insertMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (_table: string) => ({ insert: insertMock }),
  }),
}));

describe('logAssistantImageGen', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ data: null, error: null });
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('no-ops when source is not "assistant"', async () => {
    const req = { body: { test_user_id: 'tester-her' } } as any;
    await logAssistantImageGen(req, 'file-id', 'openai', 'gpt-image-1', '1024x1024', 'standard');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('no-ops when test_user_id is missing even if source is "assistant"', async () => {
    const req = { body: { source: 'assistant' } } as any;
    await logAssistantImageGen(req, 'file-id', 'openai', 'gpt-image-1', '1024x1024', 'standard');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('inserts a row when source="assistant" + test_user_id are present', async () => {
    const req = { body: { source: 'assistant', test_user_id: 'tester-her', assistant_prompt_id: 'p-1' } } as any;
    await logAssistantImageGen(req, 'file-id-abc', 'openai', 'gpt-image-1', '1024x1024', 'standard');
    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0][0];
    expect(row).toMatchObject({
      prompt_id: 'p-1',
      test_user_id: 'tester-her',
      provider: 'openai',
      model: 'gpt-image-1',
      size: '1024x1024',
      quality: 'standard',
      image_count: 1,
      drive_file_id: 'file-id-abc',
    });
    expect('cost_usd' in row).toBe(true);
  });

  it('swallows insert errors silently (does not throw)', async () => {
    insertMock.mockRejectedValueOnce(new Error('supabase down'));
    const req = { body: { source: 'assistant', test_user_id: 'tester-her' } } as any;
    await expect(
      logAssistantImageGen(req, 'file-id', 'openai', 'gpt-image-1', '1024x1024', 'standard')
    ).resolves.toBeUndefined();
  });
});

// Build a real image in memory so we exercise sharp for real, not a mock.
async function makeImage(w: number, h: number, format: 'jpeg' | 'png') {
  const img = sharp({
    create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 30 } },
  });
  return format === 'jpeg' ? img.jpeg().toBuffer() : img.png().toBuffer();
}

describe('resizeToExact output format', () => {
  it('keeps a JPEG input as JPEG so Gemini images are not inflated to PNG', async () => {
    const src = await makeImage(1600, 900, 'jpeg');
    const out = await resizeToExact(src, '1200 × 600');
    expect(out.resized).toBe(true);
    expect(out.mime).toBe('image/jpeg');
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(600);
  });

  it('keeps a PNG input as PNG', async () => {
    const src = await makeImage(1600, 900, 'png');
    const out = await resizeToExact(src, '1200 × 600');
    expect(out.mime).toBe('image/png');
    expect((await sharp(out.buffer).metadata()).format).toBe('png');
  });

  it('mirror-extends to the exact size when the ratio differs', async () => {
    // 16:9 source (1.778) into a 2:1 target — the gap must be filled, not cropped.
    // Assert on the branch itself (via the mirror-extend log line), not just the
    // final dimensions — the two branches can produce identical dimensions, so a
    // dimension-only assertion would not catch the 2% threshold branch selection
    // silently breaking.
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const src = await makeImage(1600, 900, 'jpeg');
      const out = await resizeToExact(src, '1200 × 600');
      const meta = await sharp(out.buffer).metadata();
      expect(meta.width).toBe(1200);
      expect(meta.height).toBe(600);
      const loggedMirrorExtend = logSpy.mock.calls.some((call) =>
        call.some((arg) => typeof arg === 'string' && /mirror-extend/.test(arg))
      );
      expect(loggedMirrorExtend).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('does a plain lossless resize when the ratio already matches (no mirroring)', async () => {
    // A true 2:1 source into a 2:1 target — this is the gpt-image-2 case, where
    // the mirror-extend workaround must NOT kick in. Assert the mirror-extend
    // branch did NOT run (no matching log line) in addition to the dimensions,
    // since both branches yield the same output size when ratios already match.
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const src = await makeImage(2048, 1024, 'png');
      const out = await resizeToExact(src, '1200 × 600');
      const meta = await sharp(out.buffer).metadata();
      expect(meta.width).toBe(1200);
      expect(meta.height).toBe(600);
      expect(out.resized).toBe(true);
      const loggedMirrorExtend = logSpy.mock.calls.some((call) =>
        call.some((arg) => typeof arg === 'string' && /mirror-extend/.test(arg))
      );
      expect(loggedMirrorExtend).toBe(false);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('returns the original bytes untouched when no target size is derivable', async () => {
    const src = await makeImage(800, 800, 'png');
    const out = await resizeToExact(src, undefined, undefined);
    expect(out.resized).toBe(false);
    expect(out.buffer).toBe(src);
  });
});

describe('pickOpenAiImageSize', () => {
  // gpt-image-2 constraints, confirmed against the live API:
  // both edges multiples of 16, max edge 3840, 655,360 <= w*h <= 8,294,400.
  const parse = (s: string) => s.split('x').map(Number);

  it('produces an exact 2:1 for a wide banner at 2K — the size verified working', () => {
    expect(pickOpenAiImageSize(2, '2K')).toBe('2048x1024');
  });

  it('produces a square at 1K', () => {
    expect(pickOpenAiImageSize(1, '1K')).toBe('1024x1024');
  });

  it('produces an exact 2:1 at 1K for cheap previews', () => {
    expect(pickOpenAiImageSize(2, '1K')).toBe('1440x720');
  });

  it('always returns multiples of 16 on both edges', () => {
    for (const r of [1, 1.5, 16 / 9, 2, 0.667, 0.5625, 2.35]) {
      for (const res of ['1K', '2K', '3K', '4K']) {
        const [w, h] = parse(pickOpenAiImageSize(r, res));
        expect(w % 16, `${r} ${res} width`).toBe(0);
        expect(h % 16, `${r} ${res} height`).toBe(0);
      }
    }
  });

  it('always stays inside the pixel budget and edge limit', () => {
    // Includes tall ratios (0.25, 1/3, 0.28) alongside the original set — these
    // are the narrow-edge-rounding cases that used to violate the 3:1 limit
    // (regression test for the 832x2512 = 3.0192:1 bug fixed below). Every
    // ratio here is checked against BOTH the pixel/edge budget AND the 3:1
    // ratio bound in both directions, since the bug only showed up on the
    // lower bound and the pre-fix suite only ever checked the upper one.
    for (const r of [0.25, 1 / 3, 0.28, 0.34, 0.5, 1, 1.78, 2, 2.9, 3]) {
      for (const res of ['1K', '2K', '3K', '4K']) {
        const [w, h] = parse(pickOpenAiImageSize(r, res));
        expect(w * h, `${r} ${res} pixels`).toBeGreaterThanOrEqual(655360);
        expect(w * h, `${r} ${res} pixels`).toBeLessThanOrEqual(8294400);
        expect(Math.max(w, h), `${r} ${res} edge`).toBeLessThanOrEqual(3840);
        expect(Math.max(w / h, h / w), `${r} ${res} 3:1 bound`).toBeLessThanOrEqual(3.001);
      }
    }
  });

  it('stays within the 3:1 limit for a tall banner at 2K — the exact regression case (832x2512 = 3.0192:1)', () => {
    const [w, h] = parse(pickOpenAiImageSize(0.25, '2K'));
    expect(Math.max(w / h, h / w)).toBeLessThanOrEqual(3);
  });

  it('keeps the delivered ratio within 2% of the request so resizeToExact never mirrors', () => {
    for (const r of [1, 1.5, 16 / 9, 2, 0.667]) {
      const [w, h] = parse(pickOpenAiImageSize(r, '2K'));
      expect(Math.abs(w / h - r) / r, `ratio ${r}`).toBeLessThan(0.02);
    }
  });

  it('clamps a ratio beyond 3:1 rather than sending an invalid request', () => {
    const [w, h] = parse(pickOpenAiImageSize(8, '2K'));
    expect(w / h).toBeLessThanOrEqual(3.001);
  });

  it('falls back to the 2K budget for an unknown resolution string', () => {
    expect(pickOpenAiImageSize(2, 'nonsense')).toBe('2048x1024');
  });
});

describe('logAssistantImageGen with token usage', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ data: null, error: null });
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('stores the exact cost computed from usage when usage is supplied', async () => {
    const req = { body: { source: 'assistant', test_user_id: 'tester-her' } } as any;
    await logAssistantImageGen(req, 'f1', 'gemini', 'gemini-3-pro-image', '16:9', null, {
      text_input_tokens: 10,
      image_output_tokens: 1120,
    });
    const row = insertMock.mock.calls[0][0];
    expect(row.model).toBe('gemini-3-pro-image');
    expect(row.cost_usd).toBeCloseTo(0.13442, 5);
  });

  it('falls back to the legacy per-image table when no usage is supplied', async () => {
    const req = { body: { source: 'assistant', test_user_id: 'tester-her' } } as any;
    await logAssistantImageGen(req, 'f2', 'openai', 'gpt-image-2', '1024x1024', 'standard');
    const row = insertMock.mock.calls[0][0];
    expect(row.cost_usd).toBeCloseTo(0.040, 6);
  });

  it('never logs the placeholder model name "imagen"', async () => {
    const req = { body: { source: 'assistant', test_user_id: 'tester-her' } } as any;
    await logAssistantImageGen(req, 'f3', 'gemini', 'gemini-2.5-flash-image', '16:9', null, {
      text_input_tokens: 8,
      image_output_tokens: 1290,
    });
    expect(insertMock.mock.calls[0][0].model).not.toBe('imagen');
  });
});

// The Gemini direct-generation branch in generate-image.ts gates on
// `geminiSpec.transport === 'gemini-api'`, where geminiSpec = resolveGeminiModel(geminiModel).
// These five assertions are what stand between the feature working and it silently
// rendering on the wrong model: if this gate's transport logic is wrong, the new
// model never fires, the request quietly renders on the current model
// (gemini-2.5-flash-image, transport 'vertex') instead, and the user ends up
// comparing that model against itself while believing they tested something new.
describe('resolveGeminiModel gate (drives the Gemini direct-generation branch)', () => {
  it('defaults to vertex when no model is requested — falls through to Cloud Run', () => {
    expect(resolveGeminiModel(undefined).transport).toBe('vertex');
  });

  it('explicitly choosing the current model still falls through to Cloud Run', () => {
    expect(resolveGeminiModel('gemini-2.5-flash-image').transport).toBe('vertex');
  });

  it('choosing the new model fires the gemini-api branch', () => {
    expect(resolveGeminiModel('gemini-3-pro-image').transport).toBe('gemini-api');
  });

  it('an OpenAI id must not route into the Gemini branch', () => {
    expect(resolveGeminiModel('gpt-image-2').transport).toBe('vertex');
  });

  it('an unknown id falls back safely to vertex', () => {
    expect(resolveGeminiModel('gemini-99-nonexistent').transport).toBe('vertex');
  });
});
