import { describe, it, expect } from 'vitest';
import { appendVersion, versionLabel } from './prompt-versions';
import type { PromptVersion } from './assistant-types';

const CONCEPT = { title: 'Neon Astronaut', description: 'Hero beside a glowing wheel.' };

const FIELDS = {
  brand: 'RocketSpin',
  format_layout: 'Wide cinematic frame',
  primary_object: 'A glowing wheel',
  subject: 'An astronaut',
  lighting: 'Neon rim light',
  mood: 'Mysterious',
  background: 'Dark industrial bay',
  positive_prompt: 'A cinematic banner',
  negative_prompt: 'no text',
};

function seed(): PromptVersion[] {
  return appendVersion([], {
    fields: FIELDS, concept: CONCEPT, source: 'generated', usage: null,
  });
}

describe('appendVersion', () => {
  it('adds a version to an empty list', () => {
    const out = seed();
    expect(out).toHaveLength(1);
    expect(out[0].fields.brand).toBe('RocketSpin');
    expect(out[0].source).toBe('generated');
  });

  it('does NOT mutate the input array — non-destructive state is the whole point', () => {
    const before = seed();
    const after = appendVersion(before, {
      fields: FIELDS, concept: CONCEPT, source: 'refined', usage: null,
    });
    expect(before).toHaveLength(1);   // unchanged
    expect(after).toHaveLength(2);
    expect(after).not.toBe(before);   // new array reference
  });

  it('appends to the end so the newest version is last', () => {
    const out = appendVersion(seed(), {
      fields: { ...FIELDS, subject: 'A diver' }, concept: CONCEPT, source: 'refined', usage: null,
    });
    expect(out[0].fields.subject).toBe('An astronaut');
    expect(out[1].fields.subject).toBe('A diver');
  });

  it('assigns a unique id to every version', () => {
    let list = seed();
    for (let i = 0; i < 25; i++) {
      list = appendVersion(list, {
        fields: FIELDS, concept: CONCEPT, source: 'refined', usage: null,
      });
    }
    const ids = list.map(v => v.id);
    expect(ids).toHaveLength(26);
    expect(new Set(ids).size).toBe(26);
    for (const id of ids) expect(id).toBeTruthy();
  });

  it('stamps createdAt as a number', () => {
    expect(typeof seed()[0].createdAt).toBe('number');
  });

  it('keeps the originating concept on both a generated and a refined version', () => {
    const out = appendVersion(seed(), {
      fields: FIELDS, concept: CONCEPT, source: 'refined', usage: null,
    });
    expect(out[0].concept.title).toBe('Neon Astronaut');
    expect(out[1].concept.title).toBe('Neon Astronaut');
  });

  it('preserves a usage object when one is given, and null when not', () => {
    const usage = {
      provider: 'gemini' as const, model: 'gemini-3.5-flash',
      input_tokens: 10, cached_input_tokens: 0, output_tokens: 20,
    };
    const withUsage = appendVersion([], {
      fields: FIELDS, concept: CONCEPT, source: 'generated', usage,
    });
    expect(withUsage[0].usage?.model).toBe('gemini-3.5-flash');
    expect(seed()[0].usage).toBeNull();
  });
});

describe('versionLabel', () => {
  it('shows a 1-based ordinal and the source', () => {
    const list = appendVersion(seed(), {
      fields: FIELDS, concept: CONCEPT, source: 'refined', usage: null,
    });
    expect(versionLabel(list[0], 0)).toBe('1 · generated');
    expect(versionLabel(list[1], 1)).toBe('2 · refined');
  });
});
