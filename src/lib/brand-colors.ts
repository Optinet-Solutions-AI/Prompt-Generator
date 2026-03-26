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
 */
export const BRAND_PALETTES: Record<string, string> = {
  FortunePlay:
    'Yellow, orange, gold, warm amber, warm casino lighting. NEVER use blue, purple, cyan, neon, or cold tones.',
  SpinJo:
    'Purple, violet, magenta, neon-blue, electric cyan, deep space black. Sci-fi/futuristic palette. NEVER use gold, warm amber, orange, or earthy warm tones.',
  Roosterbet:
    'Red, crimson, fiery orange, black, bold white. High-energy sports palette. NEVER use pastel, soft pink, or muted tones.',
  LuckyVibe:
    'Golden hour warm tones, sunset orange, tropical coral, soft amber, warm backlight. NEVER use cold blue, purple, or neon tones.',
  SpinsUp:
    'Neon purple, electric magenta, showman gold accents, deep black, circus-bright. Magical/mystical palette. NEVER use muted earthy tones or pastels.',
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
