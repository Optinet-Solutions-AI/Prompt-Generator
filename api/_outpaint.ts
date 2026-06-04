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

// Outpaint the square into EXTEND_W×EXTEND_H via gpt-image-1 /images/edits.
// Throws on any failure so the caller can fall back to generate+crop.
export async function extendToWide(params: {
  squareBuffer: Buffer;
  brand: string;
  openaiKey: string;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { squareBuffer, brand, openaiKey } = params;
  const canvas = await buildExtendCanvas(squareBuffer);
  const mask = await buildExtendMask();

  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('image', new Blob([new Uint8Array(canvas)], { type: 'image/png' }), 'image.png');
  form.append('mask', new Blob([new Uint8Array(mask)], { type: 'image/png' }), 'mask.png');
  form.append('prompt', buildExtendPrompt(brand));
  form.append('size', `${EXTEND_W}x${EXTEND_H}`);
  form.append('n', '1');
  form.append('quality', 'high');

  const resp = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`outpaint edits failed (${resp.status}): ${t.slice(0, 300)}`);
  }
  const data = (await resp.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const item = data.data?.[0];
  let buffer: Buffer;
  // gpt-image-1 returns b64_json; the url branch is a defensive fallback (untested).
  if (item?.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64');
  } else if (item?.url) {
    const imgResp = await fetch(item.url);
    if (!imgResp.ok) throw new Error(`outpaint image download failed (${imgResp.status})`);
    buffer = Buffer.from(await imgResp.arrayBuffer());
  } else {
    throw new Error('outpaint returned no image');
  }
  return { buffer, width: EXTEND_W, height: EXTEND_H };
}
