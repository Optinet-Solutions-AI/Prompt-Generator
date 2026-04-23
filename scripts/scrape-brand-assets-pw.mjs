#!/usr/bin/env node
/**
 * scrape-brand-assets-pw.mjs
 *
 * Playwright-based scraper that renders each brand's SPA,
 * waits for the DOM, then extracts the actual brand logos/images.
 *
 * Strategy per brand:
 *   1. Launch Chromium (headless), spoof a realistic desktop viewport + UA.
 *   2. Navigate, wait for `networkidle`.
 *   3. Read <link rel="icon">, <meta og:image>, and scan <img>/<svg>/background-image
 *      for elements that visually behave like a logo (inside header, top-left,
 *      `.logo` class, etc.). Rank by heuristic score.
 *   4. Download the top N candidates to public/brand-references/<slug>/scraped/.
 *   5. ALSO take a full-page screenshot and a header-only screenshot so we have
 *      a visual reference even if nothing scrapeable is found.
 *
 * Usage:
 *   node scripts/scrape-brand-assets-pw.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');
const OUT_ROOT   = path.join(ROOT, 'public', 'brand-references');

const BRANDS = [
  { name: 'Rollero',     slug: 'rollero',     url: 'https://www.rollero.com/'     },
  { name: 'Roosterbet',  slug: 'roosterbet',  url: 'https://www.rooster.bet/'     },
  { name: 'PlayMojo',    slug: 'playmojo',    url: 'https://www.playmojo.com/'    },
  { name: 'SpinsUp',     slug: 'spinsup',     url: 'https://www.spinsup.com/'     },
  { name: 'Lucky7even',  slug: 'lucky7even',  url: 'https://www.lucky7even.com/'  },
  { name: 'LuckyVibe',   slug: 'luckyvibe',   url: 'https://www.luckyvibe.com/'   },
  { name: 'SpinJo',      slug: 'spinjo',      url: 'https://www.spinjo.com/'      },
  { name: 'NovaDreams',  slug: 'novadreams',  url: 'https://www.novadreams.com/'  },
  { name: 'FortunePlay', slug: 'fortuneplay', url: 'https://www.fortuneplay.com/' },
];

function extOf(url, mime) {
  try {
    const u = new URL(url);
    const pathExt = path.extname(u.pathname).toLowerCase().replace('.', '');
    if (['png','jpg','jpeg','gif','webp','svg','ico','avif'].includes(pathExt)) return pathExt;
  } catch { /* ignore */ }
  if (!mime) return 'bin';
  if (mime.includes('svg'))  return 'svg';
  if (mime.includes('png'))  return 'png';
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('avif')) return 'avif';
  if (mime.includes('gif'))  return 'gif';
  if (mime.includes('icon')) return 'ico';
  return 'bin';
}

async function scrapeBrand(browser, brand) {
  const dir = path.join(OUT_ROOT, brand.slug, 'scraped');
  await fs.mkdir(dir, { recursive: true });

  const summary = {
    brand: brand.name, slug: brand.slug, url: brand.url,
    navStatus: null, navError: null,
    candidates: [], downloads: [],
    screenshots: {},
  };

  console.log(`\n── ${brand.name} — ${brand.url}`);

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
    // Pretend we came from a Google search — some casino sites gate direct hits
    extraHTTPHeaders: { 'Referer': 'https://www.google.com/' },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    const resp = await page.goto(brand.url, { waitUntil: 'networkidle', timeout: 45000 });
    summary.navStatus = resp ? resp.status() : null;
  } catch (err) {
    summary.navError = err?.message || String(err);
    console.log(`  ⚠ nav failed: ${summary.navError} — continuing with whatever DOM we have`);
  }

  // Give lazy-loaded assets a beat to arrive
  try { await page.waitForTimeout(2500); } catch { /* ignore */ }

  // ── Screenshots for visual reference ──
  try {
    const hero = path.join(dir, 'homepage-top.png');
    await page.screenshot({ path: hero, fullPage: false });
    summary.screenshots.homepageTop = path.relative(ROOT, hero);
    console.log(`  ✓ screenshot → ${summary.screenshots.homepageTop}`);
  } catch (err) {
    console.log(`  ✗ screenshot failed: ${err?.message || err}`);
  }

  // ── Collect candidates by evaluating inside the page ──
  let data = { icons: [], ogImages: [], images: [], svgs: [], backgrounds: [] };
  try {
    data = await page.evaluate(() => {
      const abs = (u) => { try { return new URL(u, location.href).toString(); } catch { return null; } };

      // Icons / apple-touch-icons
      const icons = [...document.querySelectorAll('link[rel]')]
        .filter(l => /icon/i.test(l.getAttribute('rel') || ''))
        .map(l => abs(l.getAttribute('href')))
        .filter(Boolean);

      // og:image / twitter:image
      const ogImages = [...document.querySelectorAll('meta[property], meta[name]')]
        .filter(m => /og:image|twitter:image/i.test(m.getAttribute('property') || m.getAttribute('name') || ''))
        .map(m => abs(m.getAttribute('content')))
        .filter(Boolean);

      // <img> + CSS-background scoring
      const scoreEl = (el) => {
        const r = el.getBoundingClientRect();
        const cls = (el.className + '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        const alt = (el.getAttribute?.('alt') || '').toLowerCase();
        const nameSignal =
          /logo|brand|wordmark/.test(cls) ||
          /logo|brand|wordmark/.test(id)  ||
          /logo|brand/.test(alt);
        // Header proximity: walk up 6 levels looking for <header> or role="banner" or navbar class
        let headerish = false;
        for (let p = el, i = 0; p && i < 8; p = p.parentElement, i++) {
          if (!p || !p.tagName) break;
          if (p.tagName === 'HEADER') { headerish = true; break; }
          if ((p.getAttribute('role') || '') === 'banner') { headerish = true; break; }
          const pc = (p.className + '').toLowerCase();
          if (/header|navbar|topbar|nav(-|_)?bar/.test(pc)) { headerish = true; break; }
        }
        const topOfPage = r.top >= -50 && r.top < 200;
        const reasonablySized = r.width >= 20 && r.height >= 20 && r.width < 800 && r.height < 400;
        let score = 0;
        if (nameSignal) score += 50;
        if (headerish)  score += 30;
        if (topOfPage)  score += 15;
        if (reasonablySized) score += 10;
        return { score, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, headerish, nameSignal, topOfPage };
      };

      const images = [];
      for (const img of document.querySelectorAll('img')) {
        const src = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src');
        if (!src) continue;
        const absSrc = abs(src); if (!absSrc) continue;
        const meta = scoreEl(img);
        if (meta.score < 15) continue;
        images.push({ url: absSrc, alt: img.getAttribute('alt') || '', ...meta });
      }

      const svgs = [];
      for (const svg of document.querySelectorAll('svg')) {
        const meta = scoreEl(svg);
        if (meta.score < 25) continue;
        // Inline SVGs — serialize them
        const clone = svg.cloneNode(true);
        if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const serialized = clone.outerHTML;
        svgs.push({ inline: true, svg: serialized, ...meta });
      }

      const backgrounds = [];
      for (const el of document.querySelectorAll('header, header *, [role="banner"], [role="banner"] *, .logo, .brand, .wordmark')) {
        const bg = getComputedStyle(el).backgroundImage;
        const m = /url\((['"]?)(.*?)\1\)/i.exec(bg);
        if (!m) continue;
        const absSrc = abs(m[2]); if (!absSrc) continue;
        const meta = scoreEl(el);
        if (meta.score < 15) continue;
        backgrounds.push({ url: absSrc, ...meta });
      }

      return { icons, ogImages, images, svgs, backgrounds };
    });
  } catch (err) {
    console.log(`  ✗ DOM evaluate failed: ${err?.message || err}`);
  }

  // Rank & de-dup
  const dedupeByUrl = (arr) => {
    const seen = new Set(); const out = [];
    for (const x of arr) {
      const k = x.url || x.svg;
      if (!k || seen.has(k)) continue;
      seen.add(k); out.push(x);
    }
    return out;
  };
  const images = dedupeByUrl(data.images).sort((a,b) => b.score - a.score).slice(0, 6);
  const svgs = data.svgs.slice(0, 3);
  const backgrounds = dedupeByUrl(data.backgrounds).sort((a,b) => b.score - a.score).slice(0, 3);
  const icons = [...new Set(data.icons)].slice(0, 3);
  const ogImages = [...new Set(data.ogImages)].slice(0, 2);

  summary.candidates = { icons, ogImages, images, svgs: svgs.map(s => ({ score: s.score, rect: s.rect })), backgrounds };

  console.log(`  candidates: ${icons.length} icons, ${ogImages.length} og, ${images.length} img, ${svgs.length} svg, ${backgrounds.length} bg`);

  // ── Downloads ──
  async function dl(url, name) {
    try {
      const r = await context.request.get(url, { timeout: 20000 });
      if (!r.ok()) throw new Error(`HTTP ${r.status()}`);
      const buf = await r.body();
      if (buf.length < 50) throw new Error('too small');
      const mime = r.headers()['content-type'] || '';
      const ext = extOf(url, mime);
      const file = path.join(dir, `${name}.${ext}`);
      await fs.writeFile(file, buf);
      return { ok: true, name: `${name}.${ext}`, bytes: buf.length, url, mime };
    } catch (err) {
      return { ok: false, name, url, error: err?.message || String(err) };
    }
  }

  const plan = [
    ...icons.map((u, i) => ({ url: u, name: `icon-${i + 1}` })),
    ...ogImages.map((u, i) => ({ url: u, name: `og-${i + 1}` })),
    ...images.map((img, i) => ({ url: img.url, name: `logo-${i + 1}` })),
    ...backgrounds.map((b, i) => ({ url: b.url, name: `bg-${i + 1}` })),
  ];

  for (const item of plan) {
    const result = await dl(item.url, item.name);
    summary.downloads.push(result);
    if (result.ok) {
      console.log(`  ✓ ${result.name} (${result.bytes} B) ← ${item.url}`);
    } else {
      console.log(`  ✗ ${item.name} failed (${result.error})`);
    }
  }

  // Save inline SVGs
  for (let i = 0; i < svgs.length; i++) {
    const file = path.join(dir, `logo-inline-${i + 1}.svg`);
    try {
      await fs.writeFile(file, svgs[i].svg, 'utf8');
      const bytes = Buffer.byteLength(svgs[i].svg, 'utf8');
      summary.downloads.push({ ok: true, name: `logo-inline-${i + 1}.svg`, bytes, inline: true });
      console.log(`  ✓ logo-inline-${i + 1}.svg (${bytes} B, inline)`);
    } catch (err) {
      console.log(`  ✗ inline svg ${i + 1} failed: ${err?.message || err}`);
    }
  }

  await context.close();
  return summary;
}

async function main() {
  await fs.mkdir(OUT_ROOT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
  });

  const report = [];
  try {
    for (const brand of BRANDS) {
      try {
        const r = await scrapeBrand(browser, brand);
        report.push(r);
      } catch (err) {
        console.log(`  fatal on ${brand.name}: ${err?.message || err}`);
        report.push({ brand: brand.name, slug: brand.slug, url: brand.url, fatal: err?.message || String(err) });
      }
    }
  } finally {
    await browser.close();
  }

  await fs.writeFile(path.join(OUT_ROOT, '_scrape-report-pw.json'), JSON.stringify(report, null, 2));
  console.log('\n── Summary ──');
  for (const r of report) {
    const dl = r.downloads || [];
    const ok = dl.filter(d => d.ok).length;
    const fail = dl.filter(d => !d.ok).length;
    const stat = r.navError ? `nav err` : `HTTP ${r.navStatus ?? '?'}`;
    console.log(`  ${r.brand.padEnd(14)} ${ok} ok, ${fail} failed  [${stat}]`);
  }
  console.log(`\nReport: ${path.relative(ROOT, path.join(OUT_ROOT, '_scrape-report-pw.json'))}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
