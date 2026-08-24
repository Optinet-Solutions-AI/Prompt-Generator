import { describe, it, expect } from 'vitest';
import { LLM_PRICING, IMAGE_PRICING, computeLlmCost, computeImageCost, computeImageCostFromUsage } from './_pricing.js';

describe('LLM_PRICING table', () => {
  it('has Gemini Flash and Pro filled with sourced values', () => {
    expect(LLM_PRICING['gemini-2.5-flash'].input_per_million).toBe(0.30);
    expect(LLM_PRICING['gemini-2.5-flash'].output_per_million).toBe(2.50);
    expect(LLM_PRICING['gemini-2.5-pro'].input_per_million).toBe(1.25);
    expect(LLM_PRICING['gemini-2.5-pro'].output_per_million).toBe(10.00);
  });

  it('has OpenAI rates filled in (verify against openai.com before launch)', () => {
    expect(LLM_PRICING['gpt-4o'].input_per_million).toBe(2.50);
    expect(LLM_PRICING['gpt-4o'].output_per_million).toBe(10.00);
    expect(LLM_PRICING['gpt-4o-mini'].input_per_million).toBe(0.15);
    expect(LLM_PRICING['gpt-4o-mini'].output_per_million).toBe(0.60);
    expect(LLM_PRICING['gpt-4o'].source).toMatch(/verify/);
  });
});

describe('computeLlmCost', () => {
  it('computes Gemini Pro cost from token usage', () => {
    const cost = computeLlmCost('gemini-2.5-pro', {
      input_tokens: 1000,
      cached_input_tokens: 0,
      output_tokens: 500,
    });
    // (1000 * 1.25 + 500 * 10.00) / 1_000_000 = 0.00625
    expect(cost).toBeCloseTo(0.00625, 8);
  });

  it('computes gpt-4o cost from token usage', () => {
    const cost = computeLlmCost('gpt-4o', {
      input_tokens: 1000,
      cached_input_tokens: 0,
      output_tokens: 500,
    });
    // (1000 * 2.50 + 500 * 10.00) / 1_000_000 = 0.0075
    expect(cost).toBeCloseTo(0.0075, 8);
  });

  it('returns null for an unknown model', () => {
    const cost = computeLlmCost('unknown-model-9999', {
      input_tokens: 1000,
      cached_input_tokens: 0,
      output_tokens: 500,
    });
    expect(cost).toBeNull();
  });

  it('discounts cached input tokens when cached_input_per_million is set', () => {
    const cost = computeLlmCost('test-cache-model', {
      input_tokens: 2000,
      cached_input_tokens: 1500,
      output_tokens: 0,
    });
    // 500 billable @ $1/M + 1500 cached @ $0.50/M = (500 + 750) / 1_000_000
    expect(cost).toBeCloseTo(0.00125, 8);
  });
});

describe('computeImageCost', () => {
  it('computes OpenAI gpt-image-1 standard 1024x1024 cost', () => {
    expect(computeImageCost('openai', '1024x1024', 'standard', 1)).toBeCloseTo(0.04, 8);
    expect(computeImageCost('openai', '1024x1024', 'standard', 3)).toBeCloseTo(0.12, 8);
  });

  it('computes Gemini imagen cost (no quality tier)', () => {
    expect(computeImageCost('gemini', '1024x1024', null, 1)).toBeCloseTo(0.04, 8);
    expect(computeImageCost('gemini', '16:9', null, 1)).toBeCloseTo(0.04, 8);
  });

  it('returns null when provider+size+quality not in pricing table', () => {
    expect(computeImageCost('openai', '9999x9999', 'standard', 1)).toBeNull();
    expect(computeImageCost('unknown', '1024x1024', 'standard', 1)).toBeNull();
  });
});

describe('computeImageCostFromUsage', () => {
  // These two assertions are the whole point of usage-based costing: token
  // count x official rate reproduces Google's own published per-image price.
  it('reproduces the published $0.134 for gemini-3-pro-image', () => {
    const cost = computeImageCostFromUsage('gemini-3-pro-image', {
      text_input_tokens: 10,
      image_output_tokens: 1120,
    });
    // 10 * 2.00/1M + 1120 * 120.00/1M = 0.00002 + 0.1344 = 0.13442
    expect(cost).toBeCloseTo(0.13442, 5);
  });

  it('reproduces the published $0.101 for gemini-3.1-flash-image at 2K', () => {
    const cost = computeImageCostFromUsage('gemini-3.1-flash-image', {
      text_input_tokens: 10,
      image_output_tokens: 1680,
    });
    // 10 * 0.50/1M + 1680 * 60.00/1M = 0.000005 + 0.1008
    expect(cost).toBeCloseTo(0.100805, 6);
  });

  it('computes the measured gpt-image-2 high-quality banner cost', () => {
    const cost = computeImageCostFromUsage('gpt-image-2', {
      text_input_tokens: 15,
      image_output_tokens: 4720,
    });
    // 15 * 5.00/1M + 4720 * 30.00/1M = 0.000075 + 0.1416 = 0.141675
    expect(cost).toBeCloseTo(0.141675, 6);
  });

  it('computes the measured gpt-image-1 baseline so old rows still price', () => {
    const cost = computeImageCostFromUsage('gpt-image-1', {
      text_input_tokens: 15,
      image_output_tokens: 6208,
    });
    // 15 * 5.00/1M + 6208 * 40.00/1M = 0.000075 + 0.24832
    expect(cost).toBeCloseTo(0.248395, 6);
  });

  it('returns null for an unknown model rather than guessing a rate', () => {
    expect(computeImageCostFromUsage('gemini-99-imaginary', {
      text_input_tokens: 10,
      image_output_tokens: 1000,
    })).toBeNull();
  });

  it('returns 0 when no tokens were used', () => {
    expect(computeImageCostFromUsage('gpt-image-2', {
      text_input_tokens: 0,
      image_output_tokens: 0,
    })).toBe(0);
  });
});

describe('computeImageCost (legacy) still works', () => {
  it('prices an old per-image row unchanged', () => {
    expect(computeImageCost('openai', '1024x1024', 'standard', 1)).toBeCloseTo(0.040, 6);
  });
});
