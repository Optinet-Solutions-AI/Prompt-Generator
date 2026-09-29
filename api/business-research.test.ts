import { describe, it, expect } from 'vitest';
import { pickColours, softenClaims, normaliseUrl, logoCandidates } from './_business-research.js';

describe('business research helpers', () => {
  it('finds real brand colours and skips WordPress/Bootstrap defaults', () => {
    const css = '.a{color:#c88d36}.b{color:#c88d36}.c{background:#191e19}.d{color:#0693e3;color:#0693e3;color:#0693e3}.e{color:#fff}';
    expect(pickColours(css)).toMatchObject({ main: '#191e19', accent: '#c88d36' });
  });

  it('softens claims healthcare ad rules forbid, and removes text props', () => {
    expect(softenClaims('Caring, stress-free dental care')).toBe('Caring, relaxed dental care');
    expect(softenClaims('Pain-free implants, guaranteed')).toBe('comfortable implants,');
    expect(softenClaims('Takes a breath and holds up a clinic brochure.')).toBe('Takes a breath and smiles at the camera.');
    expect(softenClaims('A painless visit')).toBe('A comfortable visit');
  });

  it('only accepts public websites', () => {
    expect(normaliseUrl('demajodental.org').href).toBe('https://demajodental.org/');
    expect(() => normaliseUrl('http://localhost:3000')).toThrow();
    expect(() => normaliseUrl('http://192.168.1.10')).toThrow();
  });

  it('finds the logo image first', () => {
    const html = '<header><img src="/hero.jpg"></header><img class="site-logo" src="/wp/logo.svg"><link rel="apple-touch-icon" href="/icon.png">';
    expect(logoCandidates(html, 'https://x.com/')[0]).toBe('https://x.com/wp/logo.svg');
  });
});
