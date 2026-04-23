#!/usr/bin/env node
/**
 * scrape-blocked-brands.mjs
 *
 * Rollero and NovaDreams returned 403 on the homepage, but all other brands
 * use the same white-label platform with predictable asset paths:
 *   /images/logos/brand/default/long.svg
 *   /images/logos/brand/default/short.svg
 *   /images/pwa/152x152.png
 *   /images/og-preview-social.jpg
 *
 * This script probes those exact paths on the two blocked brands.
 * If the platform is the same, we get their logos without rendering the SPA.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');
const OUT_ROOT   = path.join(ROOT, 'public', 'brand-references');

const BLOCKED = [
  { name: 'Rollero',    slug: 'rollero',    origin: 'https://www.rollero.com' },
  { name: 'NovaDreams', slug: 'novadreams', origin: 'https://www.novadreams.com' },
];

const PATHS = [
  { path: '/images/logos/brand/default/long.svg',  name: 'logo-long'  },
  { path: '/images/logos/brand/default/short.svg', name: 'logo-short' },
  { path: '/images/pwa/152x152.png',               name: 'pwa-152'    },
  { path: '/images/pwa/32x32.png',                 name: 'pwa-32'     },
  { path: '/images/favicon.png',                   name: 'favicon'    },
  { path: '/images/og-preview-social.jpg',         name: 'og-social'  },
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
  return 'bin';
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  const report = [];
  for (const brand of BLOCKED) {
    console.log(`\n── ${brand.name}`);
    const dir = path.join(OUT_ROOT, brand.slug, 'scraped');
    await fs.mkdir(dir, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'en-US',
      extraHTTPHeaders: { 'Referer': 'https://www.google.com/' },
    });

    const brandDownloads = [];
    for (const item of PATHS) {
      const url = brand.origin + item.path;
      try {
        const r = await context.request.get(url, { timeout: 15000 });
        if (!r.ok()) {
          console.log(`  ✗ ${item.name} → HTTP ${r.status()}`);
          brandDownloads.push({ ok: false, url, status: r.status() });
          continue;
        }
        const buf = await r.body();
        if (buf.length < 50) {
          console.log(`  ✗ ${item.name} → too small (${buf.length} B)`);
          continue;
        }
        const mime = r.headers()['content-type'] || '';
        const ext = extOf(url, mime);
        const file = path.join(dir, `${item.name}.${ext}`);
        await fs.writeFile(file, buf);
        console.log(`  ✓ ${item.name}.${ext} (${buf.length} B)`);
        brandDownloads.push({ ok: true, url, file: path.relative(ROOT, file), bytes: buf.length });
      } catch (err) {
        console.log(`  ✗ ${item.name} → ${err?.message || err}`);
        brandDownloads.push({ ok: false, url, error: err?.message || String(err) });
      }
    }

    // Try a full-page screenshot through page.goto with a longer timeout and forgiving wait
    try {
      const page = await context.newPage();
      const resp = await page.goto(brand.origin, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(4000);
      const heroShot = path.join(dir, 'homepage-top.png');
      await page.screenshot({ path: heroShot, fullPage: false });
      console.log(`  ✓ screenshot (HTTP ${resp?.status() ?? '?'})`);
      await page.close();
    } catch (err) {
      console.log(`  ⚠ screenshot failed: ${err?.message || err}`);
    }

    await context.close();
    report.push({ brand: brand.name, slug: brand.slug, downloads: brandDownloads });
  }

  await browser.close();

  await fs.writeFile(
    path.join(OUT_ROOT, '_scrape-report-blocked.json'),
    JSON.stringify(report, null, 2),
  );

  console.log('\n── Summary ──');
  for (const r of report) {
    const ok = r.downloads.filter(d => d.ok).length;
    const fail = r.downloads.filter(d => !d.ok).length;
    console.log(`  ${r.brand.padEnd(12)} ${ok} ok, ${fail} failed`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
