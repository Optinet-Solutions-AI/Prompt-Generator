// Shared aspect-ratio helpers.
//
// The image-generation prompt rule (api/generate-prompt.ts) only accepts a fixed
// set of --ar tokens, so a free-text custom size like 1200×600 must be snapped to
// the closest supported token. Both the Sports wizard (BannerSizeSelect) and the
// normal-flow size selector (SizePresetSelect) use these helpers so there is one
// source of truth.

// Must match the --ar list in api/generate-prompt.ts rule 6.
export const SUPPORTED_RATIOS: Array<{ token: string; value: number }> = [
  { token: '1:2', value: 0.5 }, { token: '6:11', value: 6 / 11 }, { token: '9:16', value: 9 / 16 },
  { token: '2:3', value: 2 / 3 }, { token: '3:4', value: 0.75 }, { token: '4:5', value: 0.8 },
  { token: '5:6', value: 5 / 6 }, { token: '1:1', value: 1 }, { token: '6:5', value: 1.2 },
  { token: '5:4', value: 1.25 }, { token: '4:3', value: 4 / 3 }, { token: '3:2', value: 1.5 },
  { token: '16:9', value: 16 / 9 }, { token: '2:1', value: 2 }, { token: '21:9', value: 21 / 9 },
];

/** Snap a pixel size to the nearest supported aspect-ratio token (e.g. 1200×600 → "2:1"). */
export function nearestAspectToken(w: number, h: number): string {
  if (!w || !h) return '16:9';
  const r = w / h;
  return SUPPORTED_RATIOS.reduce((best, cur) =>
    Math.abs(cur.value - r) < Math.abs(best.value - r) ? cur : best
  ).token;
}

/** Parse "1200 × 600" / "1200x600" → {width,height}, or null if not a valid pair. */
export function parseDimensions(s?: string): { width: number; height: number } | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  if (!m) return null;
  const width = parseInt(m[1], 10);
  const height = parseInt(m[2], 10);
  if (!width || !height) return null;
  return { width, height };
}
