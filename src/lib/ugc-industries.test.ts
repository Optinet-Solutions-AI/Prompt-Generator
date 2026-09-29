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
