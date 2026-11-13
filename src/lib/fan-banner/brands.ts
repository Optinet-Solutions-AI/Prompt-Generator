/**
 * Fan Banner brand styles — how each brand's 1200×600 email banner looks.
 *
 * Separate from brand-standards.ts on purpose: that file drives the existing
 * HTML banner and must not change. These styles were taken from the brand
 * team's Figma banner examples (Nov 2026):
 *   - colours were sampled from the example images;
 *   - fonts are the closest free Google Fonts by eye (the original Figma font
 *     names weren't available — view-only access);
 *   - SpinJo, LuckyVibe, NovaDreams and RocketSpin had no examples, so they
 *     use the same layout with colours taken from their own logos.
 *
 * Logos are trimmed PNGs made by scripts/build-fan-banner-logos.mjs.
 */

/** A solid colour, or a gradient across the shape it fills. */
export type Paint = string | { direction: 'vertical' | 'horizontal'; stops: string[] };

export interface FanFont {
  family: string;
  weight: number;
  italic?: boolean;
  /** Write this text in capitals regardless of how it was typed. */
  uppercase?: boolean;
  /** Size multiplier for fonts that look small at the same pixel size (tall, narrow ones). */
  scale?: number;
}

export interface FanBannerBrand {
  /** Path under public/ */
  logo: string;
  fonts: {
    headline: FanFont; // the big number: 250%, $5, 50
    offer: FanFont;    // BONUS / FREE SPINS
    line: FanFont;     // the coloured lines: +100 FREE SPINS, NO DEPOSIT NEEDED
    button: FanFont;
    code: FanFont;     // "Bonus Code: WIN250"
  };
  colors: {
    /** Dark tone behind the text column (used for the fade over the picture). */
    panel: string;
    headline: Paint;
    offer: Paint;
    line: string;
    buttonFill: Paint;
    buttonText: string;
    codeLabel: string;
    codeValue: string;
  };
  buttonRadius: number;
  /** Under the button (most brands) or in the bottom corner over the picture (Lucky7even). */
  codePlacement: 'under-button' | 'corner';
}

const caps = (f: Omit<FanFont, 'uppercase'>): FanFont => ({ ...f, uppercase: true });

const montserrat = (weight: number) => caps({ family: 'Montserrat', weight });

export const FAN_BANNER_BRANDS: Record<string, FanBannerBrand> = {
  // ── From the Figma examples ────────────────────────────────────────────────
  Roosterbet: {
    logo: '/fan-banner/logos/roosterbet.png',
    fonts: { headline: montserrat(900), offer: montserrat(900), line: montserrat(900), button: montserrat(800), code: { family: 'Montserrat', weight: 800 } },
    colors: {
      panel: '#050507', headline: '#FFFFFF', offer: '#FFFFFF', line: '#F22515',
      buttonFill: '#E42314', buttonText: '#FFFFFF', codeLabel: '#FFFFFF', codeValue: '#EF2415',
    },
    buttonRadius: 10,
    codePlacement: 'under-button',
  },

  FortunePlay: {
    logo: '/fan-banner/logos/fortuneplay.png',
    fonts: {
      headline: caps({ family: 'Open Sans', weight: 800 }),
      offer: caps({ family: 'Open Sans', weight: 800 }),
      line: caps({ family: 'Open Sans', weight: 800 }),
      button: caps({ family: 'Open Sans', weight: 800 }),
      code: { family: 'Open Sans', weight: 800 },
    },
    colors: {
      panel: '#090704', headline: '#FFFFFF', offer: '#FFFFFF', line: '#FFC734',
      // Metallic gold: light at the top and bottom edges, darker through the middle.
      buttonFill: { direction: 'vertical', stops: ['#E3C05A', '#AC751E', '#DAA44F'] },
      buttonText: '#FFFFFF', codeLabel: '#FFFFFF', codeValue: '#FFC734',
    },
    buttonRadius: 6,
    codePlacement: 'under-button',
  },

  SpinsUp: {
    logo: '/fan-banner/logos/spinsup.png',
    fonts: {
      headline: caps({ family: 'Poppins', weight: 800 }),
      offer: caps({ family: 'Poppins', weight: 800 }),
      line: caps({ family: 'Poppins', weight: 800, italic: true }),
      button: caps({ family: 'Poppins', weight: 700 }),
      code: { family: 'Poppins', weight: 700 },
    },
    colors: {
      panel: '#00010C', headline: '#FFFFFF', offer: '#FFFFFF', line: '#62BDF8',
      buttonFill: { direction: 'vertical', stops: ['#F13C98', '#A61479'] },
      buttonText: '#FFFFFF', codeLabel: '#FFFFFF', codeValue: '#E3268D',
    },
    buttonRadius: 14,
    codePlacement: 'under-button',
  },

  PlayMojo: {
    logo: '/fan-banner/logos/playmojo.png',
    // Teko is tall and narrow, so it is set larger to match the examples.
    fonts: {
      headline: caps({ family: 'Teko', weight: 600, scale: 1.25 }),
      offer: caps({ family: 'Teko', weight: 600, scale: 1.25 }),
      line: caps({ family: 'Teko', weight: 500, scale: 1.3 }),
      button: caps({ family: 'Teko', weight: 600, scale: 1.35 }),
      code: { family: 'Teko', weight: 500, scale: 1.35 },
    },
    colors: {
      panel: '#191A23', headline: '#FFFFFF', offer: '#FFFFFF', line: '#17B4E8',
      buttonFill: '#16BCF0', buttonText: '#FFFFFF', codeLabel: '#FFFFFF', codeValue: '#16BCF0',
    },
    buttonRadius: 6,
    codePlacement: 'under-button',
  },

  Lucky7even: {
    logo: '/fan-banner/logos/lucky7even.png',
    fonts: {
      headline: montserrat(800),
      offer: montserrat(800),
      line: montserrat(800),
      // Handwritten button text ("Claim Now!") — kept as typed, not capitalised.
      button: { family: 'Kaushan Script', weight: 400 },
      code: { family: 'Montserrat', weight: 800 },
    },
    colors: {
      panel: '#07071B', headline: '#FFFFFF', offer: '#FFFFFF', line: '#8C33CA',
      buttonFill: { direction: 'horizontal', stops: ['#4B41E5', '#D434E4'] },
      buttonText: '#FFFFFF', codeLabel: '#FFFFFF', codeValue: '#FFFFFF',
    },
    buttonRadius: 12,
    codePlacement: 'corner',
  },

  Rollero: {
    logo: '/fan-banner/logos/rollero.png',
    fonts: {
      headline: caps({ family: 'Cinzel', weight: 700 }),
      offer: montserrat(500),
      line: caps({ family: 'Cinzel', weight: 700 }),
      button: montserrat(700),
      code: montserrat(600),
    },
    colors: {
      panel: '#0E0906',
      headline: { direction: 'vertical', stops: ['#FFC249', '#E3A42A'] },
      offer: '#FFFFFF', line: '#F8B83C',
      buttonFill: '#C92113', buttonText: '#FFFFFF', codeLabel: '#E6E6E6', codeValue: '#D0281A',
    },
    buttonRadius: 8,
    codePlacement: 'under-button',
  },

  // ── No examples yet: same layout, colours from each brand's logo ───────────
  SpinJo: {
    logo: '/fan-banner/logos/spinjo.png',
    fonts: { headline: montserrat(800), offer: montserrat(800), line: montserrat(800), button: montserrat(700), code: { family: 'Montserrat', weight: 700 } },
    colors: {
      panel: '#05061A', headline: '#FFFFFF', offer: '#FFFFFF', line: '#00F0F1',
      buttonFill: { direction: 'horizontal', stops: ['#00C8E8', '#8254FF'] },
      buttonText: '#FFFFFF', codeLabel: '#FFFFFF', codeValue: '#00F0F1',
    },
    buttonRadius: 12,
    codePlacement: 'under-button',
  },

  LuckyVibe: {
    logo: '/fan-banner/logos/luckyvibe.png',
    fonts: { headline: montserrat(800), offer: montserrat(800), line: montserrat(800), button: montserrat(700), code: { family: 'Montserrat', weight: 700 } },
    colors: {
      panel: '#020B1F', headline: '#FFFFFF', offer: '#FFFFFF', line: '#23C9FF',
      buttonFill: { direction: 'vertical', stops: ['#2A9CF4', '#0A2FC0'] },
      buttonText: '#FFFFFF', codeLabel: '#FFFFFF', codeValue: '#23C9FF',
    },
    buttonRadius: 12,
    codePlacement: 'under-button',
  },

  NovaDreams: {
    logo: '/fan-banner/logos/novadreams.png',
    fonts: {
      headline: caps({ family: 'Oswald', weight: 700 }),
      offer: caps({ family: 'Oswald', weight: 700 }),
      line: caps({ family: 'Oswald', weight: 600 }),
      button: caps({ family: 'Oswald', weight: 700 }),
      code: { family: 'Oswald', weight: 600 },
    },
    colors: {
      panel: '#02060F', headline: '#FFFFFF', offer: '#FFFFFF', line: '#28E7EF',
      // The logo cyan is too light for white text, so the button text is dark navy.
      buttonFill: '#28E7EF', buttonText: '#04121A', codeLabel: '#FFFFFF', codeValue: '#28E7EF',
    },
    buttonRadius: 8,
    codePlacement: 'under-button',
  },

  RocketSpin: {
    logo: '/fan-banner/logos/rocketspin.png',
    fonts: { headline: montserrat(800), offer: montserrat(800), line: montserrat(800), button: montserrat(700), code: { family: 'Montserrat', weight: 700 } },
    colors: {
      panel: '#08121C', headline: '#FFFFFF', offer: '#FFFFFF', line: '#45B9EA',
      buttonFill: '#45B9EA', buttonText: '#FFFFFF', codeLabel: '#FFFFFF', codeValue: '#45B9EA',
    },
    buttonRadius: 8,
    codePlacement: 'under-button',
  },
};

export const FAN_BANNER_BRAND_NAMES = Object.keys(FAN_BANNER_BRANDS);

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const BY_NORMALIZED_NAME = new Map(Object.entries(FAN_BANNER_BRANDS).map(([name, style]) => [normalize(name), style]));

/** Find a brand's style by name ("spinsup", "Rooster.Bet" and "Fortune Play" all work). */
export function getFanBannerBrand(name: string | undefined | null): FanBannerBrand | null {
  if (!name) return null;
  return FAN_BANNER_BRANDS[name] ?? BY_NORMALIZED_NAME.get(normalize(name)) ?? null;
}

/** The canonical brand name for whatever spelling the image carries ("spinsup" → "SpinsUp"). */
export function canonicalFanBannerBrandName(name: string | undefined | null): string {
  if (!name) return '';
  const n = normalize(name);
  return FAN_BANNER_BRAND_NAMES.find((b) => normalize(b) === n) ?? '';
}

/** CSS font shorthand for a canvas, e.g. `italic 800 46px "Poppins"`. */
export function fontCss(f: FanFont, sizePx: number): string {
  return `${f.italic ? 'italic ' : ''}${f.weight} ${sizePx}px "${f.family}"`;
}

/**
 * Google Fonts stylesheet URL that loads exactly the families/weights a brand
 * uses. Format: https://developers.google.com/fonts/docs/css2
 */
export function googleFontsHref(brand: FanBannerBrand): string {
  const byFamily = new Map<string, Set<string>>();
  for (const f of Object.values(brand.fonts)) {
    const set = byFamily.get(f.family) ?? new Set<string>();
    set.add(`${f.italic ? 1 : 0},${f.weight}`);
    byFamily.set(f.family, set);
  }
  const params = [...byFamily.entries()].map(([family, styles]) => {
    const name = family.replace(/ /g, '+');
    const tuples = [...styles].map((s) => s.split(',').map(Number) as [number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (tuples.length === 1 && tuples[0][0] === 0 && tuples[0][1] === 400) return `family=${name}`;
    if (tuples.some(([ital]) => ital === 1)) {
      return `family=${name}:ital,wght@${tuples.map(([i, w]) => `${i},${w}`).join(';')}`;
    }
    return `family=${name}:wght@${tuples.map(([, w]) => w).join(';')}`;
  });
  return `https://fonts.googleapis.com/css2?${params.join('&')}&display=swap`;
}

/** e.g. ("SpinsUp", "250%", "BONUS") → "spinsup-250-bonus-1200x600.png" */
export function fanBannerFilename(brand: string, headline: string, offer: string): string {
  const slug = [brand, headline, offer]
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'fan-banner'}-1200x600.png`;
}
