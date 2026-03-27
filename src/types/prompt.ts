export type AppState = 'FORM' | 'PROCESSING' | 'RESULT' | 'SAVING' | 'SAVED';

export interface FormData {
  brand: string;
  reference: string;
  subjectPosition: string;
  aspectRatio: string;
  theme: string;
  description: string;
  format_layout: string;
  primary_object: string;
  subject: string;
  lighting: string;
  mood: string;
  background: string;
  positive_prompt: string;
  negative_prompt: string;
}

export interface ReferencePromptData {
  format_layout: string;
  primary_object: string;
  subject: string;
  lighting: string;
  mood: string;
  background: string;
  positive_prompt: string;
  negative_prompt: string;
}

export const IMAGE_SIZES = [
  { label: 'Square Small – 512x512', value: 'gemini-512x512', provider: 'Gemini' },
  { label: 'Square Medium – 768x768', value: 'gemini-768x768', provider: 'Gemini' },
  { label: 'Square Large – 1024x1024', value: 'gemini-1024x1024', provider: 'Gemini' },
  { label: 'HD Landscape – 1280x720', value: 'gemini-1280x720', provider: 'Gemini' },
  { label: 'Full HD Landscape – 1920x1080', value: 'gemini-1920x1080', provider: 'Gemini' },
  { label: 'Full HD Portrait – 1080x1920', value: 'gemini-1080x1920', provider: 'Gemini' },
  { label: 'Ultra-Wide – 2048x1024', value: 'gemini-2048x1024', provider: 'Gemini' },
  { label: 'Ultra-Tall – 1024x2048', value: 'gemini-1024x2048', provider: 'Gemini' },
  { label: 'Square – 1024x1024', value: 'gpt-1024x1024', provider: 'GPT' },
  { label: 'Landscape – 1792x1024', value: 'gpt-1792x1024', provider: 'GPT' },
  { label: 'Portrait – 1024x1792', value: 'gpt-1024x1792', provider: 'GPT' },
] as const;

export type ImageSizeOption = typeof IMAGE_SIZES[number];

export const SUBJECT_POSITIONS = [
  'Lower Left',
  'Upper Left',
  'Left Aligned',
  'Centered',
  'Right Aligned',
  'Upper Right',
  'Lower Right',
] as const;

export interface ReferenceOption {
  id: string;
  label: string;
  description: string;
  category: string;
}

export const BRAND_REFERENCES: Record<string, ReferenceOption[]> = {
  'FortunePlay': [
    // --- Casino - Promotions ---
    { id: 'nightlife_lion', label: 'Lion with roulette', description: 'A right-side, half-body lion in a sharp suit wearing sunglasses', category: 'Casino - Promotions' },
    { id: 'explorer_lion', label: 'Explorer Lion', description: 'A center-position, half-body lion in adventure gear holding a treasure map', category: 'Casino - Promotions' },
    { id: 'smoking_lion', label: 'Smoking Lion', description: 'A right-side, half-body lion in ornate attire holding a cigar', category: 'Casino - Promotions' },
    { id: 'driver_lion', label: 'Driver Lion', description: 'A right-side, half-body lion in red clothes driving a car', category: 'Casino - Promotions' },
    { id: 'boss_lion', label: 'Boss Lion', description: 'A right-side, half-body lion in a suit holding cash', category: 'Casino - Promotions' },
    { id: 'neon_lion', label: 'Neon Lion', description: 'A right-side, half-body lion wearing vibrant sunglasses', category: 'Casino - Promotions' },

    // --- Sports - Promotions ---
    { id: 'golden_cup_clash', label: 'Golden Cup Clash', description: 'A right-weighted soccer promo banner with a mid-air player, a central gold trophy, and a large 0 - 0 score', category: 'Sports - Promotions' },
    { id: 'golden_striker', label: 'Golden Striker', description: 'A right-side soccer player mid-kick with a gold particle burst and floating casino chips over a dark banner layout', category: 'Sports - Promotions' },
    { id: 'golden_dribbler', label: 'Basketball Dribbler', description: 'A right-side basketball player sprinting with a ball through a burst of glowing gold particles and floating coins', category: 'Sports - Promotions' },
    { id: 'golden_dribble', label: 'Football Dribbler', description: 'A right-aligned soccer player in a gray kit controlling a ball amid explosive gold dust on a dark banner', category: 'Sports - Promotions' },
    { id: 'victory_trophy_esports', label: 'Victory Trophy', description: 'A group of esports players on the right lift a gold cup amid golden confetti with a dark negative-space banner on the left', category: 'Sports - Promotions' },
    { id: 'elite_athletes', label: 'Elite Athletes', description: 'A right-aligned lineup of five multi-sport players in matching dark uniforms with gold accents and dramatic particle lighting', category: 'Sports - Promotions' },
  ],

  'PlayMojo': [
    { id: 'casino_rabbit_1', label: 'Rabbit with Roulette', description: 'A half-body white rabbit in leather and sunglasses smoking a cigar beside a glowing prize wheel', category: 'Casino - Promotions' },
    { id: 'gangster_rabbit', label: 'Gangster Rabbit', description: 'A right-aligned anthropomorphic rabbit in sunglasses smoking in a leather armchair with a whiskey glass and heavy blue haze', category: 'Casino - Promotions' },
    { id: 'cigar_lounge_1', label: 'Cigar Lounge', description: 'Two whiskey glasses on a reflective table with cigars and ornate case in moody blue-amber lighting', category: 'Casino - Promotions' },
    { id: 'midnight_wager', label: 'Midnight Wager', description: 'A moody bar tabletop with a whiskey glass, scattered cash, and stacked cards in blue-and-amber cinematic lighting', category: 'Casino - Promotions' },
    { id: 'streetwise_rabbit', label: 'Streetwise Rabbit', description: 'A close-up rabbit in sunglasses and a red jacket posed on the right against a dark neon-lit city alley', category: 'Casino - Promotions' },
    { id: 'noir_rabbit_1', label: 'Noir Rabbit', description: 'A right-aligned, half-body rabbit in a red suit wearing sunglasses and gold chains with drifting smoke in a dark studio', category: 'Casino - Promotions' },
    { id: 'midnight_lounge', label: 'Midnight Lounge', description: 'A right-weighted still life of a whiskey bottle and coupe glass on a tray beside a tufted leather sofa', category: 'Casino - Promotions' },
    { id: 'cigar_lounge_2', label: 'Cigar Lounge', description: 'A cinematic close-up of cigars and amber spirits on a marble coffee table in a dark luxury living room', category: 'Casino - Promotions' },
    { id: 'noir_rabbit_2', label: 'Grey Noir Rabbit', description: 'A right-side close-up rabbit in a dark suit wearing reflective sunglasses against a smoky teal studio backdrop', category: 'Casino - Promotions' },
  ],

  'SpinJo': [
    { id: 'neon_portal', label: 'Astronaut with Roulette', description: 'A lone astronaut stands in a dark spacecraft bay beside a massive glowing wheel-like machine', category: 'Casino - Promotions' },
    { id: 'nebula_cruiser', label: 'Nebula Cruiser', description: 'A sleek starship angled upward on the right, backlit by a violet nebula with deep negative space on the left', category: 'Casino - Promotions' },
    { id: 'nebula_interceptor', label: 'Nebula Interceptor', description: 'A sleek starship seen head-on, drifting through a violet nebula with bright engine glows and vast dark space', category: 'Casino - Promotions' },
    { id: 'stormcraft_arrival', label: 'Stormcraft Arrival', description: 'A massive alien ship hovers low over a rain-slick roadway under storm clouds with magenta glow and blue haze', category: 'Casino - Promotions' },
    { id: 'neon_astronaut', label: 'Neon Astronaut', description: 'A right-side astronaut sprinting across a rocky alien surface with a glowing purple planet backdrop and dramatic rim light', category: 'Casino - Promotions' },
    { id: 'starlit_astronaut_1', label: 'Starlit Astronaut', description: 'A right-aligned, close-up astronaut portrait in a reflective helmet with blue eyes and purple cosmic glow', category: 'Casino - Promotions' },
    { id: 'neon_citadel', label: 'Neon Citadel', description: 'A right-weighted futuristic skyline of glowing spires beneath a looming planet in violet atmospheric haze', category: 'Casino - Promotions' },
    { id: 'starlit_astronaut_2', label: 'Starlit Astronaut', description: 'A right-side close-up portrait of a young astronaut gazing upward, helmet visor reflecting a purple-blue galaxy', category: 'Casino - Promotions' },
  ],

  'Roosterbet': [
    // --- Casino - Promotions ---
    { id: 'victory_trophy', label: 'Victory Trophy', description: 'A glowing golden cup trophy on the right, framed by sparks and flames with dramatic backlight rays', category: 'Casino - Promotions' },
    { id: 'golden_egg', label: 'Golden Egg', description: 'A glossy golden egg with a rooster emblem surrounded by coins, bars, and a red gemstone in dramatic warm lighting', category: 'Casino - Promotions' },
    { id: 'golden_rooster', label: 'Golden Rooster', description: 'A right-side close-up rooster in oversized glasses and a yellow suit posed against a warm, luxurious interior', category: 'Casino - Promotions' },
    { id: 'neon_rooster_1', label: 'Neon Rooster', description: 'A close-up, right-framed rooster in sunglasses and a leather jacket with a red muscle car glowing behind', category: 'Casino - Promotions' },
    { id: 'neon_rooster_2', label: 'Neon Rooster', description: 'A close-up rooster portrait on the right wearing glowing neon sunglasses against a dark futuristic light-streak background', category: 'Casino - Promotions' },
    { id: 'rockstar_rooster', label: 'Rockstar Rooster', description: 'A right-side close-up rooster in sunglasses holding a vintage microphone on a warm-lit concert stage', category: 'Casino - Promotions' },
    { id: 'casino_rooster', label: 'Casino Rooster', description: 'A stylish rooster in sunglasses and a suit presenting a glowing prize wheel that reads FREE PLAY', category: 'Casino - Promotions' },

    // --- Sports - Promotions ---
    { id: 'inferno_athletes', label: 'Inferno Athletes', description: 'A right-side sports collage of four action players bursting through fiery smoke with a large dark negative-space panel on the left', category: 'Sports - Promotions' },
    { id: 'victory_trophy_roosterbet', label: 'Victory Trophy', description: 'A golden championship cup on the right with sports balls and fiery embers under a dramatic light burst', category: 'Sports - Promotions' },
    { id: 'stadium_striker', label: 'Stadium Striker', description: 'A right-aligned footballer in a red kit striking a ball in a glowing stadium with dramatic sparks and haze', category: 'Sports - Promotions' },
    { id: 'inferno_skater', label: 'Inferno Skater', description: 'A right-aligned ice hockey player in red gear lunging forward with a stick amid flames and smoky darkness', category: 'Sports - Promotions' },
    { id: 'crimson_tennis', label: 'Crimson Tennis', description: 'A right-aligned tennis player in red mid-swing with a racket, surrounded by fiery smoke on a dark wide banner', category: 'Sports - Promotions' },
    { id: 'fire_striker', label: 'Fire Striker', description: 'A right-side action footballer in a red kit holding a matching ball, exploding through flames with dark negative space', category: 'Sports - Promotions' },
    { id: 'final_trophy', label: 'Final Trophy', description: 'A right-side footballer in a red kit clutching a golden cup amid red smoke, sparks, and a glowing 0-0 scoreboard', category: 'Sports - Promotions' },

  ],

  'SpinsUp': [
    { id: 'mystic_croupier', label: 'Mystic Croupier', description: 'A stylish showman in a purple coat spins a glowing casino prize wheel surrounded by swirling neon energy', category: 'Casino - Promotions' },
    { id: 'arcane_magician', label: 'Arcane Magician', description: 'A right-side, half-body stage magician presenting a glowing neon vortex in his hands under circus tent lights', category: 'Casino - Promotions' },
    { id: 'fire_ringmaster', label: 'Fire Ringmaster', description: 'A muscular showman in an ornate red jacket stands beside a lion with a burning circus tent behind', category: 'Casino - Promotions' },
    { id: 'arcane_seer', label: 'Arcane Seer', description: 'A right-aligned crimson-robed sorceress holding a glowing spiral crystal orb in a dark, mystical study', category: 'Casino - Promotions' },
    { id: 'mystic_magician', label: 'Mystic Magician', description: 'A right-side close-up of gloved hands presenting a top hat with glowing playing cards bursting into purple sparkles', category: 'Casino - Promotions' },
    { id: 'carnival_enchantress', label: 'Carnival Enchantress', description: 'A smiling woman in a red corset on the right, wrapped in glowing golden light trails at a night fair', category: 'Casino - Promotions' },
    { id: 'arcane_cardsharp', label: 'Arcane Cardsharp', description: 'A right-framed, half-body magician in ornate formalwear conjuring flying playing cards amid sparks and smoky glow', category: 'Casino - Promotions' },
    { id: 'mystic_casino', label: 'Mystic Casino', description: 'A neon-lit top hat on poker chips with a hovering bird and two aces, framed as a wide banner', category: 'Casino - Promotions' },
  ],

  'LuckyVibe': [
    // --- Casino - Promotions ---
    { id: 'sunset_dj', label: 'Sunset DJ', description: 'A smiling beach DJ in a floral shirt mixing on decks at golden hour with warm backlight and soft crowd bokeh', category: 'Casino - Promotions' },
    { id: 'sunset_sippers', label: 'Sunset Sippers', description: 'Three colorful iced cocktails on a wooden beach table with umbrellas softly blurred behind in golden-hour light', category: 'Casino - Promotions' },
    { id: 'sunset_dj_headphones', label: 'Sunset DJ Headphones', description: 'Close-up over-ear headphones resting on a mixing console with a beach crowd blurred in warm golden-hour light', category: 'Casino - Promotions' },
    { id: 'golden_festival', label: 'Golden Festival', description: 'A laughing woman in mirrored sunglasses framed on the right with dark negative space and a sunlit crowd behind', category: 'Casino - Promotions' },
    { id: 'sunset_dj_deck', label: 'Sunset DJ Deck', description: 'A close-up DJ controller in the foreground with glowing pads, facing a calm ocean sunset and palm silhouettes', category: 'Casino - Promotions' },
    { id: 'sunset_cheers', label: 'Sunset Cheers', description: 'Two iced cocktails clink in close-up against a glowing tropical beach sunset with palm silhouettes and soft party bokeh', category: 'Casino - Promotions' },
    { id: 'sunset_dj_blonde', label: 'Sunset DJ Woman', description: 'A smiling blonde woman in headphones mixes music at a beach party with warm golden-hour backlight and heavy left-side negative space', category: 'Casino - Promotions' },
    { id: 'jackpot_burst', label: 'Jackpot Burst', description: 'A glossy slot machine on the right erupting with flying gold coins against dark negative space', category: 'Casino - Promotions' },

    // --- Sports - Promotions ---
    { id: 'desert_final', label: 'Desert Final', description: 'Two footballers on a sandy pitch flank a glowing golden trophy beneath a 0 - 0 scoreboard in warm cinematic haze', category: 'Sports - Promotions' },
    { id: 'sunset_kick', label: 'Sunset Kick', description: 'A barefoot player about to kick a soccer ball on a tropical beach at sunset with an oversized casino-style chip in the foreground', category: 'Sports - Promotions' },
    { id: 'sunset_showdown', label: 'Football Beach', description: 'Two barefoot footballers contesting a ball on sandy beach at golden hour with dark left-side negative space', category: 'Sports - Promotions' },
    { id: 'victory_trophy_sports', label: 'Victory Trophy', description: 'Two athletes on the right side lift a giant cup in a stadium at sunset with dramatic backlight', category: 'Sports - Promotions' },
  ],

    'Lucky7even': [
    { id: 'purple_jackpot', label: 'Purple Jackpot', description: 'A right-weighted casino promo scene with a glowing slot machine, roulette wheel, and scattered gold coins on a purple gradient background', category: 'Casino - Promotions' },
    { id: 'royal_casino', label: 'Royal Casino', description: 'A right-aligned cluster of glossy roulette, poker cards, chips, and dice on a deep purple gradient banner', category: 'Casino - Promotions' },
    
    { id: 'lucky_spin', label: 'Casino Wheel', description: 'A right-weighted casino prize wheel surrounded by coins, chips, dice, and cards on a purple gradient banner', category: 'Casino - Promotions' },
    
    { id: 'royal_spade', label: 'Royal Spade', description: 'A glossy purple casino chip with a spade emblem floating on the right against a magenta gradient haze', category: 'Casino - Promotions' },
    { id: 'lucky_seven', label: 'Lucky Seven', description: 'A glossy blue slot reel with a gold number 7 and floating dice in a wide smoky banner composition', category: 'Casino - Promotions' },
    { id: 'royal_aces', label: 'Royal Aces', description: 'A purple casino banner with stacked ace playing cards and floating dice on the right against smoky negative space', category: 'Casino - Promotions' },
  ],

  'NovaDreams': [
    { id: 'cosmic_prizewheel', label: 'Cosmic Prizewheel', description: 'A right-side astronaut reaches toward a large numbered prize wheel in glossy cinematic sci-fi lighting', category: 'Casino - Promotions' },
    
    { id: 'lone_astronaut', label: 'Lone Astronaut', description: 'A back-facing astronaut walks across a barren alien landscape beneath a massive planet with a fiery atmospheric glow', category: 'Casino - Promotions' },
    { id: 'starlit_visor', label: 'Starlit Visor', description: 'A centered, extreme close-up of a blue-eyed young woman framed by a helmet-like circular visor with floating dust and bokeh', category: 'Casino - Promotions' },
    { id: 'orbital_sentinel', label: 'Orbital Sentinel', description: 'A futuristic satellite with broad solar panels drifting through a glowing nebula with dramatic rim light', category: 'Casino - Promotions' },
    { id: 'starlit_astronaut', label: 'Starlit Astronaut', description: 'An intense close-up portrait of a helmeted astronaut with glowing embers drifting across a dark, cinematic frame', category: 'Casino - Promotions' },
    { id: 'crimson_astronaut', label: 'Crimson Astronaut', description: 'A right-aligned astronaut in a white EVA suit emerging from smoky orange light with wide negative space on the left', category: 'Casino - Promotions' },
    { id: 'orbital_sunrise', label: 'Orbital Sunrise', description: "A cinematic sunrise peeking over Earth’s curved horizon with glowing city lights and deep space negative space", category: 'Casino - Promotions' },
  ],

  'Rollero': [
    // --- Casino - Promotions ---
    {
      id: 'crimson_helm',
      label: 'Crimson Helm',
      description: 'A right-aligned, half-body armored warrior with a red plume helmet emerging from dark negative space in cinematic haze',
      category: 'Casino - Promotions'
    },
    {
      id: 'battle_relic',
      label: 'Battle Relic',
      description: 'A right-aligned close-up of a warrior’s ornate round shield and diagonal sword in dramatic cinematic shadow',
      category: 'Casino - Promotions'
    },
    {
      id: 'fallen_helm',
      label: 'Fallen Helm',
      description: 'A battle-worn Spartan helmet with a red crest resting on cobblestones at sunset with dark ruins in the distance',
      category: 'Casino - Promotions'
    },
    {
      id: 'battle_knight',
      label: 'Battle Knight',
      description: 'A close-up armored knight on the right raising a sword and shield, framed against dark negative space with drifting sparks',
      category: 'Casino - Promotions'
    },
    {
      id: 'iron_sentinel',
      label: 'Iron Sentinel',
      description: 'A gritty close-up of a battle-worn armored warrior staring forward with intense eyes against deep black negative space',
      category: 'Casino - Promotions'
    },
    {
      id: 'sunset_excalibur',
      label: 'Sunset Excalibur',
      description: 'A lone medieval sword embedded in a rocky ledge, framed on the right against a glowing sunset with dark negative space',
      category: 'Casino - Promotions'
    },
    {
      id: 'gladiator_relic',
      label: 'Gladiator Relic',
      description: 'A right-aligned close-up of an ornate Roman helmet with red crest beside a sword, set against the Colosseum at sunset',
      category: 'Casino - Promotions'
    },
    {
      id: 'arena_gladiator',
      label: 'Arena Gladiator',
      description: 'A muscular armored warrior on the right holding a round shield in a smoky colosseum with dramatic warm rim light',
      category: 'Casino - Promotions'
    },
  ],

};

// ─────────────────────────────────────────────
// Sports Banner Wizard
// ─────────────────────────────────────────────

/** All data collected by the 5-question Sports Banner Wizard */
export interface SportsBannerData {
  // Q1
  sport: string;
  // Q2
  playerCount: '1' | '2' | '3+';
  action: string;           // selected chip or free text
  kitColors: string;        // e.g. "red and white striped"
  gender: 'Male' | 'Female' | 'Mixed';
  // Q3
  subjectPosition: string;  // one of SUBJECT_POSITIONS values
  negativeSpaceRule: string; // auto-derived from position cell
  // Q4
  backgroundCategory: string;
  backgroundDetail: string;
  hasTrophy: boolean;
  hasScoreboard: boolean;
  scoreboardText: string;
  hasEquipment: boolean;
  // Q5
  bannerSizeId: string;
  bannerSizeLabel: string;
  bannerDimensions: string;
  aspectRatio: string;
  occasion: string;
  occasionMood: string;
}

export interface PromptMetadata {
  brand: string;
  reference: string;
  subjectPosition?: string;
  aspectRatio?: string;
  theme: string;
  description: string;
  format_layout?: string;
  primary_object?: string;
  subject?: string;
  lighting?: string;
  mood?: string;
  background?: string;
  positive_prompt?: string;
  negative_prompt?: string;
}

export interface GeneratePromptResponse {
  success: boolean;
  message: string;
  prompt: string;
  metadata: PromptMetadata;
}

export interface SavePromptResponse {
  success: boolean;
  message: string;
}

export const BRANDS = [
  'FortunePlay',
  'PlayMojo',
  'SpinJo',
  'Roosterbet',
  'SpinsUp',
  'LuckyVibe',
  'Lucky7even',
  'NovaDreams',
  'Rollero'
] as const;

export const INITIAL_FORM_DATA: FormData = {
  brand: '',
  reference: '',
  subjectPosition: 'Centered',
  aspectRatio: '16:9',
  theme: '',
  description: '',
  format_layout: '',
  primary_object: '',
  subject: '',
  lighting: '',
  mood: '',
  background: '',
  positive_prompt: '',
  negative_prompt: '',
};
