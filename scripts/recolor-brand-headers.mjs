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

/**
 * Build a shield-free version of the template by cloning the right-side
 * stroke pattern over the centered Georgia Soccer shield. Run once per
 * recolour; the cleaned image is cached so subsequent runs skip this step.
 */
async function ensureCleanTemplate() {
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
  const W = meta.width, H = meta.height;
  // Shield bounding box (eyeballed from the 600×124 reference):
  const SHIELD_X = 220;
  const SHIELD_W = 160;
  // Donor strip: take the right-hand stroke pattern (x 420..580), mirror it so
  // the diagonal direction still points top-right → bottom-left, then paste
  // it over the shield area.
  const donor = await sharp(TEMPLATE_RAW)
    .extract({ left: 420, top: 0, width: SHIELD_W, height: H })
    .flop() // horizontal mirror to keep stroke direction consistent
    .toBuffer();
  const cleaned = await sharp(TEMPLATE_RAW)
    .composite([{ input: donor, left: SHIELD_X, top: 0, blend: 'over' }])
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
 * Recolour a pixel classified as 'navy' or 'red' by applying the
 * pixel's original brightness ratio onto the target brand color.
 */
function recolorPixel(r, g, b, refColor, targetColor) {
  const pxMax  = Math.max(r, g, b);
  const refMax = Math.max(refColor.r, refColor.g, refColor.b);
  const ratio  = pxMax / refMax;
  // Floor so we don't push very bright pixels above 255 when brand colour is
  // near-white. Also preserves some texture contrast.
  const scale = Math.min(1.4, ratio);
  return {
    r: Math.min(255, Math.round(targetColor.r * scale)),
    g: Math.min(255, Math.round(targetColor.g * scale)),
    b: Math.min(255, Math.round(targetColor.b * scale)),
  };
}

async function recolorOne(brand) {
  const outDir  = path.join(ROOT, 'public', 'brand-references', brand.slug);
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'email-header-bg.png');

  const { data, info } = await sharp(TEMPLATE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const panel  = hexToRgb(brand.panelBg);
  const accent = hexToRgb(brand.accent);

  // Walk every pixel
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    const kind = classify(r, g, b, a);
    if (kind === 'navy') {
      const c = recolorPixel(r, g, b, REF_NAVY, panel);
      data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b;
    } else if (kind === 'red') {
      const c = recolorPixel(r, g, b, REF_RED, accent);
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
  try { await fs.access(TEMPLATE); }
  catch { console.error(`ERROR: template missing at ${TEMPLATE}`); process.exit(1); }

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
