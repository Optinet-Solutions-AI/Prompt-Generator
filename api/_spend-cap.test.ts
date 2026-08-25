import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkSpendCap } from './_spend-cap.js';

const originalFetch = global.fetch;

// Every test hits two tables: assistant_llm_calls (priced via computeLlmCost)
// and assistant_image_gens (priced by reading its stored cost_usd directly).
// This router lets each test control both responses independently by
// inspecting which table the URL is querying — Promise.all() inside
// checkSpendCap fires both fetches, so a mock keyed on call order would be
// unreliable.
function makeFetchMock(opts: {
  llmRows?: unknown[];
  llmOk?: boolean;
  llmStatus?: number;
  llmThrows?: boolean;
  imageRows?: unknown[];
  imageOk?: boolean;
  imageStatus?: number;
  imageThrows?: boolean;
}) {
  return vi.fn(async (url: string) => {
    if (url.includes('assistant_llm_calls')) {
      if (opts.llmThrows) throw new Error('network down (llm)');
      return {
        ok: opts.llmOk ?? true,
        status: opts.llmStatus ?? 200,
        json: async () => opts.llmRows ?? [],
      };
    }
    if (url.includes('assistant_image_gens')) {
      if (opts.imageThrows) throw new Error('network down (image)');
      return {
        ok: opts.imageOk ?? true,
        status: opts.imageStatus ?? 200,
        json: async () => opts.imageRows ?? [],
      };
    }
    throw new Error(`unexpected fetch url in test: ${url}`);
  });
}

describe('checkSpendCap', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    delete process.env.ASSISTANT_DAILY_SPEND_CAP_USD;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.ASSISTANT_DAILY_SPEND_CAP_USD;
  });

  it('counts image spend toward the total — an image row alone can push the total over a small cap', async () => {
    process.env.ASSISTANT_DAILY_SPEND_CAP_USD = '0.05';
    global.fetch = makeFetchMock({
      llmRows: [],
      imageRows: [{ cost_usd: 0.10 }],
    }) as unknown as typeof fetch;

    const result = await checkSpendCap('tester-1');

    expect(result.allowed).toBe(false);
    expect(result.spent_today_usd).toBeCloseTo(0.10, 6);
    expect(result.cap_usd).toBe(0.05);
    expect(result.reason).toBeTruthy();
  });

  it('sums LLM and image spend together rather than counting only one of them', async () => {
    // gpt-4o-mini: input $0.15/M, output $0.60/M (see api/_pricing.ts).
    // 2,000,000 input tokens, 0 cached, 0 output -> 2 * 0.15 = $0.30 exactly.
    global.fetch = makeFetchMock({
      llmRows: [{ model: 'gpt-4o-mini', input_tokens: 2_000_000, cached_input_tokens: 0, output_tokens: 0 }],
      imageRows: [{ cost_usd: 0.20 }],
    }) as unknown as typeof fetch;

    const result = await checkSpendCap('tester-2');

    // If the fix only counted one table, this would be 0.30 or 0.20 — the sum
    // (0.50) is what proves both tables actually contributed.
    expect(result.spent_today_usd).toBeCloseTo(0.50, 6);
    expect(result.allowed).toBe(true);
    // Pin the default explicitly. The file header used to document a $1.00
    // default alongside per-set arithmetic that no longer matched reality, and
    // nothing failed when the two disagreed. Asserting the number means the
    // constant cannot drift away from its documentation unnoticed.
    expect(result.cap_usd).toBe(10);
  });

  it('counts cost_usd correctly when PostgREST returns it as a numeric string', async () => {
    global.fetch = makeFetchMock({
      llmRows: [],
      imageRows: [{ cost_usd: '0.075' }],
    }) as unknown as typeof fetch;

    const result = await checkSpendCap('tester-3');

    expect(result.spent_today_usd).toBeCloseTo(0.075, 6);
    expect(result.allowed).toBe(true);
  });

  it('treats cost_usd: null as 0 and never produces NaN in the total', async () => {
    global.fetch = makeFetchMock({
      llmRows: [],
      imageRows: [{ cost_usd: null }, { cost_usd: '0.02' }],
    }) as unknown as typeof fetch;

    const result = await checkSpendCap('tester-4');

    expect(Number.isNaN(result.spent_today_usd)).toBe(false);
    expect(result.spent_today_usd).toBeCloseTo(0.02, 6);
  });

  it('fails open on the image query alone: a non-OK image response still allows the call and preserves the LLM total', async () => {
    global.fetch = makeFetchMock({
      // 1,000,000 input tokens on gpt-4o-mini -> $0.15 exactly.
      llmRows: [{ model: 'gpt-4o-mini', input_tokens: 1_000_000, cached_input_tokens: 0, output_tokens: 0 }],
      imageOk: false,
      imageStatus: 500,
    }) as unknown as typeof fetch;

    const result = await checkSpendCap('tester-5');

    // Zeroing the whole total on the image failure would report 0 here — the
    // LLM figure must survive instead.
    expect(result.allowed).toBe(true);
    expect(result.spent_today_usd).toBeCloseTo(0.15, 6);
  });

  it('fails open on the image query alone when the fetch itself throws (network error), not just a bad status', async () => {
    global.fetch = makeFetchMock({
      llmRows: [{ model: 'gpt-4o-mini', input_tokens: 1_000_000, cached_input_tokens: 0, output_tokens: 0 }],
      imageThrows: true,
    }) as unknown as typeof fetch;

    const result = await checkSpendCap('tester-6');

    expect(result.allowed).toBe(true);
    expect(result.spent_today_usd).toBeCloseTo(0.15, 6);
  });

  it('fails open on the LLM query alone: a non-OK LLM response still allows the call and preserves the image total', async () => {
    global.fetch = makeFetchMock({
      llmOk: false,
      llmStatus: 500,
      imageRows: [{ cost_usd: 0.25 }],
    }) as unknown as typeof fetch;

    const result = await checkSpendCap('tester-7');

    expect(result.allowed).toBe(true);
    expect(result.spent_today_usd).toBeCloseTo(0.25, 6);
  });

  it('fails open completely when Supabase env vars are missing — no fetch is even attempted', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await checkSpendCap('tester-8');

    expect(result.allowed).toBe(true);
    expect(result.spent_today_usd).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns allowed: true with the correct spent_today_usd when comfortably under the cap', async () => {
    process.env.ASSISTANT_DAILY_SPEND_CAP_USD = '5';
    global.fetch = makeFetchMock({
      llmRows: [{ model: 'gpt-4o-mini', input_tokens: 1_000_000, cached_input_tokens: 0, output_tokens: 0 }],
      imageRows: [{ cost_usd: 0.05 }],
    }) as unknown as typeof fetch;

    const result = await checkSpendCap('tester-9');

    expect(result.allowed).toBe(true);
    expect(result.cap_usd).toBe(5);
    expect(result.spent_today_usd).toBeCloseTo(0.20, 6); // 0.15 (LLM) + 0.05 (image)
  });

  it('refuses once the combined total meets the cap exactly (>=, not >)', async () => {
    process.env.ASSISTANT_DAILY_SPEND_CAP_USD = '0.15';
    global.fetch = makeFetchMock({
      llmRows: [{ model: 'gpt-4o-mini', input_tokens: 1_000_000, cached_input_tokens: 0, output_tokens: 0 }],
      imageRows: [],
    }) as unknown as typeof fetch;

    const result = await checkSpendCap('tester-10');

    expect(result.allowed).toBe(false);
    expect(result.spent_today_usd).toBeCloseTo(0.15, 6);
  });
});
