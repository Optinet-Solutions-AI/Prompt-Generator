import { describe, it, expect } from 'vitest';
import { INDUSTRIES, colourName, HEALTHCARE_SAFETY } from './ugc-industries';
import { buildUgcPrompt, EMPTY_VIDEO_FORM, EMPTY_CUSTOM_BUSINESS, UGC_REALISM } from './ugc-video';

const dental = INDUSTRIES.find(i => i.id === 'dental')!;
const smile = dental.styles[0];
const form = {
  ...EMPTY_VIDEO_FORM, mode: 'custom' as const,
  custom: { ...EMPTY_CUSTOM_BUSINESS, name: 'Dr Demajo', industry: 'dental', promote: 'Implants with an on-site lab', color: '#0E7490', accent: '#5EEAD4' },
  creator: smile.creator, setting: smile.setting, action: smile.action, camera: smile.camera, dialogue: smile.line,
};

describe('custom business prompt', () => {
  it('describes the kind of business but NEVER its name', () => {
    const p = buildUgcPrompt(form);
    expect(p).toContain('a modern, welcoming dental clinic');
    expect(p).toContain('The clip is about: Implants with an on-site lab.');
    expect(p).not.toMatch(/demajo/i);
  });

  it('turns hex colours into plain colour names', () => {
    expect(buildUgcPrompt(form)).toContain('Subtle teal and turquoise accents');
    expect(colourName('#ffffff')).toBe('white');
    expect(colourName('nonsense')).toBe('');
  });

  it('adds the healthcare safety block for clinics only', () => {
    expect(buildUgcPrompt(form)).toContain(HEALTHCARE_SAFETY);
    const gym = { ...form, custom: { ...form.custom, industry: 'gym' } };
    expect(buildUgcPrompt(gym)).not.toContain(HEALTHCARE_SAFETY);
  });

  it('never uses our brands’ mascot/palette hints in custom mode', () => {
    const p = buildUgcPrompt({ ...form, brand: 'Roosterbet' });
    expect(p).not.toContain('rooster');
    expect(p.endsWith(UGC_REALISM)).toBe(true);
  });

  it('every preset has a short line (< 12 words) and no "pain-free" claim', () => {
    for (const ind of INDUSTRIES) for (const st of ind.styles) {
      expect(st.line.split(/\s+/).length, st.id).toBeLessThan(12);
      expect(`${st.line} ${st.endCard}`, st.id).not.toMatch(/pain[- ]free/i);
    }
  });
});

import { speechFit } from './ugc-video';
import { maxWordsFor } from '../../api/_script-writer';

describe('making the ad work (after the first Demajo test)', () => {
  it('flags a line that is too long for 5 seconds', () => {
    // The line that got cut off in the first real test.
    expect(speechFit('Their own lab made my new smile so fast.', 5)).toMatchObject({ words: 9, maxWords: 8, fits: false });
    expect(speechFit('Okay… I actually love my smile now.', 5).fits).toBe(true);
    expect(speechFit('Their own lab made my new smile so fast.', 10).fits).toBe(true);
  });

  it('the script writer uses the same word budget as the meter', () => {
    expect(maxWordsFor(5)).toBe(speechFit('', 5).maxWords);
    expect(maxWordsFor(10)).toBe(speechFit('', 10).maxWords);
  });

  it('always adds visual cues so viewers see it is a dental clinic', () => {
    const p = buildUgcPrompt(form);
    expect(p).toContain('dental treatment chair');
    expect(p).toContain('start speaking within the first second');
  });

  it('every industry has cues and every format a short, emoji-free hook', () => {
    for (const ind of INDUSTRIES) {
      expect(ind.cues.length, ind.id).toBeGreaterThan(20);
      for (const st of ind.styles) {
        expect(st.hook, st.id).toBeTruthy();
        expect(st.hook!.split(/\s+/).length, st.id).toBeLessThanOrEqual(8);
        expect(st.hook, st.id).not.toMatch(/\p{Extended_Pictographic}/u);
      }
    }
  });

  it('every built-in spoken line fits a 5-second clip', () => {
    for (const ind of INDUSTRIES) for (const st of ind.styles) expect(speechFit(st.line, 5).fits, `${st.id}: ${st.line}`).toBe(true);
  });
});
