import { describe, it, expect } from 'vitest';
import { buildConceptsSystemPrompt, buildGenerateSystemPrompt } from './_assistant-prompts.js';

describe('buildConceptsSystemPrompt', () => {
  it('includes the partner personality preamble', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/visual concept partner/i);
    expect(out).toMatch(/Forbidden phrases/);
    expect(out).toMatch(/Great question/);
  });

  it('includes the brand palette and mandate', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/champagne gold/i);
    expect(out).toMatch(/chest reactor/i);
  });

  it('instructs the model to return exactly 3 visually distinct concepts as JSON', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/exactly 3 concepts/i);
    expect(out).toMatch(/visually distinct/i);
  });
});

describe('buildGenerateSystemPrompt', () => {
  it('includes the personality + brand rules + structured-field instructions', () => {
    const out = buildGenerateSystemPrompt('RocketSpin');
    expect(out).toMatch(/visual concept partner/i);
    expect(out).toMatch(/champagne gold/i);
    expect(out).toMatch(/positive_prompt/);
    expect(out).toMatch(/negative_prompt/);
    expect(out).toMatch(/format_layout/);
  });
});
