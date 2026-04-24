#!/usr/bin/env node
/**
 * recolor-brand-headers.mjs
 *
 * Takes the reference template (Georgia Soccer style — navy + red brush-stroke
 * header with torn cream paper edge) and recolours it per brand:
 *   - template navy  → brand.panelBg
 *   - template red   → brand.accentColor
 *   - cream / white  → untouched (torn paper stays cream/white)
 *
 * Brush-stroke texture / brightness variation is preserved because each pixel
 * inherits the ORIGINAL pixel's brightness ratio mapped onto the new hue.
 *
 * Output: public/brand-references/<slug>/email-header-bg.png  (then pass to
 * composite-brand-headers.mjs to stamp the brand logo overflow on top).
 *
 * Usage:
 *   npx tsx scripts/recolor-brand-headers.mjs
 *   npx tsx scripts/recolor-brand-headers.mjs --brand fortuneplay
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const TEMPLATE_RAW   = path.join(ROOT, 'public', 'brand-references', '_template', 'header-template.png');
const TEMPLATE_CLEAN = path.join(ROOT, 'public', 'brand-references', '_template', 'header-template-clean.png');

// Load GEMINI_API_KEY from .env.local
async function loadEnvLocal() {
  try {
    const raw = await fs.readFile(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let [, key, val] = m;
      if (val.startsWith('"') || val.startsWith("'")) val = val.slice(1);
      if (val.endsWith('"')   || val.endsWith("'"))   val = val.slice(0, -1);
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch { /* ignore */ }
}

/**
 * Use Gemini image editing (gemini-3-pro-image-preview) to remove the
 * Georgia Soccer shield + text from the template, filling with the
 * surrounding stroke pattern. Falls back to the donor-strip clone method
 * when the API is unavailable or fails.
 */
async function removeShieldWithGemini(apiKey) {
  const imgBuf = await fs.readFile(TEMPLATE_RAW);
  const b64    = imgBuf.toString('base64');
  const url    = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`;
  const prompt =
    'Remove the soccer shield logo, the soccer ball, and the "GEORGIA SOCCER" text from the centre of this banner. ' +
    'Fill in the removed area seamlessly with the same diagonal red-and-navy brush-stroke texture that appears on the left and right sides of the banner. ' +
    'Keep the torn cream-white paper edge along the bottom exactly as it is. ' +
    'The result should look like a clean abstract painted sports banner with NO logo, NO shield, NO text, NO badge, NO typography — just diagonal red strokes on navy background with torn paper at the bottom. ' +
    'Preserve the original dimensions, colours, and stroke style.';

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/png', data: b64 } },
        ],
      }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini ${resp.status}: ${errText.slice(0, 250)}`);
  }
  const data = await resp.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.data);
  if (!imgPart) throw new Error(`no image in response: ${JSON.stringify(data).slice(0, 250)}`);
  return Buffer.from(imgPart.inlineData.data, 'base64');
}

/**
 * Fallback: donor-strip clone — copies a clean stroke region over the shield
 * with soft feathered edges. Used when Gemini is unavailable.
 */
async function removeShieldWithDonor() {
  try {
    const rawStat = await fs.stat(TEMPLATE_RAW);
    let cleanNeedsRebuild = true;
    try {
      const cleanStat = await fs.stat(TEMPLATE_CLEAN);
      if (cleanStat.mtimeMs >= rawStat.mtimeMs) cleanNeedsRebuild = false;
    } catch { /* clean doesn't exist yet */ }
    if (!cleanNeedsRebuild) return;
  } catch {
    throw new Error(`template missing at ${TEMPLATE_RAW}`);
  }

  const meta = await sharp(TEMPLATE_RAW).metadata();
  const H = meta.height;
  // Shield bounding box — shield is ~200px wide centered on a 600px image.
  const SHIELD_X = 200;
  const SHIELD_W = 200;
  // Donor strip: take clean stroke pattern from the right-hand side
  // (x 380..580). No mirroring so diagonal strokes continue in the same
  // direction (upper-right → lower-left).
  const donor = await sharp(TEMPLATE_RAW)
    .extract({ left: 380, top: 0, width: SHIELD_W, height: H })
    .toBuffer();
  // Narrow feather (8px) at left/right edges only — keeps the donor almost
  // fully opaque across the shield area so the Georgia Soccer shield doesn't
  // bleed through, but softens the hard seam at the boundaries.
  const FEATHER = 8;
  const fPct = (FEATHER / SHIELD_W * 100).toFixed(2);
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SHIELD_W}" height="${H}">` +
    `<defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0%" stop-color="#fff" stop-opacity="0"/>` +
    `<stop offset="${fPct}%" stop-color="#fff" stop-opacity="1"/>` +
    `<stop offset="${(100 - FEATHER / SHIELD_W * 100).toFixed(2)}%" stop-color="#fff" stop-opacity="1"/>` +
    `<stop offset="100%" stop-color="#fff" stop-opacity="0"/>` +
    `</linearGradient></defs>` +
    `<rect width="${SHIELD_W}" height="${H}" fill="url(#lg)"/>` +
    `</svg>`;
  const maskBuf = await sharp(Buffer.from(maskSvg)).png().toBuffer();
  const donorFeathered = await sharp(donor)
    .ensureAlpha()
    .composite([{ input: maskBuf, blend: 'dest-in' }])
    .png()
    .toBuffer();
  const cleaned = await sharp(TEMPLATE_RAW)
    .composite([{ input: donorFeathered, left: SHIELD_X, top: 0, blend: 'over' }])
    .png()
    .toBuffer();
  await fs.writeFile(TEMPLATE_CLEAN, cleaned);
  console.log(`  ✓ wrote ${path.relative(ROOT, TEMPLATE_CLEAN)} (shield removed)`);
}

// Brand palette (panelBg = template navy replacement, accent = template red replacement).
const BRANDS = [
  { slug: 'fortuneplay', panelBg: '#0F0800', accent: '#FFD700' },
  { slug: 'roosterbet',  panelBg: '#140000', accent: '#FF3333' },
  { slug: 'spinjo',      panelBg: '#000D1A', accent: '#00B4D8' },
  { slug: 'luckyvibe',   panelBg: '#001A33', accent: '#29B6F6' },
  { slug: 'spinsup',     panelBg: '#08001C', accent: '#FF00FF' },
  { slug: 'playmojo',    panelBg: '#020D16', accent: '#00BCD4' },
  { slug: 'lucky7even',  panelBg: '#08001A', accent: '#CE93D8' },
  { slug: 'novadreams',  panelBg: '#00030F', accent: '#40C4FF' },
  { slug: 'rollero',     panelBg: '#080600', accent: '#D4A017' },
];

// Template reference colours (sampled from public/brand-references/_template/header-template.png)
const REF_NAVY = { r: 24,  g: 53,  b: 93  }; // #18355D
const REF_RED  = { r: 215, g: 38,  b: 48  }; // #D72630

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
}

// ── HSL helpers — used to preserve lightness while switching hue/saturation.
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h *= 60;
  }
  return { h, s, l };
}
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/**
 * Classify a pixel as 'navy', 'red', 'light' (cream / white torn paper),
 * or 'other' (black outlines, shadows etc.).
 */
function classify(r, g, b, a) {
  if (a < 40) return 'transparent';
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Light / paper: bright, low saturation.
  if (max > 220 && (max - min) < 40) return 'light';
  // Red: r noticeably higher than g and b.
  if (r > g + 50 && r > b + 50) return 'red';
  // Navy / blue: b higher than r, g comparable or less.
  if (b > r + 8 && b > g - 10 && r < 120) return 'navy';
  // Else preserve (outlines, textures)
  return 'other';
}

/**
 * Recolour a pixel by swapping its HUE+SATURATION to the target brand colour
 * while preserving the pixel's original LIGHTNESS. This keeps the brush-
 * stroke texture/shading intact instead of crushing bright highlights into
 * washed-out tones.
 *
 * `refLightness` is the lightness of the template's reference colour (red or
 * navy) so we can normalise — e.g. a pixel that was slightly brighter than
 * the reference becomes slightly brighter than the brand colour.
 */
function recolorPixel(r, g, b, refLightness, targetHsl) {
  const px = rgbToHsl(r, g, b);
  // Shift the pixel's lightness by (px.l - refLightness) from the target's base lightness.
  const newL = Math.max(0, Math.min(1, targetHsl.l + (px.l - refLightness)));
  return hslToRgb(targetHsl.h, targetHsl.s, newL);
}

async function recolorOne(brand) {
  const outDir  = path.join(ROOT, 'public', 'brand-references', brand.slug);
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'email-header-bg.png');

  const { data, info } = await sharp(TEMPLATE_CLEAN)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const panelRgb  = hexToRgb(brand.panelBg);
  const accentRgb = hexToRgb(brand.accent);
  const panelHsl  = rgbToHsl(panelRgb.r,  panelRgb.g,  panelRgb.b);
  const accentHsl = rgbToHsl(accentRgb.r, accentRgb.g, accentRgb.b);
  const refNavyL  = rgbToHsl(REF_NAVY.r, REF_NAVY.g, REF_NAVY.b).l;
  const refRedL   = rgbToHsl(REF_RED.r,  REF_RED.g,  REF_RED.b).l;

  // Walk every pixel
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    const kind = classify(r, g, b, a);
    if (kind === 'navy') {
      const c = recolorPixel(r, g, b, refNavyL, panelHsl);
      data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b;
    } else if (kind === 'red') {
      const c = recolorPixel(r, g, b, refRedL, accentHsl);
      data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b;
    }
    // 'light' / 'other' / 'transparent' → keep original pixel
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(outPath);

  return { ok: true, path: outPath };
}

async function main() {
  await ensureCleanTemplate();

  const argIdx = process.argv.indexOf('--brand');
  const only = argIdx >= 0 ? process.argv[argIdx + 1] : null;
  const targets = only ? BRANDS.filter(b => b.slug === only) : BRANDS;
  if (only && targets.length === 0) {
    console.error(`ERROR: unknown brand slug "${only}".`);
    process.exit(1);
  }

  console.log(`Recolouring template → ${targets.length} brand header(s)`);
  for (const brand of targets) {
    process.stdout.write(`  ${brand.slug}... `);
    try {
      const r = await recolorOne(brand);
      console.log(`✓ ${path.relative(ROOT, r.path)}`);
    } catch (err) {
      console.log(`✗ ${err.message}`);
    }
  }
  console.log(`\nDone. Now run:  npx tsx scripts/composite-brand-headers.mjs`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
