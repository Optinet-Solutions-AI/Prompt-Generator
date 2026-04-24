import { buildEmailHtml, EMPTY_EMAIL_FORM } from './src/lib/build-email-html.ts';
import fs from 'node:fs';

const brands = ['FortunePlay', 'Roosterbet', 'SpinJo', 'LuckyVibe', 'SpinsUp', 'PlayMojo', 'Lucky7even', 'NovaDreams', 'Rollero'];

// Transparent 1x1 PNG placeholder for the hero
const hero = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const sections = brands.map(b => {
  const html = buildEmailHtml({
    imageSrc: hero,
    brand: b,
    formData: {
      ...EMPTY_EMAIL_FORM,
      headline: 'Spin tonight and win big',
      introText: 'Kick off your evening with a fresh boost, exclusive to tonight.',
      bodyText: 'Jackpots refresh at midnight. Log in, spin up a new session, and claim your bonus before the clock strikes twelve.',
      linkText: 'Play Now',
      linkUrl: 'https://example.com/play',
    },
    imgWidth: 600,
    imgHeight: 300,
    variant: 'image-hero',
    staticConfig: {
      logo_url: '',
    },
  });
  return `<section style="margin:40px 0;"><h2 style="font-family:system-ui;">${b}</h2><iframe srcdoc='${html.replace(/'/g, "&apos;")}' style="width:640px;height:900px;border:1px solid #ccc;"></iframe></section>`;
}).join('\n');

const wrapper = `<!doctype html><html><body style="background:#eee;padding:20px;">${sections}</body></html>`;
fs.writeFileSync('./_preview_email_headers.html', wrapper);
console.log('Wrote _preview_email_headers.html');
