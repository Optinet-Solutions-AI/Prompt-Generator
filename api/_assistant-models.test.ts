import { describe, it, expect } from 'vitest';
import { ASSISTANT_MODELS } from './_assistant-models.js';

describe('ASSISTANT_MODELS tiered map', () => {
  it('uses gpt-5.2 on every OpenAI stage with the right reasoning effort', () => {
    expect(ASSISTANT_MODELS.concepts.openai).toMatchObject({ model: 'gpt-5.2', effort: 'none' });
    expect(ASSISTANT_MODELS.generate.openai).toMatchObject({ model: 'gpt-5.2', effort: 'none' });
    expect(ASSISTANT_MODELS.refine.openai).toMatchObject({ model: 'gpt-5.2', effort: 'low' });
  });

  it('tiers Gemini: flash for concepts/refine, flash-lite for generate', () => {
    expect(ASSISTANT_MODELS.concepts.gemini.model).toBe('gemini-3.5-flash');
    expect(ASSISTANT_MODELS.generate.gemini.model).toBe('gemini-3.1-flash-lite');
    expect(ASSISTANT_MODELS.refine.gemini.model).toBe('gemini-3.5-flash');
  });

  it('raises refine OpenAI maxTokens to cover reasoning tokens', () => {
    expect(ASSISTANT_MODELS.refine.openai.maxTokens).toBeGreaterThanOrEqual(2500);
  });
});
