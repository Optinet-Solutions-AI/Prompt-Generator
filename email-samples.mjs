/**
 * email-samples.mjs
 * Generates email-samples.html — all 9 brands × 3 variants with the new
 * AI-generated composite headers (texture + logo).
 *
 * Re-run any time:  npx tsx email-samples.mjs
 */
import { buildEmailHtml, EMPTY_EMAIL_FORM } from './src/lib/build-email-html.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename));

const brands = [
  'FortunePlay', 'Roosterbet', 'SpinJo', 'LuckyVibe',
  'SpinsUp', 'PlayMojo', 'Lucky7even', 'NovaDreams', 'Rollero',
];
const slugMap = {
  FortunePlay: 'fortuneplay', Roosterbet: 'roosterbet', SpinJo: 'spinjo',
  LuckyVibe: 'luckyvibe', SpinsUp: 'spinsup', PlayMojo: 'playmojo',
  Lucky7even: 'lucky7even', NovaDreams: 'novadreams', Rollero: 'rollero',
};
const variants = [
  { id: 'image-hero',         label: 'image-hero' },
  { id: 'brand-only',         label: 'brand-only' },
  { id: 'atlanta-newsletter', label: 'atlanta-newsletter' },
];

const form = {
  ...EMPTY_EMAIL_FORM,
  headline:  'Your weekend boost is live',
  introText: 'Midnight strikes, the reels reset — and your bonus is waiting. {link}',
  linkText:  'Claim it now',
  linkUrl:   'https://example.com/bonus',
  bodyText:  'Top up once this weekend and we will match it up to $500. Offer runs Friday to Sunday, one claim per player, T&Cs apply.',
  facebookUrl:  'https://facebook.com/example',
  twitterUrl:   'https://twitter.com/example',
  instagramUrl: 'https://instagram.com/example',
  websiteUrl:   'https://example.com',
  unsubscribeUrl: 'https://example.com/unsub',
};

// Load composite header as base64 data URI (works inside srcdoc iframes)
async function headerDataUri(slug) {
  const p = path.join(ROOT, 'public', 'brand-references', slug, 'email-header.png');
  try {
    const buf = await fs.readFile(p);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// Wordmark per brand. Flags:
//   darkBg       — wrap the wordmark in a compact dark pill when the logo is
//                  too light to read on a white email body.
//   invertWhite  — recolour near-white pixels to black. ONLY enable when the
//                  wordmark has large white TEXT areas; enabling it on logos
//                  with small white highlights (eyes, shines, details) turns
//                  those highlights into ugly black blocks.
const WORDMARK_FILES = {
  fortuneplay: { file: 'scraped/logo-1.svg',     darkBg: false, invertWhite: true  }, // white "FORTUNE" text
  roosterbet:  { file: 'scraped/logo-1.svg',     darkBg: false, invertWhite: false }, // red/dark, highlights only
  spinjo:      { file: 'scraped/logo-1.svg',     darkBg: false, invertWhite: false }, // no white
  luckyvibe:   { file: 'scraped/logo-1.svg',     darkBg: false, invertWhite: false }, // dark script, highlights only
  spinsup:     { file: 'scraped/logo-1.svg',     darkBg: true,  invertWhite: false }, // dark pill, leave as-is
  playmojo:    { file: 'scraped/logo-1.svg',     darkBg: false, invertWhite: false },
  lucky7even:  { file: 'scraped/logo-1.svg',     darkBg: false, invertWhite: false },
  novadreams:  { file: 'scraped/logo-long.svg',  darkBg: true,  invertWhite: false }, // dark pill
  rollero:     { file: 'scraped/logo-long.svg',  darkBg: true,  invertWhite: false }, // dark pill
};

// Convert wordmark SVG → PNG → base64 data URI.
// When `darkBg` is false: recolours near-white text pixels to black so the
//   wordmark is legible on a white email body without a pill.
// When `darkBg` is true: leaves pixels untouched — the wordmark will be
//   wrapped in a dark brand-colored pill by the email builder.
async function wordmarkDataUri(slug) {
  const cfg = WORDMARK_FILES[slug];
  if (!cfg) return null;
  const p = path.join(ROOT, 'public', 'brand-references', slug, cfg.file);
  try {
    await fs.access(p);
    const rendered = await sharp(p, { density: 256 })
      .resize(600, 140, { fit: 'inside', withoutEnlargement: false })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data, info } = rendered;
    if (cfg.invertWhite) {
      // White text → black so it's visible on white body.
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a > 40 && r > 235 && g > 235 && b > 235) {
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
        }
      }
    }
    const buf = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer();
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function buildSections() {
  const sections = [];
  for (const brand of brands) {
    const slug = slugMap[brand];
    const header_url = await headerDataUri(slug);
    const wordmark_url = await wordmarkDataUri(slug);
    const wordmark_dark_bg = !!(WORDMARK_FILES[slug] && WORDMARK_FILES[slug].darkBg);
    const staticConfig = {
      header_url,
      wordmark_url,
      wordmark_dark_bg,
      legal_text: '21+ only. Please play responsibly.',
      footer_attribution: `Sent on behalf of ${brand}.`,
      unsubscribe_url: 'https://example.com/unsub',
    };
    const hero = `https://picsum.photos/seed/${brand}/1200/630`;

    const variantCards = variants.map(v => {
      const html = buildEmailHtml({
        imageSrc: hero,
        brand,
        formData: form,
        imgWidth: 1200,
        imgHeight: 630,
        variant: v.id,
        staticConfig,
      });
      return `
        <div>
          <p style="font-family:system-ui;font-size:12px;color:#666;margin:0 0 6px 0;">${v.label}</p>
          <iframe srcdoc='${html.replace(/'/g, "&apos;")}' style="width:602px;height:1050px;border:1px solid #ddd;background:#fff;border-radius:4px;"></iframe>
        </div>`;
    }).join('');

    sections.push(`
      <section id="${slug}" style="margin:48px 0;">
        <h2 style="font-family:system-ui;margin:0 0 14px 0;border-bottom:1px solid #333;padding-bottom:8px;">${brand}</h2>
        <div style="display:flex;gap:20px;overflow-x:auto;padding-bottom:8px;">${variantCards}</div>
      </section>`);
  }
  return sections.join('\n');
}

const navLinks = brands.map(b => `<a href="#${slugMap[b]}" style="margin-right:14px;color:#aaa;font-size:13px;">${b}</a>`).join('');
const sections = await buildSections();

const page = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Email HTML Samples — All Brands × All Variants</title>
</head>
<body style="background:#1a1a1a;padding:24px;margin:0;font-family:system-ui;color:#fff;">
  <h1 style="margin:0 0 6px 0;font-size:22px;">Email HTML Samples</h1>
  <p style="margin:0 0 16px 0;color:#888;font-size:13px;">9 brands × 3 variants — AI composite header (1200×400, displays at 600×200 in email).</p>
  <nav style="margin:0 0 24px 0;padding:12px 16px;background:#222;border-radius:6px;">
    <strong style="margin-right:12px;font-size:13px;">Jump to:</strong>${navLinks}
  </nav>
  ${sections}
</body>
</html>`;

await fs.writeFile(path.join(ROOT, 'email-samples.html'), page);
console.log('Wrote email-samples.html');
