#!/usr/bin/env node
/**
 * generate-brand-headers.mjs
 *
 * Generates the TEXTURE-ONLY email header background for each brand.
 * Supports TWO providers — OpenAI gpt-image-1 and Google Gemini Imagen 3 —
 * so outputs can be side-by-side compared to pick the best.
 *
 * Saves raw outputs locally for the user to review:
 *   public/brand-references/<slug>/email-header-bg.png           (active)
 *   public/brand-references/<slug>/email-header-bg.openai.png    (openai)
 *   public/brand-references/<slug>/email-header-bg.gemini.png    (gemini)
 *
 * Env (from .env.local):
 *   OPENAI_API_KEY — required for --provider openai
 *   GEMINI_API_KEY — required for --provider gemini
 *
 * Usage:
 *   npx tsx scripts/generate-brand-headers.mjs                         # default openai
 *   npx tsx scripts/generate-brand-headers.mjs --provider gemini       # all brands via gemini
 *   npx tsx scripts/generate-brand-headers.mjs --brand fortuneplay     # one brand, openai
 *   npx tsx scripts/generate-brand-headers.mjs --brand fortuneplay --provider gemini
 *   npx tsx scripts/generate-brand-headers.mjs --compare --brand fortuneplay   # both providers
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

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
  } catch { /* ignore */ }
}

// ── Per-brand generation inputs ────────────────────────────────────
// Each brand's panelBg (dark base) + accentColor (paint) comes from
// src/lib/brand-standards.ts. Mood words steer gpt-image-1 toward the
// right feeling (warrior, cosmic, tropical, etc.) without changing
// the core "torn paper grunge" aesthetic.
const BRANDS = [
  {
    slug: 'fortuneplay',
    display: 'FortunePlay',
    panelBg: '#0F0800',     // deep black
    accent:  '#FFD700',     // gold
    mood:    'premium gold and black luxury',
  },
  {
    slug: 'roosterbet',
    display: 'Roosterbet',
    panelBg: '#140000',     // blood black
    accent:  '#FF3333',     // aggressive red
    mood:    'bold aggressive crimson and black',
  },
  {
    slug: 'spinjo',
    display: 'SpinJo',
    panelBg: '#000D1A',     // deep navy
    accent:  '#00B4D8',     // cyan neon
    mood:    'futuristic space-age cyan and deep navy',
  },
  {
    slug: 'luckyvibe',
    display: 'LuckyVibe',
    panelBg: '#001A33',     // dark navy
    accent:  '#29B6F6',     // bright sky blue
    mood:    'tropical fresh bright blue and dark navy',
  },
  {
    slug: 'spinsup',
    display: 'SpinsUp',
    panelBg: '#08001C',     // deep purple-black
    accent:  '#FF00FF',     // neon magenta
    mood:    'magical neon magenta and dark purple',
  },
  {
    slug: 'playmojo',
    display: 'PlayMojo',
    panelBg: '#020D16',     // inky teal-black
    accent:  '#00BCD4',     // bright teal
    mood:    'clean modern teal and dark navy',
  },
  {
    slug: 'lucky7even',
    display: 'Lucky7even',
    panelBg: '#08001A',     // cosmic purple-black
    accent:  '#CE93D8',     // lavender purple
    mood:    'cosmic mystical purple and deep black',
  },
  {
    slug: 'novadreams',
    display: 'NovaDreams',
    panelBg: '#00030F',     // near-black space
    accent:  '#40C4FF',     // astro blue
    mood:    'cosmic astronaut space-blue and black',
  },
  {
    slug: 'rollero',
    display: 'Rollero',
    panelBg: '#080600',     // dark charcoal
    accent:  '#D4A017',     // antique gold
    mood:    'Roman gladiator antique gold and dark charcoal',
  },
];

function buildPrompt(brand) {
  // Single-paragraph prompt — gpt-image-1 responds better to natural language
  // than to structured keyword lists. Heavy emphasis on "NO text/logos/symbols"
  // because gpt-image-1 loves to invent wordmarks unless explicitly blocked.
  return (
    `Horizontal email header banner in the style of a Georgia Soccer sports banner — wide panoramic sports banner format. ` +
    `Deep dark ${brand.panelBg} background filling the entire image flush from the top edge downward — ` +
    `the dark color starts immediately at the very top of the frame, no white at the top. ` +
    `3 to 4 BOLD THICK parallel diagonal brush strokes in vivid saturated ${brand.accent} paint, ` +
    `each stroke sweeping confidently from the upper-right corner diagonally down toward the lower-left corner, ` +
    `like powerful slashing paint bands across the entire width, ${brand.mood}. ` +
    `The strokes are wide, heavy, impasto, dominant — matching the bold red/blue banners on sports team ` +
    `headers (Georgia Soccer style): rough distressed textured paint with grunge feel, clearly visible against the dark background. ` +
    `Along the very bottom edge of the banner: a rough irregular TORN CREAM-WHITE PAPER edge, ` +
    `with ragged uneven paper fragments tearing downward — the torn paper is pale cream/off-white with visible paper texture, ` +
    `occupying roughly the bottom 15% of the banner. ` +
    `The center area is slightly calmer so a logo can sit on top. ` +
    `Ink spatter and paint droplets around the strokes for texture. ` +
    `Absolutely NO text, NO letters, NO numbers, NO logos, NO badges, NO symbols, NO watermarks, NO typography. ` +
    `Pure abstract painted sports-banner background only.`
  );
}

// ── OpenAI gpt-image-1 ──────────────────────────────────────────────
async function generateOpenAI(brand, apiKey) {
  const prompt = buildPrompt(brand);
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:   'gpt-image-1',
      prompt,
      n:       1,
      size:    '1536x1024',
      quality: 'high', // bumped from medium — user reported "looks bad/small"
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { ok: false, error: `OpenAI ${resp.status}: ${errText.slice(0, 300)}` };
  }

  const data = await resp.json();
  const item = data.data?.[0];
  const b64  = item?.b64_json;
  const url  = item?.url;
  let buf;
  if (b64) {
    buf = Buffer.from(b64, 'base64');
  } else if (url) {
    const imgResp = await fetch(url);
    if (!imgResp.ok) return { ok: false, error: `image fetch ${imgResp.status}` };
    buf = Buffer.from(await imgResp.arrayBuffer());
  } else {
    return { ok: false, error: 'no image in OpenAI response' };
  }
  return { ok: true, buf };
}

// ── Google Gemini 2.5 Flash Image (multimodal image generation) ─────
async function generateGemini(brand, apiKey) {
  const prompt = buildPrompt(brand);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { ok: false, error: `Gemini ${resp.status}: ${errText.slice(0, 300)}` };
  }

  const data = await resp.json();
  // Response contains a candidate with parts[].inlineData.data (base64)
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.data);
  if (!imgPart) return { ok: false, error: `no image in Gemini response: ${JSON.stringify(data).slice(0, 250)}` };
  return { ok: true, buf: Buffer.from(imgPart.inlineData.data, 'base64') };
}

async function generateOne(brand, provider, keys) {
  console.log(`\n── ${brand.display} (${brand.slug}) via ${provider} ──`);
  const prompt = buildPrompt(brand);
  console.log(`  prompt: ${prompt.slice(0, 140)}...`);

  const result = provider === 'gemini'
    ? await generateGemini(brand, keys.gemini)
    : await generateOpenAI(brand, keys.openai);

  if (!result.ok) return result;

  const outDir = path.join(ROOT, 'public', 'brand-references', brand.slug);
  await fs.mkdir(outDir, { recursive: true });
  // Active file (used by composite) + provider-tagged file (for comparison)
  const activePath   = path.join(outDir, 'email-header-bg.png');
  const taggedPath   = path.join(outDir, `email-header-bg.${provider}.png`);
  await fs.writeFile(activePath, result.buf);
  await fs.writeFile(taggedPath, result.buf);
  return { ok: true, path: activePath, bytes: result.buf.length };
}

function getFlag(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? (process.argv[idx + 1] || '') : null;
}
function hasFlag(flag) { return process.argv.includes(flag); }

async function main() {
  await loadEnvLocal();
  const keys = {
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  };

  const only       = getFlag('--brand');
  const provider   = (getFlag('--provider') || 'openai').toLowerCase();
  const compare    = hasFlag('--compare');

  const targets = only ? BRANDS.filter(b => b.slug === only) : BRANDS;
  if (only && targets.length === 0) {
    console.error(`ERROR: unknown brand slug "${only}". Valid: ${BRANDS.map(b => b.slug).join(', ')}`);
    process.exit(1);
  }

  // Determine which providers to run
  const providers = compare ? ['openai', 'gemini'] : [provider];
  for (const p of providers) {
    if (p === 'openai' && !keys.openai) { console.error('ERROR: OPENAI_API_KEY not set.'); process.exit(1); }
    if (p === 'gemini' && !keys.gemini) { console.error('ERROR: GEMINI_API_KEY not set.'); process.exit(1); }
    if (p !== 'openai' && p !== 'gemini') { console.error(`ERROR: unknown provider "${p}".`); process.exit(1); }
  }

  console.log(`Generating header textures for ${targets.length} brand(s) × ${providers.length} provider(s): ${providers.join(', ')}`);

  const results = [];
  for (const p of providers) {
    for (const brand of targets) {
      try {
        const r = await generateOne(brand, p, keys);
        if (r.ok) {
          console.log(`  ✓ [${p}] ${path.relative(ROOT, r.path)} (${(r.bytes / 1024).toFixed(0)} KB)`);
        } else {
          console.log(`  ✗ [${p}] FAILED: ${r.error}`);
        }
        results.push({ brand: brand.slug, provider: p, ...r });
      } catch (err) {
        console.log(`  ✗ [${p}] CRASH: ${err.message}`);
        results.push({ brand: brand.slug, provider: p, ok: false, error: err.message });
      }
    }
  }

  const ok = results.filter(r => r.ok).length;
  console.log(`\nDone. ${ok}/${results.length} succeeded.`);
  if (ok < results.length) {
    console.log('Failures:', results.filter(r => !r.ok).map(r => `${r.brand}/${r.provider}`).join(', '));
    process.exit(1);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
