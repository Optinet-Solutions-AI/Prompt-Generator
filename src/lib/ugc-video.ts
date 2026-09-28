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
  { id: 'seedance_2_5', label: 'Seedance 2.5', hint: 'Best all-round UGC look' },
  { id: 'kling3_0', label: 'Kling 3.0', hint: 'Strong speech & lip-sync' },
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

export interface VideoFormData {
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
}

export const EMPTY_VIDEO_FORM: VideoFormData = {
  brand: '',
  styleId: '',
  creator: '',
  setting: '',
  action: '',
  camera: '',
  dialogue: '',
  aspectRatio: '9:16',
  duration: 5,
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
  const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

  if (clean(data.creator)) parts.push(`Subject: ${clean(data.creator)}.`);
  if (clean(data.setting)) parts.push(`Setting: ${clean(data.setting)}.`);
  if (clean(data.action)) parts.push(`Action: ${clean(data.action)}.`);
  if (clean(data.camera)) parts.push(`Camera: ${clean(data.camera)}.`);

  if (data.audio && clean(data.dialogue)) {
    parts.push(`They say: "${clean(data.dialogue)}"`);
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
