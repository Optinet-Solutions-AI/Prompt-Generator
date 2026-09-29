/**
 * ugc-industries.ts — "Custom business" mode: UGC presets per industry.
 *
 * Built from reverse research (2026-09-29) into which short-video formats
 * perform for each niche on TikTok / Instagram Reels / Facebook — e.g. for
 * dental: smile-reveal reactions, first-visit nerves → relief, "POV you
 * finally booked", myth vs fact, aligner routine, patient story. First
 * target: Drs Demajo Dental & Implantology Clinics (Malta).
 *
 * Every preset is a 5–10 s phone-shot moment. No real names, no readable
 * text in the scene (the business name/logo is stamped on afterwards), no
 * gore or needles. Edit freely — nothing else depends on the wording.
 */
import type { UgcStyle } from './ugc-video';

export interface IndustryStyle extends UgcStyle {
  /** Short spoken line (< 12 words, natural UGC voice). */
  line: string;
  /** Suggested end-card line, e.g. "Book your smile consultation". */
  endCard: string;
}

export interface Industry {
  id: string;
  label: string;
  emoji: string;
  /** Healthcare → extra safety rules in the prompt + a compliance note in the UI. */
  healthcare: boolean;
  /** What kind of business the prompt describes (never its name). */
  describe: string;
  styles: IndustryStyle[];
}

const s = (o: IndustryStyle) => o;

export const INDUSTRIES: Industry[] = [
  {
    id: 'dental', label: 'Dental clinic', emoji: '🦷', healthcare: true, describe: 'a modern, welcoming dental clinic',
    styles: [
      s({ id: 'dental-smile-reveal', label: 'Smile reveal', emoji: '😁',
        creator: 'A woman around 30 wearing a paper dental bib, natural look',
        setting: 'Bright, modern dental treatment room, clean white and soft wood tones',
        action: 'Lifts a hand mirror, pauses, breaks into a wide smile, covers her mouth and laughs',
        camera: 'Handheld phone, close medium shot, slight natural shake',
        line: 'Okay… I actually love my smile now.', endCard: 'Book your smile consultation' }),
      s({ id: 'dental-nervous-relief', label: 'Nervous → relieved', emoji: '😮‍💨',
        creator: 'A man around 40 in casual clothes',
        setting: 'Calm clinic waiting area, then a comfortable treatment chair',
        action: 'Fidgets nervously in the waiting area, then relaxes in the chair and gives a thumbs-up',
        camera: 'Front-facing selfie camera at arm’s length',
        line: 'Honestly, I was terrified. That was easy.', endCard: 'Nervous? Ask about sedation' }),
      s({ id: 'dental-pov-booked', label: 'POV: you finally booked', emoji: '🚪',
        creator: 'First-person view, only the visitor’s hands visible; a friendly receptionist',
        setting: 'Glass clinic entrance leading to a warm, bright reception desk',
        action: 'Walks through the door; the receptionist looks up, smiles and waves',
        camera: 'First-person handheld walk, smooth but natural',
        line: 'Finally doing the thing I’ve avoided for years.', endCard: 'Call today — book your visit' }),
      s({ id: 'dental-myth-fact', label: 'Dentist: myth vs fact', emoji: '👩‍⚕️',
        creator: 'A friendly dentist in their 40s wearing scrubs',
        setting: 'Consultation room with a large tooth model on the desk',
        action: 'Shakes head playfully, taps the tooth model, then smiles at the camera',
        camera: 'Phone on a tripod, static chest-up framing',
        line: 'Brushing harder doesn’t clean better. Gentle wins.', endCard: 'Book your check-up' }),
      s({ id: 'dental-sea-trip', label: 'Dental trip by the sea', emoji: '🌊',
        creator: 'A woman in her 50s with sunglasses, relaxed holiday clothes',
        setting: 'Sunny Mediterranean seafront promenade, blue sea and limestone buildings',
        action: 'Walks along the promenade, turns to the camera and flashes a confident smile',
        camera: 'Selfie walk-and-talk, handheld',
        line: 'Holiday by the sea, and new teeth too.', endCard: 'Ask about treatment stays' }),
      s({ id: 'dental-aligner', label: 'Aligner morning', emoji: '🪥',
        creator: 'A young man in his 20s, just woke up',
        setting: 'Home bathroom with soft morning light',
        action: 'Opens a clear aligner case, clicks the trays in, grins at the mirror',
        camera: 'Phone facing the mirror, close-up',
        line: 'Nobody even notices I’m wearing them.', endCard: 'Straighter teeth — ask about aligners' }),
    ],
  },
  {
    id: 'medical', label: 'Medical clinic / GP', emoji: '🩺', healthcare: true, describe: 'a friendly medical clinic',
    styles: [
      s({ id: 'med-myth', label: 'Doctor: myth vs fact', emoji: '👨‍⚕️', creator: 'A calm doctor in their 40s in a white coat',
        setting: 'Bright consultation room', action: 'Raises an eyebrow, shakes head, then smiles reassuringly at the camera',
        camera: 'Phone on a tripod, chest-up', line: 'No, you don’t need to wait until it’s serious.', endCard: 'Book an appointment' }),
      s({ id: 'med-first-visit', label: 'What to expect', emoji: '📋', creator: 'A patient in their 30s',
        setting: 'Modern clinic reception, then a consultation room', action: 'Checks in with a smile, then sits relaxed chatting with the doctor',
        camera: 'Handheld, filmed by a friend', line: 'Way quicker and friendlier than I expected.', endCard: 'Same-week appointments' }),
      s({ id: 'med-pov-sameday', label: 'POV: same-day appointment', emoji: '⏱️', creator: 'First-person view of a patient',
        setting: 'Walking from a sunny street into a calm clinic', action: 'Walks in, is greeted warmly, sits down in the waiting area',
        camera: 'First-person handheld walk', line: 'Called this morning, seen by lunch.', endCard: 'Call us today' }),
    ],
  },
  {
    id: 'aesthetics', label: 'Aesthetics / med-spa', emoji: '✨', healthcare: true, describe: 'a calm, upscale aesthetics clinic',
    styles: [
      s({ id: 'aes-glow', label: 'Glow reveal', emoji: '🪞', creator: 'A woman in her 30s, fresh natural skin',
        setting: 'Softly lit treatment room', action: 'Looks into a mirror, touches her cheek gently and smiles',
        camera: 'Handheld close-up', line: 'I feel so fresh right now.', endCard: 'Book a consultation' }),
      s({ id: 'aes-vlog', label: 'Treatment-day vlog', emoji: '🎥', creator: 'A woman in her 20s',
        setting: 'Chic clinic lounge with plants', action: 'Waves at the camera, sips water, relaxes into a treatment chair',
        camera: 'Selfie vlog style', line: 'Treating myself today, come with me.', endCard: 'Your glow starts here' }),
      s({ id: 'aes-qa', label: 'Consultation Q&A', emoji: '💬', creator: 'A friendly practitioner in their 30s',
        setting: 'Minimal consultation room', action: 'Nods thoughtfully, gestures while explaining, smiles at the camera',
        camera: 'Phone on a tripod, chest-up', line: 'Great question — let’s talk about what suits you.', endCard: 'Free consultation' }),
    ],
  },
  {
    id: 'gym', label: 'Gym / fitness', emoji: '🏋️', healthcare: false, describe: 'an energetic modern gym',
    styles: [
      s({ id: 'gym-first-day', label: 'First day → confident', emoji: '💪', creator: 'A person in their late 20s in workout clothes',
        setting: 'Bright gym floor', action: 'Looks around nervously, then finishes a set and grins at the camera',
        camera: 'Handheld selfie', line: 'Day one done. Actually loved it.', endCard: 'First week free' }),
      s({ id: 'gym-form', label: 'Trainer fixes your form', emoji: '🧑‍🏫', creator: 'A friendly personal trainer',
        setting: 'Gym with dumbbell rack', action: 'Adjusts a client’s posture, gives a thumbs-up to the camera',
        camera: 'Phone on a bench, wide-ish', line: 'Small fix, big difference.', endCard: 'Book a free session' }),
      s({ id: 'gym-member-day', label: 'Member day in the life', emoji: '⏰', creator: 'A member in their 30s',
        setting: 'Gym entrance at sunrise', action: 'Taps in, waves at staff, starts stretching with a smile',
        camera: 'Handheld POV cuts', line: 'My favourite hour of the day.', endCard: 'Join today' }),
    ],
  },
  {
    id: 'restaurant', label: 'Restaurant / café', emoji: '🍽️', healthcare: false, describe: 'a cosy, busy restaurant',
    styles: [
      s({ id: 'rest-first-bite', label: 'POV: first bite', emoji: '😋', creator: 'A person in their 20s at a table',
        setting: 'Warm restaurant table with the signature dish', action: 'Takes a bite, closes eyes, nods slowly with a big smile',
        camera: 'Handheld close-up across the table', line: 'Okay, this is unreal.', endCard: 'Book your table' }),
      s({ id: 'rest-dish-reveal', label: 'Dish reveal', emoji: '🍝', creator: 'A server’s hands',
        setting: 'Rustic table, soft evening light', action: 'Sets down a steaming dish; the camera leans in as steam rises',
        camera: 'Handheld close-up, slow push in', line: 'You have to try this one.', endCard: 'Open tonight' }),
      s({ id: 'rest-chef', label: 'Behind the pass', emoji: '👨‍🍳', creator: 'A cheerful chef in whites',
        setting: 'Open kitchen pass', action: 'Plates a dish, wipes the rim, slides it forward and winks',
        camera: 'Handheld, over the pass', line: 'Made fresh, every single time.', endCard: 'Reserve now' }),
    ],
  },
  {
    id: 'real-estate', label: 'Real estate', emoji: '🏡', healthcare: false, describe: 'a trusted local real estate agency',
    styles: [
      s({ id: 're-tour', label: 'Walk-through tour', emoji: '🚶', creator: 'First-person view of a visitor',
        setting: 'Bright, stylish apartment with big windows', action: 'Opens the front door and walks into a sunlit living room with a view',
        camera: 'First-person handheld walk', line: 'Wait till you see the view.', endCard: 'Book a viewing' }),
      s({ id: 're-feature', label: 'Hidden-feature reveal', emoji: '🔑', creator: 'A friendly agent in their 30s',
        setting: 'Modern kitchen', action: 'Slides open a hidden pantry door and smiles at the camera',
        camera: 'Handheld selfie', line: 'Nobody expects this in here.', endCard: 'See more listings' }),
      s({ id: 're-keys', label: 'Just got the keys', emoji: '🥳', creator: 'A young couple',
        setting: 'Doorstep of a new home', action: 'Holds up keys, hugs, jumps with joy',
        camera: 'Handheld, filmed by a friend', line: 'We did it! It’s ours!', endCard: 'Find your home' }),
    ],
  },
  {
    id: 'salon', label: 'Hair / beauty salon', emoji: '💇', healthcare: false, describe: 'a stylish hair and beauty salon',
    styles: [
      s({ id: 'salon-spin', label: 'Transformation spin', emoji: '💫', creator: 'A woman in her 20s with freshly styled hair',
        setting: 'Salon chair in front of a big mirror', action: 'Spins the chair around, flips her hair and beams',
        camera: 'Handheld, from behind the stylist', line: 'I can’t stop looking at it!', endCard: 'Book your appointment' }),
      s({ id: 'salon-stylist', label: 'Stylist answers', emoji: '✂️', creator: 'A stylist in their 30s holding scissors',
        setting: 'Salon station', action: 'Points to the side, nods, then smiles and snips the air',
        camera: 'Phone on a stand, chest-up', line: 'Yes, you can go shorter. Trust me.', endCard: 'Walk-ins welcome' }),
      s({ id: 'salon-wash', label: 'Relaxing wash', emoji: '🫧', creator: 'A client leaning back at the basin',
        setting: 'Calm wash area, warm lighting', action: 'Closes eyes and sighs happily as warm water runs through the hair',
        camera: 'Handheld close-up', line: 'Best part of my week.', endCard: 'Treat yourself' }),
    ],
  },
  {
    id: 'physio', label: 'Physio / chiropractor', emoji: '🧘', healthcare: true, describe: 'a modern physiotherapy clinic',
    styles: [
      s({ id: 'physio-relief', label: 'Relief after treatment', emoji: '😌', creator: 'A man in his 40s in sportswear',
        setting: 'Treatment room', action: 'Rolls his shoulders, smiles surprised, gives a thumbs-up',
        camera: 'Handheld, filmed by the therapist', line: 'Why didn’t I come sooner?', endCard: 'Book an assessment' }),
      s({ id: 'physio-tip', label: 'Desk-posture tip', emoji: '🪑', creator: 'A friendly physiotherapist',
        setting: 'Office desk', action: 'Demonstrates sitting up straight and a simple neck stretch, then smiles',
        camera: 'Phone on a tripod', line: 'Try this at your desk right now.', endCard: 'Book a session' }),
      s({ id: 'physio-story', label: 'Patient story', emoji: '🗣️', creator: 'A woman in her 50s',
        setting: 'Sunny park path', action: 'Walks confidently, turns to camera and smiles',
        camera: 'Selfie walk-and-talk', line: 'Walking comfortably again feels amazing.', endCard: 'Get moving again' }),
    ],
  },
  {
    id: 'other', label: 'Other business', emoji: '🏪', healthcare: false, describe: 'a friendly local business',
    styles: [
      s({ id: 'other-reaction', label: 'Customer reaction', emoji: '🤩', creator: 'A happy customer in their 30s',
        setting: 'Inside the business, bright and welcoming', action: 'Looks around impressed, then smiles and nods at the camera',
        camera: 'Handheld selfie', line: 'Okay, I’m obsessed with this place.', endCard: 'Visit us today' }),
      s({ id: 'other-pov', label: 'POV: first visit', emoji: '🚪', creator: 'First-person view of a new customer',
        setting: 'Walking in through the front door', action: 'Walks in; a staff member greets them with a smile',
        camera: 'First-person handheld walk', line: 'Should’ve come here ages ago.', endCard: 'Come say hi' }),
      s({ id: 'other-owner', label: 'Meet the owner', emoji: '👋', creator: 'The friendly owner in their 40s',
        setting: 'Behind the counter', action: 'Waves at the camera, gestures around proudly, smiles',
        camera: 'Phone on the counter', line: 'Come see what we’ve built.', endCard: 'Find us today' }),
    ],
  },
];

export const findIndustry = (id: string) => INDUSTRIES.find(i => i.id === id) || null;

/** Extra rules for healthcare ads (from TikTok/Meta healthcare policies). */
export const HEALTHCARE_SAFETY =
  'Keep it reassuring and realistic: no medical procedures shown in graphic detail, ' +
  'no blood, needles, drills or open mouths in extreme close-up, no exaggerated results.';

/** Nearest plain colour name for a hex (video models ignore hex codes). */
export function colourName(hex: string): string {
  const named: Array<[string, number, number, number]> = [
    ['white', 245, 245, 245], ['black', 20, 20, 20], ['charcoal grey', 60, 64, 72], ['light grey', 190, 195, 200],
    ['navy blue', 20, 40, 90], ['royal blue', 40, 80, 200], ['sky blue', 110, 180, 235], ['teal', 20, 120, 130],
    ['turquoise', 60, 200, 200], ['mint green', 150, 225, 190], ['emerald green', 20, 140, 90], ['olive green', 110, 120, 50],
    ['yellow', 240, 210, 50], ['gold', 210, 170, 60], ['orange', 240, 140, 40], ['coral', 245, 120, 100],
    ['red', 210, 40, 40], ['burgundy', 120, 20, 40], ['pink', 240, 150, 190], ['magenta', 210, 40, 160],
    ['purple', 120, 60, 170], ['lavender', 190, 170, 230], ['brown', 120, 80, 50], ['beige', 225, 205, 170],
  ];
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '';
  const n = parseInt(m[1], 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  let best = named[0]; let bestD = Infinity;
  for (const c of named) { const d = (c[1] - r) ** 2 + (c[2] - g) ** 2 + (c[3] - b) ** 2; if (d < bestD) { bestD = d; best = c; } }
  return best[0];
}
