import sharp from 'sharp';
import fs from 'node:fs';

const logoSrc = fs.readFileSync('public/brand-references/rocketspin/scraped/logo-long.svg', 'utf8');
const whiteLogo = logoSrc.replace(/#2D2D2D/gi, '#FFFFFF'); // white wordmark, keep cyan icon
const logoB64 = Buffer.from(whiteLogo, 'utf8').toString('base64');

let torn = 'M0,152 ';
for (let x = 0, i = 0; x <= 600; x += 24, i++) torn += `L${x},${i % 2 === 0 ? 142 : 152} `;
torn += 'L600,152 Z';

const W = 600, H = 152;
const lw = 150, lh = Math.round(lw * 44 / 120);
const lx = Math.round((W - lw) / 2), ly = Math.round((H - 16 - lh) / 2);

const band = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#06203A"/><stop offset="0.55" stop-color="#0A2E4D"/><stop offset="1" stop-color="#08243B"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.35" r="0.6">
      <stop offset="0" stop-color="#45B9EA" stop-opacity="0.25"/><stop offset="1" stop-color="#45B9EA" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g opacity="0.45" stroke="#45B9EA" stroke-width="2" stroke-linecap="round">
    <line x1="40" y1="20" x2="120" y2="-12"/><line x1="500" y1="165" x2="585" y2="120"/><line x1="70" y1="150" x2="150" y2="116"/>
  </g>
  <image x="${lx}" y="${ly}" width="${lw}" height="${lh}" href="data:image/svg+xml;base64,${logoB64}"/>
  <path d="${torn}" fill="#ffffff"/>
</svg>`;

await sharp(Buffer.from(band)).png().toFile('public/brand-references/rocketspin/email-header.png');
console.log('wrote rocketspin/email-header.png');
