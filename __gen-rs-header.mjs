import sharp from 'sharp';
import fs from 'node:fs';

const W = 600, H = 152;

// Icon-only logo, placed LARGE + centered + straddling the torn edge (NovaDreams format).
const iconSrc = fs.readFileSync('public/brand-references/rocketspin/scraped/logo-short.svg', 'utf8');
const iconPng = await sharp(Buffer.from(iconSrc)).resize({ width: 116 }).png().toBuffer();
const im = await sharp(iconPng).metadata();
const iw = im.width || 116, ih = im.height || 116;

const bg = await sharp('public/brand-references/novadreams/email-header-bg.png')
  .resize(W, H, { fit: 'fill' }).toBuffer();

const cx = W / 2, cy = 80; // straddle: centre sits near the torn edge
const left = Math.round(cx - iw / 2);
const top = Math.round(cy - ih / 2);

// Soft light disc behind the icon so it reads as a badge on the busy texture
// (mirrors the "bubble" effect of the other brands' logos).
const disc = Buffer.from(
  `<svg width="${W}" height="${H}"><defs><radialGradient id="d" cx="${cx / W}" cy="${cy / H}" r="0.16">` +
  `<stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="0.7" stop-color="#ffffff" stop-opacity="0.85"/>` +
  `<stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>` +
  `<rect width="${W}" height="${H}" fill="url(#d)"/></svg>`,
);

await sharp(bg)
  .composite([{ input: disc, left: 0, top: 0 }, { input: iconPng, left, top }])
  .png()
  .toFile('public/brand-references/rocketspin/email-header.png');
console.log('wrote rocketspin/email-header.png (icon straddling edge)');
