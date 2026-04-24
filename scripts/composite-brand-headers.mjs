#!/usr/bin/env node
/**
 * composite-brand-headers.mjs
 *
 * Takes the AI-generated texture (email-header-bg.png) for each brand,
 * crops + resizes it to email header proportions (1200×400 — displays at
 * 600×200 in a 600px-wide email, 2× retina-ready), then composites the
 * real brand logo centred on top.
 *
 * Output: public/brand-references/<slug>/email-header.png
 *
 * Usage:
 *   npx tsx scripts/composite-brand-headers.mjs
 *   npx tsx scripts/composite-brand-headers.mjs --brand fortuneplay
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

// ── Brand config ────────────────────────────────────────────────────
// logo: preferred logo file. SVGs scale cleanly. Falls back to webp/jpg.
const BRANDS = [
  { slug: 'fortuneplay', display: 'FortunePlay', logo: 'scraped/logo-2.svg',      logoPng: 'scraped/logo-4.webp' },
  { slug: 'roosterbet',  display: 'Roosterbet',  logo: 'scraped/logo-2.svg',      logoPng: 'scraped/logo-4.webp' },
  { slug: 'spinjo',      display: 'SpinJo',      logo: 'scraped/logo-2.svg',      logoPng: 'scraped/logo-4.webp' },
  { slug: 'luckyvibe',   display: 'LuckyVibe',   logo: 'scraped/logo-2.svg',      logoPng: 'scraped/logo-4.webp' },
  { slug: 'spinsup',     display: 'SpinsUp',     logo: 'scraped/logo-2.svg',      logoPng: 'scraped/logo-4.jpg'  },
  { slug: 'playmojo',    display: 'PlayMojo',    logo: 'scraped/logo-2.svg',      logoPng: 'scraped/logo-4.webp' },
  { slug: 'lucky7even',  display: 'Lucky7even',  logo: 'scraped/logo-2.svg',      logoPng: 'scraped/logo-4.webp' },
  { slug: 'novadreams',  display: 'NovaDreams',  logo: 'scraped/logo-short.svg',  logoPng: null },
  { slug: 'rollero',     display: 'Rollero',     logo: 'scraped/logo-short.svg',  logoPng: null },
];

// ── Dimensions (match Georgia Soccer reference template: 600×124) ───
const OUT_W        = 600;  // native template width
const TEXTURE_H    = 124;  // native template height (includes torn paper)
const LOGO_MAX_H   = 110;  // max logo height — sits within the header
const LOGO_MAX_W   = 260;  // max logo width
const LOGO_OVERFLOW = 28;  // px of logo that spill BELOW the texture into white
// Final canvas is TEXTURE_H + LOGO_OVERFLOW tall so the logo badge visually
// floats half-in-header / half-in-body (Atlassian overflow badge style).
const OUT_H = TEXTURE_H + LOGO_OVERFLOW;

async function loadLogo(brand) {
  const refDir = path.join(ROOT, 'public', 'brand-references', brand.slug);

  // Try SVG first (crisp at any size)
  const svgPath = path.join(refDir, brand.logo);
  try {
    await fs.access(svgPath);
    const buf = await sharp(svgPath, { density: 192 })
      .resize(LOGO_MAX_W, LOGO_MAX_H, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer();
    return buf;
  } catch { /* SVG failed — try raster fallback */ }

  // Raster fallback
  if (brand.logoPng) {
    const pngPath = path.join(refDir, brand.logoPng);
    try {
      await fs.access(pngPath);
      const buf = await sharp(pngPath)
        .resize(LOGO_MAX_W, LOGO_MAX_H, { fit: 'inside', withoutEnlargement: false })
        .png()
        .toBuffer();
      return buf;
    } catch { /* fallback also failed */ }
  }

  return null;
}

async function compositeOne(brand) {
  const bgPath  = path.join(ROOT, 'public', 'brand-references', brand.slug, 'email-header-bg.png');
  const outPath = path.join(ROOT, 'public', 'brand-references', brand.slug, 'email-header.png');

  // Check texture exists
  try { await fs.access(bgPath); }
  catch { return { ok: false, error: `texture missing: run generate-brand-headers.mjs first` }; }

  // 1. Resize texture to TEXTURE_H.
  const rawTexBuf = await sharp(bgPath)
    .resize(OUT_W, TEXTURE_H, { fit: 'fill' })
    .toBuffer();

  // 1b. Fade the bottom 60px of the texture to white so any torn-paper remnants
  //     in the AI image blend seamlessly into the white canvas below.
  const FADE_H = 60;
  const fadeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${FADE_H}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>` +
    `<stop offset="100%" stop-color="#ffffff" stop-opacity="1"/>` +
    `</linearGradient></defs>` +
    `<rect width="${OUT_W}" height="${FADE_H}" fill="url(#g)"/>` +
    `</svg>`;
  const fadeBuf = await sharp(Buffer.from(fadeSvg)).png().toBuffer();
  const texBuf = await sharp(rawTexBuf)
    .composite([{ input: fadeBuf, top: TEXTURE_H - FADE_H, left: 0, blend: 'over' }])
    .toBuffer();

  // 2. Build full canvas: texture on top, white on the bottom overflow zone.
  const canvasBuf = await sharp({
    create: { width: OUT_W, height: OUT_H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([
      { input: texBuf, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  // 3. Load + resize logo
  const logoBuf = await loadLogo(brand);
  if (!logoBuf) {
    await fs.writeFile(outPath, canvasBuf);
    return { ok: true, path: outPath, note: 'no logo found — texture only' };
  }

  // 4. Position logo: centred horizontally, bottom-anchored so LOGO_OVERFLOW
  //    px of the logo hang below the texture edge into the white zone.
  const { width: lw, height: lh } = await sharp(logoBuf).metadata();
  const left = Math.round((OUT_W - lw) / 2);
  const top  = TEXTURE_H - (lh - LOGO_OVERFLOW); // logo bottom = TEXTURE_H + LOGO_OVERFLOW

  const final = await sharp(canvasBuf)
    .composite([{ input: logoBuf, left, top, blend: 'over' }])
    .png({ compressionLevel: 8 })
    .toBuffer();

  await fs.writeFile(outPath, final);
  return { ok: true, path: outPath, bytes: final.length };
}

async function main() {
  const argIdx = process.argv.indexOf('--brand');
  const only = argIdx >= 0 ? process.argv[argIdx + 1] : null;
  const targets = only ? BRANDS.filter(b => b.slug === only) : BRANDS;
  if (only && targets.length === 0) {
    console.error(`Unknown brand slug "${only}". Valid: ${BRANDS.map(b => b.slug).join(', ')}`);
    process.exit(1);
  }

  console.log(`Compositing ${targets.length} brand header(s) at ${OUT_W}×${OUT_H}...`);
  const results = [];
  for (const brand of targets) {
    process.stdout.write(`  ${brand.display}... `);
    try {
      const r = await compositeOne(brand);
      if (r.ok) {
        const note = r.note ? ` (${r.note})` : ` (${((r.bytes||0) / 1024).toFixed(0)} KB)`;
        console.log(`✓${note}`);
      } else {
        console.log(`✗ ${r.error}`);
      }
      results.push({ brand: brand.slug, ...r });
    } catch (err) {
      console.log(`✗ CRASH: ${err.message}`);
      results.push({ brand: brand.slug, ok: false, error: err.message });
    }
  }

  const ok = results.filter(r => r.ok).length;
  console.log(`\nDone. ${ok}/${results.length} succeeded.`);
  console.log(`\nOpen email-header-composites.html to review all outputs.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
