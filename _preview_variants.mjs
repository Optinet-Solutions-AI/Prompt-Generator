import { buildEmailHtml, EMPTY_EMAIL_FORM } from './src/lib/build-email-html.ts';
import fs from 'node:fs';

const brand = 'FortunePlay';
const hero = 'https://picsum.photos/seed/fortuneplay/1200/630';

const form = {
  ...EMPTY_EMAIL_FORM,
  headline: 'Your weekend boost is live',
  introText: 'Midnight strikes, the reels reset — and your bonus is waiting. {link}',
  linkText: 'Claim it now',
  linkUrl: 'https://example.com/bonus',
  bodyText: 'Top up once this weekend and we will match it up to $500. Offer runs Friday to Sunday, one claim per player, T&Cs apply.',
  facebookUrl: 'https://facebook.com/fortuneplay',
  twitterUrl: 'https://twitter.com/fortuneplay',
  instagramUrl: 'https://instagram.com/fortuneplay',
  websiteUrl: 'https://fortuneplay.com',
  footerAttribution: 'Sent on behalf of FortunePlay.',
  unsubscribeUrl: 'https://example.com/unsub',
};

const staticConfig = {
  logo_url: '',
  banner_url: '',
  website_url: 'https://fortuneplay.com',
  unsubscribe_url: 'https://example.com/unsub',
  footer_attribution: 'FortunePlay · 123 Example Ave · Las Vegas, NV',
  legal_text: '21+ only. Please play responsibly. Gambling can be addictive.',
};

const variants = [
  { id: 'image-hero',         label: '1. image-hero — AI image is the hero (default)' },
  { id: 'brand-only',         label: '2. brand-only — brand banner/wordmark replaces the AI image' },
  { id: 'atlanta-newsletter', label: '3. atlanta-newsletter — text-forward, no headline/CTA' },
];

const sections = variants.map(v => {
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
    <section style="margin:32px 0;">
      <h2 style="font-family:system-ui;margin:0 0 12px 0;">${v.label}</h2>
      <iframe srcdoc='${html.replace(/'/g, "&apos;")}' style="width:640px;height:1200px;border:1px solid #ccc;background:#fff;"></iframe>
    </section>`;
}).join('\n');

fs.writeFileSync('./_preview_variants.html',
  `<!doctype html><html><body style="background:#eee;padding:20px;font-family:system-ui;">
    <h1 style="margin:0 0 8px 0;">Email HTML variants — brand: ${brand}</h1>
    <p style="margin:0 0 24px 0;color:#555;">Same grunge header (panelBg + accentColor brush-strokes + torn edges) applies to all 3 variants. Body layout differs per variant.</p>
    ${sections}
  </body></html>`);
console.log('Wrote _preview_variants.html');
