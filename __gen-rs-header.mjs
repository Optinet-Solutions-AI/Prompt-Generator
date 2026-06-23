import sharp from 'sharp';
import fs from 'node:fs';

// Reuse a real brand texture (NovaDreams — same cyan family) so RocketSpin's
// header matches the others exactly; just composite the RocketSpin logo on top.
const W = 600, H = 152;

const logoSrc = fs.readFileSync('public/brand-references/rocketspin/scraped/logo-long.svg', 'utf8');
const whiteLogo = logoSrc.replace(/#2D2D2D/gi, '#FFFFFF'); // white wordmark, keep cyan icon
const logoPng = await sharp(Buffer.from(whiteLogo)).resize({ width: 168 }).png().toBuffer();
const lm = await sharp(logoPng).metadata();

const bg = await sharp('public/brand-references/novadreams/email-header-bg.png')
  .resize(W, H, { fit: 'fill' }).toBuffer();

// Soft dark scrim behind the logo so the wordmark stays legible on the busy texture.
const scrim = Buffer.from(
  `<svg width="${W}" height="${H}"><defs><radialGradient id="s" cx="0.5" cy="0.4" r="0.4">` +
  `<stop offset="0" stop-color="#02060C" stop-opacity="0.78"/><stop offset="1" stop-color="#02060C" stop-opacity="0"/>` +
  `</radialGradient></defs><rect width="${W}" height="${H}" fill="url(#s)"/></svg>`,
);

const left = Math.round((W - (lm.width || 168)) / 2);
const top = Math.round((118 - (lm.height || 62)) / 2); // centered above the torn edge

await sharp(bg)
  .composite([{ input: scrim, left: 0, top: 0 }, { input: logoPng, left, top }])
  .png()
  .toFile('public/brand-references/rocketspin/email-header.png');
console.log('wrote rocketspin/email-header.png from NovaDreams texture + RocketSpin logo');
