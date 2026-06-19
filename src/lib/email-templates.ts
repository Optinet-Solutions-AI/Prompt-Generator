/**
 * email-templates.ts — ready-made starting points for the block-based Email Builder.
 *
 * Each template assembles a default EmailDoc (header → hero → heading → intro →
 * bonus → body → cta → wordmark → social → footer) with realistic, clean copy.
 * Use {brand} anywhere — it's swapped for the selected brand name.
 */
import { defaultEmailDoc, type EmailDoc } from './email-model';

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  preheader: string;
  heading: string;
  intro: string;
  bonusOffer: string;
  bonusCode: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'welcome', name: 'Welcome', description: 'Greet a new player.',
    subject: 'Welcome to {brand}', preheader: 'Your account is ready.',
    heading: 'Welcome aboard',
    intro: 'Thanks for joining {brand} — your account is ready to go.',
    bonusOffer: 'Extra value up to USD 200 on your first top-up', bonusCode: 'WELCOME',
    body: 'If you have any questions, just reply to this note — a real person will get back to you. We are glad to have you here.',
    ctaLabel: 'Visit your account', ctaUrl: 'https://example.com/account',
  },
  {
    id: 'weekend-boost', name: 'Weekend Boost', description: 'Light-touch weekend offer.',
    subject: 'Your weekend update from {brand}', preheader: 'A little something for the weekend.',
    heading: 'Something for the weekend',
    intro: 'We have added a little extra value to your account this weekend.',
    bonusOffer: 'We will match your top-up up to USD 500', bonusCode: 'WEEKEND',
    body: 'Top up once between Friday and Sunday and we will match it. One per player, terms apply.',
    ctaLabel: 'See the details', ctaUrl: 'https://example.com/offer',
  },
  {
    id: 'cashback', name: 'Cashback / Reload', description: 'Reload reminder as added value.',
    subject: 'A quick note about your {brand} account', preheader: 'Your reload is ready.',
    heading: 'Your reload is ready',
    intro: 'Your account has some added value waiting.',
    bonusOffer: 'Up to USD 200 in extra value, credited automatically', bonusCode: '',
    body: 'Reload this week and the extra value is added automatically — no code needed.',
    ctaLabel: 'Apply it now', ctaUrl: 'https://example.com/reload',
  },
  {
    id: 'vip', name: 'VIP Invite', description: 'Warm, low-pressure VIP invite.',
    subject: 'An invitation from {brand}', preheader: 'We would like to invite you.',
    heading: 'We would like to invite you',
    intro: 'Based on your recent activity, we would like to invite you to our VIP circle.',
    bonusOffer: 'A dedicated host, quicker payouts, and early access', bonusCode: '',
    body: 'There is nothing to do right now — just take a look when you have a moment.',
    ctaLabel: 'Learn more', ctaUrl: 'https://example.com/vip',
  },
  {
    id: 'reactivation', name: 'We Miss You', description: 'Gentle reactivation note.',
    subject: 'It has been a while — {brand}', preheader: 'Your account is as you left it.',
    heading: 'It has been a while',
    intro: 'We noticed you have not stopped by in a bit.',
    bonusOffer: 'A refreshed look and some new features to explore', bonusCode: '',
    body: 'No pressure — we just wanted to say hello. Your account is exactly as you left it.',
    ctaLabel: 'Pick up where you left off', ctaUrl: 'https://example.com/welcome-back',
  },
];

/** Build an EmailDoc from a template, with {brand} resolved. */
export function buildTemplateDoc(t: EmailTemplate, brand: string, genId: () => string): EmailDoc {
  const r = (s: string) => s.replace(/\{brand\}/g, brand || 'your brand');
  const doc = defaultEmailDoc(brand, genId);
  let paraSeen = 0;
  doc.blocks = doc.blocks.map((b) => {
    switch (b.type) {
      case 'heading':   return { ...b, text: r(t.heading) };
      case 'paragraph': return { ...b, text: paraSeen++ === 0 ? r(t.intro) : r(t.body) };
      case 'bonus':     return { ...b, offer: r(t.bonusOffer), code: t.bonusCode };
      case 'cta':       return { ...b, label: r(t.ctaLabel), url: t.ctaUrl };
      case 'footer':    return { ...b, attribution: `Sent on behalf of ${brand || 'us'}.`, legal: '21+ only. Please play responsibly.', unsubscribeUrl: 'https://example.com/unsubscribe' };
      case 'social':    return { ...b, website: 'https://example.com' };
      default:          return b;
    }
  });
  doc.meta.subject = r(t.subject);
  doc.meta.preheader = r(t.preheader);
  return doc;
}
