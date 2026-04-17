/**
 * BRAND_STANDARDS — CSS styling rules per brand for HTML ad/email output.
 *
 * Each entry defines the visual identity applied to the gradient overlay and
 * text layer in the generated HTML banner. The AI image fills the background.
 *
 * Fields:
 *   fontFamily    — CSS font-family stack (web-safe fallbacks included)
 *   googleFont    — Google Fonts import name (e.g. "Oswald:wght@700")
 *   panelBg       — Dark end of the gradient overlay (matches brand dark tone)
 *   headlineColor — Main headline text color
 *   bodyColor     — Sub-text and descriptor color
 *   accentColor   — Highlight accent (bonus line, brand label)
 *   buttonBg      — CTA button background
 *   buttonText    — CTA button label color
 *   buttonShadow  — Box-shadow glow color for the CTA button
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
  // ── Red/dark aggressive — rooster mascot ──────────────────────────────────
  Roosterbet: {
    fontFamily: "'Oswald', 'Impact', 'Arial Black', sans-serif",
    googleFont: 'Oswald:wght@600;700',
    panelBg: '#140000',
    headlineColor: '#FFFFFF',
    bodyColor: '#FFCCCC',
    accentColor: '#FF3333',
    buttonBg: '#CC0000',
    buttonText: '#FFFFFF',
    buttonShadow: 'rgba(204,0,0,0.6)',
  },

  // ── Gold/black premium — lion mascot ─────────────────────────────────────
  FortunePlay: {
    fontFamily: "'Cinzel', 'Times New Roman', Georgia, serif",
    googleFont: 'Cinzel:wght@700;900',
    panelBg: '#0F0800',
    headlineColor: '#FFD700',
    bodyColor: '#FFF8E1',
    accentColor: '#FFA000',
    buttonBg: '#E67E00',
    buttonText: '#1A1A1A',
    buttonShadow: 'rgba(230,126,0,0.6)',
  },

  // ── Deep navy/cyan space — astronaut theme ────────────────────────────────
  SpinJo: {
    fontFamily: "'Orbitron', 'Courier New', monospace",
    googleFont: 'Orbitron:wght@700;900',
    panelBg: '#000D1A',
    headlineColor: '#FFFFFF',
    bodyColor: '#B3D9FF',
    accentColor: '#00B4D8',
    buttonBg: '#0077B6',
    buttonText: '#FFFFFF',
    buttonShadow: 'rgba(0,119,182,0.65)',
  },

  // ── Warm amber/orange sunset — golden mascot ──────────────────────────────
  LuckyVibe: {
    fontFamily: "'Poppins', 'Helvetica Neue', Arial, sans-serif",
    googleFont: 'Poppins:wght@600;800',
    panelBg: '#110600',
    headlineColor: '#FF6B35',
    bodyColor: '#FFF3E0',
    accentColor: '#FF8F00',
    buttonBg: '#FF8F00',
    buttonText: '#1A1A1A',
    buttonShadow: 'rgba(255,143,0,0.55)',
  },

  // ── Dark purple/neon — fantasy magical theme ──────────────────────────────
  SpinsUp: {
    fontFamily: "'Fredoka One', 'Comic Sans MS', cursive, sans-serif",
    googleFont: 'Fredoka+One',
    panelBg: '#08001C',
    headlineColor: '#FF00FF',
    bodyColor: '#F3E5F5',
    accentColor: '#FFD700',
    buttonBg: '#9C27B0',
    buttonText: '#FFD700',
    buttonShadow: 'rgba(156,39,176,0.65)',
  },

  // ── Dark navy/teal — bunny mascot, clean modern ───────────────────────────
  PlayMojo: {
    fontFamily: "'Montserrat', 'Helvetica Neue', Arial, sans-serif",
    googleFont: 'Montserrat:wght@700;900',
    panelBg: '#020D16',
    headlineColor: '#FFFFFF',
    bodyColor: '#B2EBF2',
    accentColor: '#00BCD4',
    buttonBg: '#00838F',
    buttonText: '#FFFFFF',
    buttonShadow: 'rgba(0,131,143,0.6)',
  },

  // ── Deep purple/gold cosmic — Lucky7 neon theme ───────────────────────────
  Lucky7even: {
    fontFamily: "'Playfair Display', 'Times New Roman', Georgia, serif",
    googleFont: 'Playfair+Display:wght@700;900',
    panelBg: '#08001A',
    headlineColor: '#FFFFFF',
    bodyColor: '#E1BEE7',
    accentColor: '#CE93D8',
    buttonBg: '#6A1B9A',
    buttonText: '#FFFFFF',
    buttonShadow: 'rgba(106,27,154,0.65)',
  },

  // ── Cosmic blue/white — astronaut/space explorer ──────────────────────────
  NovaDreams: {
    fontFamily: "'Space Grotesk', 'Trebuchet MS', Arial, sans-serif",
    googleFont: 'Space+Grotesk:wght@600;700',
    panelBg: '#00030F',
    headlineColor: '#00E5FF',
    bodyColor: '#E3F2FD',
    accentColor: '#40C4FF',
    buttonBg: '#1565C0',
    buttonText: '#FFFFFF',
    buttonShadow: 'rgba(21,101,192,0.65)',
  },

  // ── Dark charcoal/gold — Roman gladiator warrior ──────────────────────────
  Rollero: {
    fontFamily: "'Barlow Condensed', 'Impact', 'Arial Narrow', sans-serif",
    googleFont: 'Barlow+Condensed:wght@700;800',
    panelBg: '#080600',
    headlineColor: '#FFFFFF',
    bodyColor: '#F5DEB3',
    accentColor: '#D4A017',
    buttonBg: '#B8860B',
    buttonText: '#FFFFFF',
    buttonShadow: 'rgba(184,134,11,0.6)',
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
