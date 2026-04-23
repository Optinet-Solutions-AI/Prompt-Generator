#!/usr/bin/env node
/**
 * scrape-brand-assets.mjs
 *
 * One-shot scraper: given a list of brand websites, extract
 * favicons, apple-touch-icons, og:images, and header logos,
 * and dump them into public/brand-references/<brand>/scraped/
 * for manual review.
 *
 * Usage:
 *   node scripts/scrape-brand-assets.mjs
 *
 * Outputs a JSON summary at public/brand-references/_scrape-report.json.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');
const OUT_ROOT   = path.join(ROOT, 'public', 'brand-references');

// Brand → website map (folder name matches the lowercase brand identifier)
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

// Browser-like headers — some casino sites block default Node UA
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

const IMAGE_HEADERS = {
  ...BROWSER_HEADERS,
  'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Sec-Fetch-Dest': 'image',
};

// ── Helpers ─────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(id);
  }
}

function absolutize(maybeRelative, baseUrl) {
  try { return new URL(maybeRelative, baseUrl).toString(); }
  catch { return null; }
}

function extOf(url, fallbackMime) {
  try {
    const u = new URL(url);
    const pathExt = path.extname(u.pathname).toLowerCase().replace('.', '');
    if (['png','jpg','jpeg','gif','webp','svg','ico'].includes(pathExt)) return pathExt;
  } catch { /* ignore */ }
  if (!fallbackMime) return 'bin';
  if (fallbackMime.includes('svg'))  return 'svg';
  if (fallbackMime.includes('png'))  return 'png';
  if (fallbackMime.includes('jpeg')) return 'jpg';
  if (fallbackMime.includes('webp')) return 'webp';
  if (fallbackMime.includes('gif'))  return 'gif';
  if (fallbackMime.includes('icon')) return 'ico';
  return 'bin';
}

/**
 * Extract candidate asset URLs from HTML. Returns an object with arrays:
 *   icons:    <link rel="icon"|"apple-touch-icon"|...> hrefs
 *   ogImages: <meta property="og:image"> contents
 *   logos:    <img> candidates likely to be the logo (inside header/.logo/etc.)
 *   heros:    <img> candidates likely to be a hero/banner (prominent or .hero)
 */
function extractCandidates(html, baseUrl) {
  const icons    = new Set();
  const ogImages = new Set();
  const logos    = new Set();
  const heros    = new Set();

  // ── <link rel="icon|apple-touch-icon|shortcut icon|mask-icon"> ──
  const linkRe = /<link\b[^>]*\brel=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const rel = m[1].toLowerCase();
    if (!/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed|mask-icon|shortcut icon)(\s|$)/.test(rel)) continue;
    const hrefMatch = m[0].match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const abs = absolutize(hrefMatch[1], baseUrl);
    if (abs) icons.add(abs);
  }

  // ── <meta property="og:image"|"twitter:image"> ──
  const metaRe = /<meta\b[^>]*\b(?:property|name)=["']([^"']+)["'][^>]*\bcontent=["']([^"']+)["'][^>]*>/gi;
  while ((m = metaRe.exec(html)) !== null) {
    const prop = m[1].toLowerCase();
    if (prop === 'og:image' || prop === 'og:image:secure_url' || prop === 'twitter:image') {
      const abs = absolutize(m[2], baseUrl);
      if (abs) ogImages.add(abs);
    }
  }
  // Same attribute order flipped (content first, then property)
  const metaRe2 = /<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*\b(?:property|name)=["']([^"']+)["'][^>]*>/gi;
  while ((m = metaRe2.exec(html)) !== null) {
    const prop = m[2].toLowerCase();
    if (prop === 'og:image' || prop === 'og:image:secure_url' || prop === 'twitter:image') {
      const abs = absolutize(m[1], baseUrl);
      if (abs) ogImages.add(abs);
    }
  }

  // ── <img> candidates — logos and heros ──
  // Find img tags and inspect their alt / class / src for heuristic signals.
  const imgRe = /<img\b([^>]+)>/gi;
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1];
    const srcMatch =
      attrs.match(/\bsrc=["']([^"']+)["']/i) ||
      attrs.match(/\bdata-src=["']([^"']+)["']/i) ||
      attrs.match(/\bsrcset=["']([^"']+)["']/i);
    if (!srcMatch) continue;
    // srcset picks the first URL before any descriptor
    const raw = srcMatch[1].split(',')[0].trim().split(/\s+/)[0];
    const abs = absolutize(raw, baseUrl);
    if (!abs) continue;

    const alt   = (attrs.match(/\balt=["']([^"']+)["']/i)   || [,''])[1].toLowerCase();
    const cls   = (attrs.match(/\bclass=["']([^"']+)["']/i) || [,''])[1].toLowerCase();
    const id    = (attrs.match(/\bid=["']([^"']+)["']/i)    || [,''])[1].toLowerCase();

    const looksLikeLogo =
      /logo|brand|wordmark/.test(cls) || /logo|brand|wordmark/.test(id) ||
      /logo/.test(alt) || /\/logo|logo\.(png|svg|webp)/i.test(abs);

    const looksLikeHero =
      /hero|banner|jumbotron|cover|bg-/.test(cls) || /hero|banner/.test(id) ||
      /\/hero|\/banner|\/cover|hero\.(png|jpg|jpeg|webp|avif)/i.test(abs);

    if (looksLikeLogo) logos.add(abs);
    if (looksLikeHero) heros.add(abs);
  }

  // Fallback: if we found no logo candidates, include ALL <img> in <header>…</header>
  if (logos.size === 0) {
    const headerRe = /<header\b[^>]*>([\s\S]*?)<\/header>/i;
    const headerMatch = html.match(headerRe);
    if (headerMatch) {
      const headerImgs = [...headerMatch[1].matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)];
      for (const hm of headerImgs) {
        const abs = absolutize(hm[1], baseUrl);
        if (abs) logos.add(abs);
      }
    }
  }

  // Always add the classic /favicon.ico guess if no icons found
  if (icons.size === 0) {
    const abs = absolutize('/favicon.ico', baseUrl);
    if (abs) icons.add(abs);
  }

  return {
    icons:    [...icons],
    ogImages: [...ogImages],
    logos:    [...logos],
    heros:    [...heros],
  };
}

async function downloadAsset(url, destPath) {
  const res = await fetchWithTimeout(url, { headers: IMAGE_HEADERS }, 20000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 50) throw new Error('Asset too small (likely a 1x1 tracking pixel or empty)');
  const mime = res.headers.get('content-type') || '';
  const ext  = extOf(url, mime);
  const finalPath = destPath.endsWith(`.${ext}`) ? destPath : `${destPath}.${ext}`;
  await fs.writeFile(finalPath, buf);
  return { path: finalPath, bytes: buf.length, mime, url };
}

async function safeDownload(url, destWithoutExt) {
  try {
    const result = await downloadAsset(url, destWithoutExt);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, url, error: err?.message || String(err) };
  }
}

// ── Main ───────────────────────────────────────────────────────────

async function scrapeBrand(brand) {
  const dir = path.join(OUT_ROOT, brand.slug, 'scraped');
  await fs.mkdir(dir, { recursive: true });

  const summary = {
    brand:       brand.name,
    slug:        brand.slug,
    url:         brand.url,
    htmlStatus:  null,
    htmlBlocked: false,
    candidates:  null,
    downloads:   [],
    error:       null,
  };

  console.log(`\n── ${brand.name} — ${brand.url}`);

  let html = '';
  try {
    const htmlRes = await fetchWithTimeout(brand.url, { headers: BROWSER_HEADERS }, 25000);
    summary.htmlStatus = htmlRes.status;
    if (!htmlRes.ok) {
      summary.htmlBlocked = true;
      summary.error = `HTML fetch returned ${htmlRes.status}`;
      console.log(`  ⚠ HTML ${htmlRes.status} — still attempting /favicon.ico`);
    } else {
      html = await htmlRes.text();
    }
  } catch (err) {
    summary.htmlBlocked = true;
    summary.error = err?.message || String(err);
    console.log(`  ⚠ HTML fetch failed: ${summary.error} — still attempting /favicon.ico`);
  }

  // Even on HTML failure, try the classic favicon guess
  const candidates = html
    ? extractCandidates(html, brand.url)
    : { icons: [absolutize('/favicon.ico', brand.url), absolutize('/apple-touch-icon.png', brand.url)].filter(Boolean), ogImages: [], logos: [], heros: [] };
  summary.candidates = candidates;

  const plan = [
    ...candidates.icons.slice(0, 3).map((u, i) => ({ url: u, name: `icon-${i + 1}` })),
    ...candidates.ogImages.slice(0, 2).map((u, i) => ({ url: u, name: `og-image-${i + 1}` })),
    ...candidates.logos.slice(0, 4).map((u, i) => ({ url: u, name: `logo-${i + 1}` })),
    ...candidates.heros.slice(0, 3).map((u, i) => ({ url: u, name: `hero-${i + 1}` })),
  ];
  console.log(`  candidates: ${candidates.icons.length} icons, ${candidates.ogImages.length} og:image, ${candidates.logos.length} logos, ${candidates.heros.length} heros → downloading top ${plan.length}`);

  for (const item of plan) {
    const dest = path.join(dir, item.name);
    const result = await safeDownload(item.url, dest);
    summary.downloads.push(result);
    if (result.ok) {
      console.log(`  ✓ ${item.name}.${extOf(item.url, result.mime)} (${result.bytes} B) ← ${item.url}`);
    } else {
      console.log(`  ✗ ${item.name} failed (${result.error}) ← ${item.url}`);
    }
  }

  return summary;
}

async function main() {
  await fs.mkdir(OUT_ROOT, { recursive: true });
  const report = [];
  for (const brand of BRANDS) {
    const r = await scrapeBrand(brand);
    report.push(r);
  }
  await fs.writeFile(
    path.join(OUT_ROOT, '_scrape-report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log('\n── Summary ──');
  for (const r of report) {
    const ok = r.downloads.filter(d => d.ok).length;
    const fail = r.downloads.filter(d => !d.ok).length;
    const blocked = r.htmlBlocked ? ' [HTML blocked]' : '';
    console.log(`  ${r.brand.padEnd(14)} ${ok} ok, ${fail} failed${blocked}`);
  }
  console.log(`\nReport: ${path.relative(ROOT, path.join(OUT_ROOT, '_scrape-report.json'))}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
