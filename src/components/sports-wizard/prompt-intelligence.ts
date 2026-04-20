/**
 * prompt-intelligence.ts
 *
 * The "brain" of the Sports Banner Wizard.
 * Contains:
 *  1. ACTION_EXPANSIONS   — turns short chip text into rich physical descriptions
 *  2. BACKGROUND_SUGGESTIONS — recommends background based on sport + action
 *  3. COUNTRY_ATMOSPHERES — enriches "match in X" with specific visual detail
 *  4. buildNarrativePrompt — assembles everything into one cohesive scene description
 *
 * WHY NARRATIVE vs LABELED LIST:
 * A labeled list (Background: ... Lighting: ... Mood: ...) is easy for humans to read
 * but AI image models respond much better to a cohesive scene description because
 * they were trained on image captions, not form data.
 * "A striker caught at the peak of a full-force shot inside a packed Moroccan stadium"
 * generates far more accurate results than:
 * "Soccer athlete — striker. Background: stadium. Country: Morocco. Action: shooting."
 */

import { SportsBannerData } from '@/types/prompt';
import { POSITION_GRID, BRAND_LIGHTING_DEFAULTS } from './scene-presets';
import { BRAND_PALETTES } from '@/lib/brand-colors';

// ─────────────────────────────────────────────
// 1. Action expansions
// Each chip label → rich physical description the AI can visualise
// ─────────────────────────────────────────────

export const ACTION_EXPANSIONS: Record<string, string> = {
  // Soccer
  'striking ball mid-air with explosive force':
    'captured at the exact peak moment of a full-power shot — planting foot firm on the turf, kicking leg fully extended through the ball, upper body leaning forward for power, eyes locked on target',
  'dribbling past a defender at full sprint':
    'at full sprint, body low and leaning into the turn, the ball perfectly controlled at the foot, cutting sharply around a defender with explosive acceleration and lean body angle',
  'making a diving save — arms outstretched':
    'in a full-extension diving save — body completely horizontal mid-air, arms at maximum reach, fingertips stretching to deflect the ball, face intense with concentration',
  'celebrating a goal with fist raised':
    'in raw goal celebration — fist punching the air, chest open, chin up, momentum still carrying forward, face alive with pure emotion and intensity',
  'controlling ball with chest mid-jump':
    'suspended fully in mid-air at the peak of the jump, chest puffed forward to receive a high ball, both arms wide for balance, eyes tracking the descending ball',
  'sprinting at full pace':
    'at absolute maximum sprint — body leaning at low angle, pumping arms, one foot just lifting off the turf, expression focused and fierce, maximum athletic intensity',
  'contesting a fierce header duel':
    'both players launching simultaneously into the air for the ball — necks straining, bodies colliding at the peak, ball at the point of contact between their foreheads',
  'shoulder-to-shoulder sprint battle for the ball':
    'two athletes at full sprint, shoulders pressed together, both reaching for the ball ahead of them, neither giving ground, raw athletic contest',
  'tackle duel — one player sliding in':
    'one player launching into a full-commitment slide tackle — body low and horizontal, leg fully extended, while the other player leaps over with the ball, moment of peak impact',
  'two players celebrating a goal together':
    'two teammates in a spontaneous celebration embrace — arms locked around each other, faces showing overwhelming joy and relief, pure emotional release',
  'face-off before a penalty kick':
    'the goalkeeper crouching and ready, eyes fixed on the penalty taker who stands over the ball — the charged moment of silence before the kick',
  'team lifting the championship trophy together':
    'the full squad hoisting the gleaming trophy above their heads simultaneously — confetti falling, faces showing disbelief and elation, a once-in-a-career moment',
  'team lineup pose in matching kit':
    'the full squad standing in a tight formation, arms around each other\'s shoulders, facing the camera directly, united and powerful in matching kit',

  // Basketball
  'jumping for a tip-off':
    'launching vertically at the opening tip — both players fully airborne, one arm extended at maximum reach above the other, the ball hovering at the peak between their outstretched fingertips, bodies side by side competing for the first possession',
  'block attempt — defender vs shooter':
    'the defender launching from behind with one arm fully extended overhead, palm spread to block the shot, the shooter already in the air with wrist snapping through the release — both players frozen in the same airspace in a split-second contest',
  'dunking over the rim with both hands':
    'at the absolute apex of the jump — both hands gripping the rim above the basket, body fully elevated, knees bent beneath, face at rim level, force and authority radiating from the pose',
  'mid-air three-pointer release':
    'at the peak of a jump shot — shooting elbow perfectly aligned under the ball, wrist snapped forward in perfect follow-through, eyes already tracking the basket, fully airborne with no defenders reaching',
  'explosive fast-break layup':
    'driving hard toward the basket at full speed — ball raised in one hand for the layup, body angled into the lane, explosive upward momentum at the point of release',
  'crossover dribble low to the ground':
    'in a sharp crossover — body low and wide, ball snapping between hands close to the floor, head up scanning the defense, explosive lateral change of direction',
  'one-on-one drive to the basket':
    'attacking the basket head-on — lead shoulder driving through, ball protected low, defensive player a half-step behind, full commitment forward',
  'alley-oop — one throwing, one catching mid-air':
    'the receiver fully airborne above the rim, both hands catching the lobbed ball at full height, the passer\'s arm still extended in a perfect arc, split-second synchronicity',

  // Cricket
  'smashing a six — bat at full swing':
    'at the peak of a full-power batting swing — bat following through completely overhead, hips fully rotated, weight transferred to front foot, eyes tracking the ball already launched skyward',
  'fast bowler releasing at full pace':
    'at the exact release point of a full-pace delivery — bowling arm at maximum height, body rotating hard through the crease, front foot braced, face fixed in fierce concentration, the ball leaving the hand at match speed',
  'wicket-keeper celebration leap':
    'leaping from behind the stumps with both gloves raised — arms outstretched, chest forward, expression wide open with raw celebration energy after taking the winning wicket',
  'batsman defensive block — low crouched stance':
    'in a deep defensive crouch — bat angled forward to meet a rising delivery, head perfectly still and over the ball, weight low and balanced, the defensive wall of the innings',
  'bowler vs batsman — delivery moment':
    'the bowler at full delivery stride facing the batsman — arms wide, momentum fully committed forward, and the batsman coiled in a ready stance with bat raised, the charged moment of the duel',
  'two batsmen running between wickets':
    'both batsmen mid-sprint between the creases — bats grounded for the run, bodies lean and driving forward, legs pumping, a split-second decision to go for the run',

  // Rugby
  'charging through the defense ball in hand':
    'at full charge with ball tucked tightly under one arm — shoulder lowered, driving through contact, defenders attempting to hold the charge, pure forward power refusing to be stopped',
  'try-scoring dive over the line':
    'launching into a full-commitment diving try — body horizontal and airborne, ball stretched out ahead in both hands reaching for the line, the finish of an explosive run',
  'line-out catch at full height':
    'at the absolute top of a lift — hands extended above the head catching the ball cleanly at maximum height above the other players, the moment the throw is secured',
  'tackle collision — power vs speed':
    'the tackle exploding at the point of contact — ball carrier driving forward, tackler wrapping at full commitment, bodies locked together in a contest of force and forward momentum',
  'pass at full sprint':
    'releasing a pass at full sprinting pace — body fully angled into the run, ball spinning off the fingertips in a flat spiral, eyes scanning the field ahead, the moment before the attack continues',

  // Tennis
  'explosive overhead serve at peak toss':
    'at the absolute peak of the service motion — the ball tossed to maximum height, racket arm fully extended overhead, coiled body about to explode through the swing, full power loading',
  'powerful two-handed backhand return':
    'braced in a wide stance, both hands locked on the racket through the swing, body rotating hard from the hips, racket face meeting the ball at exactly the right contact point',
  'match-point fist-pump celebration':
    'racket held high in a triumphant fist-pump, the other arm raised, head thrown back with raw emotion, the weight of the match point releasing in one primal celebration',
  'running forehand at full stretch':
    'fully stretched to reach a wide ball — body extended in a full lunge to the side, racket reaching out at maximum arm length, perfect last-moment contact',

  // Boxing
  'champion pose — gloves raised in victory':
    'standing tall in the center of the ring, both gloves raised high above the head, chin up, chest open, radiating power and earned dominance — the champion\'s pose',
  'throwing a devastating right hook':
    'mid-swing through a full right hook — body rotated completely through the punch, lead shoulder dipped, right arm arc at maximum speed through the impact zone',
  'intense face-off stare into camera':
    'gloves up at guard position, eyes fixed directly into the lens with cold intensity — the predator\'s stare, absolute focus and controlled aggression',
  'knockout punch landing mid-swing':
    'the punch landing at the exact moment of maximum impact — the striker\'s fist connecting flush, the receiver\'s head snapping to the side, sweat spraying, a frozen instant of pure power',

  // Tennis additional
  'net exchange — both players lunging':
    'both players lunging toward the net simultaneously — rackets meeting the ball at close range, bodies fully stretched across the net line in a rapid reflex exchange',

  // Ice Hockey
  'body check collision along boards':
    'a full-speed body check into the boards — the checking player driving a shoulder into the opponent, boards shaking from the impact, both players pressed together in the collision, ice spraying at the base',
  'one-on-one breakaway vs goalie':
    'the breakaway player in full stride bearing down alone on the goalie — stick controlling the puck at speed, the goalie dropping into the ready butterfly crouch, the one-on-one showdown at maximum tension',

  // Esports additions
  'player pointing at camera — victory pose':
    'finger pointed directly into the camera lens from a low angle, expression fierce and triumphant, other hand resting on the gaming setup, the energy of a player who just secured the win',

  // Horse Racing additional
  'jockey celebration after the race':
    'standing in the stirrups post-race, arm raised in a victory salute, the horse still cantering forward, the moment of pure relief and triumph after the finish',
  'two horses neck-and-neck at the final bend':
    'two horses completely level at the final turn — jockeys crouched low urging maximum effort, hooves in perfect synchrony, neither horse giving a fraction of ground, the race on a knife edge',

  // Ice Hockey
  'slap shot with explosive ice spray':
    'mid-slap shot — stick loaded behind the body, full hip and shoulder rotation through the puck, blade striking the ice first for maximum power, a spray of ice exploding outward',
  'charging forward stick on ice':
    'skating at full acceleration, low and powerful, stick pressed to the ice, head up, body driving forward with explosive leg pushes — pure speed and intent',
  'goalkeeper in full stretch save':
    'fully sprawled in a butterfly save — pads splayed wide, glove hand reaching at full stretch, body completely covering the post, the save made by pure reaction and commitment',
  'celebrating a goal at the boards':
    'slamming into the boards in celebration — gloves off, arms raised, face full of pure uncontrolled joy, teammates converging from all directions',

  // Horse Racing
  'horse and jockey at full gallop — race moment':
    'at full racing gallop — the horse fully extended in the air between strides, jockey crouched low in perfect aerodynamic position, reins taut, both moving as one fluid unit at maximum speed',
  'crossing the finish line — winner':
    'at the exact moment the nose crosses the line — jockey rising in the irons, arms beginning to rise in victory, the finish post visible, the winning moment frozen forever',

  // Esports
  'champion raising a trophy on stage':
    'standing center-stage under the arena lights, both hands raising the esports trophy overhead, the LED backdrop blazing, the crowd visible as a sea of color below the stage',
  'player at gaming setup — intense focus':
    'leaned slightly forward at the gaming station, eyes fixed on the monitor with laser intensity, hands poised precisely on keyboard and mouse, the glow of the screen illuminating the face',

  // Generic fallback for custom actions
  'default': 'in a dynamic pose, captured at the peak moment of action',
};

// ─────────────────────────────────────────────
// 2. Smart background suggestions
// When user has picked sport + action, the wizard recommends
// the most photogenic background for that specific scene.
// ─────────────────────────────────────────────

export type BackgroundSuggestion = {
  category: string;
  detail: string;
  reason: string;
};

// Maps action chip text → the background that works best with it
export const ACTION_BACKGROUND_SUGGESTIONS: Record<string, BackgroundSuggestion> = {
  'striking ball mid-air with explosive force': {
    category: 'stadium',
    detail: 'packed stadium under blinding floodlights',
    reason: 'A packed stadium crowd and floodlights amplify the high-stakes atmosphere of the shot',
  },
  'making a diving save — arms outstretched': {
    category: 'stadium',
    detail: 'night match under blazing floodlights with pitch below',
    reason: 'Night match with pitch below creates dramatic contrast that highlights the save geometry',
  },
  'celebrating a goal with fist raised': {
    category: 'stadium',
    detail: 'packed stadium under blinding floodlights',
    reason: 'Packed crowd in the background makes the celebration feel massive and earned',
  },
  'team lifting the championship trophy together': {
    category: 'abstract',
    detail: 'explosive particle burst and smoke clouds',
    reason: 'Confetti and particle burst energy matches the trophy lift emotion',
  },
  'champion pose — gloves raised in victory': {
    category: 'minimal',
    detail: 'single spotlight on deep black background',
    reason: 'Pure black studio puts 100% of focus on the champion — nothing competing',
  },
  'sprinting at full pace': {
    category: 'abstract',
    detail: 'neon light streaks and motion blur trails',
    reason: 'Motion streaks visually reinforce the speed and direction of the sprint',
  },
  'dunking over the rim with both hands': {
    category: 'stadium',
    detail: 'indoor basketball arena with bright court lighting',
    reason: 'Arena lights from below create the classic dramatic dunk silhouette',
  },
  'intense face-off stare into camera': {
    category: 'minimal',
    detail: 'single spotlight on deep black background',
    reason: 'Black background with single spotlight creates the most intense face portrait',
  },
  'knockout punch landing mid-swing': {
    category: 'minimal',
    detail: 'solid dark background — pure black studio',
    reason: 'Dark background isolates the impact and makes the moment visceral',
  },
  'two players celebrating a goal together': {
    category: 'stadium',
    detail: 'packed stadium under blinding floodlights',
    reason: 'Stadium crowd celebrating behind them amplifies the shared joy',
  },
  'horse and jockey at full gallop — race moment': {
    category: 'outdoor',
    detail: 'mountain peaks with epic sky backdrop',
    reason: 'Open sky and landscape give the full-gallop the space and grandeur it needs',
  },
  'player at gaming setup — intense focus': {
    category: 'minimal',
    detail: 'smooth dark gradient with subtle texture',
    reason: 'Dark gradient keeps all focus on the face and screen glow',
  },
  'champion raising a trophy on stage': {
    category: 'abstract',
    detail: 'color explosion paint splash effect',
    reason: 'Color burst explosion behind a trophy raise creates maximum celebration energy',
  },
  // Cricket
  'smashing a six — bat at full swing': {
    category: 'stadium',
    detail: 'packed stadium under blinding floodlights',
    reason: 'The roaring crowd makes the six feel like a match-defining moment',
  },
  'fast bowler releasing at full pace': {
    category: 'stadium',
    detail: 'night match under blazing floodlights with pitch below',
    reason: 'Floodlit pitch with the delivery stride creates a classic cricket atmosphere',
  },
  // Rugby
  'charging through the defense ball in hand': {
    category: 'stadium',
    detail: 'packed stadium under blinding floodlights',
    reason: 'Stadium noise and crowd pressure amplify the physical charge',
  },
  'try-scoring dive over the line': {
    category: 'stadium',
    detail: 'packed stadium under blinding floodlights',
    reason: 'A packed crowd witnessing the try dive makes the score feel historic',
  },
  // Ice Hockey
  'slap shot with explosive ice spray': {
    category: 'stadium',
    detail: 'night match under blazing floodlights with pitch below',
    reason: 'Arena ice and overhead lights create the perfect slap shot backdrop',
  },
  'body check collision along boards': {
    category: 'stadium',
    detail: 'night match under blazing floodlights with pitch below',
    reason: 'The boards and ice rink environment are essential to the collision scene',
  },
  // Boxing additions
  'throwing a devastating right hook': {
    category: 'minimal',
    detail: 'single spotlight on deep black background',
    reason: 'Black studio with single spotlight isolates the punch for maximum visual impact',
  },
  'two fighters face-off before the bell': {
    category: 'minimal',
    detail: 'single spotlight on deep black background',
    reason: 'Pure black background with overhead spot creates the iconic pre-fight portrait',
  },
  // Basketball
  'jumping for a tip-off': {
    category: 'stadium',
    detail: 'indoor basketball arena with bright court lighting',
    reason: 'The court markings and arena light create the authentic tip-off environment',
  },
};

// Generic suggestion by sport (when action doesn't have a specific one)
export const SPORT_DEFAULT_SUGGESTIONS: Record<string, BackgroundSuggestion> = {
  Soccer:       { category: 'stadium', detail: 'packed stadium under blinding floodlights', reason: 'The classic backdrop for high-impact soccer banners' },
  Basketball:   { category: 'stadium', detail: 'indoor basketball arena with bright court lighting', reason: 'Arena lighting creates the iconic basketball atmosphere' },
  Tennis:       { category: 'outdoor', detail: 'mountain peaks with epic sky backdrop', reason: 'Open sky gives the serve and swing room to breathe' },
  Cricket:      { category: 'stadium', detail: 'packed stadium under blinding floodlights', reason: 'Stadium crowd puts the match action in context' },
  Rugby:        { category: 'stadium', detail: 'packed stadium under blinding floodlights', reason: 'Crowd and pitch behind the collision adds intensity' },
  Boxing:       { category: 'minimal', detail: 'single spotlight on deep black background', reason: 'Black background isolates the fighter for maximum impact' },
  'Ice Hockey': { category: 'stadium', detail: 'night match under blazing floodlights with pitch below', reason: 'Ice rink lighting creates the distinctive hockey atmosphere' },
  Esports:      { category: 'minimal', detail: 'smooth dark gradient with subtle texture', reason: 'Dark background with screen glow is the esports standard' },
  'Horse Racing': { category: 'outdoor', detail: 'mountain peaks with epic sky backdrop', reason: 'Open landscape gives the race the grandeur it deserves' },
};

export function getBackgroundSuggestion(action: string, sport: string): BackgroundSuggestion | null {
  return ACTION_BACKGROUND_SUGGESTIONS[action] ?? SPORT_DEFAULT_SUGGESTIONS[sport] ?? null;
}

// ─────────────────────────────────────────────
// 3. Country atmosphere enrichment
// "match in Morocco" → specific visual detail for Morocco
// ─────────────────────────────────────────────

const COUNTRY_ATMOSPHERES: Record<string, string> = {
  Italy:        'Italian stadium atmosphere — terracotta and stone architecture, passionate Mediterranean crowd',
  Germany:      'German arena atmosphere — precise, modern stadium design, disciplined and vocal crowd',
  Spain:        'Spanish stadium atmosphere — vibrant, sun-bleached architecture, passionate roaring crowd',
  France:       'French stadium atmosphere — elegant modern design, tricolor flags throughout the stands',
  England:      'English football atmosphere — historic brick stadium, vocal terraces, classic football energy',
  Brazil:       'Brazilian stadium atmosphere — tropical light, colorful crowd, samba energy in the stands',
  Argentina:    'Argentine stadium atmosphere — tight old stadium walls, blue-and-white streamers, raucous passionate crowd',
  USA:          'American arena atmosphere — modern sleek stadium, laser light show, commercial high-energy presentation',
  Australia:    'Australian stadium atmosphere — bright Southern Hemisphere light, vocal crowd, wide open skies',
  UAE:          'UAE arena atmosphere — ultra-modern Gulf architecture, desert heat shimmer, pristine facility',
  'Saudi Arabia': 'Saudi arena atmosphere — modern stadium, desert landscape visible on the horizon, intense heat',
  Japan:        'Japanese stadium atmosphere — orderly disciplined crowd, clean modern facility, cherry blossom or neon city backdrop',
  Netherlands:  'Dutch stadium atmosphere — orange-flooded stands, flat northern European light, loud passionate support',
  Portugal:     'Portuguese stadium atmosphere — warm Iberian light, historic stone and modern mix, dramatic sunset potential',
  Mexico:       'Mexican stadium atmosphere — altitude atmosphere, deafening noise, green-white-red color throughout the stands',
  Turkey:       'Turkish stadium atmosphere — intense Bosphorus-city backdrop, passionate ultras, flare-lit crowd',
  Morocco:      'Moroccan stadium atmosphere — North African architecture, warm desert-toned light, red-flag-filled passionate crowd',
  Nigeria:      'Nigerian stadium atmosphere — vibrant green-and-white crowd, tropical African heat, electric energy',
  Colombia:     'Colombian stadium atmosphere — loud passionate crowd, tropical warmth, yellow-blue-red color in the stands',
  'South Korea': 'South Korean arena atmosphere — ultra-modern facility, highly organized passionate crowd, LED-lit everything',
};

export function getCountryAtmosphere(country: string): string {
  return COUNTRY_ATMOSPHERES[country] ?? `${country} local atmosphere — authentic local architectural details, national crowd energy`;
}

// ─────────────────────────────────────────────
// 4. Brand-specific kit defaults
// ─────────────────────────────────────────────

export const BRAND_KIT_DEFAULTS: Record<string, string> = {
  FortunePlay: 'gold and black',
  SpinJo:      'purple and white',
  Roosterbet:  'red and black',
  LuckyVibe:   'white and blue',
  SpinsUp:     'neon purple and black',
  PlayMojo:    'white and red',
  Lucky7even:  'purple and gold',
  NovaDreams:  'white and blue',
  Rollero:     'crimson and dark grey',
};

// ─────────────────────────────────────────────
// 5. Narrative prompt builder
// Assembles all wizard data into a cohesive scene description
// ─────────────────────────────────────────────

export function buildNarrativePrompt(data: SportsBannerData, brand: string): string {
  const kitColors = data.kitColors || BRAND_KIT_DEFAULTS[brand] || 'branded team colors';

  // ── Subject line ──
  // Format: "A male Soccer Striker representing the Philippines"
  const countMap: Record<string, string> = { '1': 'A', '2': 'Two', '3+': 'A team of' };
  const countLabel = countMap[data.playerCount] ?? 'A';
  const genderLabel = data.gender === 'Mixed' ? '' : ` ${data.gender.toLowerCase()}`;
  const roleStr = data.playerRole ? ` ${data.playerRole}` : '';
  const sportStr = ` ${data.sport}${roleStr}`;
  const playerWord = data.playerCount === '1' ? '' : ' athletes';

  // Nationality + match country — explicitly state the relationship so the AI
  // understands: the player IS from X, the MATCH is in Y.
  // When no nationality is given, we explicitly mark ethnicity as unspecified so
  // the image model does not default to any particular race based on the sport.
  let contextStr = '';
  if (data.teamNationality && data.matchCountry && data.teamNationality !== data.matchCountry) {
    contextStr = ` representing ${data.teamNationality}, competing internationally in ${data.matchCountry}`;
  } else if (data.teamNationality) {
    contextStr = ` representing ${data.teamNationality}`;
  } else if (data.matchCountry) {
    contextStr = ` at a match in ${data.matchCountry}, athlete of unspecified ethnicity`;
  } else {
    contextStr = `, athlete of unspecified ethnicity — do not default to any specific race`;
  }

  // ── Action — expand to rich physical description ──
  const expandedAction = ACTION_EXPANSIONS[data.action] ?? data.action;

  // ── Setting / environment ──
  const settingParts: string[] = [];

  // Base background
  if (data.backgroundDetail) {
    settingParts.push(data.backgroundDetail);
  }

  // Country atmosphere — integrated naturally, not just "visual references to X"
  if (data.matchCountry) {
    const atmosphere = getCountryAtmosphere(data.matchCountry);
    settingParts.push(atmosphere);
  }

  // Flag — specific placement language
  if (data.flagInBackground && data.flagCountry) {
    settingParts.push(`the ${data.flagCountry} national flag waving prominently in the crowd`);
  }

  // Optional props — integrated as part of the scene
  if (data.hasTrophy) settingParts.push('a gleaming gold championship trophy positioned prominently in the scene');
  if (data.hasScoreboard) settingParts.push(`stadium scoreboard clearly showing "${data.scoreboardText || '0 - 0'}"`);
  if (data.hasEquipment) settingParts.push(`${data.sport.toLowerCase()} equipment details in the scene`);

  const settingDesc = settingParts.length > 0 ? settingParts.join(', ') : `${data.sport} venue`;

  // ── Lighting — specific effect language ──
  const lightingDesc = data.lightingToneDetail
    ? `${data.lightingToneDetail} — the light wraps around the subject creating strong rim definition`
    : (data.backgroundCategory === 'minimal'
      ? 'dramatic single-source spotlight from above, deep shadow around the subject, strong cinematic rim light outlining the silhouette'
      : 'professional sports photography lighting — high contrast between subject and background, strong rim light separating the athlete from the environment');

  // ── Mood ──
  const mood = data.occasionMood || 'energetic, dynamic, high-impact';

  // ── Composition ── clearer instruction language
  const posCell = POSITION_GRID.find((c) => c.value === data.subjectPosition);
  const compositionDesc = posCell?.negativeSpaceRule
    ?? 'subject centered, balanced composition';

  // ── Aspect ratio ──
  const aspectDesc = data.bannerDimensions
    ? `${data.bannerDimensions} aspect ratio`
    : '16:9 aspect ratio';

  // ── Assemble as one flowing narrative ──
  // Structure: [Who + Where + Context] — [What they are doing] — [Environment] — [Light] — [Mood] — [Composition] — [Technical]
  const lines = [
    // Scene opener
    `${countLabel}${genderLabel}${sportStr}${playerWord}${contextStr} — ${expandedAction}.`,

    // Kit — STRONGLY enforced so brand color palette cannot override athlete clothing
    `REQUIRED ATHLETE UNIFORM (non-negotiable): athlete MUST wear ${kitColors} kit. This overrides any brand color rule. Brand palette applies ONLY to background, lighting, and atmosphere. Athlete clothing colors are FIXED.`,

    // Environment
    `Setting: ${settingDesc}.`,

    // Lighting
    `Lighting: ${lightingDesc}.`,

    // Mood
    `Mood: ${mood}.`,

    // Composition
    `Composition: ${compositionDesc}.`,

    // Technical (no "banner" word — causes design borders)
    `Full-bleed edge-to-edge sports action photograph, ${aspectDesc}. No borders, no frames, no design overlays, no graphic elements.`,

    // Quality
    `Ultra-realistic sports photography. Cinematic quality. High contrast. Photorealistic.`,
  ];

  return lines.join(' ');
}

// ─────────────────────────────────────────────
// 6. Negative prompt builder
// ─────────────────────────────────────────────

export function buildNegativePrompt(brand: string, kitColors?: string): string {
  const paletteStr = BRAND_PALETTES[brand] ?? '';
  const neverMatch = paletteStr.match(/NEVER use ([^.]+)\./);
  const forbiddenColors = neverMatch ? neverMatch[1] : '';

  const base = [
    // Design elements (caused by word "banner")
    'border, frame, design overlay, graphic elements, UI elements, layout elements',
    'white border, black border, rounded corners, vignette frame, picture frame',
    // Text / branding
    'text, logos, watermarks, brand logos, typography, words, lettering, signatures, captions',
    // Quality
    'blurry, out of focus, motion blur, low quality, noise, grain, jpeg artifacts',
    // Style
    'cartoon, illustration, drawing, painting, anime, cgi, 3d render, unrealistic',
    // Content
    'nsfw, violence beyond sport contact',
  ].join(', ');

  if (!forbiddenColors) return base;

  // If kit colors are provided, remove any forbidden colors that appear in the kit.
  // Example: LuckyVibe forbids "cold blue" but the kit is "white and blue" — we must not
  // block blue in the negative prompt or the athlete's shorts will turn orange.
  if (kitColors) {
    const kitLower = kitColors.toLowerCase();
    const filteredForbidden = forbiddenColors
      .split(',')
      .map(c => c.trim())
      .filter(colorPhrase => {
        // Drop this forbidden phrase if any meaningful word in it appears in the kit colors
        const words = colorPhrase.split(/\s+/).filter(w => w.length > 3);
        return !words.some(word => kitLower.includes(word.toLowerCase()));
      })
      .join(', ');
    return filteredForbidden ? `${base}, ${filteredForbidden} colors` : base;
  }

  return `${base}, ${forbiddenColors} colors`;
}
