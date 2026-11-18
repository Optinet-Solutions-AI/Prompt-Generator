/**
 * Brand color palettes — the SINGLE source of truth for brand color enforcement.
 *
 * HOW IT WORKS:
 * - If a brand has an entry here, GPT is told exactly which colors to use/avoid.
 * - If a brand does NOT have an entry (new brand, or entry not yet added),
 *   the system falls back to: "preserve the color palette from the reference
 *   prompt — do NOT introduce colors that aren't already present."
 *
 * This means new brands work out of the box — they'll keep the colors from
 * their reference prompts. You only need to add an entry here when you want
 * EXTRA strictness (e.g. "NEVER use blue" or "always use gold").
 *
 * TO ADD A NEW BRAND:
 * Just add a new key below with its approved colors and forbidden colors.
 * Both the API and frontend will pick it up automatically.
 *
 * BRANDS (10 total):
 *   Roosterbet, FortunePlay, SpinJo, LuckyVibe, SpinsUp,
 *   PlayMojo, Lucky7even, NovaDreams, Rollero, RocketSpin
 */
export const BRAND_PALETTES: Record<string, string> = {
  // Red/dark aggressive — rooster mascot
  Roosterbet:
    'Red, crimson, fiery orange, black, bold white. High-energy sports palette. NEVER use pastel, soft pink, blue, or muted tones.',

  // Gold/black premium — lion mascot
  FortunePlay:
    'Yellow, orange, gold, warm amber, warm casino lighting. NEVER use blue, purple, cyan, neon, or cold tones.',

  // Deep navy/cyan space — astronaut theme
  SpinJo:
    'Deep navy blue, electric cyan, white, dark space black. Clean futuristic space palette. NEVER use gold, warm amber, orange, purple, or earthy warm tones.',

  // Warm amber/orange sunset — golden mascot
  LuckyVibe:
    'Golden hour warm tones, sunset orange, tropical coral, soft amber, warm backlight. NEVER use cold blue, purple, or neon tones.',

  // Dark purple/neon — fantasy magical theme
  SpinsUp:
    'Neon purple, electric magenta, showman gold accents, deep black, circus-bright. Magical/mystical palette. NEVER use muted earthy tones or pastels.',

  // Dark navy/teal — bunny mascot, clean modern
  PlayMojo:
    'Dark navy black, teal, cyan, cool blue accents, clean white. Sleek modern palette. NEVER use warm gold, red, orange, or cheerful bright colors.',

  // Deep purple/gold cosmic — Lucky7 neon theme
  Lucky7even:
    'Deep purple, electric violet, metallic gold accents, black. Rich premium casino palette. NEVER use flat grey, earthy tones, or muted colors.',

  // Cosmic blue/white — astronaut/space explorer
  NovaDreams:
    'Cosmic blue, electric cyan, white, deep navy black. Space/futuristic exploration palette. NEVER use warm orange, red, gold, or earthy tones.',

  // Dark charcoal/gold — Roman gladiator warrior
  Rollero:
    'Dark charcoal, aged gold, warm wheat, black, sharp white highlight. Warrior/ancient Rome palette. NEVER use pastel, neon, cold blue, or soft tones.',

  // White/champagne gold in a sunlit sky — armoured hero (same words as api/_brand-rules.ts)
  RocketSpin:
    'Pristine white (#F5F5F0), champagne gold (#D4B26A), glowing cyan (#00BFFF), ' +
    'sky blue. Setting almost always bright sky with massive sun-lit cumulus ' +
    'clouds during golden hour, occasionally a premium futuristic interior. ' +
    'NEVER use dark moody tones, pastel washes, muted greys, or anime/cartoon ' +
    'colour styling.',
};

/**
 * Returns the brand color enforcement rule for GPT prompts.
 *
 * - Known brand → strict palette enforcement
 * - Unknown brand → "preserve the reference prompt's existing colors"
 * - No brand at all → empty string (no rule)
 */
export function getBrandColorRule(brand: string | undefined | null): string {
  if (!brand) return '';

  const palette = BRAND_PALETTES[brand];

  if (palette) {
    return `BRAND COLOR ENFORCEMENT: This is a ${brand} branded image. Approved color palette: ${palette} All lighting, mood, atmosphere, and background colors MUST comply with this palette. Replace any off-brand colors with on-brand alternatives.`;
  }

  // Fallback for unknown/new brands — still enforce color consistency from reference
  return `BRAND COLOR ENFORCEMENT: This is a ${brand} branded image. Preserve the same color palette as the reference prompt. Do NOT introduce colors not present in the original reference. Keep the brand's visual identity consistent.`;
}
