import { describe, it, expect } from 'vitest';
import { buildConceptsSystemPrompt, buildGenerateSystemPrompt, pickConceptLens, CONCEPT_LENSES } from './_assistant-prompts.js';

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

  it('instructs the model to return exactly 3 genuinely-different concepts as JSON', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/exactly 3 concepts/i);
    expect(out).toMatch(/genuinely different visual direction/i);
    expect(out).toMatch(/do NOT return the same scene/i);
  });

  it('frames the assistant as a creative expander (more/newer, non-obvious)', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/expand the user'?s thinking/i);
    expect(out).toMatch(/more and newer ideas/i);
    expect(out).toMatch(/non-obvious/i);
  });

  it('requires a range of boldness (a safe direction and a bolder stretch)', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/range of boldness/i);
    expect(out).toMatch(/bolder.*stretch/i);
  });

  it('decouples brand identity from composition', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/IDENTITY vs COMPOSITION/i);
    expect(out).toMatch(/not a fixed composition/i);
    expect(out).toMatch(/one option to draw from/i);
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

  it('forbids real-person names and copyrighted franchise refs in output', () => {
    const out = buildGenerateSystemPrompt('RocketSpin');
    expect(out).toMatch(/never name any real person/i);
    expect(out).toMatch(/copyrighted franchises/i);
    expect(out).toMatch(/brand names/i);
  });

  it('inherits the identity-vs-composition clause from the brand block', () => {
    const out = buildGenerateSystemPrompt('RocketSpin');
    expect(out).toMatch(/IDENTITY vs COMPOSITION/i);
  });
});

describe('pickConceptLens', () => {
  it('offers a pool of several distinct, non-empty creative lenses', () => {
    expect(CONCEPT_LENSES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(CONCEPT_LENSES).size).toBe(CONCEPT_LENSES.length); // all distinct
    CONCEPT_LENSES.forEach(l => expect(l.trim().length).toBeGreaterThan(0));
  });

  it('selects the lens indicated by the random value (deterministic with a stubbed rand)', () => {
    expect(pickConceptLens(() => 0)).toBe(CONCEPT_LENSES[0]);
    expect(pickConceptLens(() => 0.999)).toBe(CONCEPT_LENSES[CONCEPT_LENSES.length - 1]);
  });
});
