import sharp from 'sharp';
import fs from 'node:fs';

const W = 600, H = 152;

// FULL logo (icon + ROCKETSPIN wordmark) so the brand name shows. White wordmark, keep cyan icon.
const logoSrc = fs.readFileSync('public/brand-references/rocketspin/scraped/logo-long.svg', 'utf8');
const whiteLogo = logoSrc.replace(/#2D2D2D/gi, '#FFFFFF');
const logoPng = await sharp(Buffer.from(whiteLogo)).resize({ width: 210 }).png().toBuffer();
const lm = await sharp(logoPng).metadata();
const lw = lm.width || 210, lh = lm.height || 77;

const bg = await sharp('public/brand-references/novadreams/email-header-bg.png')
  .resize(W, H, { fit: 'fill' }).toBuffer();

const cx = W / 2, cy = 56; // centred in the band, above the torn edge
const left = Math.round(cx - lw / 2);
const top = Math.round(cy - lh / 2);

// Subtle DARK scrim (a soft horizontal pill) so the white wordmark stays readable
// over the cyan strokes — no white blob.
const scrim = Buffer.from(
  `<svg width="${W}" height="${H}"><defs>` +
  `<radialGradient id="d" cx="0.5" cy="${cy / H}" r="0.5" gradientTransform="scale(1,0.45)" >` +
  `<stop offset="0" stop-color="#03070E" stop-opacity="0.62"/>` +
  `<stop offset="0.6" stop-color="#03070E" stop-opacity="0.45"/>` +
  `<stop offset="1" stop-color="#03070E" stop-opacity="0"/></radialGradient></defs>` +
  `<rect width="${W}" height="${Math.round(H * 0.7)}" fill="url(#d)"/></svg>`,
);

await sharp(bg)
  .composite([{ input: scrim, left: 0, top: 0 }, { input: logoPng, left, top }])
  .png()
  .toFile('public/brand-references/rocketspin/email-header.png');
console.log('wrote rocketspin/email-header.png (full logo, dark scrim)');
