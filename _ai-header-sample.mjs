// v3 — generate a tightened banner + composite the actual FortunePlay
// logo on top (via Playwright) so the user can judge the final output.
// Local only, no repo/DB/deploy changes.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

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

const SUPABASE = 'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets';

// Just FortunePlay for this sample — the brand the user showed in the reference.
const BRAND = { name: 'FortunePlay', slug: 'fortuneplay', panelBg: '#0F0800', accent: '#FFD700' };

const prompt = [
  'A single wide horizontal banner strip graphic design, magazine-banner aesthetic.',
  'The banner fills the top 60% of the image frame; bottom 40% is solid pure white paper.',
  `BANNER BASE COLOR: solid flat matte ${BRAND.panelBg} covering the full banner rectangle edge-to-edge, from top edge down to the torn bottom.`,
  `LEFT SIDE of banner: dramatic diagonal painterly brush-stroke splashes in ${BRAND.accent} colour, sweeping in from the left edge like torn paint or ripped paper — roughly triangular region covering 15-20% of the banner width, with irregular organic brushed edges (not straight, not rectangular).`,
  `RIGHT SIDE of banner: matching diagonal brush-stroke splashes in ${BRAND.accent}, mirrored, same 15-20% width, same painterly irregular edges.`,
  'CENTER of banner (roughly 50-60% of the width): COMPLETELY CLEAN and EMPTY — only the solid dark base colour, no paint strokes, no decoration, no texture. This empty centre will have a logo placed on it later.',
  `BOTTOM EDGE of the banner: a single painterly ragged torn-paper rip running horizontally across the full width, revealing the white paper below. The rip is organic, hand-torn, irregular — one continuous torn edge, NOT multiple horizontal lines.`,
  'TOP EDGE: clean straight horizontal edge.',
  'IMPORTANT: do not introduce any horizontal tears, lines, or splits inside the banner itself — the banner is ONE continuous piece. Only the bottom edge is torn.',
  'Style: flat graphic design, textured matte paint, minimalist premium. NOT a painting, NOT abstract art, NOT circular, NOT a slide or presentation.',
  'No text, no typography, no logos, no people, no photography.',
].join(' ');

async function generateBg() {
  const bgPath = `${OUT}/ai3-fortuneplay-bg.png`;
  if (existsSync(bgPath) && process.argv.includes('--reuse')) {
    console.log('reusing existing bg', bgPath);
    return bgPath;
  }
  console.log('[v3] requesting FortunePlay banner background…');
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1536x1024', quality: 'high', n: 1 }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(data).slice(0,400)}`);
  const b64 = data.data?.[0]?.b64_json;
  const url = data.data?.[0]?.url;
  const buf = b64 ? Buffer.from(b64, 'base64') : Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(bgPath, buf);
  console.log(`  wrote ${bgPath} (${buf.length} bytes)`);
  return bgPath;
}

async function compositeLogo(bgPath) {
  // Render an HTML page with the AI banner as background + centered logo,
  // cropped to banner-strip proportions, then screenshot.
  const logoUrl = `${SUPABASE}/${BRAND.slug}/logo.svg`;
  const bgUrl = pathToFileURL(bgPath).href;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#fff;}</style></head>
<body>
  <div id="cap" style="width:1200px;height:360px;position:relative;overflow:hidden;background:#ffffff;">
    <!-- AI banner background, positioned to show the top 60% (banner area) at the banner's native position -->
    <img src="${bgUrl}" style="position:absolute;top:0;left:0;width:1200px;height:auto;" />
    <!-- Brand logo centered -->
    <img src="${logoUrl}" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-55%);height:120px;width:auto;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.4));" />
  </div>
</body></html>`;
  const htmlPath = `${OUT}/ai3-fortuneplay-composite.html`;
  writeFileSync(htmlPath, html, 'utf8');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 360 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(htmlPath).href);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500); // logo fetch
  const outPath = `${OUT}/ai3-fortuneplay-final.png`;
  const el = await page.$('#cap');
  await el.screenshot({ path: outPath });
  await browser.close();
  console.log(`  wrote ${outPath}`);
  return outPath;
}

const bg = await generateBg();
await compositeLogo(bg);
console.log('done');
