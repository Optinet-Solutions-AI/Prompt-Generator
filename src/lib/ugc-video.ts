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
};

/** Fixed realism block — keeps every clip looking phone-shot, not commercial. */
export const UGC_REALISM =
  'Authentic user-generated content: shot on a smartphone, natural imperfect lighting, ' +
  'realistic skin texture, casual unscripted body language, no cinematic color grading, ' +
  'no studio lighting, no on-screen text, captions, logos or watermarks.';

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

  // Brand palette hints at the clothing/lighting accents — kept subtle for UGC.
  const palette = BRAND_PALETTES[data.brand];
  if (palette) {
    parts.push(`Subtle ${data.brand} color accents in the scene (props, clothing, lighting): ${palette}`);
  }

  parts.push(UGC_REALISM);
  return parts.join(' ');
}
