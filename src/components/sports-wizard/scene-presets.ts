/**
 * scene-presets.ts
 * All static data for the Sports Banner Wizard.
 */

// ─────────────────────────────────────────────
// Sports
// ─────────────────────────────────────────────

export type PlayerCount = '1' | '2' | '3+';

export type SportPreset = {
  id: string;
  label: string;
  emoji: string;
  defaultVenue: string;
  /** Role/type chips — shown as the first question in Q2 */
  playerRoles: string[];
  /** Action chips per player count */
  actions: Record<PlayerCount, string[]>;
};

export const SPORTS: SportPreset[] = [
  {
    id: 'Soccer',
    label: 'Soccer / Football',
    emoji: '⚽',
    defaultVenue: 'dramatic stadium under floodlights with green pitch below',
    playerRoles: [
      'Striker',
      'Goalkeeper',
      'Midfielder',
      'Defender',
      'Running player',
      'Dribbler',
      'Header specialist',
      'Celebrating player',
    ],
    actions: {
      '1': [
        'striking ball mid-air with explosive force',
        'dribbling past a defender at full sprint',
        'making a diving save — arms outstretched',
        'celebrating a goal with fist raised',
        'controlling ball with chest mid-jump',
        'sprinting at full pace',
      ],
      '2': [
        'contesting a fierce header duel',
        'shoulder-to-shoulder sprint battle for the ball',
        'tackle duel — one player sliding in',
        'two players celebrating a goal together',
        'face-off before a penalty kick',
      ],
      '3+': [
        'team lifting the championship trophy together',
        'team lineup pose in matching kit',
        'players in a victory huddle',
        'action group shot — all charging forward',
      ],
    },
  },
  {
    id: 'Basketball',
    label: 'Basketball',
    emoji: '🏀',
    defaultVenue: 'indoor basketball arena with bright court lighting',
    playerRoles: [
      'Point guard',
      'Center / dunker',
      'Shooter',
      'Dribbler',
      'Defender',
      'Champion',
    ],
    actions: {
      '1': [
        'dunking over the rim with both hands',
        'mid-air three-pointer release',
        'explosive fast-break layup',
        'crossover dribble low to the ground',
        'jumping for a tip-off',
      ],
      '2': [
        'one-on-one drive to the basket',
        'alley-oop — one throwing, one catching mid-air',
        'block attempt — defender vs shooter',
      ],
      '3+': [
        'team celebrating a championship win',
        'fast-break charge — all players in motion',
        'team huddle in intense pre-game focus',
      ],
    },
  },
  {
    id: 'Tennis',
    label: 'Tennis',
    emoji: '🎾',
    defaultVenue: 'centre court with stadium crowd in background',
    playerRoles: [
      'Server',
      'Forehand hitter',
      'Backhand hitter',
      'Net player',
      'Celebrating player',
    ],
    actions: {
      '1': [
        'explosive overhead serve at peak toss',
        'powerful two-handed backhand return',
        'match-point fist-pump celebration',
        'running forehand at full stretch',
      ],
      '2': [
        'net exchange — both players lunging',
        'mixed doubles serving together',
      ],
      '3+': [
        'team celebrating a doubles victory',
        'group shot with trophies and rackets',
      ],
    },
  },
  {
    id: 'Cricket',
    label: 'Cricket',
    emoji: '🏏',
    defaultVenue: 'cricket ground with pavilion and crowd in stands',
    playerRoles: [
      'Batsman',
      'Fast bowler',
      'Spin bowler',
      'Wicket-keeper',
      'Fielder',
      'Captain',
    ],
    actions: {
      '1': [
        'smashing a six — bat at full swing',
        'fast bowler releasing at full pace',
        'wicket-keeper celebration leap',
        'batsman defensive block — low crouched stance',
      ],
      '2': [
        'bowler vs batsman — delivery moment',
        'two batsmen running between wickets',
      ],
      '3+': [
        'team lifting the World Cup trophy',
        'fielders catching a high ball — group action',
      ],
    },
  },
  {
    id: 'Rugby',
    label: 'Rugby',
    emoji: '🏉',
    defaultVenue: 'rugby stadium with floodlights and turf pitch',
    playerRoles: [
      'Ball carrier',
      'Try scorer',
      'Line-out jumper',
      'Scrum forward',
      'Captain',
    ],
    actions: {
      '1': [
        'charging through the defense ball in hand',
        'try-scoring dive over the line',
        'line-out catch at full height',
      ],
      '2': [
        'tackle collision — power vs speed',
        'pass at full sprint',
      ],
      '3+': [
        'scrum formation — team power shot',
        'team lifting trophy after final',
        'pack charging together',
      ],
    },
  },
  {
    id: 'Boxing',
    label: 'Boxing / MMA',
    emoji: '🥊',
    defaultVenue: 'dark fight arena with ring ropes and overhead spotlight',
    playerRoles: [
      'Champion',
      'Challenger',
      'Knockout puncher',
      'Defensive boxer',
      'Celebrating fighter',
    ],
    actions: {
      '1': [
        'champion pose — gloves raised in victory',
        'throwing a devastating right hook',
        'intense face-off stare into camera',
        'knockout punch landing mid-swing',
      ],
      '2': [
        'two fighters face-off before the bell',
        'exchange mid-fight — punches thrown',
      ],
      '3+': [
        'team cornermen lifting champion in celebration',
        'entourage entering the arena',
      ],
    },
  },
  {
    id: 'Ice Hockey',
    label: 'Ice Hockey',
    emoji: '🏒',
    defaultVenue: 'ice rink arena with frozen surface and arena lighting',
    playerRoles: [
      'Goaltender',
      'Forward',
      'Defenseman',
      'Power forward',
      'Goal scorer',
      'Champion',
    ],
    actions: {
      '1': [
        'slap shot with explosive ice spray',
        'charging forward stick on ice',
        'goalkeeper in full stretch save',
        'celebrating a goal at the boards',
      ],
      '2': [
        'body check collision along boards',
        'one-on-one breakaway vs goalie',
      ],
      '3+': [
        'team piling on after a goal',
        'team skating in formation',
        'championship trophy lift on ice',
      ],
    },
  },
  {
    id: 'Esports',
    label: 'Esports',
    emoji: '🎮',
    defaultVenue: 'esports arena stage with LED screens and crowd',
    playerRoles: [
      'Champion',
      'Pro gamer',
      'Team captain',
      'Trophy holder',
    ],
    actions: {
      '1': [
        'champion raising a trophy on stage',
        'player at gaming setup — intense focus',
        'player pointing at camera — victory pose',
      ],
      '2': [
        'two players facing each other in a showdown',
        'teammates celebrating side by side',
      ],
      '3+': [
        'full team holding esports trophy on stage',
        'team group shot in matching jerseys',
      ],
    },
  },
  {
    id: 'Horse Racing',
    label: 'Horse Racing',
    emoji: '🐎',
    defaultVenue: 'horse racing track with grandstand and turf',
    playerRoles: [
      'Jockey',
      'Winning jockey',
      'Champion jockey',
    ],
    actions: {
      '1': [
        'horse and jockey at full gallop — race moment',
        'crossing the finish line — winner',
        'jockey celebration after the race',
      ],
      '2': [
        'two horses neck-and-neck at the final bend',
      ],
      '3+': [
        'pack of horses charging off the start',
        'winner in enclosure — horse and crowd',
      ],
    },
  },
];

// ─────────────────────────────────────────────
// Countries & flags
// ─────────────────────────────────────────────

export type CountryOption = {
  name: string;
  flag: string;
};

/**
 * Top match/tournament countries — shown as quick-pick chips.
 * User can also type any country manually.
 */
export const TOP_MATCH_COUNTRIES: CountryOption[] = [
  { name: 'Italy', flag: '🇮🇹' },
  { name: 'Germany', flag: '🇩🇪' },
  { name: 'Spain', flag: '🇪🇸' },
  { name: 'France', flag: '🇫🇷' },
  { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { name: 'Brazil', flag: '🇧🇷' },
  { name: 'Argentina', flag: '🇦🇷' },
  { name: 'USA', flag: '🇺🇸' },
  { name: 'Australia', flag: '🇦🇺' },
  { name: 'UAE', flag: '🇦🇪' },
  { name: 'Saudi Arabia', flag: '🇸🇦' },
  { name: 'Japan', flag: '🇯🇵' },
  { name: 'Netherlands', flag: '🇳🇱' },
  { name: 'Portugal', flag: '🇵🇹' },
  { name: 'Mexico', flag: '🇲🇽' },
  { name: 'Turkey', flag: '🇹🇷' },
  { name: 'Morocco', flag: '🇲🇦' },
  { name: 'Nigeria', flag: '🇳🇬' },
  { name: 'Colombia', flag: '🇨🇴' },
  { name: 'South Korea', flag: '🇰🇷' },
];

// ─────────────────────────────────────────────
// Lighting tones
// ─────────────────────────────────────────────

export type LightingTone = {
  id: string;
  label: string;
  /** Injected into the prompt's lighting/atmosphere description */
  promptDetail: string;
};

export const LIGHTING_TONES: LightingTone[] = [
  {
    id: 'blue',
    label: 'Blue / cool',
    promptDetail: 'cold blue stadium lights, icy blue atmosphere, cool tones throughout',
  },
  {
    id: 'orange',
    label: 'Orange / warm',
    promptDetail: 'warm amber-orange lighting, glowing warm atmosphere, rich orange tones',
  },
  {
    id: 'red',
    label: 'Red / crimson',
    promptDetail: 'intense red and crimson lighting, fiery red atmosphere, bold crimson tones',
  },
  {
    id: 'golden',
    label: 'Golden hour',
    promptDetail: 'golden sunset lighting, warm golden glow, late afternoon amber light',
  },
  {
    id: 'night',
    label: 'Night / dark',
    promptDetail: 'dark dramatic night lighting, deep shadows, highlights cutting through darkness',
  },
  {
    id: 'purple',
    label: 'Purple / neon',
    promptDetail: 'vibrant purple neon lighting, electric magenta accents, neon atmosphere',
  },
  {
    id: 'white',
    label: 'Stadium white',
    promptDetail: 'bright white stadium floodlights, clean sharp shadows, crisp professional lighting',
  },
  {
    id: 'custom',
    label: 'Custom ✏️',
    promptDetail: '', // user fills this in
  },
];

/**
 * Maps each brand to the lighting tone that best matches its color palette.
 * Auto-selected when the user picks a brand — they can always override.
 */
export const BRAND_LIGHTING_DEFAULTS: Record<string, string> = {
  FortunePlay: 'orange',    // gold, amber, warm
  SpinJo:      'purple',    // violet, neon-blue, electric cyan
  Roosterbet:  'red',       // red, crimson, fiery
  LuckyVibe:   'golden',    // golden hour, sunset, tropical warm
  SpinsUp:     'purple',    // neon purple, showman magic
  PlayMojo:    'night',     // dark, moody, noir
  Lucky7even:  'purple',    // deep purple gradient
  NovaDreams:  'blue',      // cool space, cosmic blue
  Rollero:     'red',       // crimson warrior, dark fire
};

/**
 * Short human-readable description of why this lighting is recommended per brand.
 * Shown as a contextual tip in the wizard.
 */
export const BRAND_LIGHTING_REASONS: Record<string, string> = {
  FortunePlay: 'FortunePlay uses gold and warm amber — orange/warm lighting matches the brand identity.',
  SpinJo:      'SpinJo is a sci-fi purple brand — purple/neon lighting fits the futuristic feel.',
  Roosterbet:  'Roosterbet is built on red and crimson energy — red/crimson is the signature mood.',
  LuckyVibe:   'LuckyVibe is a beach/sunset brand — golden hour lighting feels native.',
  SpinsUp:     'SpinsUp is a magical circus brand — purple/neon gives the showman spark.',
  PlayMojo:    'PlayMojo is a dark, noir brand — night/dark lighting suits the moody style.',
  Lucky7even:  'Lucky7even uses deep purple gradients — purple/neon reinforces the identity.',
  NovaDreams:  'NovaDreams is a cosmic space brand — cool blue lighting matches the atmosphere.',
  Rollero:     'Rollero is a warrior/gladiator brand — red/crimson lighting adds raw intensity.',
};

// ─────────────────────────────────────────────
// Background categories
// ─────────────────────────────────────────────

export type BackgroundCategory = {
  id: string;
  label: string;
  emoji: string;
  details: string[];
};

export const BACKGROUND_CATEGORIES: BackgroundCategory[] = [
  {
    id: 'stadium',
    label: 'Stadium / Arena',
    emoji: '🏟️',
    details: [
      'packed stadium under blinding floodlights',
      'empty stadium with dramatic beam lighting',
      'night match under blazing floodlights with pitch below',
      'locker room tunnel entry — dramatic corridor',
    ],
  },
  {
    id: 'abstract',
    label: 'Abstract / Energy',
    emoji: '✨',
    details: [
      'explosive particle burst and smoke clouds',
      'neon light streaks and motion blur trails',
      'color explosion paint splash effect',
      'dynamic dust and debris scatter',
    ],
  },
  {
    id: 'outdoor',
    label: 'Outdoor / Natural',
    emoji: '🌅',
    details: [
      'tropical beach at golden sunset',
      'desert landscape with dramatic warm haze',
      'mountain peaks with epic sky backdrop',
      'urban city skyline at night',
    ],
  },
  {
    id: 'minimal',
    label: 'Minimal / Clean',
    emoji: '⬛',
    details: [
      'solid dark background — pure black studio',
      'gradient from brand colors to black',
      'single spotlight on deep black background',
      'smooth dark gradient with subtle texture',
    ],
  },
];

// ─────────────────────────────────────────────
// Banner size presets
// ─────────────────────────────────────────────

export type BannerSizePreset = {
  id: string;
  label: string;
  subtitle: string;
  dimensions: string;
  aspectRatio: string;
  previewRatio: number;
};

export const BANNER_SIZES: BannerSizePreset[] = [
  {
    id: 'email-banner',
    label: 'Email Banner',
    subtitle: 'CRM / email header',
    dimensions: '1200 × 600',
    aspectRatio: '2:1',
    previewRatio: 2,
  },
  {
    id: 'wide-banner',
    label: 'Wide Banner',
    subtitle: 'Website hero',
    dimensions: '1328 × 784',
    aspectRatio: '16:9',
    previewRatio: 16 / 9,
  },
  {
    id: 'social-square',
    label: 'Square',
    subtitle: 'Instagram / Facebook',
    dimensions: '1080 × 1080',
    aspectRatio: '1:1',
    previewRatio: 1,
  },
  {
    id: 'story',
    label: 'Story',
    subtitle: 'Instagram / TikTok',
    dimensions: '1080 × 1920',
    aspectRatio: '9:16',
    previewRatio: 9 / 16,
  },
  {
    id: 'social-landscape',
    label: 'Social Post',
    subtitle: 'Facebook / Twitter',
    dimensions: '1200 × 628',
    aspectRatio: '16:9',
    previewRatio: 1200 / 628,
  },
  {
    id: 'leaderboard',
    label: 'Leaderboard',
    subtitle: 'Ad strip',
    dimensions: '728 × 90',
    aspectRatio: '16:9',
    previewRatio: 728 / 90,
  },
];

// ─────────────────────────────────────────────
// Occasions
// ─────────────────────────────────────────────

export type Occasion = {
  id: string;
  label: string;
  mood: string;
};

export const OCCASIONS: Occasion[] = [
  {
    id: 'match-day',
    label: 'Match Day',
    mood: 'intense, electric, high-stakes, adrenaline-charged',
  },
  {
    id: 'tournament',
    label: 'Tournament / Cup',
    mood: 'epic, dramatic, championship atmosphere, legendary',
  },
  {
    id: 'welcome-bonus',
    label: 'Welcome Bonus',
    mood: 'celebratory, inviting, exciting, fresh',
  },
  {
    id: 'deposit-bonus',
    label: 'Deposit / Cashback',
    mood: 'rewarding, bold, energetic, confident',
  },
  {
    id: 'free-bet',
    label: 'Free Bet / Free Spins',
    mood: 'thrilling, dynamic, fast-paced, opportunistic',
  },
  {
    id: 'seasonal',
    label: 'Seasonal / World Cup',
    mood: 'festive, grand, world-stage, historic',
  },
  {
    id: 'generic',
    label: 'Generic Branding',
    mood: 'powerful, confident, professional, aspirational',
  },
];

// ─────────────────────────────────────────────
// Subject position grid
// ─────────────────────────────────────────────

export type PositionCell = {
  gridRow: 1 | 2 | 3;
  gridCol: 1 | 2 | 3;
  displayLabel: string;
  value: string;
  negativeSpaceRule: string;
};

export const POSITION_GRID: PositionCell[] = [
  {
    gridRow: 1, gridCol: 1,
    displayLabel: 'Upper Left',
    value: 'Upper Left',
    negativeSpaceRule: 'subject anchored upper-left, right side and lower area clear for promotional text',
  },
  {
    gridRow: 1, gridCol: 2,
    displayLabel: 'Upper Center',
    value: 'Centered',
    negativeSpaceRule: 'subject anchored upper-center, lower half clear for promotional text',
  },
  {
    gridRow: 1, gridCol: 3,
    displayLabel: 'Upper Right',
    value: 'Upper Right',
    negativeSpaceRule: 'subject anchored upper-right, left side and lower area clear for promotional text',
  },
  {
    gridRow: 2, gridCol: 1,
    displayLabel: 'Left',
    value: 'Left Aligned',
    negativeSpaceRule: 'subject on left third, right two-thirds clear for promotional text',
  },
  {
    gridRow: 2, gridCol: 2,
    displayLabel: 'Center',
    value: 'Centered',
    negativeSpaceRule: 'subject centered, balanced composition',
  },
  {
    gridRow: 2, gridCol: 3,
    displayLabel: 'Right',
    value: 'Right Aligned',
    negativeSpaceRule: 'subject on right third, left two-thirds clear for promotional text',
  },
  {
    gridRow: 3, gridCol: 1,
    displayLabel: 'Lower Left',
    value: 'Lower Left',
    negativeSpaceRule: 'subject anchored lower-left, right side and upper area clear for promotional text',
  },
  {
    gridRow: 3, gridCol: 2,
    displayLabel: 'Lower Center',
    value: 'Centered',
    negativeSpaceRule: 'subject anchored lower-center, upper half clear for promotional text',
  },
  {
    gridRow: 3, gridCol: 3,
    displayLabel: 'Lower Right',
    value: 'Lower Right',
    negativeSpaceRule: 'subject anchored lower-right, left side and upper area clear for promotional text',
  },
];
