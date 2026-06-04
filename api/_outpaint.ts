import sharp from 'sharp';

// gpt-image-1's edit endpoint only emits its 3 fixed sizes; 1536×1024 is the
// widest. We extend a square subject into this size by outpainting BACKGROUND
// ONLY into the left/right strips, then the caller crops to the exact target.
export const EXTEND_W = 1536;
export const EXTEND_H = 1024;
export const BASE_SQUARE = 1024;
const SIDE = (EXTEND_W - BASE_SQUARE) / 2; // 256px transparent strip each side

// Wide banners (ratio >= 1.7) are the ones whose crop cuts the subject; only
// they need outpainting. Square/portrait keep the fast single-shot path.
export function shouldOutpaint(requestedRatio: number): boolean {
  return Number.isFinite(requestedRatio) && requestedRatio >= 1.7;
}

// Place the square subject centred on a transparent EXTEND_W×EXTEND_H canvas.
// The transparent side strips are what the model will paint into.
export async function buildExtendCanvas(squareBuffer: Buffer): Promise<Buffer> {
  const square = await sharp(squareBuffer)
    .resize(BASE_SQUARE, BASE_SQUARE, { fit: 'cover' })
    .png().toBuffer();
  return sharp({ create: {
    width: EXTEND_W, height: EXTEND_H, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  } })
    .composite([{ input: square, left: SIDE, top: 0 }])
    .png().toBuffer();
}

// Mask for /images/edits: TRANSPARENT areas get regenerated, OPAQUE areas are
// kept. Keep the centre square (opaque), regenerate the side strips (transparent).
export async function buildExtendMask(): Promise<Buffer> {
  const keep = await sharp({ create: {
    width: BASE_SQUARE, height: EXTEND_H, channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 255 },
  } }).png().toBuffer();
  return sharp({ create: {
    width: EXTEND_W, height: EXTEND_H, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  } })
    .composite([{ input: keep, left: SIDE, top: 0 }])
    .png().toBuffer();
}

// Background-only extend instruction. NO new figures/objects/text.
export function buildExtendPrompt(brand: string): string {
  const b = brand ? `${brand} ` : '';
  return `Extend this scene outward to the left and right, filling ONLY the empty side areas with a seamless, photorealistic continuation of the existing background and atmosphere — blurred crowd, arena lighting, sky, depth, and a subtle ${b}brand-colour glow. Do NOT add any people, players, figures, faces, animals, balls, objects, or props in the extended areas. Add no text, no letters, no numbers, no logos, and no watermarks. Keep the central subject exactly as it is. The result must look like one continuous wide photograph.`;
}
