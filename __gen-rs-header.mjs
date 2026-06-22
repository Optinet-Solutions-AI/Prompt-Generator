import sharp from 'sharp';
import fs from 'node:fs';

const logoSrc = fs.readFileSync('public/brand-references/rocketspin/scraped/logo-long.svg', 'utf8');
const whiteLogo = logoSrc.replace(/#2D2D2D/gi, '#FFFFFF'); // white wordmark, keep cyan icon
const logoB64 = Buffer.from(whiteLogo, 'utf8').toString('base64');

const W = 600, H = 152, CY = '#45B9EA';

// Diagonal brush strokes (like the other brands' headers), varying width/opacity.
const xs  = [-80, -30, 30, 80, 140, 200, 260, 330, 400, 460, 520, 590];
const ops = [0.85, 0.4, 0.9, 0.5, 0.75, 0.35, 0.8, 0.5, 0.7, 0.4, 0.85, 0.55];
const ws  = [26, 12, 32, 16, 22, 10, 28, 14, 24, 12, 26, 18];
const strokes = xs.map((x, i) => `<rect x="${x}" y="-140" width="${ws[i]}" height="440" fill="${CY}" opacity="${ops[i]}"/>`).join('');

// Spatter dots for grit.
const dots = [[60,30,3,0.6],[180,110,2.4,0.45],[300,40,2.8,0.55],[440,120,2.2,0.4],[520,50,3,0.55],[120,90,1.8,0.4],[380,90,2,0.45],[560,100,1.8,0.4]]
  .map(([x,y,r,o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${CY}" opacity="${o}"/>`).join('');

// Torn-paper white bottom edge.
let torn = 'M0,152 ';
for (let x = 0, i = 0; x <= 600; x += 22, i++) torn += `L${x},${i % 2 === 0 ? 140 : 152} `;
torn += 'L600,152 Z';

const lw = 160, lh = Math.round(lw * 44 / 120);
const lx = Math.round((W - lw) / 2), ly = Math.round((H - 16 - lh) / 2);

const band = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="scrim" cx="0.5" cy="0.42" r="0.5">
      <stop offset="0" stop-color="#040B14" stop-opacity="0.85"/><stop offset="1" stop-color="#040B14" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#06121F"/>
  <g transform="rotate(-32 300 76)">${strokes}</g>
  ${dots}
  <rect width="${W}" height="${H}" fill="url(#scrim)"/>
  <image x="${lx}" y="${ly}" width="${lw}" height="${lh}" href="data:image/svg+xml;base64,${logoB64}"/>
  <path d="${torn}" fill="#ffffff"/>
</svg>`;

await sharp(Buffer.from(band)).png().toFile('public/brand-references/rocketspin/email-header.png');
console.log('wrote rocketspin/email-header.png');
