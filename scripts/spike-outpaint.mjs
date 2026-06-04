import { writeFileSync } from 'fs';
import sharp from 'sharp';

const BASE = 'https://prompt-generator-virid-delta.vercel.app';

async function squareBase(ref, provider) {
  const pr = await fetch(`${BASE}/api/generate-prompt`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brand: 'Roosterbet', positive_prompt: ref, aspectRatio: '1:1',
      bannerDimensions: '1024 × 1024', theme: '', description: '', subjectPosition: 'Centered' }),
  });
  const prompt = (await pr.json()).prompt || ref;
  const r = await fetch(`${BASE}/api/generate-image`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, provider, aspectRatio: '1:1', bannerDimensions: '1024 × 1024',
      backend: 'cloud-run', resolution: '1K', brand: 'Roosterbet' }),
  });
  return (await r.json()).public_url;
}

const CASES = [
  { tag: 'gpt-dunk',    provider: 'chatgpt', ref: 'A basketball player leaping for a slam dunk, full body, dynamic, arena' },
  { tag: 'gem-keeper',  provider: 'gemini',  ref: 'A goalkeeper diving to catch a soccer ball, full body, stadium' },
  { tag: 'gem-rooster', provider: 'gemini',  ref: 'A golden rooster mascot in a tuxedo beside a roulette table in a luxury casino' },
  { tag: 'gpt-runner',  provider: 'chatgpt', ref: 'A sprinter exploding off the blocks on a track, full body, stadium' },
];

for (const c of CASES) {
  try {
    const sq = await squareBase(c.ref, c.provider);
    if (!sq) { console.log(`${c.tag}: square FAILED`); continue; }
    writeFileSync(`C:/tmp/spike-${c.tag}-square.png`, Buffer.from(await (await fetch(sq)).arrayBuffer()));
    const ex = await fetch(`${BASE}/api/spike-outpaint`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: sq, brand: 'Roosterbet' }),
    });
    const j = await ex.json();
    if (!j.dataUrl) { console.log(`${c.tag}: extend FAILED -> ${JSON.stringify(j).slice(0,200)}`); continue; }
    const wide = Buffer.from(j.dataUrl.split(',')[1], 'base64');
    writeFileSync(`C:/tmp/spike-${c.tag}-wide.png`, wide);
    const cropped = await sharp(wide).resize(1200, 600, { fit: 'cover', position: sharp.gravity.north }).png().toBuffer();
    writeFileSync(`C:/tmp/spike-${c.tag}-1200x600.png`, cropped);
    console.log(`${c.tag}: OK (${j.ms}ms, ${j.width}x${j.height})`);
  } catch (e) {
    console.log(`${c.tag}: ERROR ${String(e).slice(0,200)}`);
  }
}
console.log('SPIKE DONE');
