import { describe, it, expect } from 'vitest';
import { ASSISTANT_MODELS } from './_assistant-models.js';

describe('ASSISTANT_MODELS tiered map', () => {
  it('uses gpt-5.2 on every OpenAI stage with the right reasoning effort', () => {
    // concepts moved to 'low' effort as part of the Pro-tier quality upgrade
    // (see "concepts stage is configured for quality, not a 10s budget" below).
    expect(ASSISTANT_MODELS.concepts.openai).toMatchObject({ model: 'gpt-5.2', effort: 'low' });
    expect(ASSISTANT_MODELS.generate.openai).toMatchObject({ model: 'gpt-5.2', effort: 'none' });
    expect(ASSISTANT_MODELS.refine.openai).toMatchObject({ model: 'gpt-5.2', effort: 'low' });
  });

  it('uses gemini-3.5-flash on generate/refine (flash-lite dropped fields on generate); concepts is now Pro-tier', () => {
    // concepts moved off gemini-3.5-flash to gemini-3.1-pro-preview — see below.
    expect(ASSISTANT_MODELS.concepts.gemini.model).toBe('gemini-3.1-pro-preview');
    expect(ASSISTANT_MODELS.generate.gemini.model).toBe('gemini-3.5-flash');
    expect(ASSISTANT_MODELS.refine.gemini.model).toBe('gemini-3.5-flash');
  });

  it('raises refine OpenAI maxTokens to cover reasoning tokens', () => {
    expect(ASSISTANT_MODELS.refine.openai.maxTokens).toBeGreaterThanOrEqual(2500);
  });
});

describe('concepts stage is configured for quality, not a 10s budget', () => {
  it('uses the Pro tier for Gemini concepts', () => {
    expect(ASSISTANT_MODELS.concepts.gemini.model).toBe('gemini-3.1-pro-preview');
  });

  it('gives concepts enough tokens that a long brand mandate cannot truncate the JSON', () => {
    // Reproduced at 1200: a long mandate (LuckyVibe, Roosterbet) truncated the
    // response mid-string and JSON.parse threw. Gemini counts thinking tokens
    // against this budget, so the visible text is only part of the spend.
    expect(ASSISTANT_MODELS.concepts.gemini.maxTokens).toBeGreaterThanOrEqual(4000);
    expect(ASSISTANT_MODELS.concepts.openai.maxTokens).toBeGreaterThanOrEqual(4000);
  });

  it('gives OpenAI concepts some reasoning effort', () => {
    expect(ASSISTANT_MODELS.concepts.openai.effort).toBe('low');
  });
});

describe('recommend stage', () => {
  it('exists for both providers', () => {
    expect(ASSISTANT_MODELS.recommend.gemini.model).toBeTruthy();
    expect(ASSISTANT_MODELS.recommend.openai.model).toBeTruthy();
  });

  it('uses the cheapest Gemini tier — it is a short judgement, not ideation', () => {
    expect(ASSISTANT_MODELS.recommend.gemini.model).toBe('gemini-3.5-flash-lite');
  });

  it('keeps the recommendation budget small', () => {
    expect(ASSISTANT_MODELS.recommend.gemini.maxTokens).toBeLessThanOrEqual(1000);
  });
});

describe('every stage is fully configured', () => {
  it('has both providers with a model and a positive token budget', () => {
    for (const [stage, providers] of Object.entries(ASSISTANT_MODELS)) {
      for (const [provider, cfg] of Object.entries(providers)) {
        expect(cfg.model, `${stage}.${provider}`).toBeTruthy();
        expect(cfg.maxTokens, `${stage}.${provider}`).toBeGreaterThan(0);
      }
    }
  });
});
