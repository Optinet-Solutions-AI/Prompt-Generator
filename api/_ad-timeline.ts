/**
 * _ad-timeline.ts — the "recipe" for every ad length (pure maths, no I/O).
 *
 * An Ad Studio ad is a short sketch, modelled on the Trivago spots
 * (Higgsfield's scene-by-scene analysis of the sample, 2026-10-06):
 *
 *   hook   → the relatable problem, said on camera          (~4–5s)
 *   twist  → our spokesperson says the brand name           (~5s)
 *   demo   → the product/service in action                  (~3–4s)
 *   proof  → one concrete benefit or number                 (~5s)
 *   button → the funny line that repeats the brand          (~3–4s)
 *   end card → logo + catchphrase + call to action, with a
 *              voiceover ("Hotel? Trivago.")  — drawn by us, not AI
 *
 * The 30s MASTER uses every scene. The shorter CUT-DOWNS re-use the same
 * scenes (no new video generation):
 *   15s = hook + twist + end card
 *   10s = twist + end card
 *    6s = button + end card
 *
 * Underscore file = helper, not its own Vercel route.
 */

export type AdBeat = 'hook' | 'twist' | 'demo' | 'proof' | 'button';
export type AdCut = '30' | '15' | '10' | '6';

/** Scene order in the master ad. */
export const AD_BEATS: AdBeat[] = ['hook', 'twist', 'demo', 'proof', 'button'];

export const AD_CUTS: AdCut[] = ['30', '15', '10', '6'];

/** Exact length of each cut, in seconds. */
export const CUT_SECONDS: Record<AdCut, number> = { '30': 30, '15': 15, '10': 10, '6': 6 };

/** Which scenes each cut uses, in order (the end card always comes last). */
export const CUT_RECIPES: Record<AdCut, AdBeat[]> = {
  '30': ['hook', 'twist', 'demo', 'proof', 'button'],
  '15': ['hook', 'twist'],
  '10': ['twist'],
  '6': ['button'],
};

/** The end card never gets shorter than this (room for logo + catchphrase). */
export const MIN_END_CARD: Record<AdCut, number> = { '30': 4, '15': 4, '10': 3.5, '6': 3 };

/** A scene shorter than this isn't worth showing — it's dropped instead. */
const MIN_SCENE = 1.5;

/** Everything is snapped to whole frames so the cut is exactly the right length. */
export const FPS = 30;
const snap = (s: number) => Math.round(s * FPS) / FPS;

export interface Segment {
  beat: AdBeat | 'endcard';
  /** Start time in the finished ad (seconds). */
  start: number;
  /** How long it plays (seconds). */
  duration: number;
  /** Where to start inside the clip (seconds) — skips dead air before the first word. */
  from: number;
}

/** A generated clip: its length, and (optionally) where the speech starts. */
export interface ShotInfo { duration: number; from?: number }

/**
 * Lay out one cut. `shots` = each generated clip's length (or {duration,
 * from} when we know where the speech starts — then the dead air before it
 * is skipped). Missing beats are skipped. Scenes are trimmed if the cut runs
 * out of room, and the end card fills the rest so the total is EXACTLY the
 * cut length.
 */
export function buildTimeline(cut: AdCut, shots: Partial<Record<AdBeat, number | ShotInfo>>): Segment[] {
  const total = CUT_SECONDS[cut];
  let room = total - MIN_END_CARD[cut];
  const out: Segment[] = [];
  let t = 0;
  for (const beat of CUT_RECIPES[cut]) {
    const raw = shots[beat];
    const info: ShotInfo | null = typeof raw === 'number' ? { duration: raw } : raw || null;
    if (!info || !(info.duration > 0)) continue;
    const from = snap(Math.min(Math.max(0, info.from || 0), Math.max(0, info.duration - MIN_SCENE)));
    const d = snap(Math.min(info.duration - from, room));
    if (d < MIN_SCENE) break;
    out.push({ beat, start: snap(t), duration: d, from });
    t = snap(t + d);
    room = snap(room - d);
  }
  out.push({ beat: 'endcard', start: t, duration: snap(total - t), from: 0 });
  return out;
}

/** Total length of a timeline (seconds). */
export const timelineSeconds = (segs: Segment[]) => snap(segs.reduce((n, s) => n + s.duration, 0));
