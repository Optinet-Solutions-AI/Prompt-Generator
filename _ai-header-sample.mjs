// Local-only sample script — generates AI header banners for 2 brands so
// we can judge gpt-image-1 output quality before committing to all 9.
// Reads OPENAI_API_KEY from .env.local. Nothing is pushed / deployed.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'c:/tmp/header-samples';
mkdirSync(OUT, { recursive: true });

// Parse .env.local the simple way (no dotenv dep).
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=');
      if (idx < 0) return null;
      const key = l.slice(0, idx).trim();
      let val = l.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return [key, val];
    })
    .filter(Boolean)
);

const API_KEY = env.OPENAI_API_KEY;
if (!API_KEY) throw new Error('OPENAI_API_KEY missing from .env.local');

// Test with 2 brands of different palettes.
const BRANDS = [
  { name: 'FortunePlay', panelBg: '#0F0800', accent: '#FFD700', vibe: 'premium gold and black luxury' },
  { name: 'Roosterbet',  panelBg: '#140000', accent: '#FF3333', vibe: 'aggressive red and black combat' },
];

function prompt(b) {
  return [
    `Horizontal email header banner graphic, wide aspect ratio.`,
    `Deep ${b.panelBg} base colour covering most of the frame.`,
    `Bold ${b.accent} painterly brush-stroke splashes across the top and sides of the banner,`,
    `layered over the dark base like ripped paint or torn paper.`,
    `The bottom edge of the banner is an organic, painterly, uneven torn-paper rip,`,
    `not a straight line — rough, hand-drawn, with irregular tears and exposed white paper below.`,
    `Clean empty centred area reserved for a logo to be composited on top later.`,
    `Textured matte finish, ${b.vibe} feel, minimalist premium design.`,
    `No text, no typography, no photography, no people, no characters — purely decorative graphic design.`,
    `Background outside the banner is pure white.`,
  ].join(' ');
}

async function generate(brand) {
  const body = {
    model: 'gpt-image-1',
    prompt: prompt(brand),
    size: '1536x1024',
    quality: 'high',
    n: 1,
  };
  console.log(`requesting ${brand.name}…`);
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`OpenAI error ${r.status}: ${JSON.stringify(data).slice(0, 400)}`);
  const b64 = data.data?.[0]?.b64_json;
  const url = data.data?.[0]?.url;
  let buf;
  if (b64) {
    buf = Buffer.from(b64, 'base64');
  } else if (url) {
    const imgRes = await fetch(url);
    buf = Buffer.from(await imgRes.arrayBuffer());
  } else {
    throw new Error(`No image in response: ${JSON.stringify(data).slice(0, 400)}`);
  }
  const path = `${OUT}/ai-${brand.name.toLowerCase()}.png`;
  writeFileSync(path, buf);
  console.log(`  wrote ${path} (${buf.length} bytes)`);
}

for (const b of BRANDS) {
  try {
    await generate(b);
  } catch (e) {
    console.error(`FAILED ${b.name}:`, e.message);
  }
}
console.log('done');
