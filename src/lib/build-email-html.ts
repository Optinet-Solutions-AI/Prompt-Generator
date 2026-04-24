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

/**
 * Hidden inbox-preview text that shows next to the subject line in Gmail,
 * Apple Mail, Outlook etc. Keeps recipients from seeing "View in browser"
 * or CSS bleed as the preview. Takes the first ~90 chars of the intro,
 * falling back to "<brand> — <headline>" then brand alone.
 */
function buildPreheader(form: EmailFormData, brand?: string): string {
  const raw = form.introText.trim()
    || (brand && form.headline.trim() ? `${brand} — ${form.headline.trim()}` : '')
    || form.headline.trim()
    || brand
    || '';
  if (!raw) return '';
  const trimmed = raw.length > 110 ? `${raw.slice(0, 107)}…` : raw;
  return `<div style="display:none;font-size:1px;color:#f4f5f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(trimmed)}</div>`;
}

// ── HTML builder ────────────────────────────────────────────────────

// Atlassian-style palette — neutral navy ink, cool greys, soft off-white bg.
// Brand accent still comes from BRAND_STANDARDS.accentColor.
const INK_HEADLINE = '#172b4d';  // Atlassian navy — strong headline
const INK_BODY     = '#42526e';  // body copy — high-contrast but soft
const INK_MUTED    = '#5e6c84';  // secondary info (socials, footer attr)
const INK_LIGHT    = '#97a0af';  // legal / fine print
const LINE_COLOR   = '#ebecf0';  // dividers
const PAGE_BG      = '#f4f5f7';  // page canvas
const FOOTER_BG    = '#fafbfc';  // subtle footer tint
const HEADER_BG    = '#fafbfc';  // header paper tint — matches torn edge fill

// Pre-encoded SVG torn-paper edge (18px tall, irregular bumps). Fill colour
// matches HEADER_BG so the tear reads as the header "paper" ending with a
// rough edge before the white content below. Base64-encoded so it survives
// strict email clients that mangle raw-utf8 data URIs.
const TORN_EDGE_DATA_URI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAwIiBoZWlnaHQ9IjE4IiB2aWV3Qm94PSIwIDAgMTIwMCAxOCIgcHJlc2VydmVBc3BlY3RSYXRpbz0ibm9uZSI+PHBhdGggZD0iTTAsMCBIMTIwMCBWMTAgTDExODAsMTYgTDExNjAsOCBMMTE0MCwxNCBMMTEyMCw4IEwxMTAwLDE1IEwxMDgwLDkgTDEwNjAsMTYgTDEwNDAsMTAgTDEwMjAsMTcgTDEwMDAsOSBMOTgwLDE0IEw5NjAsOCBMOTQwLDE1IEw5MjAsMTAgTDkwMCwxNyBMODgwLDkgTDg2MCwxNCBMODQwLDggTDgyMCwxNiBMODAwLDEwIEw3ODAsMTUgTDc2MCw5IEw3NDAsMTQgTDcyMCw4IEw3MDAsMTcgTDY4MCwxMCBMNjYwLDE0IEw2NDAsOSBMNjIwLDE1IEw2MDAsOCBMNTgwLDE2IEw1NjAsMTAgTDU0MCwxNCBMNTIwLDggTDUwMCwxNyBMNDgwLDkgTDQ2MCwxNSBMNDQwLDEwIEw0MjAsMTQgTDQwMCw4IEwzODAsMTYgTDM2MCw5IEwzNDAsMTQgTDMyMCwxMCBMMzAwLDE3IEwyODAsOCBMMjYwLDE1IEwyNDAsOSBMMjIwLDE0IEwyMDAsMTAgTDE4MCwxNiBMMTYwLDggTDE0MCwxNSBMMTIwLDkgTDEwMCwxNCBMODAsMTAgTDYwLDE3IEw0MCw4IEwyMCwxNSBMMCwxMCBaIiBmaWxsPSIjZmFmYmZjIi8+PC9zdmc+';

const FONT_STACK = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";

export function buildEmailHtml(params: BuildEmailHtmlParams): string {
  const { imageSrc, brand, formData, imgWidth, imgHeight } = params;
  const variant: EmailTemplateVariant = params.variant || 'image-hero';
  const cfg: StaticBrandConfig = params.staticConfig || {};
  const style: BrandStyle = getBrandStyle(brand);

  const containerWidth = 600;

  // ── Hero ────────────────────────────────────────────────────────────
  const heroHtml = buildHeroRow({
    variant, imageSrc, brand, style, containerWidth,
    imgWidth, imgHeight,
    bannerUrl: cfg.banner_url || undefined,
  });

  // ── Branded header bar (logo or wordmark fallback) ──────────────────
  // Subtle tinted "paper" panel that tears off at the bottom into the white
  // content area below. Inspired by Atlassian email headers. No hard border —
  // the torn-edge SVG acts as the visual separator.
  const logoUrl = formData.secondaryLogoUrl.trim() || (cfg.logo_url || '');
  const headerBarHtml = logoUrl
    ? [
        '<tr>',
        `  <td align="center" style="background-color:${HEADER_BG};padding:36px 24px 24px 24px;line-height:0;font-size:0;">`,
        `    <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brand || 'Logo')}" height="36" style="display:inline-block;height:36px;width:auto;border:0;outline:none;" />`,
        '  </td>',
        '</tr>',
      ].join('\n')
    : (brand
        ? [
            '<tr>',
            `  <td align="center" style="background-color:${HEADER_BG};padding:32px 24px 24px 24px;font-family:${FONT_STACK};font-size:17px;font-weight:800;letter-spacing:0.14em;color:${INK_HEADLINE};text-transform:uppercase;">`,
            `    ${escapeHtml(brand)}`,
            '  </td>',
            '</tr>',
          ].join('\n')
        : '');

  // Torn-paper separator between the tinted header and the white content.
  // Renders as an <img> that fills the 600px container — SVG data URI
  // works in Gmail/Apple Mail/Outlook web. For very old Outlook desktop
  // the broken image shows as blank which still looks fine against the
  // continuous white content below.
  const tornEdgeHtml = headerBarHtml
    ? [
        '<tr>',
        '  <td style="padding:0;line-height:0;font-size:0;background-color:#ffffff;">',
        `    <img src="${TORN_EDGE_DATA_URI}" alt="" width="600" height="18" style="display:block;width:100%;max-width:600px;height:18px;border:0;outline:none;" />`,
        '  </td>',
        '</tr>',
      ].join('\n')
    : '';

  // ── Content block ───────────────────────────────────────────────────
  // Flush white block immediately under the hero. No overlapping card — the
  // hero sits tight against the body so the email reads as one continuous
  // surface rather than stacked panels. CTA is centered for prominence.
  const brandLabel = brand
    ? `<p style="margin:0 0 16px 0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${style.accentColor};font-family:${FONT_STACK};">${escapeHtml(brand)}</p>`
    : '';

  const headlineHtml = formData.headline.trim()
    ? `<h1 style="margin:0 0 16px 0;font-size:28px;line-height:1.3;font-weight:700;color:${INK_HEADLINE};letter-spacing:-0.01em;font-family:${FONT_STACK};">${escapeHtml(formData.headline)}</h1>`
    : '';

  const introHtml = buildIntroParagraph(formData);
  const bodyHtml = formData.bodyText.trim()
    ? `<p style="margin:0 0 28px 0;font-size:16px;line-height:1.6;color:${INK_BODY};font-family:${FONT_STACK};">${escapeHtml(formData.bodyText)}</p>`
    : '';

  const ctaText = formData.linkText.trim();
  const ctaUrl  = safeUrl(formData.linkUrl);
  const ctaHtml = ctaText ? buildCtaButton(ctaText, ctaUrl, style) : '';

  const hasCardContent = brandLabel || headlineHtml || introHtml || bodyHtml || ctaHtml;
  const cardHtml = hasCardContent
    ? [
        '<tr>',
        `  <td style="background-color:#ffffff;padding:36px 40px 32px 40px;font-family:${FONT_STACK};">`,
        `    ${brandLabel}`,
        `    ${headlineHtml}`,
        `    ${introHtml}`,
        `    ${bodyHtml}`,
        ctaHtml
          ? `    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:4px 0 0 0;">${ctaHtml}</td></tr></table>`
          : '',
        '  </td>',
        '</tr>',
      ].join('\n')
    : '';

  // ── Footer ──────────────────────────────────────────────────────────
  const mergedSocials = {
    ...formData,
    websiteUrl: formData.websiteUrl.trim() || (cfg.website_url || ''),
  };
  const socialHtml = buildSocialRow(mergedSocials, style);

  const attribution = formData.footerAttribution.trim()
    || (cfg.footer_attribution || '')
    || (brand ? `This email was sent on behalf of ${brand}.` : '');
  const footerAttr = attribution
    ? `<p style="margin:0 0 10px 0;font-size:13px;line-height:1.55;color:${INK_MUTED};font-family:${FONT_STACK};">${escapeHtml(attribution)}</p>`
    : '';

  const legalText = cfg.legal_text || '';
  const legalHtml = legalText
    ? `<p style="margin:0 0 12px 0;font-size:12px;line-height:1.55;color:${INK_LIGHT};font-family:${FONT_STACK};">${escapeHtml(legalText)}</p>`
    : '';

  const unsubRaw = formData.unsubscribeUrl.trim() || (cfg.unsubscribe_url || '');
  const unsubHtml = unsubRaw
    ? `<p style="margin:0;font-size:12px;color:${INK_MUTED};font-family:${FONT_STACK};">To unsubscribe, <a href="${escapeHtml(safeUrl(unsubRaw))}" style="color:${INK_MUTED};text-decoration:underline;">click here</a>.</p>`
    : '';

  // Is there a footer section worth rendering at all?
  const hasFooterRow = !!(footerAttr || legalHtml || unsubHtml);
  const preheaderHtml = buildPreheader(formData, brand);

  return [
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <meta http-equiv="X-UA-Compatible" content="IE=edge" />',
    `  <title>${escapeHtml(formData.headline || brand || 'Email')}</title>`,
    '  <style type="text/css">',
    '    body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; -webkit-font-smoothing:antialiased; }',
    '    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }',
    '    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }',
    '    a, a img { border:0 !important; outline:none !important; text-decoration:none; }',
    '    p a { text-decoration:underline; }',
    '    @media only screen and (max-width:620px) {',
    '      .email-container { width:100% !important; }',
    '      .hero-img { width:100% !important; height:auto !important; }',
    '      .card-wrap { padding-left:20px !important; padding-right:20px !important; }',
    '      .footer-wrap { padding-left:20px !important; padding-right:20px !important; }',
    '    }',
    '  </style>',
    '</head>',
    `<body style="margin:0;padding:0;background-color:${PAGE_BG};font-family:${FONT_STACK};">`,
    preheaderHtml,
    `  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${PAGE_BG};">`,
    '    <tr>',
    '      <td align="center" style="padding:32px 12px 40px 12px;">',
    `        <table role="presentation" class="email-container" width="${containerWidth}" cellspacing="0" cellpadding="0" border="0" style="width:${containerWidth}px;max-width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(9,30,66,0.08);">`,
    // Header (logo or brand wordmark, with divider)
    `          ${headerBarHtml}`,
    // Hero image — flush under the header, no padding
    `          ${heroHtml}`,
    // Content block — headline + intro + body + centered CTA
    `          ${cardHtml}`,
    // Divider between content and footer (only when there's footer content below)
    hasFooterRow || socialHtml
      ? `          <tr><td style="padding:0 40px;"><div style="border-top:1px solid ${LINE_COLOR};font-size:0;line-height:0;">&nbsp;</div></td></tr>`
      : '',
    // Social row (muted, balanced)
    `          ${socialHtml}`,
    // Footer (attribution, legal, unsubscribe) on a soft tint
    hasFooterRow
      ? [
          '          <tr>',
          `            <td class="footer-wrap" align="center" style="background-color:${FOOTER_BG};padding:20px 40px 28px 40px;font-family:${FONT_STACK};text-align:center;">`,
          `              ${footerAttr}`,
          `              ${legalHtml}`,
          `              ${unsubHtml}`,
          '            </td>',
          '          </tr>',
        ].join('\n')
      : '',
    '        </table>',
    '      </td>',
    '    </tr>',
    '  </table>',
    '</body>',
    '</html>',
  ].filter(Boolean).join('\n');
}

/**
 * Branded CTA button — table-based for Outlook, regular anchor for everyone else.
 * VML shape wraps the anchor for Outlook so it gets a proper pill button.
 */
function buildCtaButton(text: string, url: string, style: BrandStyle): string {
  const bg   = style.buttonBg   || style.accentColor;
  const fg   = style.buttonText || '#ffffff';
  const safe = escapeHtml(url);
  const label = escapeHtml(text);
  return [
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">`,
    '  <tr>',
    `    <td style="border-radius:6px;background-color:${bg};">`,
    `      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safe}" style="height:50px;v-text-anchor:middle;width:220px;" arcsize="12%" strokecolor="${bg}" fillcolor="${bg}"><w:anchorlock/><center style="color:${fg};font-family:sans-serif;font-size:16px;font-weight:700;">${label}</center></v:roundrect><![endif]-->`,
    `      <!--[if !mso]><!--><a href="${safe}" style="display:inline-block;padding:15px 36px;font-family:${FONT_STACK};font-size:16px;font-weight:700;color:${fg};text-decoration:none;border-radius:6px;background-color:${bg};">${label}</a><!--<![endif]-->`,
    '    </td>',
    '  </tr>',
    '</table>',
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

  // Inline link style — Atlassian link blue, single underline for affordance.
  const linkStyle = 'color:#0052cc;text-decoration:underline;text-underline-offset:2px;font-weight:600;';
  let body: string;
  if (linkText && intro.includes('{link}')) {
    const anchor = `<a href="${escapeHtml(linkUrl)}" style="${linkStyle}">${escapeHtml(linkText)}</a>`;
    body = escapeHtml(intro).replace('{link}', anchor);
  } else if (linkText) {
    const anchor = ` <a href="${escapeHtml(linkUrl)}" style="${linkStyle}">${escapeHtml(linkText)}</a>`;
    body = `${escapeHtml(intro)}${anchor}`;
  } else {
    body = escapeHtml(intro);
  }
  return `<p style="margin:0 0 20px 0;font-size:16px;line-height:1.6;color:${INK_BODY};font-family:${FONT_STACK};">${body}</p>`;
}

function buildSocialRow(data: EmailFormData, _style: BrandStyle): string {
  const entries = [
    { label: 'Facebook',  url: data.facebookUrl },
    { label: 'Twitter',   url: data.twitterUrl },
    { label: 'Instagram', url: data.instagramUrl },
    { label: 'Website',   url: data.websiteUrl  },
  ].filter(e => e.url.trim());

  if (entries.length === 0) return '';

  // Muted row — readable on white, doesn't steal attention from the CTA above.
  const linkStyle = `color:${INK_MUTED};text-decoration:none;font-weight:600;font-size:13px;letter-spacing:0.02em;`;
  const sepStyle  = `color:${LINE_COLOR};padding:0 12px;font-size:13px;`;
  const parts = entries.map((e, i) => {
    const link = `<a href="${escapeHtml(safeUrl(e.url))}" style="${linkStyle}">${escapeHtml(e.label)}</a>`;
    return i === 0 ? link : `<span style="${sepStyle}">|</span>${link}`;
  }).join('');

  return [
    '<tr>',
    `  <td align="center" style="padding:24px 40px;background-color:#ffffff;font-family:${FONT_STACK};">`,
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

  const websiteUrl = formData.websiteUrl.trim() || (cfg.website_url || '');
  const social = [
    formData.facebookUrl.trim()  && `Facebook: ${safeUrl(formData.facebookUrl)}`,
    formData.twitterUrl.trim()   && `Twitter: ${safeUrl(formData.twitterUrl)}`,
    formData.instagramUrl.trim() && `Instagram: ${safeUrl(formData.instagramUrl)}`,
    websiteUrl                    && `Website: ${safeUrl(websiteUrl)}`,
  ].filter(Boolean) as string[];
  if (social.length) {
    lines.push('--', ...social, '');
  }

  const attrTxt = formData.footerAttribution.trim()
    || (cfg.footer_attribution || '')
    || (brand ? `This email was sent on behalf of ${brand}.` : '');
  if (attrTxt) {
    lines.push(attrTxt);
  }
  if (cfg.legal_text) {
    lines.push(cfg.legal_text);
  }
  const unsubRaw = formData.unsubscribeUrl.trim() || (cfg.unsubscribe_url || '');
  if (unsubRaw) {
    lines.push(`To unsubscribe: ${safeUrl(unsubRaw)}`);
  }

  return lines.join('\n');
}
