#!/usr/bin/env node
/**
 * upload-brand-assets.mjs
 *
 * Uploads per-brand logo + hero banner to Supabase Storage so they
 * can be referenced from the email templates in production (where
 * `public/brand-references/*` is not available — scraped assets are
 * git-ignored).
 *
 * - Creates the `brand-assets` bucket (public read) if missing.
 * - Uploads <slug>/logo.<ext> and <slug>/banner.<ext> per brand using
 *   `scripts/brand-asset-picks.json` as the source-of-truth picks.
 * - Prints the public URLs for each brand — paste into the
 *   `brand_email_config` seed SQL.
 *
 * Env (read from .env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/upload-brand-assets.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');
const BUCKET     = 'brand-assets';

// ── Load .env.local ─────────────────────────────────────────────────
async function loadEnvLocal() {
  try {
    const raw = await fs.readFile(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let [, key, val] = m;
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch { /* no .env.local — rely on ambient env */ }
}

// ── Asset picks (edit to re-select later) ───────────────────────────
const PICKS = [
  // Rails white-label brands — same shape across all 7
  { slug: 'fortuneplay', logo: 'scraped/logo-2.svg',     banner: 'scraped/logo-4.webp' },
  { slug: 'luckyvibe',   logo: 'scraped/logo-2.svg',     banner: 'scraped/logo-4.webp' },
  { slug: 'lucky7even',  logo: 'scraped/logo-2.svg',     banner: 'scraped/logo-4.webp' },
  { slug: 'playmojo',    logo: 'scraped/logo-2.svg',     banner: 'scraped/logo-4.webp' },
  { slug: 'roosterbet',  logo: 'scraped/logo-2.svg',     banner: 'scraped/logo-4.webp' },
  { slug: 'spinjo',      logo: 'scraped/logo-2.svg',     banner: 'scraped/logo-4.webp' },
  { slug: 'spinsup',     logo: 'scraped/logo-2.svg',     banner: 'scraped/logo-4.jpg'  },
  // VPN re-scrapes — different naming
  { slug: 'novadreams',  logo: 'scraped/logo-short.svg', banner: 'scraped/banner-1.jpg' },
  { slug: 'rollero',     logo: 'scraped/logo-short.svg', banner: 'scraped/banner-1.webp' },
];

const BRAND_DISPLAY = {
  fortuneplay: 'FortunePlay',
  luckyvibe:   'LuckyVibe',
  lucky7even:  'Lucky7even',
  playmojo:    'PlayMojo',
  roosterbet:  'Roosterbet',
  spinjo:      'SpinJo',
  spinsup:     'SpinsUp',
  novadreams:  'NovaDreams',
  rollero:     'Rollero',
};

const BRAND_WEBSITES = {
  fortuneplay: 'https://www.fortuneplay.com/',
  luckyvibe:   'https://www.luckyvibe.com/',
  lucky7even:  'https://www.lucky7even.com/',
  playmojo:    'https://www.playmojo.com/',
  roosterbet:  'https://www.rooster.bet/',
  spinjo:      'https://www.spinjo.com/',
  spinsup:     'https://www.spinsup.com/',
  novadreams:  'https://www.novadreams.com/',
  rollero:     'https://www.rollero.com/',
};

// ── Helpers ─────────────────────────────────────────────────────────
function contentTypeFor(ext) {
  switch (ext.toLowerCase()) {
    case 'svg':  return 'image/svg+xml';
    case 'png':  return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'avif': return 'image/avif';
    case 'gif':  return 'image/gif';
    default:     return 'application/octet-stream';
  }
}

async function ensureBucket(supabase) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);
  if (buckets.some(b => b.name === BUCKET)) {
    console.log(`  bucket "${BUCKET}" already exists`);
    return;
  }
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (createErr) throw new Error(`createBucket failed: ${createErr.message}`);
  console.log(`  created bucket "${BUCKET}" (public)`);
}

async function uploadOne(supabase, slug, localRel, remoteName) {
  const localPath = path.join(ROOT, 'public', 'brand-references', slug, localRel);
  let buf;
  try {
    buf = await fs.readFile(localPath);
  } catch (err) {
    return { ok: false, error: `local file missing: ${path.relative(ROOT, localPath)}` };
  }
  const ext = path.extname(localRel).slice(1);
  const contentType = contentTypeFor(ext);
  const remotePath = `${slug}/${remoteName}.${ext}`;

  const { error } = await supabase
    .storage.from(BUCKET)
    .upload(remotePath, buf, { upsert: true, contentType, cacheControl: '3600' });
  if (error) return { ok: false, error: error.message, remotePath };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(remotePath);
  return { ok: true, url: data.publicUrl, bytes: buf.length, remotePath };
}

// ── Main ───────────────────────────────────────────────────────────
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
  for (const pick of PICKS) {
    console.log(`\n── ${BRAND_DISPLAY[pick.slug] || pick.slug} (${pick.slug}) ──`);
    const logo   = await uploadOne(supabase, pick.slug, pick.logo,   'logo');
    const banner = await uploadOne(supabase, pick.slug, pick.banner, 'banner');
    if (logo.ok)   console.log(`  ✓ logo   (${logo.bytes} B) → ${logo.url}`);
    else           console.log(`  ✗ logo   failed: ${logo.error}`);
    if (banner.ok) console.log(`  ✓ banner (${banner.bytes} B) → ${banner.url}`);
    else           console.log(`  ✗ banner failed: ${banner.error}`);

    summary.push({
      slug: pick.slug,
      brand_name: BRAND_DISPLAY[pick.slug] || pick.slug,
      website_url: BRAND_WEBSITES[pick.slug] || null,
      logo_url:   logo.ok   ? logo.url   : null,
      banner_url: banner.ok ? banner.url : null,
    });
  }

  // Emit a SQL snippet the user can paste into the Supabase SQL editor
  console.log('\n── SQL snippet for brand_email_config ──\n');
  const values = summary.map(s => {
    const esc = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
    return `  (${esc(s.brand_name)}, ${esc(s.logo_url)}, ${esc(s.banner_url)}, ${esc(s.website_url)})`;
  }).join(',\n');

  console.log(`INSERT INTO brand_email_config (brand_name, logo_url, banner_url, website_url) VALUES\n${values}\nON CONFLICT (brand_name) DO UPDATE SET\n  logo_url    = EXCLUDED.logo_url,\n  banner_url  = EXCLUDED.banner_url,\n  website_url = EXCLUDED.website_url,\n  updated_at  = NOW();`);

  const reportPath = path.join(ROOT, 'public', 'brand-references', '_upload-report.json');
  await fs.writeFile(reportPath, JSON.stringify(summary, null, 2));
  console.log(`\nReport: ${path.relative(ROOT, reportPath)}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
