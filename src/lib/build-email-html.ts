/**
 * build-email-html.ts
 *
 * Generates a self-contained HTML email campaign based on the
 * Atlanta Insiders reference template (hero image -> body copy ->
 * secondary logo -> social links -> footer -> unsubscribe).
 *
 * Uses table-based layout + inline CSS so it renders in Gmail,
 * Outlook, Apple Mail, and other email clients. Separate from
 * build-banner-html.ts which produces a promotional banner (not an email).
 */
import { getBrandStyle, type BrandStyle } from './brand-standards';

// ── Types ─────────────────────────────────────────────────────────────

export interface EmailFormData {
  /** Subject / headline text shown below the hero */
  headline: string;
  /** Short intro paragraph (may contain {link} placeholder replaced with linkText/linkUrl) */
  introText: string;
  /** Optional link text + URL shown inline inside the intro */
  linkText: string;
  linkUrl: string;
  /** Main body paragraph */
  bodyText: string;
  /** Optional secondary logo image URL (second visual block) */
  secondaryLogoUrl: string;
  /** Brand wordmark / tertiary logo text */
  brandWordmark: string;
  /** Social links */
  facebookUrl: string;
  twitterUrl: string;
  instagramUrl: string;
  websiteUrl: string;
  /** Footer attribution line, e.g. "This email was sent by X on behalf of Y" */
  footerAttribution: string;
  /** Unsubscribe link URL */
  unsubscribeUrl: string;
}

export const EMPTY_EMAIL_FORM: EmailFormData = {
  headline: '',
  introText: '',
  linkText: '',
  linkUrl: '',
  bodyText: '',
  secondaryLogoUrl: '',
  brandWordmark: '',
  facebookUrl: '',
  twitterUrl: '',
  instagramUrl: '',
  websiteUrl: '',
  footerAttribution: '',
  unsubscribeUrl: '',
};

/**
 * Two template variants per brand:
 *   - 'image-hero' : AI-generated image is the hero (default).
 *   - 'brand-only' : Static brand banner is the hero (AI image ignored).
 */
export type EmailTemplateVariant = 'image-hero' | 'brand-only';

/**
 * Per-brand static header/footer config loaded from Supabase
 * (brand_email_config table) at modal open. Missing fields fall
 * through to brand-derived defaults or are omitted.
 */
export interface StaticBrandConfig {
  logo_url?: string | null;
  banner_url?: string | null;
  website_url?: string | null;
  unsubscribe_url?: string | null;
  footer_attribution?: string | null;
  legal_text?: string | null;
}

export interface BuildEmailHtmlParams {
  /** Base64 data URI or public URL for the AI-generated image */
  imageSrc: string;
  /** Brand name — picks up colors from BRAND_STANDARDS when available */
  brand?: string;
  formData: EmailFormData;
  imgWidth: number;
  imgHeight: number;
  /** Template variant (default: 'image-hero') */
  variant?: EmailTemplateVariant;
  /** Static brand config loaded from Supabase — fills in blank form fields */
  staticConfig?: StaticBrandConfig;
}

// ── Helpers ─────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return '#';
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// ── HTML builder ────────────────────────────────────────────────────

export function buildEmailHtml(params: BuildEmailHtmlParams): string {
  const { imageSrc, brand, formData, imgWidth, imgHeight } = params;
  const variant: EmailTemplateVariant = params.variant || 'image-hero';
  const cfg: StaticBrandConfig = params.staticConfig || {};
  const style: BrandStyle = getBrandStyle(brand);

  const containerWidth = 600;

  // Hero resolution — image-hero uses imageSrc; brand-only uses cfg.banner_url
  // or a CSS-rendered brand hero as last-resort fallback.
  const heroHtml = buildHeroRow({
    variant, imageSrc, brand, style, containerWidth,
    imgWidth, imgHeight,
    bannerUrl: cfg.banner_url || undefined,
  });

  // Logo slot — user input > static config > omit
  const logoUrl = formData.secondaryLogoUrl.trim() || (cfg.logo_url || '');
  const secondaryLogoHtml = logoUrl
    ? `<tr><td align="center" style="padding:28px 24px 8px 24px;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brand || 'Logo')}" width="240" style="display:block;max-width:240px;height:auto;border:0;outline:none;" /></td></tr>`
    : '';

  const intro = buildIntroParagraph(formData);
  const bodyHtml = formData.bodyText.trim()
    ? `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#333333;">${escapeHtml(formData.bodyText)}</p>`
    : '';

  const headlineHtml = formData.headline.trim()
    ? `<h1 style="margin:0 0 14px 0;font-size:22px;line-height:1.25;font-weight:700;color:${style.panelBg};">${escapeHtml(formData.headline)}</h1>`
    : '';

  // Fallback: when wordmark is blank but a brand is known, render the brand name as a large, centered wordmark
  const wordmarkText = formData.brandWordmark.trim() || (brand ? brand.toUpperCase() : '');
  const wordmarkHtml = wordmarkText
    ? `<tr><td align="center" style="padding:${logoUrl ? '8px' : '28px'} 24px 22px 24px;font-size:28px;font-weight:800;letter-spacing:0.04em;color:${style.accentColor};font-family:Arial,Helvetica,sans-serif;">${escapeHtml(wordmarkText)}</td></tr>`
    : '';

  // Socials: merge user input with website_url fallback from static config
  const mergedSocials = {
    ...formData,
    websiteUrl: formData.websiteUrl.trim() || (cfg.website_url || ''),
  };
  const socialHtml = buildSocialRow(mergedSocials, style);

  // Fallback chain: user input → static config → brand-derived default
  const attribution = formData.footerAttribution.trim()
    || (cfg.footer_attribution || '')
    || (brand ? `This email was sent on behalf of ${brand}.` : '');
  const footerAttr = attribution
    ? `<p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:#888888;">${escapeHtml(attribution)}</p>`
    : '';

  const legalText = cfg.legal_text || '';
  const legalHtml = legalText
    ? `<p style="margin:0 0 6px 0;font-size:11px;line-height:1.5;color:#aaaaaa;">${escapeHtml(legalText)}</p>`
    : '';

  const unsubRaw = formData.unsubscribeUrl.trim() || (cfg.unsubscribe_url || '');
  const unsubUrl = safeUrl(unsubRaw);
  const unsubHtml = unsubRaw
    ? `<p style="margin:0;font-size:12px;line-height:1.5;color:#888888;">To unsubscribe from this email, <a href="${escapeHtml(unsubUrl)}" style="color:#888888;text-decoration:underline;">click here</a>.</p>`
    : '';

  const fontStack = 'Arial, Helvetica, sans-serif';

  return [
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <meta http-equiv="X-UA-Compatible" content="IE=edge" />',
    `  <title>${escapeHtml(formData.headline || brand || 'Email')}</title>`,
    '  <style type="text/css">',
    '    body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }',
    '    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }',
    '    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }',
    '    a { text-decoration:none; }',
    '    @media only screen and (max-width:620px) {',
    '      .email-container { width:100% !important; }',
    '      .hero-img { width:100% !important; height:auto !important; }',
    '      .mobile-pad { padding-left:18px !important; padding-right:18px !important; }',
    '    }',
    '  </style>',
    '</head>',
    `<body style="margin:0;padding:0;background-color:#f2f2f2;font-family:${fontStack};">`,
    `  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f2f2f2;">`,
    '    <tr>',
    '      <td align="center" style="padding:24px 12px;">',
    `        <table role="presentation" class="email-container" width="${containerWidth}" cellspacing="0" cellpadding="0" border="0" style="width:${containerWidth}px;max-width:100%;background-color:#ffffff;border-radius:6px;overflow:hidden;">`,
    `          ${heroHtml}`,
    '          <tr>',
    `            <td class="mobile-pad" style="padding:28px 36px 20px 36px;font-family:${fontStack};color:#333333;">`,
    `              ${headlineHtml}`,
    `              ${intro}`,
    `              ${bodyHtml}`,
    '            </td>',
    '          </tr>',
    `          ${secondaryLogoHtml}`,
    `          ${wordmarkHtml}`,
    `          ${socialHtml}`,
    '          <tr>',
    `            <td class="mobile-pad" align="center" style="padding:20px 36px 28px 36px;border-top:1px solid #eeeeee;font-family:${fontStack};">`,
    `              ${footerAttr}`,
    `              ${legalHtml}`,
    `              ${unsubHtml}`,
    '            </td>',
    '          </tr>',
    '        </table>',
    '      </td>',
    '    </tr>',
    '  </table>',
    '</body>',
    '</html>',
  ].join('\n');
}

/**
 * Build the <tr> that holds the email hero. Three paths:
 *   1. variant === 'image-hero'   → AI image <img>
 *   2. variant === 'brand-only' with banner URL → static banner <img>
 *   3. variant === 'brand-only' without banner → CSS-rendered brand hero (solid brand color + wordmark)
 */
function buildHeroRow(opts: {
  variant: EmailTemplateVariant;
  imageSrc: string;
  brand?: string;
  style: BrandStyle;
  containerWidth: number;
  imgWidth: number;
  imgHeight: number;
  bannerUrl?: string;
}): string {
  const { variant, imageSrc, brand, style, containerWidth, imgWidth, imgHeight, bannerUrl } = opts;
  const BRAND_BANNER_RATIO = 1656 / 500; // aspect ratio of scraped platform banners

  if (variant === 'image-hero') {
    const heroHeight = Math.round((imgHeight / imgWidth) * containerWidth);
    return [
      '<tr>',
      '  <td align="center" style="padding:0;line-height:0;font-size:0;">',
      `    <img class="hero-img" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(brand || 'Email hero')}" width="${containerWidth}" height="${heroHeight}" style="display:block;width:100%;max-width:${containerWidth}px;height:auto;border:0;outline:none;" />`,
      '  </td>',
      '</tr>',
    ].join('\n');
  }

  // brand-only variant
  if (bannerUrl) {
    const bannerHeight = Math.round(containerWidth / BRAND_BANNER_RATIO);
    return [
      '<tr>',
      '  <td align="center" style="padding:0;line-height:0;font-size:0;">',
      `    <img class="hero-img" src="${escapeHtml(bannerUrl)}" alt="${escapeHtml(brand || 'Brand banner')}" width="${containerWidth}" height="${bannerHeight}" style="display:block;width:100%;max-width:${containerWidth}px;height:auto;border:0;outline:none;" />`,
      '  </td>',
      '</tr>',
    ].join('\n');
  }

  // Last-resort CSS-rendered brand hero — no image needed, works even with no assets.
  const wordmark = (brand || 'BRAND').toUpperCase();
  return [
    '<tr>',
    `  <td align="center" style="background-color:${style.panelBg};padding:64px 24px;line-height:1;font-family:${style.fontFamily.replace(/"/g, "&quot;")};">`,
    `    <span style="font-size:44px;font-weight:900;color:${style.accentColor};letter-spacing:0.06em;display:inline-block;">${escapeHtml(wordmark)}</span>`,
    '  </td>',
    '</tr>',
  ].join('\n');
}

function buildIntroParagraph(data: EmailFormData): string {
  const intro = data.introText.trim();
  if (!intro) return '';

  const linkText = data.linkText.trim();
  const linkUrl = safeUrl(data.linkUrl);

  let body: string;
  if (linkText && intro.includes('{link}')) {
    const anchor = `<a href="${escapeHtml(linkUrl)}" style="color:#1a73e8;text-decoration:underline;font-weight:600;">${escapeHtml(linkText)}</a>`;
    body = escapeHtml(intro).replace('{link}', anchor);
  } else if (linkText) {
    const anchor = ` <a href="${escapeHtml(linkUrl)}" style="color:#1a73e8;text-decoration:underline;font-weight:600;">${escapeHtml(linkText)}</a>`;
    body = `${escapeHtml(intro)}${anchor}`;
  } else {
    body = escapeHtml(intro);
  }
  return `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#333333;">${body}</p>`;
}

function buildSocialRow(data: EmailFormData, style: BrandStyle): string {
  const entries = [
    { label: 'Facebook',  url: data.facebookUrl },
    { label: 'Twitter',   url: data.twitterUrl },
    { label: 'Instagram', url: data.instagramUrl },
    { label: 'Website',   url: data.websiteUrl  },
  ].filter(e => e.url.trim());

  if (entries.length === 0) return '';

  const linkStyle = `color:${style.accentColor};text-decoration:none;font-weight:600;font-size:13px;`;
  const sepStyle = 'color:#cccccc;padding:0 8px;';
  const parts = entries.map((e, i) => {
    const link = `<a href="${escapeHtml(safeUrl(e.url))}" style="${linkStyle}">${escapeHtml(e.label)}</a>`;
    return i === 0 ? link : `<span style="${sepStyle}">|</span>${link}`;
  }).join('');

  return [
    '<tr>',
    `  <td align="center" style="padding:12px 24px 20px 24px;font-family:Arial,Helvetica,sans-serif;">`,
    `    ${parts}`,
    '  </td>',
    '</tr>',
  ].join('\n');
}

// ── Plain-text twin ─────────────────────────────────────────────────

/**
 * Generate the plain-text version of the email — strips HTML and
 * renders links as "text (url)".
 */
export function buildEmailText(formData: EmailFormData, brand?: string, staticConfig?: StaticBrandConfig): string {
  const cfg = staticConfig || {};
  const lines: string[] = [];
  if (brand) lines.push(brand.toUpperCase(), '');
  if (formData.headline.trim()) {
    lines.push(formData.headline.trim(), '='.repeat(Math.min(formData.headline.trim().length, 60)), '');
  }

  if (formData.introText.trim()) {
    const intro = formData.introText.trim();
    const linkText = formData.linkText.trim();
    const linkUrl = safeUrl(formData.linkUrl);
    if (linkText && intro.includes('{link}')) {
      lines.push(intro.replace('{link}', `${linkText} (${linkUrl})`));
    } else if (linkText) {
      lines.push(`${intro} ${linkText} (${linkUrl})`);
    } else {
      lines.push(intro);
    }
    lines.push('');
  }

  if (formData.bodyText.trim()) {
    lines.push(formData.bodyText.trim(), '');
  }

  const wordmarkTxt = formData.brandWordmark.trim() || (brand ? brand.toUpperCase() : '');
  if (wordmarkTxt) {
    lines.push(wordmarkTxt, '');
  }

  const social = [
    formData.facebookUrl.trim()  && `Facebook: ${safeUrl(formData.facebookUrl)}`,
    formData.twitterUrl.trim()   && `Twitter: ${safeUrl(formData.twitterUrl)}`,
    formData.instagramUrl.trim() && `Instagram: ${safeUrl(formData.instagramUrl)}`,
    formData.websiteUrl.trim()   && `Website: ${safeUrl(formData.websiteUrl)}`,
  ].filter(Boolean) as string[];
  if (social.length) {
    lines.push('--', ...social, '');
  }

  const attrTxt = formData.footerAttribution.trim() || (brand ? `This email was sent on behalf of ${brand}.` : '');
  if (attrTxt) {
    lines.push(attrTxt);
  }
  if (formData.unsubscribeUrl.trim()) {
    lines.push(`To unsubscribe: ${safeUrl(formData.unsubscribeUrl)}`);
  }

  return lines.join('\n');
}
