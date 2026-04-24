/**
 * Generates email-samples.html — a standalone browser-openable file showing
 * every brand × every variant. Re-run any time you tweak the header:
 *   npx tsx email-samples.mjs
 */
import { buildEmailHtml, EMPTY_EMAIL_FORM } from './src/lib/build-email-html.ts';
import fs from 'node:fs';

const brands = ['FortunePlay', 'Roosterbet', 'SpinJo', 'LuckyVibe', 'SpinsUp', 'PlayMojo', 'Lucky7even', 'NovaDreams', 'Rollero'];
const variants = [
  { id: 'image-hero',         label: 'image-hero' },
  { id: 'brand-only',         label: 'brand-only' },
  { id: 'atlanta-newsletter', label: 'atlanta-newsletter' },
];

const form = {
  ...EMPTY_EMAIL_FORM,
  headline: 'Your weekend boost is live',
  introText: 'Midnight strikes, the reels reset — and your bonus is waiting. {link}',
  linkText: 'Claim it now',
  linkUrl: 'https://example.com/bonus',
  bodyText: 'Top up once this weekend and we will match it up to $500. Offer runs Friday to Sunday, one claim per player, T&Cs apply.',
  facebookUrl: 'https://facebook.com/example',
  twitterUrl: 'https://twitter.com/example',
  instagramUrl: 'https://instagram.com/example',
  websiteUrl: 'https://example.com',
  unsubscribeUrl: 'https://example.com/unsub',
};

const staticConfig = {
  logo_url: '',
  banner_url: '',
  legal_text: '21+ only. Please play responsibly.',
};

function sampleFor(brand, variant) {
  const hero = `https://picsum.photos/seed/${brand}/1200/630`;
  const html = buildEmailHtml({
    imageSrc: hero,
    brand,
    formData: { ...form, footerAttribution: `Sent on behalf of ${brand}.` },
    imgWidth: 1200,
    imgHeight: 630,
    variant,
    staticConfig,
  });
  return `<iframe srcdoc='${html.replace(/'/g, "&apos;")}' style="width:620px;height:1100px;border:1px solid #ccc;background:#fff;"></iframe>`;
}

const brandSections = brands.map(brand => `
  <section id="${brand}" style="margin:48px 0;">
    <h2 style="font-family:system-ui;margin:0 0 16px 0;border-bottom:2px solid #333;padding-bottom:6px;">${brand}</h2>
    <div style="display:flex;gap:16px;overflow-x:auto;padding-bottom:8px;">
      ${variants.map(v => `
        <div>
          <h3 style="font-family:system-ui;font-size:14px;margin:0 0 8px 0;color:#555;">${v.label}</h3>
          ${sampleFor(brand, v.id)}
        </div>`).join('')}
    </div>
  </section>
`).join('\n');

const navLinks = brands.map(b => `<a href="#${b}" style="margin-right:16px;">${b}</a>`).join('');

const page = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Email HTML samples — all brands × all variants</title>
</head>
<body style="background:#eee;padding:24px;font-family:system-ui;">
  <h1 style="margin:0 0 8px 0;">Email HTML samples</h1>
  <p style="margin:0 0 12px 0;color:#555;">9 brands × 3 variants. Scroll each row horizontally to compare variants side-by-side.</p>
  <nav style="margin:0 0 24px 0;padding:12px;background:#fff;border:1px solid #ccc;border-radius:6px;">
    <strong style="margin-right:12px;">Jump to:</strong>${navLinks}
  </nav>
  ${brandSections}
</body>
</html>`;

fs.writeFileSync('./email-samples.html', page);
console.log('Wrote email-samples.html — open it in your browser.');
