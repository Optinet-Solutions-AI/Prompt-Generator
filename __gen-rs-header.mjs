import sharp from 'sharp';
import fs from 'node:fs';

const W = 600, H = 152;
const logoSrc = fs.readFileSync('public/brand-references/rocketspin/scraped/logo-long.svg', 'utf8');
const whiteLogo = logoSrc.replace(/#2D2D2D/gi, '#FFFFFF');
const logoW = 200;
const logoPng = await sharp(Buffer.from(whiteLogo)).resize({ width: logoW }).png().toBuffer();
const lm = await sharp(logoPng).metadata();
const lw = lm.width || logoW, lh = lm.height || 73;

const bg = await sharp('public/brand-references/novadreams/email-header-bg.png')
  .resize(W, H, { fit: 'fill' }).toBuffer();

// Lower-centre, sitting just above the torn edge (matches where the other brands place their logo).
const cx = W / 2, cy = 86;
const left = Math.round(cx - lw / 2);
const top = Math.round(cy - lh / 2);

// Dark scrim shelf behind/below the logo so the white wordmark reads down to the edge.
const scrim = Buffer.from(
  `<svg width="${W}" height="${H}"><defs>` +
  `<radialGradient id="d" cx="0.5" cy="${cy / H}" r="0.62" gradientTransform="scale(1,0.5)">` +
  `<stop offset="0" stop-color="#03070E" stop-opacity="0.7"/>` +
  `<stop offset="0.65" stop-color="#03070E" stop-opacity="0.5"/>` +
  `<stop offset="1" stop-color="#03070E" stop-opacity="0"/></radialGradient></defs>` +
  `<rect width="${W}" height="${H}" fill="url(#d)"/></svg>`,
);

await sharp(bg)
  .composite([{ input: scrim, left: 0, top: 0 }, { input: logoPng, left, top }])
  .png()
  .toFile('public/brand-references/rocketspin/email-header.png');
console.log(`wrote header; logo ${lw}x${lh} at top=${top} (bottom=${top + lh})`);
