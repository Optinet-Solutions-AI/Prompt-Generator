import { describe, it, expect } from 'vitest';
import { buildTimeline, timelineSeconds, AD_CUTS, CUT_SECONDS, MIN_END_CARD, FPS, type AdBeat } from './_ad-timeline.js';

const fiveEach: Record<AdBeat, number> = { hook: 5.04, twist: 5.04, demo: 5.04, proof: 5.04, button: 5.04 };

describe('buildTimeline — ad cut recipes', () => {
  it('every cut is EXACTLY its length, ending on the end card', () => {
    for (const cut of AD_CUTS) {
      const t = buildTimeline(cut, fiveEach);
      expect(timelineSeconds(t)).toBe(CUT_SECONDS[cut]);
      expect(t[t.length - 1].beat).toBe('endcard');
      expect(t[t.length - 1].duration).toBeGreaterThanOrEqual(MIN_END_CARD[cut] - 1e-9);
    }
  });

  it('master uses all five scenes in order; cut-downs use their own scenes', () => {
    expect(buildTimeline('30', fiveEach).map(s => s.beat)).toEqual(['hook', 'twist', 'demo', 'proof', 'button', 'endcard']);
    expect(buildTimeline('15', fiveEach).map(s => s.beat)).toEqual(['hook', 'twist', 'endcard']);
    expect(buildTimeline('10', fiveEach).map(s => s.beat)).toEqual(['twist', 'endcard']);
    expect(buildTimeline('6', fiveEach).map(s => s.beat)).toEqual(['button', 'endcard']);
  });

  it('segments are back to back and never longer than the clip', () => {
    const t = buildTimeline('30', fiveEach);
    for (let i = 1; i < t.length; i++) expect(t[i].start).toBeCloseTo(t[i - 1].start + t[i - 1].duration, 6);
    for (const s of t) if (s.beat !== 'endcard') expect(s.duration).toBeLessThanOrEqual(5.04);
  });

  it('long clips are trimmed so the end card keeps its room', () => {
    const t = buildTimeline('10', { twist: 10 });
    expect(t.map(s => s.beat)).toEqual(['twist', 'endcard']);
    expect(t[0].duration).toBeCloseTo(10 - MIN_END_CARD['10'], 6);
    expect(timelineSeconds(t)).toBe(10);
  });

  it('skips missing scenes and fills the gap with a longer end card', () => {
    const t = buildTimeline('30', { hook: 5, proof: 5 });
    expect(t.map(s => s.beat)).toEqual(['hook', 'proof', 'endcard']);
    expect(t[2].duration).toBe(20);
  });

  it('drops a scene that would be cut to a useless sliver', () => {
    // 30s leaves 26s for scenes. Five 6s clips: the fifth gets 2s (≥1.5s, kept).
    const t = buildTimeline('30', { hook: 6, twist: 6, demo: 6, proof: 6, button: 6 });
    expect(t.map(s => s.beat)).toEqual(['hook', 'twist', 'demo', 'proof', 'button', 'endcard']);
    expect(t[4].duration).toBe(2);
    // Five 7s clips: the fifth would get 0s → dropped.
    const t1 = buildTimeline('30', { hook: 7, twist: 7, demo: 7, proof: 7, button: 7 });
    expect(t1.map(s => s.beat)).toEqual(['hook', 'twist', 'demo', 'proof', 'endcard']);
    const t2 = buildTimeline('30', { hook: 8.5, twist: 8.5, demo: 8.5, proof: 8.5, button: 8.5 });
    expect(t2.map(s => s.beat)).toEqual(['hook', 'twist', 'demo', 'endcard']);
    expect(timelineSeconds(t2)).toBe(30);
  });

  it('skips dead air before the first word (from), and never past the clip', () => {
    const t = buildTimeline('6', { button: { duration: 5.04, from: 1.8 } });
    expect(t[0]).toMatchObject({ beat: 'button', from: 1.8, duration: 3 });
    expect(timelineSeconds(t)).toBe(6);
    // A silly speech-start near the end is clamped so the scene still has 1.5s.
    const t2 = buildTimeline('30', { hook: { duration: 5, from: 4.9 } });
    expect(t2[0].from).toBeCloseTo(3.5, 6);
    expect(t2[0].duration).toBeCloseTo(1.5, 6);
  });

  it('snaps every time to whole frames', () => {
    for (const s of buildTimeline('30', { hook: 5.017, twist: 4.983, demo: 3.21, proof: 5.1, button: 2.9 })) {
      expect(Math.abs(s.duration * FPS - Math.round(s.duration * FPS))).toBeLessThan(1e-6);
    }
  });
});
