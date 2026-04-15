/**
 * BRAND_STANDARDS — CSS styling rules per brand for HTML ad/email output.
 *
 * Each entry defines the visual identity applied to the text panel and CTA button
 * in the generated HTML banner. The image itself is never modified.
 *
 * Fields:
 *   fontFamily    — CSS font-family stack (web-safe fallbacks included)
 *   googleFont    — Google Fonts import name (e.g. "Oswald:wght@700")
 *   panelBg       — Background color of the text panel
 *   headlineColor — Main headline text color
 *   bodyColor     — Sub-text and bonus percentage color
 *   accentColor   — Highlight accent (bonus line, decorative elements)
 *   buttonBg      — CTA button background
 *   buttonText    — CTA button label color
 *   buttonShadow  — Box-shadow color for the CTA button glow
 */
export interface BrandStyle {
  fontFamily: string;
  googleFont: string;
  panelBg: string;
  headlineColor: string;
  bodyColor: string;
  accentColor: string;
  buttonBg: string;
  buttonText: string;
  buttonShadow: string;
}

export const BRAND_STANDARDS: Record<string, BrandStyle> = {
  Roosterbet: {
    fontFamily: "'Oswald', 'Impact', 'Arial Black', sans-serif",
    googleFont: 'Oswald:wght@600;700',
    panelBg: '#0F0000',
    headlineColor: '#FFFFFF',
    bodyColor: '#FFCCCC',
    accentColor: '#FF3333',
    buttonBg: '#CC0000',
    buttonText: '#FFFFFF',
    buttonShadow: 'rgba(204,0,0,0.55)',
  },
  FortunePlay: {
    fontFamily: "'Cinzel', 'Times New Roman', Georgia, serif",
    googleFont: 'Cinzel:wght@700;900',
    panelBg: '#0F0900',
    headlineColor: '#FFD700',
    bodyColor: '#FFF8E1',
    accentColor: '#FFA000',
    buttonBg: '#FF8C00',
    buttonText: '#1A1A1A',
    buttonShadow: 'rgba(255,140,0,0.55)',
  },
  SpinJo: {
    fontFamily: "'Orbitron', 'Courier New', monospace",
    googleFont: 'Orbitron:wght@700;900',
    panelBg: '#06001A',
    headlineColor: '#E040FB',
    bodyColor: '#D1C4E9',
    accentColor: '#00E5FF',
    buttonBg: '#7C4DFF',
    buttonText: '#FFFFFF',
    buttonShadow: 'rgba(124,77,255,0.6)',
  },
  LuckyVibe: {
    fontFamily: "'Poppins', 'Helvetica Neue', Arial, sans-serif",
    googleFont: 'Poppins:wght@600;800',
    panelBg: '#0F0600',
    headlineColor: '#FF6B35',
    bodyColor: '#FFF3E0',
    accentColor: '#FF8F00',
    buttonBg: '#FF8F00',
    buttonText: '#1A1A1A',
    buttonShadow: 'rgba(255,143,0,0.5)',
  },
  SpinsUp: {
    fontFamily: "'Fredoka One', 'Comic Sans MS', cursive, sans-serif",
    googleFont: 'Fredoka+One',
    panelBg: '#0A0020',
    headlineColor: '#FF00FF',
    bodyColor: '#F3E5F5',
    accentColor: '#FFD700',
    buttonBg: '#9C27B0',
    buttonText: '#FFD700',
    buttonShadow: 'rgba(156,39,176,0.6)',
  },
  PlayMojo: {
    fontFamily: "'Montserrat', 'Helvetica Neue', Arial, sans-serif",
    googleFont: 'Montserrat:wght@700;900',
    panelBg: '#080808',
    headlineColor: '#FFFFFF',
    bodyColor: '#BDBDBD',
    accentColor: '#F44336',
    buttonBg: '#F44336',
    buttonText: '#FFFFFF',
    buttonShadow: 'rgba(244,67,54,0.55)',
  },
  Lucky7even: {
    fontFamily: "'Playfair Display', 'Times New Roman', Georgia, serif",
    googleFont: 'Playfair+Display:wght@700;900',
    panelBg: '#0A001A',
    headlineColor: '#FFD700',
    bodyColor: '#E1BEE7',
    accentColor: '#CE93D8',
    buttonBg: '#6A1B9A',
    buttonText: '#FFD700',
    buttonShadow: 'rgba(106,27,154,0.6)',
  },
  NovaDreams: {
    fontFamily: "'Space Grotesk', 'Trebuchet MS', Arial, sans-serif",
    googleFont: 'Space+Grotesk:wght@600;700',
    panelBg: '#00050F',
    headlineColor: '#00E5FF',
    bodyColor: '#E3F2FD',
    accentColor: '#40C4FF',
    buttonBg: '#1565C0',
    buttonText: '#FFFFFF',
    buttonShadow: 'rgba(21,101,192,0.6)',
  },
  Rollero: {
    fontFamily: "'Barlow Condensed', 'Impact', 'Arial Narrow', sans-serif",
    googleFont: 'Barlow+Condensed:wght@700;800',
    panelBg: '#0A0A0A',
    headlineColor: '#FFFFFF',
    bodyColor: '#CFD8DC',
    accentColor: '#FF1744',
    buttonBg: '#B71C1C',
    buttonText: '#FFFFFF',
    buttonShadow: 'rgba(183,28,28,0.55)',
  },
};

/** Fallback style used when brand is unknown or not provided. */
export const DEFAULT_BRAND_STYLE: BrandStyle = {
  fontFamily: "'Montserrat', 'Helvetica Neue', Arial, sans-serif",
  googleFont: 'Montserrat:wght@700;900',
  panelBg: '#0D0D0D',
  headlineColor: '#FFFFFF',
  bodyColor: '#E0E0E0',
  accentColor: '#7C4DFF',
  buttonBg: '#7C4DFF',
  buttonText: '#FFFFFF',
  buttonShadow: 'rgba(124,77,255,0.5)',
};

export function getBrandStyle(brand: string | undefined | null): BrandStyle {
  if (brand && BRAND_STANDARDS[brand]) return BRAND_STANDARDS[brand];
  return DEFAULT_BRAND_STYLE;
}
