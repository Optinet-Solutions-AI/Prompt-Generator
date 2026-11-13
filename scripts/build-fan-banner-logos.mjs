#!/usr/bin/env node
/**
 * Builds the logo images used by the Fan Banner (PNG) feature.
 *
 *   node scripts/build-fan-banner-logos.mjs
 *
 * For each brand it takes the full logo (icon + name) that was saved from the
 * brand's own website (public/brand-references/<slug>/scraped/), turns it into
 * a transparent PNG, trims the empty space around it, and writes it to
 * public/fan-banner/logos/<slug>.png.
 *
 * Why PNG instead of using the SVG directly: some browsers draw SVGs onto a
 * canvas inconsistently, and the scraped SVGs carry uneven empty margins. A
 * trimmed PNG lets the banner place every logo the same way.
 *
 * RocketSpin's saved logo writes "ROCKET" in near-black (#2D2D2D), which would
 * vanish on a dark banner. Only the lettering is switched to white; the dark
 * details inside the face icon (left of x=24 in the SVG) are left alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'public', 'brand-references');
const OUT = path.join(ROOT, 'public', 'fan-banner', 'logos');

// Logo height in the output PNG. Banners draw logos ~100px tall, so 240px
// keeps them sharp with room to spare.
const HEIGHT = 240;

const LOGOS = [
  { slug: 'fortuneplay', file: 'scraped/logo-1.svg' },
  { slug: 'roosterbet',  file: 'scraped/logo-1.svg' },
  { slug: 'spinjo',      file: 'scraped/logo-1.svg' },
  { slug: 'luckyvibe',   file: 'scraped/logo-1.svg' },
  { slug: 'spinsup',     file: 'scraped/logo-1.svg' },
  { slug: 'playmojo',    file: 'scraped/logo-1.svg' },
  { slug: 'lucky7even',  file: 'scraped/logo-1.svg' },
  { slug: 'novadreams',  file: 'scraped/logo-long.svg' },
  { slug: 'rollero',     file: 'scraped/logo-long.svg' },
  { slug: 'rocketspin',  file: 'scraped/logo-long.svg', whitenDarkLettering: true },
];

// Switch the near-black lettering paths to white, keeping icon details dark.
function whitenDarkLettering(svg) {
  return svg.replace(/<path\b[^>]*>/g, (tag) => {
    const start = tag.match(/\bd="M\s*([\d.]+)/);
    if (!start || !/fill="#2D2D2D"/i.test(tag)) return tag;
    return parseFloat(start[1]) > 24 ? tag.replace(/fill="#2D2D2D"/i, 'fill="#FFFFFF"') : tag;
  });
}

fs.mkdirSync(OUT, { recursive: true });

for (const { slug, file, whitenDarkLettering: whiten } of LOGOS) {
  const src = path.join(SRC, slug, file);
  let svg = fs.readFileSync(src, 'utf8');
  if (whiten) svg = whitenDarkLettering(svg);

  // Render large (high density), trim the transparent margin, then size down.
  const trimmed = await sharp(Buffer.from(svg), { density: 1200 })
    .png()
    .trim({ threshold: 1 })
    .toBuffer();
  const out = path.join(OUT, `${slug}.png`);
  await sharp(trimmed).resize({ height: HEIGHT }).png({ compressionLevel: 9 }).toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`${slug.padEnd(12)} ${meta.width}x${meta.height}  <- ${file}${whiten ? ' (lettering whitened)' : ''}`);
}
