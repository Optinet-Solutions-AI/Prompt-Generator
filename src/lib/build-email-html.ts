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
 * Three template variants per brand:
 *   - 'image-hero'        : AI-generated image is the hero (default).
 *   - 'brand-only'        : Static brand banner is the hero (AI image ignored).
 *   - 'atlanta-newsletter': Atlanta-Insiders-style newsletter — header image,
 *                           two text paragraphs, secondary image, logo bottom,
 *                           socials, divider, unsubscribe. No headline/CTA.
 */
export type EmailTemplateVariant = 'image-hero' | 'brand-only' | 'atlanta-newsletter';

/**
 * Per-brand static header/footer config loaded from Supabase
 * (brand_email_config table) at modal open. Missing fields fall
 * through to brand-derived defaults or are omitted.
 */
export interface StaticBrandConfig {
  logo_url?: string | null;
  banner_url?: string | null;
  /** AI-generated composite header image (texture + logo). When present,
   *  replaces ALL header markup with a single full-width <img> — Atlassian
   *  style, no SVG grunge, works in every email client including Outlook. */
  header_url?: string | null;
  /** Full brand wordmark (icon + name text). Displayed centered below the
   *  header banner, Atlassian-style, before body content. */
  wordmark_url?: string | null;
  /** When true, the wordmark is wrapped in a dark brand-colored pill for
   *  contrast — needed for brands whose logo colours are too light to read
   *  on a white email body (e.g. all-gold Rollero, cyan NovaDreams). */
  wordmark_dark_bg?: boolean | null;
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
const PAGE_BG      = '#ffffff';  // page canvas — white so torn-paper edges blend
const FOOTER_BG    = '#fafbfc';  // subtle footer tint

/**
 * Torn-paper edge rendered as an inline SVG data URI (24px tall, deep
 * irregular teeth so the effect reads clearly, not as a straight line).
 * Fill colour matches the header's brand panel colour so the tear looks
 * like the branded header paper ending in a rough edge before white content.
 *
 * `side`:
 *   - 'bottom' (default) → fill at TOP of the rect, teeth point DOWN.
 *     Use BELOW the header panel (header above, white below).
 *   - 'top' → fill at BOTTOM of the rect, teeth point UP.
 *     Use ABOVE the header panel (white above, header below).
 *
 * Base64-encoded for max email-client compatibility (Gmail, Outlook web,
 * Apple Mail all honour base64 SVG data URIs in <img src>).
 */
function buildTornEdgeDataUri(fillColor: string, side: 'top' | 'bottom' = 'bottom'): string {
  // Jagged teeth path. For 'bottom', fill sits along y=0 with the ragged edge
  // dipping down into transparency (y≈2..22). For 'top', the same pattern is
  // reflected so the fill sits along y=24 and the teeth climb up.
  const bottomPath = 'M0,0 H1200 V6 L1185,20 L1170,4 L1155,22 L1140,8 L1125,20 L1110,2 L1095,18 L1080,8 L1065,22 L1050,4 L1035,20 L1020,6 L1005,22 L990,4 L975,18 L960,8 L945,22 L930,2 L915,16 L900,8 L885,20 L870,4 L855,22 L840,8 L825,18 L810,2 L795,22 L780,6 L765,20 L750,4 L735,16 L720,8 L705,22 L690,2 L675,18 L660,8 L645,20 L630,4 L615,22 L600,6 L585,18 L570,8 L555,22 L540,4 L525,20 L510,2 L495,16 L480,8 L465,22 L450,4 L435,18 L420,8 L405,22 L390,2 L375,20 L360,8 L345,16 L330,4 L315,22 L300,6 L285,18 L270,8 L255,22 L240,2 L225,20 L210,4 L195,16 L180,8 L165,22 L150,4 L135,18 L120,8 L105,22 L90,2 L75,20 L60,4 L45,16 L30,8 L15,22 L0,6 Z';
  const topPath    = 'M0,24 H1200 V18 L1185,4 L1170,20 L1155,2 L1140,16 L1125,4 L1110,22 L1095,6 L1080,16 L1065,2 L1050,20 L1035,4 L1020,18 L1005,2 L990,20 L975,6 L960,16 L945,2 L930,22 L915,8 L900,16 L885,4 L870,20 L855,2 L840,16 L825,6 L810,22 L795,2 L780,18 L765,4 L750,20 L735,8 L720,16 L705,2 L690,22 L675,6 L660,16 L645,4 L630,20 L615,2 L600,18 L585,6 L570,16 L555,2 L540,20 L525,4 L510,22 L495,8 L480,16 L465,2 L450,20 L435,6 L420,16 L405,2 L390,22 L375,4 L360,16 L345,8 L330,20 L315,2 L300,18 L285,6 L270,16 L255,2 L240,22 L225,4 L210,20 L195,8 L180,16 L165,2 L150,20 L135,6 L120,16 L105,2 L90,22 L75,4 L60,20 L45,8 L30,16 L15,2 L0,18 Z';
  const path = side === 'top' ? topPath : bottomPath;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="24" viewBox="0 0 1200 24" preserveAspectRatio="none"><path d="${path}" fill="${fillColor}"/></svg>`;
  // btoa exists in modern browsers and Node 16+. Fallback only triggers in
  // exotic environments — shouldn't fire in production.
  try {
    const b64 = typeof btoa !== 'undefined'
      ? btoa(svg)
      : (typeof Buffer !== 'undefined' ? Buffer.from(svg, 'utf-8').toString('base64') : '');
    return `data:image/svg+xml;base64,${b64}`;
  } catch {
    // Last-resort: percent-encoded utf-8 — still works in most clients.
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}

/**
 * Grunge brush-stroke overlay for the branded header. Renders 5 diagonal
 * parallelogram "slashes" plus subtle noise dots in the brand's accent colour
 * on a transparent background — designed to sit on top of the TD's dark
 * panelBg so the accent pops like spray-painted gold on a black ribbon.
 *
 * Used as a CSS background-image on the header TD. Gmail, Apple Mail, iOS
 * Mail, Yahoo honour it. Outlook ignores it and shows the solid panelBg
 * colour with the logo centred on top — acceptable graceful fallback.
 */
function buildGrungeHeaderBgSvg(accentColor: string): string {
  // Redesigned to match the reference: the logo is the focal point; the gold
  // reads as atmospheric ink-splash paint FRAMING the logo rather than a
  // dense grid of parallel stripes. Technique:
  //   1. Two broad "washes" at reduced opacity (~0.55–0.65) on top/bottom so
  //      they look absorbed into the paper, not solid paint.
  //   2. Each wash is BROKEN INTO FRAGMENTS with gaps — more natural than a
  //      continuous streak.
  //   3. Fragments have strong y-jitter (±6px) so edges are obviously rough.
  //   4. Stroke body leaves a softer zone around the centre (x≈240–360) so
  //      the logo / wordmark sits in a calmer patch.
  //   5. Dense spatter of varied-radius dots across the whole panel for grunge.
  // Group is rotated -16° for a diagonal axis. Viewport 600×180, pivot (300,90).

  const fragments: Array<{ pts: string; op: number }> = [
    // ── Top band — 3 fragments with gaps ─────────────────────────────────
    { op: 0.6, pts:
      '-50,28 10,18 70,22 130,16 200,20 240,30 ' +
      '230,46 190,52 130,48 70,52 10,46 -50,52'
    },
    // (gap between x≈240 and x≈360 — leaves the logo zone calm)
    { op: 0.55, pts:
      '360,28 410,20 480,16 540,22 610,18 660,26 ' +
      '640,48 570,50 500,46 430,52 370,48'
    },
    { op: 0.4, pts:
      '270,14 300,10 340,14 350,24 320,30 280,28'
    },

    // ── Middle band — broad washed stroke, two fragments, low opacity ───
    { op: 0.5, pts:
      '-60,92 -10,82 60,78 140,80 210,76 260,84 ' +
      '240,108 180,110 100,106 20,108 -60,114'
    },
    { op: 0.55, pts:
      '330,80 400,72 490,76 570,72 650,80 ' +
      '640,104 560,106 480,104 390,108 340,104'
    },

    // ── Bottom band — one long broken fragment + a splash ────────────────
    { op: 0.58, pts:
      '-40,140 30,128 120,132 210,126 290,134 360,140 ' +
      '340,158 260,162 180,158 100,162 30,158 -40,162'
    },
    { op: 0.5, pts:
      '440,146 500,138 560,142 620,148 ' +
      '600,164 540,166 480,162 440,164'
    },
    // Bottom accent splash (mid)
    { op: 0.45, pts:
      '280,150 320,144 360,152 340,166 300,164 270,158'
    },
  ];

  const fragmentsSvg = fragments.map(s =>
    `<polygon points="${s.pts}" fill="${accentColor}" opacity="${s.op}"/>`
  ).join('');

  // Dense spatter — varied sizes for grunge texture. Bigger blobs act as
  // "paint droplets", smaller dots are ink mist.
  const dots: Array<[number, number, number, number]> = [
    // Larger droplets
    [50, 40, 3.2, 0.55], [260, 30, 2.8, 0.5],  [410, 24, 3.0, 0.55], [560, 38, 2.6, 0.5],
    [30, 120, 2.8, 0.5],  [210, 108, 2.4, 0.45], [380, 116, 3.0, 0.55], [540, 124, 2.6, 0.5],
    [120, 160, 2.4, 0.5], [410, 168, 2.2, 0.45],
    // Medium specks
    [90, 60, 1.6, 0.4],   [180, 70, 1.4, 0.35],  [320, 58, 1.5, 0.4],  [470, 66, 1.6, 0.4],
    [60, 92, 1.4, 0.35],  [240, 140, 1.6, 0.4],  [350, 94, 1.5, 0.38], [500, 144, 1.4, 0.35],
    [580, 100, 1.6, 0.4], [14, 70, 1.4, 0.35],   [150, 128, 1.5, 0.38], [330, 130, 1.3, 0.35],
    [470, 130, 1.5, 0.38], [590, 150, 1.4, 0.35],
    // Fine mist
    [40, 10, 0.9, 0.3],   [110, 100, 0.9, 0.28], [200, 40, 1.0, 0.3],  [290, 100, 0.9, 0.28],
    [380, 40, 1.0, 0.32], [460, 100, 0.9, 0.28], [550, 60, 1.0, 0.3],  [28, 160, 0.9, 0.28],
    [170, 170, 1.0, 0.3], [310, 10, 1.0, 0.3],   [450, 10, 0.9, 0.28], [590, 170, 1.0, 0.3],
    [240, 80, 0.8, 0.26], [360, 72, 0.9, 0.28],  [90, 170, 0.9, 0.3],  [520, 82, 0.8, 0.26],
  ];
  const dotsSvg = dots.map(([x, y, r, op]) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${accentColor}" opacity="${op}"/>`
  ).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180" viewBox="0 0 600 180" preserveAspectRatio="xMidYMid slice">` +
    `<g transform="rotate(-16 300 90)">${fragmentsSvg}</g>${dotsSvg}` +
    `</svg>`;
  try {
    const b64 = typeof btoa !== 'undefined'
      ? btoa(svg)
      : (typeof Buffer !== 'undefined' ? Buffer.from(svg, 'utf-8').toString('base64') : '');
    return `data:image/svg+xml;base64,${b64}`;
  } catch {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}

const FONT_STACK = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";

export function buildEmailHtml(params: BuildEmailHtmlParams): string {
  // Atlanta-newsletter variant is a fully separate template layout —
  // dispatch early so the image-hero/brand-only code below stays untouched.
  if (params.variant === 'atlanta-newsletter') {
    return buildAtlantaNewsletterHtml(params);
  }

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

  // ── Branded header ───────────────────────────────────────────────────
  // When header_url is set (AI-generated composite: texture + logo), render
  // it as a single full-width <img> — Atlassian style: flush to the container
  // edges, no padding, no extra markup. Works identically in every client.
  //
  // Falls back to the SVG grunge approach when header_url is absent (brands
  // that haven't been composited yet, or dev environments without assets).
  const cfg_header = cfg.header_url || '';

  let topTornHtml   = '';
  let headerBarHtml = '';
  let tornEdgeHtml  = '';

  if (cfg_header) {
    // ── NEW: single composite image header ────────────────────────────
    headerBarHtml = [
      '<tr>',
      '  <td style="padding:0;line-height:0;font-size:0;">',
      `    <img src="${escapeHtml(cfg_header)}" alt="${escapeHtml(brand || 'Header')}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;" />`,
      '  </td>',
      '</tr>',
    ].join('\n');
  } else {
    // ── FALLBACK: SVG grunge + torn edges (no header_url yet) ─────────
    const headerBg    = style.panelBg       || '#172b4d';
    const strokeColor = style.accentColor   || '#ffffff';
    const headerText  = style.headlineColor || '#ffffff';
    const grungeBgUrl = buildGrungeHeaderBgSvg(strokeColor);
    const logoUrl     = formData.secondaryLogoUrl.trim() || (cfg.logo_url || '');

    topTornHtml = (logoUrl || brand)
      ? [
          '<tr>',
          '  <td style="padding:0;line-height:0;font-size:0;background-color:#ffffff;">',
          `    <img src="${buildTornEdgeDataUri(headerBg, 'top')}" alt="" width="600" height="18" style="display:block;width:100%;max-width:600px;height:18px;border:0;outline:none;" />`,
          '  </td>',
          '</tr>',
        ].join('\n')
      : '';

    headerBarHtml = logoUrl
      ? [
          '<tr>',
          `  <td align="center" bgcolor="${headerBg}" style="background-color:${headerBg};background-image:url('${grungeBgUrl}');background-repeat:no-repeat;background-size:cover;background-position:center center;padding:54px 24px 46px 24px;line-height:0;font-size:0;">`,
          `    <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brand || 'Logo')}" height="72" style="display:inline-block;height:72px;width:auto;border:0;outline:none;" />`,
          '  </td>',
          '</tr>',
        ].join('\n')
      : (brand
          ? [
              '<tr>',
              `  <td align="center" bgcolor="${headerBg}" style="background-color:${headerBg};background-image:url('${grungeBgUrl}');background-repeat:no-repeat;background-size:cover;background-position:center center;padding:52px 24px 44px 24px;font-family:${FONT_STACK};font-size:26px;font-weight:800;letter-spacing:0.16em;color:${headerText};text-transform:uppercase;">`,
              `    ${escapeHtml(brand)}`,
              '  </td>',
              '</tr>',
            ].join('\n')
          : '');

    tornEdgeHtml = headerBarHtml
      ? [
          '<tr>',
          '  <td style="padding:0;line-height:0;font-size:0;background-color:#ffffff;">',
          `    <img src="${buildTornEdgeDataUri(headerBg, 'bottom')}" alt="" width="600" height="24" style="display:block;width:100%;max-width:600px;height:24px;border:0;outline:none;" />`,
          '  </td>',
          '</tr>',
        ].join('\n')
      : '';
  }

  // wordmarkHtml — brand wordmark image below the hero.
  //   • wordmark_dark_bg=false → plain white background, white text pixels
  //     were already recoloured to black upstream, no pill.
  //   • wordmark_dark_bg=true  → wordmark sits in a compact dark brand-
  //     coloured pill (only as wide as the logo needs) so light-coloured
  //     logos (gold, cyan) stay legible.
  const wmPanel = style.panelBg || '#0F0800';
  // Dark-bg brands: the halo is already baked into the wordmark PNG by the
  // upstream loader, so both branches render the same flat <img> — no box.
  const wordmarkHtml = cfg.wordmark_url
    ? [
        '<tr>',
        '  <td align="center" style="background-color:#ffffff;padding:28px 40px 32px 40px;line-height:0;font-size:0;">',
        `    <img src="${escapeHtml(cfg.wordmark_url)}" alt="${escapeHtml(brand || 'Brand')}" style="display:inline-block;max-width:240px;height:auto;border:0;outline:none;" />`,
        '  </td>',
        '</tr>',
      ].join('\n')
    : (brand
        ? [
            '<tr>',
            `  <td align="center" style="background-color:#ffffff;padding:28px 40px 32px 40px;font-family:${style.fontFamily};">`,
            `    <span style="display:inline-block;font-size:26px;font-weight:800;color:${style.panelBg || '#000000'};letter-spacing:0.06em;font-family:${style.fontFamily};">${escapeHtml(brand)}</span>`,
            '  </td>',
            '</tr>',
          ].join('\n')
        : '');

  // ── Content block ───────────────────────────────────────────────────
  const headlineHtml = formData.headline.trim()
    ? `<h1 style="margin:0 0 16px 0;font-size:28px;line-height:1.3;font-weight:700;color:${INK_HEADLINE};letter-spacing:-0.01em;font-family:${FONT_STACK};">${escapeHtml(formData.headline)}</h1>`
    : '';

  const introHtml = buildIntroParagraph(formData);
  const bodyHtml = formData.bodyText.trim()
    ? `<p style="margin:0 0 28px 0;font-size:16px;line-height:1.6;color:${INK_BODY};font-family:${FONT_STACK};">${escapeHtml(formData.bodyText)}</p>`
    : '';

  const hasCopy = !!(headlineHtml || introHtml || bodyHtml);
  const contentHtml = hasCopy
    ? [
        '<tr>',
        `  <td class="card-wrap" style="background-color:#ffffff;padding:20px 40px 24px 40px;font-family:${FONT_STACK};">`,
        `    ${headlineHtml}`,
        `    ${introHtml}`,
        `    ${bodyHtml}`,
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
    '      <td align="center" style="padding:0 0 40px 0;">',
    `        <table role="presentation" class="email-container" width="${containerWidth}" cellspacing="0" cellpadding="0" border="0" style="width:${containerWidth}px;max-width:100%;background-color:#ffffff;border-radius:0 0 12px 12px;overflow:hidden;">`,
    // Top torn-paper edge — white paper tears to reveal the dark header
    `          ${topTornHtml}`,
    // Header (dark brand panel + gold brush-strokes + centered logo)
    `          ${headerBarHtml}`,
    // Bottom torn-paper edge separating the header from the white content
    `          ${tornEdgeHtml}`,
    // Content block — headline + intro + body
    `          ${contentHtml}`,
    // Hero banner — sits after the body text, full-bleed inside the container
    `          ${heroHtml}`,
    // Brand wordmark centered — replaces CTA button, sits after the hero
    `          ${wordmarkHtml}`,
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
 * Atlanta-Insiders-style newsletter template (Gemini reference).
 *
 * Layout (Atlassian-style header with torn edge → text-forward body):
 *   1. Branded header panel: brand panelBg background + brand logo centred
 *   2. Torn-paper edge tearing from header colour down into white content
 *   3. Body copy (intro + inline link, then body paragraph)  — 12px Arial
 *   4. AI-generated image (the user-converted image)         — centred
 *   5. Social links row (pipe-separated, primary colour)
 *   6. Black 1px horizontal divider
 *   7. Two-column footer table: unsubscribe copy (left) + sponsor slot (right)
 *
 * This variant has NO headline and NO CTA button — it's a text-forward
 * newsletter format. Users who want a call-to-action button should pick
 * one of the other variants.
 */
function buildAtlantaNewsletterHtml(params: BuildEmailHtmlParams): string {
  const { imageSrc, brand, formData } = params;
  const cfg = params.staticConfig || {};
  const style: BrandStyle = getBrandStyle(brand);
  const primary    = style.accentColor   || '#0052cc';
  const headerBg   = style.panelBg       || '#172b4d';
  const headerText = style.headlineColor || '#ffffff';
  const containerWidth = 600;
  const brandName = brand || 'Brand';

  // The logo shown IN the branded header panel (Atlassian-style).
  const logoUrl = formData.secondaryLogoUrl.trim() || cfg.logo_url || '';
  // The AI-generated image that sits AFTER the body text.
  const generatedImage = imageSrc || '';

  const websiteUrl = safeUrl(formData.websiteUrl.trim() || cfg.website_url || '');
  const unsubUrl   = safeUrl(formData.unsubscribeUrl.trim() || cfg.unsubscribe_url || '');

  // Intro paragraph with optional inline link (supports {link} placeholder).
  const intro     = formData.introText.trim();
  const linkText  = formData.linkText.trim();
  const linkUrl   = safeUrl(formData.linkUrl.trim() || websiteUrl || '');
  const linkStyle = `color:${primary};text-decoration:underline;`;
  let introInner = '';
  if (intro) {
    const anchor = linkText ? `<a href="${escapeHtml(linkUrl)}" style="${linkStyle}">${escapeHtml(linkText)}</a>` : '';
    if (linkText && intro.includes('{link}')) {
      introInner = escapeHtml(intro).replace('{link}', anchor);
    } else if (linkText) {
      introInner = `${escapeHtml(intro)} ${anchor}`;
    } else {
      introInner = escapeHtml(intro);
    }
  }

  const bodyText = formData.bodyText.trim();
  const textRow = (introInner || bodyText)
    ? [
        '    <tr>',
        '      <td style="padding:16px 20px 20px 20px;font-family:Arial,Helvetica,sans-serif;color:#000000;">',
        introInner
          ? `        <p style="font-size:12px;line-height:1.5;margin:0 0 15px 0;color:#000000;">${introInner}</p>`
          : '',
        bodyText
          ? `        <p style="font-size:12px;line-height:1.5;margin:0;color:#000000;">${escapeHtml(bodyText)}</p>`
          : '',
        '      </td>',
        '    </tr>',
      ].filter(Boolean).join('\n')
    : '';

  // Socials — pipe-separated, primary-colour underlined.
  const socialEntries = [
    { label: 'Facebook',  url: formData.facebookUrl.trim()  },
    { label: 'Twitter',   url: formData.twitterUrl.trim()   },
    { label: 'Instagram', url: formData.instagramUrl.trim() },
    { label: 'Website',   url: formData.websiteUrl.trim() || cfg.website_url || '' },
  ].filter(e => e.url);
  const socialHtml = socialEntries.length
    ? socialEntries.map((e, i) => {
        const a = `<a href="${escapeHtml(safeUrl(e.url))}" style="color:${primary};text-decoration:underline;">${e.label}</a>`;
        return i === 0 ? a : `<span style="color:#000000;margin:0 5px;">|</span>${a}`;
      }).join('')
    : '';

  const unsubRow = unsubUrl
    ? `To unsubscribe from this particular email, <a href="${escapeHtml(unsubUrl)}" style="color:${primary};text-decoration:underline;">click here</a>.`
    : '';

  // ── Header: composite image when available, SVG grunge fallback ─────
  const cfg_header = cfg.header_url || '';

  let brandedHeader: string;
  let topTornEdge = '';
  let tornEdge    = '';

  if (cfg_header) {
    // Single full-width composite image — Atlassian style, no overflow
    brandedHeader = [
      '    <tr>',
      '      <td style="padding:0;line-height:0;font-size:0;">',
      `        <img src="${escapeHtml(cfg_header)}" alt="${escapeHtml(brandName)}" width="${containerWidth}" style="display:block;width:100%;max-width:${containerWidth}px;height:auto;border:0;outline:none;" />`,
      '      </td>',
      '    </tr>',
    ].join('\n');
  } else {
    // Fallback: SVG grunge + torn edges
    const grungeBgUrl = buildGrungeHeaderBgSvg(primary);

    brandedHeader = logoUrl
      ? [
          '    <tr>',
          `      <td align="center" bgcolor="${headerBg}" style="background-color:${headerBg};background-image:url('${grungeBgUrl}');background-repeat:no-repeat;background-size:cover;background-position:center center;padding:54px 24px 46px 24px;line-height:0;font-size:0;">`,
          `        <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" height="72" style="display:inline-block;height:72px;width:auto;border:0;outline:none;" />`,
          '      </td>',
          '    </tr>',
        ].join('\n')
      : [
          '    <tr>',
          `      <td align="center" bgcolor="${headerBg}" style="background-color:${headerBg};background-image:url('${grungeBgUrl}');background-repeat:no-repeat;background-size:cover;background-position:center center;padding:52px 24px 44px 24px;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:800;letter-spacing:0.16em;color:${headerText};text-transform:uppercase;">`,
          `        ${escapeHtml(brandName)}`,
          '      </td>',
          '    </tr>',
        ].join('\n');

    topTornEdge = [
      '    <tr>',
      '      <td style="padding:0;line-height:0;font-size:0;background-color:#ffffff;">',
      `        <img src="${buildTornEdgeDataUri(headerBg, 'top')}" alt="" width="${containerWidth}" height="18" style="display:block;width:100%;max-width:${containerWidth}px;height:18px;border:0;outline:none;" />`,
      '      </td>',
      '    </tr>',
    ].join('\n');

    tornEdge = [
      '    <tr>',
      '      <td style="padding:0;line-height:0;font-size:0;background-color:#ffffff;">',
      `        <img src="${buildTornEdgeDataUri(headerBg, 'bottom')}" alt="" width="${containerWidth}" height="24" style="display:block;width:100%;max-width:${containerWidth}px;height:24px;border:0;outline:none;" />`,
      '      </td>',
      '    </tr>',
    ].join('\n');
  }

  return [
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width,initial-scale=1.0" />',
    '  <meta http-equiv="X-UA-Compatible" content="IE=edge" />',
    `  <title>${escapeHtml(brandName)}</title>`,
    '  <style type="text/css">',
    '    body { margin:0; padding:0; background-color:#ffffff; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }',
    '    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }',
    '    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }',
    '    a, a img { border:0 !important; outline:none !important; }',
    '    @media only screen and (max-width:620px) {',
    '      .email-container { width:100% !important; }',
    '    }',
    '  </style>',
    '</head>',
    `<body style="margin:0;padding:0;background-color:${PAGE_BG};font-family:Arial,Helvetica,sans-serif;color:#000000;">`,
    `  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${PAGE_BG};">`,
    '    <tr>',
    `      <td align="center" style="padding:0 0 40px 0;">`,
    `        <table role="presentation" class="email-container" width="${containerWidth}" cellspacing="0" cellpadding="0" border="0" style="width:${containerWidth}px;max-width:100%;background-color:#ffffff;border-radius:0 0 12px 12px;overflow:hidden;">`,
    // 1. Top torn-paper edge — white paper tears to reveal the dark header
    topTornEdge,
    // 2. Branded header (dark panel + accent brush-strokes + logo)
    brandedHeader,
    // 3. Bottom torn-paper edge
    tornEdge,
    // 4. Brand wordmark centered below header
    cfg.wordmark_url
      ? [
          '          <tr>',
          '            <td align="center" style="background-color:#ffffff;padding:24px 24px 8px 24px;line-height:0;font-size:0;">',
          `              <img src="${escapeHtml(cfg.wordmark_url)}" alt="${escapeHtml(brandName)}" style="display:inline-block;max-width:220px;height:auto;border:0;outline:none;" />`,
          '            </td>',
          '          </tr>',
        ].join('\n')
      : '',
    // 5. Body copy
    textRow,
    // 5. AI-generated image — user's converted image, after the body text
    generatedImage
      ? [
          '          <tr>',
          '            <td align="center" style="padding:10px 20px 30px 20px;">',
          `              <img src="${escapeHtml(generatedImage)}" alt="${escapeHtml(brandName)}" style="max-width:100%;height:auto;display:block;margin:0 auto;border:0;outline:none;" />`,
          '            </td>',
          '          </tr>',
        ].join('\n')
      : '',
    // 6. Socials
    socialHtml
      ? `          <tr><td align="center" style="padding:0 20px 15px 20px;font-size:11px;font-family:Arial,Helvetica,sans-serif;">${socialHtml}</td></tr>`
      : '',
    // 7. Divider
    '          <tr><td style="padding:0 20px 10px 20px;"><div style="border-top:1px solid #000000;font-size:0;line-height:0;height:1px;">&nbsp;</div></td></tr>',
    // 8. Footer: unsubscribe (left) + sponsor slot (right)
    '          <tr>',
    '            <td style="padding:0 20px 20px 20px;">',
    '              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">',
    '                <tr>',
    '                  <td align="left" valign="top" style="font-size:10px;color:#000000;line-height:1.4;font-family:Arial,Helvetica,sans-serif;">',
    `                    This email was sent on behalf of <strong>${escapeHtml(brandName)}</strong>.${unsubRow ? '<br />' : ''}`,
    unsubRow ? `                    ${unsubRow}` : '',
    '                  </td>',
    '                  <td align="right" valign="top" width="120" style="font-size:0;line-height:0;"></td>',
    '                </tr>',
    '              </table>',
    '            </td>',
    '          </tr>',
    '        </table>',
    '      </td>',
    '    </tr>',
    '  </table>',
    '</body>',
    '</html>',
  ].filter(Boolean).join('\n');
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
