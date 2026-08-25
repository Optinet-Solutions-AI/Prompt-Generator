import { describe, it, expect } from 'vitest';
import { buildConceptsSystemPrompt, buildGenerateSystemPrompt, pickConceptLens, pickConceptLenses, CONCEPT_LENSES, buildAvoidClause, buildSingleConceptSystemPrompt, SINGLE_CONCEPT_JSON_SCHEMA, buildRecommendationPrompt, buildDissectSystemPrompt, DISSECT_JSON_SCHEMA } from './_assistant-prompts.js';

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

describe('subject demographics neutrality', () => {
  it('tells BOTH stages not to assume subject gender/ethnicity when unspecified', () => {
    const c = buildConceptsSystemPrompt('RocketSpin');
    const g = buildGenerateSystemPrompt('RocketSpin');
    for (const out of [c, g]) {
      expect(out).toMatch(/DO NOT ASSUME/i);
      expect(out).toMatch(/gender/i);
      expect(out).toMatch(/keep it exactly/i); // honors an explicitly-stated gender
    }
  });
});

describe('buildAvoidClause', () => {
  it('returns empty string for an empty or blank-only list', () => {
    expect(buildAvoidClause([])).toBe('');
    expect(buildAvoidClause(['  ', ''])).toBe('');
  });
  it('lists the items under a do-not-repeat header', () => {
    const out = buildAvoidClause(['Sky Ascent — hero in golden sky', 'Vault Reveal — hand in vault']);
    expect(out).toMatch(/do NOT repeat or lightly re-skin/i);
    expect(out).toContain('- Sky Ascent — hero in golden sky');
    expect(out).toContain('- Vault Reveal — hand in vault');
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

describe('pickConceptLenses', () => {
  it('returns the requested number of lenses', () => {
    expect(pickConceptLenses(3)).toHaveLength(3);
  });

  it('never returns a duplicate — this is the whole point of the function', () => {
    // Run many times because the failure mode is probabilistic.
    for (let i = 0; i < 200; i++) {
      const picked = pickConceptLenses(3);
      expect(new Set(picked).size).toBe(3);
    }
  });

  it('only ever returns real lenses from the pool', () => {
    for (const lens of pickConceptLenses(3)) {
      expect(CONCEPT_LENSES).toContain(lens);
    }
  });

  it('returns the whole pool when asked for more than exists, still without duplicates', () => {
    const picked = pickConceptLenses(CONCEPT_LENSES.length + 5);
    expect(picked).toHaveLength(CONCEPT_LENSES.length);
    expect(new Set(picked).size).toBe(CONCEPT_LENSES.length);
  });

  it('returns an empty array for n <= 0 rather than throwing', () => {
    expect(pickConceptLenses(0)).toEqual([]);
    expect(pickConceptLenses(-1)).toEqual([]);
  });

  it('is deterministic under a seeded rand, so tests can pin the selection', () => {
    // A rand that always returns 0 must take the pool in order.
    const zero = () => 0;
    expect(pickConceptLenses(3, zero)).toEqual([
      CONCEPT_LENSES[0], CONCEPT_LENSES[1], CONCEPT_LENSES[2],
    ]);
  });
});

describe('buildSingleConceptSystemPrompt', () => {
  it('keeps the brand block so brand identity still applies', () => {
    const p = buildSingleConceptSystemPrompt('Roosterbet');
    expect(p).toContain('Roosterbet');
    expect(p).toMatch(/COLOR PALETTE/);
  });

  it('keeps the subject-neutrality guard', () => {
    expect(buildSingleConceptSystemPrompt('Roosterbet')).toMatch(/DO NOT ASSUME/);
  });

  it('asks for exactly ONE concept', () => {
    const p = buildSingleConceptSystemPrompt('Roosterbet');
    expect(p).toMatch(/exactly ONE concept/i);
  });

  it('drops the inter-concept diversity instructions, which are meaningless for one concept', () => {
    const p = buildSingleConceptSystemPrompt('Roosterbet');
    expect(p).not.toMatch(/could share one background/);
    expect(p).not.toMatch(/Return exactly 3 concepts/);
  });

  it('still tells the model to avoid the predictable take', () => {
    expect(buildSingleConceptSystemPrompt('Roosterbet')).toMatch(/EXPAND/i);
  });

  it('handles a brand with no registered rules without throwing', () => {
    expect(() => buildSingleConceptSystemPrompt('NoSuchBrand')).not.toThrow();
    expect(buildSingleConceptSystemPrompt('NoSuchBrand')).toContain('NoSuchBrand');
  });
});

describe('SINGLE_CONCEPT_JSON_SCHEMA', () => {
  it('requires exactly one concept', () => {
    const s = SINGLE_CONCEPT_JSON_SCHEMA as any;
    expect(s.properties.concepts.minItems).toBe(1);
    expect(s.properties.concepts.maxItems).toBe(1);
  });

  it('does not require a recommendation — that comes from a separate call', () => {
    expect((SINGLE_CONCEPT_JSON_SCHEMA as any).required).toEqual(['concepts']);
  });

  it('requires title and description on the concept', () => {
    const item = (SINGLE_CONCEPT_JSON_SCHEMA as any).properties.concepts.items;
    expect(item.required).toEqual(['title', 'description']);
  });
});

describe('buildRecommendationPrompt', () => {
  const concepts = [
    { title: 'Sky Strike', description: 'Hero dives through a gold coin storm.' },
    { title: 'Vault Heist', description: 'Hero stands inside a cyan-lit vault.' },
    { title: 'Cloud Throne', description: 'Hero perched atop golden cumulus.' },
  ];

  it('puts every concept title in the user message so the model can compare them', () => {
    const { user } = buildRecommendationPrompt(concepts);
    for (const c of concepts) expect(user).toContain(c.title);
  });

  it('includes the descriptions, not just titles', () => {
    const { user } = buildRecommendationPrompt(concepts);
    expect(user).toContain('gold coin storm');
  });

  it('asks for one short sentence', () => {
    expect(buildRecommendationPrompt(concepts).system).toMatch(/one short sentence/i);
  });

  it('handles a single surviving concept (partial fan-out failure)', () => {
    const { user } = buildRecommendationPrompt([concepts[0]]);
    expect(user).toContain('Sky Strike');
  });
});

describe('DISSECT_JSON_SCHEMA', () => {
  const FIELDS = [
    'format_layout', 'primary_object', 'subject', 'lighting',
    'mood', 'background', 'positive_prompt', 'negative_prompt',
  ];

  it('requires exactly the eight reference fields', () => {
    expect([...(DISSECT_JSON_SCHEMA as any).required].sort()).toEqual([...FIELDS].sort());
  });

  it('types every field as a string', () => {
    const props = (DISSECT_JSON_SCHEMA as any).properties;
    for (const f of FIELDS) expect(props[f], f).toEqual({ type: 'string' });
  });

  it('forbids extra properties so the model cannot invent columns', () => {
    expect((DISSECT_JSON_SCHEMA as any).additionalProperties).toBe(false);
  });
});

describe('buildDissectSystemPrompt', () => {
  it('names the brand so the dissection has context', () => {
    expect(buildDissectSystemPrompt('Roosterbet')).toContain('Roosterbet');
  });

  it('instructs the model to EXTRACT and not invent — the core guard', () => {
    const p = buildDissectSystemPrompt('Roosterbet');
    expect(p).toMatch(/do NOT invent/i);
    // The full wording, not just "not specified" on its own — that shorter
    // phrase also occurs in the separate negative_prompt line below, so a
    // regex that only checked for it stayed green even with this entire
    // EXTRACT sentence deleted. "for that field" only occurs in this line.
    expect(p).toMatch(/"Not specified in the source prompt" for that field/i);
    // Pin the negation to the sentence that carries it. /do NOT invent/i above
    // is also satisfied by the "EXTRACT, DO NOT INVENT." header alone, so
    // reversing just the instruction ("Invent a plausible value to fill the
    // gap.") left this test green. "a plausible value" only follows the
    // negated form.
    expect(p).toMatch(/Do NOT invent a plausible value/i);
  });

  it('pins the negative_prompt instruction line', () => {
    // Deleting this whole line previously left the suite green — nothing
    // else in the prompt mentions exclusions, so nothing else covered it.
    expect(buildDissectSystemPrompt('Roosterbet')).toMatch(/negative_prompt: only what the source explicitly excludes/i);
  });

  it('pins the YOUR JOB line', () => {
    // Deleting this whole line previously left the suite green too — the
    // "forbids conforming" test below covers a different sentence
    // ("not a target to conform"), not this one.
    expect(buildDissectSystemPrompt('Roosterbet')).toMatch(/describe what was pasted/i);
  });

  it('tells the model to keep positive_prompt as the pasted text, not a rewrite', () => {
    expect(buildDissectSystemPrompt('Roosterbet')).toMatch(/do NOT rewrite, shorten, improve or re-order/i);
  });

  it('forbids conforming the fields to the brand', () => {
    // The brand is context for reading the prompt, not a target to rewrite toward.
    expect(buildDissectSystemPrompt('Roosterbet')).toMatch(/not a target to conform/i);
  });

  it('handles a brand with no registered rules without throwing', () => {
    expect(() => buildDissectSystemPrompt('NoSuchBrand')).not.toThrow();
  });

  it('does NOT carry the ideation persona — it fights extract-don\'t-invent', () => {
    const p = buildDissectSystemPrompt('Roosterbet');
    expect(p).not.toMatch(/Have opinions/i);
    expect(p).not.toMatch(/senior visual concept partner/i);
  });

  it('does NOT carry brandBlock\'s generative directives', () => {
    // brandBlock() (still used, unchanged, by concepts/generate) opens with
    // "Apply these rules to every concept" and later says brand identity
    // "MUST be applied to every concept". Both are generation-stage
    // instructions with no meaning for a read-only extraction call, and
    // previously outweighed the EXTRACT, DO NOT INVENT rule below them.
    const p = buildDissectSystemPrompt('Roosterbet');
    expect(p).not.toMatch(/apply these rules to every concept/i);
    expect(p).not.toMatch(/MUST be applied to every concept/i);
  });

  it('does NOT carry a brand scene mandate (e.g. Roosterbet\'s fire signature)', () => {
    // Roosterbet's mandate (api/_brand-rules.ts) instructs the model to wrap
    // the subject in fire for any sports/athletic/high-energy scene — the
    // single most likely confabulation for a sports-banner dissection. Check
    // both a phrase unique to the mandate text itself and the "STYLE
    // MANDATE:" label brandBlock() wraps it in — neither should appear here.
    const p = buildDissectSystemPrompt('Roosterbet');
    expect(p).not.toMatch(/FIRE SIGNATURE/i);
    expect(p).not.toMatch(/STYLE MANDATE/i);
  });

  it('puts the extraction rule before the brand palette (primacy favours extraction)', () => {
    const p = buildDissectSystemPrompt('Roosterbet');
    const extractIdx = p.search(/EXTRACT, DO NOT INVENT/i);
    const paletteIdx = p.search(/color palette/i);
    expect(extractIdx).toBeGreaterThanOrEqual(0);
    expect(paletteIdx).toBeGreaterThan(extractIdx);
  });

  it('still gives the model the brand palette, framed as read-only reference', () => {
    const p = buildDissectSystemPrompt('Roosterbet');
    expect(p).toMatch(/for reference only/i);
    expect(p).toMatch(/not an instruction to apply/i);
  });
});
