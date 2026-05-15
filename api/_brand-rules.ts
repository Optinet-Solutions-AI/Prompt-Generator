export const BRAND_PALETTES: Record<string, string> = {
  FortunePlay: 'Yellow, orange, gold, warm amber, warm casino lighting. NEVER use blue, purple, cyan, neon, or cold tones.',
  SpinJo:      'Purple, violet, magenta, neon-blue, electric cyan, deep space black. Sci-fi/futuristic palette. NEVER use gold, warm amber, orange, or earthy warm tones.',
  Roosterbet:  'Red, crimson, fiery orange, black, bold white. High-energy sports palette. NEVER use pastel, soft pink, or muted tones.',
  LuckyVibe:   'Golden hour warm tones, sunset orange, tropical coral, soft amber, warm backlight. NEVER use cold blue, purple, or neon tones.',
  SpinsUp:     'Neon purple, electric magenta, showman gold accents, deep black, circus-bright. Magical/mystical palette. NEVER use muted earthy tones or pastels.',
  PlayMojo:    'Dark noir black, bold white, sharp red accent. Sleek, cinematic. NEVER use warm gold, pastel, or cheerful bright colors.',
  Lucky7even:  'Deep purple, electric violet, metallic gold accents, black. Rich premium palette. NEVER use flat grey, earthy tones, or muted colors.',
  NovaDreams:  'Cosmic blue, electric cyan, white, deep navy black. Space/futuristic palette. NEVER use warm orange, red, gold, or earthy tones.',
  Rollero:     'Crimson red, dark charcoal grey, black, sharp white highlight. Warrior/combat palette. NEVER use pastel, neon, or soft warm tones.',
  RocketSpin:
    'Pristine white (#F5F5F0), champagne gold (#D4B26A), glowing cyan (#00BFFF), ' +
    'sky blue. Setting almost always bright sky with massive sun-lit cumulus ' +
    'clouds during golden hour, occasionally a premium futuristic interior. ' +
    'NEVER use dark moody tones, pastel washes, muted greys, or anime/cartoon ' +
    'colour styling.',
};

export const BRAND_SCENE_MANDATES: Record<string, string> = {
  Roosterbet:  'FIRE IS MANDATORY AND MUST ORIGINATE FROM THE PLAYER: Fire and flames MUST burst outward FROM the athlete — erupting from their feet, legs, arms, or movement trail as they perform the action. The player should appear to be GENERATING the fire through their athletic intensity and power. Do NOT place fire only in the background or floor — it must come FROM the player\'s body and movement. Make the fire dynamic, explosive, and visually striking — an extension of the player\'s energy. This is the Roosterbet signature.',
  FortunePlay: 'GOLD IS MANDATORY: The scene MUST include gold accents AND gold dust/particles — floating golden light, golden sparkles, or shimmering gold dust in the air. This is the FortunePlay signature. If the base prompt lacks these, ADD them to the atmosphere or lighting.',
  LuckyVibe:   'BEACH/SUNSET IS MANDATORY: The scene MUST feature sunset lighting as the primary light source, AND sand must be visible somewhere in the frame (even if the setting is a stadium with grass, add sand at the edges or as a foreground element). Palm trees MUST appear in the background. This is the LuckyVibe signature. If the base prompt lacks these, ADD them naturally.',
  RocketSpin:
    'STYLE MANDATE: Hyperrealistic cinematic CGI at the quality of a live-action ' +
    'superhero blockbuster (Unreal Engine 5, AAA cinematic render quality). NEVER ' +
    'Pixar style, NEVER anime, NEVER cartoon, NEVER plastic skin, NEVER oversized ' +
    'head/eyes. ' +
    'HERO MANDATE: Athletic male, age 28-32, rugged action-hero appearance with ' +
    'masculine angular features and a square jaw, fit athletic build, short ' +
    'tousled brown hair, light stubble, piercing blue eyes. ' +
    'Amber/orange-tinted aviator-style tactical goggles with a thin champagne-gold ' +
    'frame. Sleek white-and-gold high-tech armored suit with a circular glowing ' +
    'cyan chest reactor centered on the torso, gold pauldrons, gold wrist cuffs. ' +
    'Female variant: long-haired blonde, same armor. ' +
    'BRAND OBJECTS (use at least one when relevant): gold coins engraved "RS", ' +
    'white rockets with golden thrusters, blue holographic UI elements, white gift ' +
    'boxes with gold ribbons, sparkling particles, confetti. ' +
    'COMPOSITION: Hero centered, facing camera, symmetrical framing, negative ' +
    'space on the sides for text. Lighting always warm and soft, with volumetric ' +
    'god rays and lens flare. ' +
    'MOOD: Premium, aspirational, optimistic, victorious, cinematic. ' +
    'SAFETY: Never name any real person, celebrity, actor, athlete, or public figure. ' +
    'Never reference copyrighted franchises, characters, films, or brands (Marvel, ' +
    'DC, Iron Man, MCU, etc.). Use descriptive features only.',
};

export interface BrandRules {
  palette: string | null;
  mandate: string;
}

export function buildBrandRules(brand: string): BrandRules {
  return {
    palette: BRAND_PALETTES[brand] ?? null,
    mandate: BRAND_SCENE_MANDATES[brand] ?? '',
  };
}
