// Iteration 2 — tighter prompt that forces the Atlanta-Insiders banner
// shape (wide strip, colour rips on LEFT/RIGHT edges, torn bottom,
// clean centre for logo). Still local-only, no deploy.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'c:/tmp/header-samples';
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); if (i<0) return null;
      let v = l.slice(i+1).trim();
      if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v = v.slice(1,-1);
      return [l.slice(0,i).trim(), v]; }).filter(Boolean)
);
const API_KEY = env.OPENAI_API_KEY;
if (!API_KEY) throw new Error('OPENAI_API_KEY missing');

const BRANDS = [
  { name: 'FortunePlay', panelBg: '#0F0800', accent: '#FFD700' },
  { name: 'Roosterbet',  panelBg: '#140000', accent: '#FF3333' },
];

function prompt(b) {
  // Hard-wired structural language — describe the Atlanta Insiders banner
  // in mechanical terms so gpt-image-1 doesn't drift into abstract art.
  return [
    'A wide horizontal email header banner, shaped like a short rectangular strip (4 times wider than tall).',
    'The banner occupies only the TOP HALF of the image frame. The bottom half of the frame is pure solid white.',
    `BACKGROUND of the banner: solid matte ${b.panelBg} colour filling the entire banner rectangle edge-to-edge.`,
    `LEFT EDGE of the banner: a dramatic torn-paper rip shape in ${b.accent} colour, covering the leftmost 15-20% of the banner width, as if ${b.accent} coloured paper has been ripped off revealing the ${b.panelBg} beneath. Painterly, irregular, organic edges.`,
    `RIGHT EDGE of the banner: a matching dramatic torn-paper rip in ${b.accent} colour, mirrored on the right side, same 15-20% width, same painterly torn look.`,
    'CENTER of the banner: a completely clean empty rectangular area in the middle (about 60% of the width) with NO paint, NO strokes, NO decoration — only the solid dark background colour. This empty zone will have a logo placed on it later.',
    `BOTTOM EDGE of the banner: a painterly organic torn-paper rip running horizontally across the full width, with irregular ragged teeth, revealing pure white paper below.`,
    'TOP EDGE of the banner: a clean straight edge, flat, not torn.',
    'Style: flat graphic design, magazine-banner aesthetic, matte paint texture. NOT a painting, NOT abstract art, NOT a circular frame, NOT a slide.',
    'No text, no typography, no logos, no people, no photography.',
  ].join(' ');
}

async function generate(brand) {
  console.log(`[v2] requesting ${brand.name}…`);
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: prompt(brand), size: '1536x1024', quality: 'high', n: 1 }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(data).slice(0,400)}`);
  const b64 = data.data?.[0]?.b64_json;
  const url = data.data?.[0]?.url;
  const buf = b64 ? Buffer.from(b64, 'base64') : Buffer.from(await (await fetch(url)).arrayBuffer());
  const path = `${OUT}/ai2-${brand.name.toLowerCase()}.png`;
  writeFileSync(path, buf);
  console.log(`  wrote ${path} (${buf.length} bytes)`);
}

for (const b of BRANDS) {
  try { await generate(b); } catch (e) { console.error(`FAILED ${b.name}:`, e.message); }
}
