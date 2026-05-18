import { describe, it, expect } from 'vitest';
import { LLM_PRICING, IMAGE_PRICING, computeLlmCost, computeImageCost } from './_pricing.js';

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
