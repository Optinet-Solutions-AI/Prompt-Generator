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

// ── Dimensions ──────────────────────────────────────────────────────
const OUT_W        = 1200; // 2× retina — displays at 600px wide in email
const TEXTURE_H    = 400;  // height of the dark texture band (200px at 1×)
const LOGO_MAX_H   = 200;  // max logo height (100px at 1× display)
const LOGO_MAX_W   = 500;  // max logo width
const LOGO_OVERFLOW = 100; // px of logo that spill BELOW the texture into white
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

  // Resize texture to email header dimensions.
  // We squish (no aspect-ratio lock) so both torn paper edges are preserved
  // top + bottom while the dark centre shrinks to banner proportions.
  const bgBuf = await sharp(bgPath)
    .resize(OUT_W, OUT_H, { fit: 'fill' })  // fill = squish, no crop
    .toBuffer();

  // Load + resize logo
  const logoBuf = await loadLogo(brand);
  if (!logoBuf) {
    // No logo — save texture-only as header (user can add logo later)
    await fs.writeFile(outPath, bgBuf);
    return { ok: true, path: outPath, note: 'no logo found — texture only' };
  }

  // Get actual logo dimensions after resize
  const { width: lw, height: lh } = await sharp(logoBuf).metadata();

  // Centre the logo on the banner
  const left = Math.round((OUT_W - lw) / 2);
  const top  = Math.round((OUT_H - lh) / 2);

  const final = await sharp(bgBuf)
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
