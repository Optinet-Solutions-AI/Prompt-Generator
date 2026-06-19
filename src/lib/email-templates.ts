/**
 * email-templates.ts — ready-made email copy presets for the Email Content Checker.
 *
 * Each template is a starting point: realistic subject + body copy that the user
 * can preview as a fully-rendered branded HTML email (via build-email-html) and
 * then load into the deliverability checker to refine.
 *
 * Copy is intentionally written clean-ish; the checker flags anything risky that
 * remains. Use {brand} in any string — it's swapped for the selected brand name.
 */
import { EMPTY_EMAIL_FORM, type EmailFormData } from './build-email-html';

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  /** Subject line shown in the checker (brand token allowed). */
  subject: string;
  form: EmailFormData;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'welcome',
    name: 'Welcome',
    description: 'Greet a new player and point them to their account.',
    subject: 'Welcome to {brand}',
    form: {
      ...EMPTY_EMAIL_FORM,
      headline: 'Welcome aboard',
      introText: 'Thanks for joining {brand} — your account is ready to go. {link} whenever you would like to take a look around.',
      linkText: 'Visit your account',
      linkUrl: 'https://example.com/account',
      bodyText: 'If you have any questions, just reply to this note — a real person will get back to you. We are glad to have you here.',
      footerAttribution: 'Sent on behalf of {brand}.',
    },
  },
  {
    id: 'weekend-boost',
    name: 'Weekend Boost',
    description: 'Light-touch weekend offer announcement.',
    subject: 'Your weekend update from {brand}',
    form: {
      ...EMPTY_EMAIL_FORM,
      headline: 'Something for the weekend',
      introText: 'We have added a little extra value to your account this weekend. {link} to see the details.',
      linkText: 'See the details',
      linkUrl: 'https://example.com/offer',
      bodyText: 'Top up once between Friday and Sunday and we will match it, up to USD 500. One per player, terms apply.',
      footerAttribution: 'Sent on behalf of {brand}.',
    },
  },
  {
    id: 'cashback',
    name: 'Cashback / Reload',
    description: 'Reload reminder framed as added value.',
    subject: 'A quick note about your {brand} account',
    form: {
      ...EMPTY_EMAIL_FORM,
      headline: 'Your reload is ready',
      introText: 'Your account has some added value waiting. {link} to apply it.',
      linkText: 'Apply it now',
      linkUrl: 'https://example.com/reload',
      bodyText: 'Reload this week and we will add up to USD 200 in extra value. Funds are credited automatically, no code needed.',
      footerAttribution: 'Sent on behalf of {brand}.',
    },
  },
  {
    id: 'vip',
    name: 'VIP Invite',
    description: 'Warm, low-pressure invite to a VIP tier.',
    subject: 'An invitation from {brand}',
    form: {
      ...EMPTY_EMAIL_FORM,
      headline: 'We would like to invite you',
      introText: 'Based on your recent activity, we would like to invite you to our VIP circle. {link} to learn what it includes.',
      linkText: 'Learn more',
      linkUrl: 'https://example.com/vip',
      bodyText: 'VIP members get a dedicated host, quicker payouts, and early access to new features. There is nothing to do right now — just take a look when you have a moment.',
      footerAttribution: 'Sent on behalf of {brand}.',
    },
  },
  {
    id: 'reactivation',
    name: 'We Miss You',
    description: 'Gentle reactivation note for lapsed players.',
    subject: 'It has been a while — {brand}',
    form: {
      ...EMPTY_EMAIL_FORM,
      headline: 'It has been a while',
      introText: 'We noticed you have not stopped by in a bit. {link} whenever you are ready — your account is exactly as you left it.',
      linkText: 'Pick up where you left off',
      linkUrl: 'https://example.com/welcome-back',
      bodyText: 'A lot has changed since your last visit, with a refreshed look and some new features. No pressure — we just wanted to say hello.',
      footerAttribution: 'Sent on behalf of {brand}.',
    },
  },
];

/** Replace the {brand} token everywhere with the chosen brand (or a neutral fallback). */
export function applyBrandToken(value: string, brand?: string): string {
  return value.replace(/\{brand\}/g, brand || 'your brand');
}

/** A copy of the template form with {brand} tokens resolved. */
export function resolveTemplateForm(t: EmailTemplate, brand?: string): EmailFormData {
  const r = (s: string) => applyBrandToken(s, brand);
  return {
    ...t.form,
    headline: r(t.form.headline),
    introText: r(t.form.introText),
    bodyText: r(t.form.bodyText),
    footerAttribution: r(t.form.footerAttribution),
  };
}

/** Subject + plain-text body (intro + body) for loading into the checker. */
export function templateCheckerCopy(t: EmailTemplate, brand?: string): { subject: string; body: string } {
  const form = resolveTemplateForm(t, brand);
  // Inline the link as "text (url)" so the body reads naturally in the checker.
  const intro = form.introText.replace(/\{link\}/g, form.linkText ? `${form.linkText} (${form.linkUrl})` : '');
  const body = [intro.trim(), form.bodyText.trim()].filter(Boolean).join('\n\n');
  return { subject: applyBrandToken(t.subject, brand), body };
}
