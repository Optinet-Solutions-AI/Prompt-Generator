import { describe, it, expect } from 'vitest';
import { buildUgcPrompt, BRAND_SCREEN_HINTS, EMPTY_VIDEO_FORM, UGC_REALISM, UGC_STYLES } from './ugc-video';
import { BRANDS } from '@/types/prompt';

const base = { ...EMPTY_VIDEO_FORM, ...UGC_STYLES[0], brand: 'SpinJo' };

describe('buildUgcPrompt', () => {
  it('includes every structured field and ends with the UGC realism block', () => {
    const p = buildUgcPrompt(base);
    expect(p).toContain(`Subject: ${UGC_STYLES[0].creator}.`);
    expect(p).toContain(`Setting: ${UGC_STYLES[0].setting}.`);
    expect(p).toContain(`Action: ${UGC_STYLES[0].action}.`);
    expect(p).toContain(`Camera: ${UGC_STYLES[0].camera}.`);
    expect(p.endsWith(UGC_REALISM)).toBe(true);
  });

  it('puts the brand mascot on the phone screen without naming the brand there', () => {
    const p = buildUgcPrompt(base);
    expect(p).toContain(`Their phone screen glows with ${BRAND_SCREEN_HINTS.SpinJo}.`);
    expect(BRAND_SCREEN_HINTS.SpinJo).not.toMatch(/spinjo/i);
    expect(buildUgcPrompt({ ...base, brand: 'UnknownBrand' })).not.toContain('phone screen glows');
  });

  it('has a phone-screen hint for every brand in the system', () => {
    for (const b of BRANDS) expect(BRAND_SCREEN_HINTS[b], b).toBeTruthy();
  });

  it('adds the brand palette for known brands', () => {
    expect(buildUgcPrompt(base)).toContain('SpinJo color accents');
    expect(buildUgcPrompt({ ...base, brand: 'UnknownBrand' })).not.toContain('color accents');
  });

  it('only includes dialogue when audio is on', () => {
    const withLine = { ...base, dialogue: 'I did not expect that!' };
    expect(buildUgcPrompt(withLine)).toContain('They say: "I did not expect that!"');
    expect(buildUgcPrompt({ ...withLine, audio: false })).not.toContain('They say');
  });

  it('skips empty fields and collapses whitespace', () => {
    const p = buildUgcPrompt({ ...EMPTY_VIDEO_FORM, creator: '  a   person  ' });
    expect(p).toBe(`Subject: a person. ${UGC_REALISM}`);
  });
});
