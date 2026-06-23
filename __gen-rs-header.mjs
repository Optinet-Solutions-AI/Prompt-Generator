import sharp from 'sharp';
import fs from 'node:fs';

const W = 600, H = 152;
const logoSrc = fs.readFileSync('public/brand-references/rocketspin/scraped/logo-long.svg', 'utf8');
const whiteLogo = logoSrc.replace(/#2D2D2D/gi, '#FFFFFF');
const logoW = 196;
const logoPng = await sharp(Buffer.from(whiteLogo)).resize({ width: logoW }).png().toBuffer();
const lm = await sharp(logoPng).metadata();
const lw = lm.width || logoW, lh = lm.height || 72;

const bg = await sharp('public/brand-references/novadreams/email-header-bg.png')
  .resize(W, H, { fit: 'fill' }).toBuffer();

// Low — straddling the torn edge like the other brands.
const cx = W / 2, cy = 104;
const left = Math.round(cx - lw / 2);
const top = Math.round(cy - lh / 2);

// A soft dark badge that follows the logo down so the white wordmark stays
// readable even over the lighter torn-paper area; sides keep the torn white.
const scrim = Buffer.from(
  `<svg width="${W}" height="${H}"><defs>` +
  `<radialGradient id="d" cx="0.5" cy="${cy / H}" r="0.7" gradientTransform="scale(1,0.6)">` +
  `<stop offset="0" stop-color="#04080F" stop-opacity="0.82"/>` +
  `<stop offset="0.55" stop-color="#04080F" stop-opacity="0.6"/>` +
  `<stop offset="1" stop-color="#04080F" stop-opacity="0"/></radialGradient></defs>` +
  `<rect width="${W}" height="${H}" fill="url(#d)"/></svg>`,
);

await sharp(bg)
  .composite([{ input: scrim, left: 0, top: 0 }, { input: logoPng, left, top }])
  .png()
  .toFile('public/brand-references/rocketspin/email-header.png');
console.log(`logo ${lw}x${lh} top=${top} bottom=${top + lh}`);
