#!/usr/bin/env node
/**
 * upload-brand-headers.mjs
 *
 * Uploads the per-brand composite header PNG + processed wordmark PNG to
 * Supabase Storage (bucket `brand-assets`), then prints a SQL UPSERT that
 * populates `brand_email_config.header_url`, `wordmark_url`,
 * `wordmark_dark_bg` for each brand.
 *
 * Prerequisites:
 *   - `npx tsx scripts/recolor-brand-headers.mjs` has run (produces
 *     public/brand-references/<slug>/email-header-bg.png per brand).
 *   - `npx tsx scripts/composite-brand-headers.mjs` has run (produces
 *     public/brand-references/<slug>/email-header.png per brand).
 *   - Migration 002_brand_email_header.sql applied in Supabase.
 *
 * Env (from .env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npx tsx scripts/upload-brand-headers.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');
const BUCKET     = 'brand-assets';

async function loadEnvLocal() {
  try {
    const raw = await fs.readFile(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let [, key, val] = m;
      if (val.startsWith('"') || val.startsWith("'")) val = val.slice(1);
      if (val.endsWith('"')   || val.endsWith("'"))   val = val.slice(0, -1);
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch { /* no .env.local — rely on ambient env */ }
}

// Mirror of the WORDMARK_FILES config in email-samples.mjs so the uploaded
// wordmark PNGs match what the preview generator produces.
const BRANDS = [
  { slug: 'fortuneplay', display: 'FortunePlay', wordmarkSrc: 'scraped/logo-1.svg',    darkBg: false, invertWhite: true  },
  { slug: 'roosterbet',  display: 'Roosterbet',  wordmarkSrc: 'scraped/logo-1.svg',    darkBg: false, invertWhite: false },
  { slug: 'spinjo',      display: 'SpinJo',      wordmarkSrc: 'scraped/logo-1.svg',    darkBg: false, invertWhite: false },
  { slug: 'luckyvibe',   display: 'LuckyVibe',   wordmarkSrc: 'scraped/logo-1.svg',    darkBg: false, invertWhite: false },
  { slug: 'spinsup',     display: 'SpinsUp',     wordmarkSrc: 'scraped/logo-1.svg',    darkBg: true,  invertWhite: false },
  { slug: 'playmojo',    display: 'PlayMojo',    wordmarkSrc: 'scraped/logo-1.svg',    darkBg: false, invertWhite: false },
  { slug: 'lucky7even',  display: 'Lucky7even',  wordmarkSrc: 'scraped/logo-1.svg',    darkBg: false, invertWhite: false },
  { slug: 'novadreams',  display: 'NovaDreams',  wordmarkSrc: 'scraped/logo-long.svg', darkBg: true,  invertWhite: false },
  { slug: 'rollero',     display: 'Rollero',     wordmarkSrc: 'scraped/logo-long.svg', darkBg: true,  invertWhite: false },
];

async function ensureBucket(supabase) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);
  if (!buckets.some(b => b.name === BUCKET)) {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (createErr) throw new Error(`createBucket failed: ${createErr.message}`);
    console.log(`  created bucket "${BUCKET}" (public)`);
  }
}

// Render + process the wordmark exactly like email-samples.mjs does so the
// uploaded PNG matches the local preview byte-for-byte.
async function buildWordmarkPng(brand) {
  const srcPath = path.join(ROOT, 'public', 'brand-references', brand.slug, brand.wordmarkSrc);
  try { await fs.access(srcPath); } catch {
    return { ok: false, error: `wordmark source missing: ${srcPath}` };
  }
  try {
    // Render at high density, trim transparent padding, resize to fit.
    const rendered = await sharp(srcPath, { density: 256 }).png().toBuffer();
    let trimmed;
    try { trimmed = await sharp(rendered).trim().toBuffer(); }
    catch { trimmed = rendered; }
    const raw = await sharp(trimmed)
      .resize(600, 140, { fit: 'inside', withoutEnlargement: false })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data, info } = raw;
    if (brand.invertWhite) {
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a > 40 && r > 235 && g > 235 && b > 235) {
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
        }
      }
    }
    const buf = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    }).png().toBuffer();
    return { ok: true, buf };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function uploadBuffer(supabase, remotePath, buf, contentType) {
  const { error } = await supabase
    .storage.from(BUCKET)
    .upload(remotePath, buf, { upsert: true, contentType, cacheControl: '3600' });
  if (error) return { ok: false, error: error.message };
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(remotePath);
  return { ok: true, url: data.publicUrl };
}

async function main() {
  await loadEnvLocal();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.');
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('── Ensuring storage bucket ──');
  await ensureBucket(supabase);

  const summary = [];
  for (const brand of BRANDS) {
    console.log(`\n── ${brand.display} (${brand.slug}) ──`);

    // 1. Composite header PNG
    const headerLocal = path.join(ROOT, 'public', 'brand-references', brand.slug, 'email-header.png');
    let headerUrl = null;
    try {
      const buf = await fs.readFile(headerLocal);
      const r = await uploadBuffer(supabase, `${brand.slug}/email-header.png`, buf, 'image/png');
      if (r.ok) { headerUrl = r.url; console.log(`  ✓ header   ${buf.length} B → ${r.url}`); }
      else      console.log(`  ✗ header upload failed: ${r.error}`);
    } catch (e) {
      console.log(`  ✗ header local missing: ${e.message}`);
    }

    // 2. Processed wordmark PNG
    let wordmarkUrl = null;
    const wm = await buildWordmarkPng(brand);
    if (wm.ok) {
      const r = await uploadBuffer(supabase, `${brand.slug}/wordmark.png`, wm.buf, 'image/png');
      if (r.ok) { wordmarkUrl = r.url; console.log(`  ✓ wordmark ${wm.buf.length} B → ${r.url}`); }
      else      console.log(`  ✗ wordmark upload failed: ${r.error}`);
    } else {
      console.log(`  ✗ wordmark build failed: ${wm.error}`);
    }

    summary.push({
      brand_name:       brand.display,
      header_url:       headerUrl,
      wordmark_url:     wordmarkUrl,
      wordmark_dark_bg: brand.darkBg,
    });
  }

  // Emit SQL UPSERT for the new columns
  console.log('\n── SQL snippet (paste into Supabase SQL editor) ──\n');
  const values = summary.map(s => {
    const esc = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
    return `  (${esc(s.brand_name)}, ${esc(s.header_url)}, ${esc(s.wordmark_url)}, ${s.wordmark_dark_bg})`;
  }).join(',\n');
  console.log(
    `INSERT INTO brand_email_config (brand_name, header_url, wordmark_url, wordmark_dark_bg) VALUES\n` +
    `${values}\n` +
    `ON CONFLICT (brand_name) DO UPDATE SET\n` +
    `  header_url       = EXCLUDED.header_url,\n` +
    `  wordmark_url     = EXCLUDED.wordmark_url,\n` +
    `  wordmark_dark_bg = EXCLUDED.wordmark_dark_bg,\n` +
    `  updated_at       = NOW();`
  );

  const reportPath = path.join(ROOT, 'public', 'brand-references', '_header-upload-report.json');
  await fs.writeFile(reportPath, JSON.stringify(summary, null, 2));
  console.log(`\nReport: ${path.relative(ROOT, reportPath)}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
