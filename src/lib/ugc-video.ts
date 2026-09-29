/**
 * ugc-video.ts — the structured UGC (user-generated-content) video prompt.
 *
 * WHAT THIS IS:
 * The Video tab works like the image tab: pick a brand, fill a few structured
 * fields, and we assemble ONE prompt string that is sent to Higgsfield.
 * This file holds the building blocks (styles, ratios, durations) and the
 * pure `buildUgcPrompt` function that stitches them together.
 *
 * WHY UGC-SPECIFIC:
 * UGC ads must look like a real person filmed them on a phone — handheld,
 * natural light, casual framing, no cinematic polish. Every prompt therefore
 * ends with a fixed "UGC realism" block so the model doesn't drift into a
 * glossy commercial look.
 *
 * This is a SKELETON template — edit the presets below freely; nothing else
 * in the app depends on their exact wording.
 */

import { BRAND_PALETTES } from './brand-colors';
import { findIndustry, colourName, HEALTHCARE_SAFETY } from './ugc-industries';

// ── Settings options ──────────────────────────────────────────────────────

/** UGC is watched on phones, so vertical 9:16 is the default and listed first. */
export const VIDEO_ASPECT_RATIOS = [
  { value: '9:16', label: 'Vertical', hint: 'TikTok · Reels · Shorts' },
  { value: '1:1', label: 'Square', hint: 'Feed posts' },
  { value: '16:9', label: 'Landscape', hint: 'YouTube · web' },
] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number]['value'];

/** Short clips — UGC hooks land in the first seconds. */
export const VIDEO_DURATIONS = [5, 10] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

/** The "type" of UGC clip. Each preset pre-fills the creator/setting/action fields. */
export interface UgcStyle {
  id: string;
  label: string;
  emoji: string;
  creator: string;
  setting: string;
  action: string;
  camera: string;
}

export const UGC_STYLES: UgcStyle[] = [
  {
    id: 'reaction',
    label: 'Big Win Reaction',
    emoji: '🤩',
    creator: 'A relatable adult in their late 20s, casual hoodie, no makeup look',
    setting: 'Living room couch at night, lamp light and phone screen glow on their face',
    action: 'Stares at their phone, gasps, then jumps up celebrating and turns the screen toward the camera',
    camera: 'Front-facing selfie camera held at arm\'s length, slight natural shake',
  },
  {
    id: 'testimonial',
    label: 'Talking-Head Testimonial',
    emoji: '🗣️',
    creator: 'A friendly adult in their 30s, everyday clothes, speaks directly to camera',
    setting: 'Bedroom or kitchen with natural daylight from a window, lived-in background',
    action: 'Leans toward the camera and shares an excited recommendation, nodding and gesturing with one hand',
    camera: 'Phone propped on a shelf at eye level, static framing from chest up',
  },
  {
    id: 'day-in-life',
    label: 'Day in the Life',
    emoji: '☕',
    creator: 'A laid-back adult in their 20s, streetwear, candid and unposed',
    setting: 'A quick moment on a coffee break — café window seat, soft afternoon light',
    action: 'Sips coffee, glances at their phone, smiles and gives a small fist pump',
    camera: 'Handheld POV-style shot, casual movement as if filmed by a friend',
  },
  {
    id: 'tutorial',
    label: 'Quick "How I…" Tutorial',
    emoji: '👆',
    creator: 'A confident adult in their 30s, casual smart outfit',
    setting: 'Home desk with a laptop and a plant, warm practical lighting',
    action: 'Holds the phone up to the camera and taps through the screen, then points and smiles',
    camera: 'Over-the-shoulder then cut to selfie angle, handheld',
  },
];

// ── Models ────────────────────────────────────────────────────────────────

/**
 * Higgsfield video models offered in the Video tab (MCP model ids).
 * The server only accepts ids listed in ALLOWED_MODELS in api/video.ts — keep
 * the two lists in sync. First entry = default.
 */
export const VIDEO_MODELS = [
  // Picked 2026-09-28 by rendering the same Roosterbet script on both:
  // Seedance followed the selfie direction and looked genuinely phone-shot;
  // Kling framed it like a filmed ad, but is ~3x cheaper and 1080p.
  { id: 'seedance_2_5', label: 'Seedance 2.5', hint: 'Most authentic UGC · ~35 credits / 5s' },
  { id: 'kling3_0', label: 'Kling 3.0 Pro', hint: 'Sharper 1080p, more polished · ~12.5 / 5s' },
] as const;
export type VideoModelId = (typeof VIDEO_MODELS)[number]['id'];

// ── Brand on the phone screen (option C) ──────────────────────────────────

/**
 * What the creator's phone screen shows, per brand — the brand's mascot and
 * colours, so viewers get a visual hint during the clip. We describe the
 * mascot instead of naming the brand: video models turn brand names into
 * garbled lettering. The REAL logo is added afterwards (see api/_video-brand.ts).
 */
export const BRAND_SCREEN_HINTS: Record<string, string> = {
  Roosterbet: 'a fierce red-and-white rooster mascot on a red and black game screen',
  FortunePlay: 'a majestic golden lion mascot on a black and gold game screen',
  SpinJo: 'a cyan astronaut-helmet mascot on a deep navy space-themed game screen',
  LuckyVibe: 'a stylish woman-with-headphones mascot on a bright blue and sunset-orange game screen',
  SpinsUp: 'a magician in a pink top hat mascot on a neon purple and magenta game screen',
  PlayMojo: 'a cool grey bunny mascot on a dark navy and teal game screen',
  Lucky7even: 'a glowing purple-and-gold number 7 on a deep violet game screen',
  NovaDreams: 'a white astronaut mascot on a dark cosmic cyan game screen',
  Rollero: 'a golden spartan-helmet emblem on a black and gold game screen',
};

// ── Form data ─────────────────────────────────────────────────────────────

/** "Custom business" mode — advertise any business (e.g. Dr Demajo, a dental clinic). */
export interface CustomBusiness {
  /** Saved business id (Supabase custom_businesses), '' if not saved yet. */
  id: string;
  name: string;
  industry: string;     // id from INDUSTRIES
  promote: string;      // what the clip is about, e.g. "Teeth whitening — 20% off"
  color: string;        // #RRGGBB main brand colour
  accent: string;       // #RRGGBB accent
  tagline: string;      // end-card line
  logo: string;         // data URL, optional
  /** From "Auto-fill from website". */
  website: string;
  /** Video formats written for THIS business by the research (shown first). */
  presets: BusinessPreset[];
  research: BusinessResearchNotes | null;
}

export interface BusinessPreset extends UgcStyle { line: string; endCard: string }

export interface BusinessResearchNotes {
  full_name: string; summary: string; location: string; services: string[]; selling_points: string[];
  tone: string; audience: string; social: string; compliance: string; sources: string[];
}

export const EMPTY_CUSTOM_BUSINESS: CustomBusiness = {
  id: '', name: '', industry: 'dental', promote: '', color: '#0F4C81', accent: '#38BDF8', tagline: '', logo: '',
  website: '', presets: [], research: null,
};

export type VideoMode = 'brand' | 'custom';

export interface VideoFormData {
  /** 'brand' = one of our brands · 'custom' = any business (CustomBusiness). */
  mode: VideoMode;
  custom: CustomBusiness;
  brand: string;
  styleId: string;
  creator: string;
  setting: string;
  action: string;
  camera: string;
  /** Optional spoken line — only used when audio is on. */
  dialogue: string;
  aspectRatio: VideoAspectRatio;
  duration: VideoDuration;
  audio: boolean;
  /** Optional starting frame (data URL) — switches Higgsfield to image-to-video. */
  startImage: string;
  model: VideoModelId;
  /** Stamp the real brand logo in the corner of the saved video. */
  brandLogo: boolean;
  /** Add a 1.5s closing brand card to the saved video. */
  brandEndCard: boolean;
  /** On-screen hook caption for the first seconds (stamped on, like TikTok text). */
  hook: string;
  hookOn: boolean;
}

// ── Speech timing ─────────────────────────────────────────────────────────
// A first Dr Demajo test cut the actor off mid-sentence: 9 words don't fit a
// 5 s clip once the actor takes a beat to start. Natural UGC speech is ~2.5
// words/second, plus ~1 s lead-in and a little breathing room at the end.

export const WORDS_PER_SECOND = 2.5;
const LEAD_IN_SECONDS = 1;
const TAIL_SECONDS = 0.5;

/** How long a spoken line takes, and whether it fits the clip. */
export function speechFit(line: string, duration: number) {
  const words = line.trim() ? line.trim().split(/\s+/).length : 0;
  const seconds = Math.round((words / WORDS_PER_SECOND) * 10) / 10;
  const maxWords = Math.floor((duration - LEAD_IN_SECONDS - TAIL_SECONDS) * WORDS_PER_SECOND);
  return { words, seconds, maxWords, fits: words <= maxWords };
}

export const EMPTY_VIDEO_FORM: VideoFormData = {
  mode: 'brand',
  custom: EMPTY_CUSTOM_BUSINESS,
  brand: '',
  styleId: '',
  creator: '',
  setting: '',
  action: '',
  camera: '',
  dialogue: '',
  aspectRatio: '9:16',
  duration: 5,
  hook: '',
  hookOn: true,
  audio: true,
  startImage: '',
  model: 'seedance_2_5',
  brandLogo: true,
  brandEndCard: true,
};

/** Fixed realism block — keeps every clip looking phone-shot, not commercial. */
export const UGC_REALISM =
  'Authentic user-generated content: shot on a smartphone, natural imperfect lighting, ' +
  'realistic skin texture, casual unscripted body language, no cinematic color grading, ' +
  'no studio lighting, no readable on-screen text, captions, logos or watermarks.';

/**
 * Assemble the final Higgsfield prompt from the structured fields.
 * Pure function — same input always gives the same output (unit-tested).
 */
export function buildUgcPrompt(data: VideoFormData): string {
  const parts: string[] = [];
  // Collapse spaces and drop trailing full stops (we add our own) — avoids "crown..".
  const clean = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/[.\s]+$/, '');

  if (clean(data.creator)) parts.push(`Subject: ${clean(data.creator)}.`);
  if (clean(data.setting)) parts.push(`Setting: ${clean(data.setting)}.`);
  if (clean(data.action)) parts.push(`Action: ${clean(data.action)}.`);
  if (clean(data.camera)) parts.push(`Camera: ${clean(data.camera)}.`);

  if (data.audio && clean(data.dialogue)) {
    parts.push(`They say: "${clean(data.dialogue)}"`);
    // Timing: start straight away and finish — otherwise the line gets cut off.
    parts.push('They start speaking within the first second, at a natural pace, and finish the whole sentence well before the clip ends.');
  }

  // ── Custom business: describe the KIND of business, never its name (models
  // turn names into garbled lettering — the real name/logo is stamped on after).
  if (data.mode === 'custom') {
    const ind = findIndustry(data.custom.industry);
    if (ind) parts.push(`This is a short social media ad for ${ind.describe}. ${ind.cues}.`);
    if (clean(data.custom.promote)) parts.push(`The clip is about: ${clean(data.custom.promote)}.`);
    const c1 = colourName(data.custom.color); const c2 = colourName(data.custom.accent);
    if (c1 || c2) parts.push(`Subtle ${[c1, c2].filter(Boolean).join(' and ')} accents in the scene (clothing, decor, props).`);
    if (ind?.healthcare) parts.push(HEALTHCARE_SAFETY);
    parts.push(UGC_REALISM);
    return parts.join(' ');
  }

  // The brand's mascot on the phone screen — a hint viewers can spot mid-clip.
  const screen = BRAND_SCREEN_HINTS[data.brand];
  if (screen) parts.push(`Their phone screen glows with ${screen}.`);

  // Brand palette hints at the clothing/lighting accents — kept subtle for UGC.
  const palette = BRAND_PALETTES[data.brand];
  if (palette) {
    parts.push(`Subtle ${data.brand} color accents in the scene (props, clothing, lighting): ${palette}`);
  }

  parts.push(UGC_REALISM);
  return parts.join(' ');
}
