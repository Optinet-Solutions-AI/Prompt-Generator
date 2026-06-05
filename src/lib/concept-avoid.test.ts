import { describe, it, expect } from 'vitest';
import { conceptGist, mergeAvoid } from './concept-avoid';

describe('conceptGist', () => {
  it('joins the title with a truncated description gist', () => {
    expect(
      conceptGist({ title: 'Sky Ascent', description: 'Hero stands atop a rocket in a golden sky with coins raining everywhere' }, 6),
    ).toBe('Sky Ascent — Hero stands atop a rocket in');
  });
  it('falls back to the title when the description is empty', () => {
    expect(conceptGist({ title: 'Vault', description: '' })).toBe('Vault');
  });
});

describe('mergeAvoid', () => {
  it('appends new gists, de-dupes case-insensitively', () => {
    const next = mergeAvoid(['A — alpha'], [
      { title: 'A', description: 'alpha' },        // dup
      { title: 'B', description: 'beta gamma' },
    ]);
    expect(next).toEqual(['A — alpha', 'B — beta gamma']);
  });
  it('keeps only the last `cap` entries', () => {
    const prev = Array.from({ length: 15 }, (_, i) => `P${i} — x`);
    const next = mergeAvoid(prev, [{ title: 'NEW', description: 'one' }], 15);
    expect(next).toHaveLength(15);
    expect(next[14]).toBe('NEW — one');
    expect(next[0]).toBe('P1 — x'); // P0 dropped
  });
});
