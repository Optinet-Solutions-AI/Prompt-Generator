/**
 * build-branded-email.ts — assemble a branded, email-safe HTML email + plain-text twin (PURE)
 *
 * Ported from the Content Variation Studio "branded-email" transfer package.
 * Inputs:  an EmailDoc + a resolved BrandStyle + optional BrandEmailConfig (fall-through defaults)
 * Outputs: { html, text } — 600px table-based inline-CSS email (Gmail/Outlook/Apple safe) + text twin
 */
import type { BrandStyle } from './brand-standards';
import { getBrandLogo } from './brand-logos';
import { getBrandHeader } from './brand-headers';
import type { BlockStyle, BrandEmailConfig, EmailBlock, EmailDoc } from './email-model';

// Ink palette — light (white canvas) or dark. Brand color stays a restrained cue.
interface Palette { headline: string; body: string; muted: string; light: string; line: string; pageBg: string; cardBg: string; footerBg: string }
const LIGHT: Palette = { headline: '#172b4d', body: '#42526e', muted: '#5e6c84', light: '#97a0af', line: '#ebecf0', pageBg: '#ffffff', cardBg: '#ffffff', footerBg: '#fafbfc' };
const DARK: Palette  = { headline: '#FFFFFF', body: '#C7CDD6', muted: '#9AA3B2', light: '#737B8A', line: '#2A303B', pageBg: '#0B0E14', cardBg: '#11151D', footerBg: '#0D1119' };
const FONT_STACK = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";
const WIDTH = 600;

// Localized chrome labels for the few strings the renderer hardcodes (not user
// copy), so a translated email doesn't leak English in the bonus / footer.
interface Labels { useCode: string; unsubscribe: string }
const LABELS: Record<string, Labels> = {
  en: { useCode: 'Use code:', unsubscribe: 'Unsubscribe' },
  de: { useCode: 'Code verwenden:', unsubscribe: 'Abmelden' },
  no: { useCode: 'Bruk kode:', unsubscribe: 'Meld deg av' },
  it: { useCode: 'Usa il codice:', unsubscribe: 'Annulla iscrizione' },
};
const labelsFor = (locale?: string): Labels => LABELS[(locale || 'en').toLowerCase()] || LABELS.en;

// Parse a #rrggbb / #rgb hex into [r,g,b]; returns null if not a hex colour.
function hexRgb(hex = ''): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
// Perceived luminance 0–255 (0 = black, 255 = white).
function luminance(hex: string): number {
  const rgb = hexRgb(hex);
  if (!rgb) return 255;
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
// Nudge a hex colour lighter (+) or darker (-) by `amt` per channel.
function shade(hex: string, amt: number): string {
  const rgb = hexRgb(hex);
  if (!rgb) return hex;
  const c = rgb.map((v) => Math.max(0, Math.min(255, v + amt)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
// Build a palette around a custom email background colour. Ink (headline/body/…)
// flips to the light- or dark-canvas set based on the colour's luminance, so
// text stays readable on any background the user picks.
function paletteForBg(bg: string): Palette {
  const dark = luminance(bg) < 140;
  const base = dark ? DARK : LIGHT;
  return { ...base, pageBg: bg, cardBg: bg, footerBg: shade(bg, dark ? 10 : -6), line: shade(bg, dark ? 26 : -16) };
}

function esc(s = ''): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function safeUrl(u = ''): string {
  const t = u.trim();
  if (!t) return '';
  if (/^(https?:|mailto:|tel:|data:|\/)/i.test(t)) return t;
  return `https://${t}`;
}
const cell = (inner: string) => `<tr><td style="padding:0 32px;">${inner}</td></tr>`;

function spacing(st: BlockStyle, dTop: number, dBottom: number): string {
  return `margin:${st.spaceTop ?? dTop}px 0 ${st.spaceBottom ?? dBottom}px;`;
}

// Global font defaults (from EmailDoc.meta), threaded into every block so the
// font cascade is: per-block override → global default → brand/body fallback.
interface FontDefaults { family?: string; size?: number }

// Resolve a block's font stack: per-block → global default → the given fallback
// (the decorative brand font for headings, or the readable body FONT_STACK).
function famFor(st: BlockStyle, g: FontDefaults, fallback: string): string {
  return st.fontFamily || g.family || fallback;
}
// Resolve weight: bold override (true→700 / false→400) else the block's default.
function weightFor(st: BlockStyle, def: number): number {
  return st.bold === true ? 700 : st.bold === false ? 400 : def;
}
// Italic snippet (empty when not italic) so it can be dropped straight into a style string.
const italicFor = (st: BlockStyle): string => (st.italic ? 'font-style:italic;' : '');

/**
 * Bulletproof, ESP/Outlook-safe CTA button. Outlook's Word engine ignores
 * padding/background on <a>, so it gets a VML <v:roundrect>; every other client
 * gets a padded <a>. Both share the resolved colours/font. VML needs a fixed
 * width, so we estimate one from the label length (rough but safe).
 */
function renderButton(label: string, href: string, bg: string, txt: string, radius: number, family: string, fullWidth: boolean): string {
  const safeLabel = esc(label);
  const w = Math.max(160, label.length * 10 + 64); // px — VML can't auto-size to content
  const aStyle = (fullWidth ? 'display:block;width:100%;box-sizing:border-box;text-align:center;' : 'display:inline-block;')
    + `background:${bg};color:${txt};font-family:${family};font-size:15px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:${radius}px;`;
  return (
    `<!--[if mso]>`
    + `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(href)}" style="height:44px;v-text-anchor:middle;width:${fullWidth ? WIDTH - 64 : w}px;" arcsize="${radius > 22 ? 50 : Math.round((radius / 44) * 100)}%" strokecolor="${bg}" fillcolor="${bg}">`
    + `<w:anchorlock/>`
    + `<center style="color:${txt};font-family:${family};font-size:15px;font-weight:bold;">${safeLabel}</center>`
    + `</v:roundrect>`
    + `<![endif]-->`
    + `<!--[if !mso]><!-- -->`
    + `<a href="${esc(href)}" style="${aStyle}">${safeLabel}</a>`
    + `<!--<![endif]-->`
  );
}

function renderBlock(b: EmailBlock, s: BrandStyle, c: BrandEmailConfig, brand: string, pal: Palette, lbl: Labels, g: FontDefaults): string {
  const st: BlockStyle = b.style ?? {};
  switch (b.type) {
    case 'header': {
      const align = st.align ?? 'center';
      const mode = b.mode ?? 'banner';
      const composite = getBrandHeader(brand) || c.header_url || '';
      // Banner: the full-width composite header image (optionally sized smaller).
      if (mode === 'banner' && composite) {
        const mw = st.width && st.width < WIDTH ? st.width : WIDTH;
        const inset = mw < WIDTH;
        const dt = inset ? 16 : 0;
        const mgn = align === 'left'
          ? `${st.spaceTop ?? dt}px auto ${st.spaceBottom ?? dt}px 0`
          : align === 'right'
          ? `${st.spaceTop ?? dt}px 0 ${st.spaceBottom ?? dt}px auto`
          : `${st.spaceTop ?? dt}px auto ${st.spaceBottom ?? dt}px auto`;
        return `<tr><td align="${align}" style="padding:0 ${inset ? '32px' : '0'};line-height:0;font-size:0;"><img src="${esc(safeUrl(composite))}" alt="${esc(brand)}" width="${mw}" style="display:block;width:100%;max-width:${mw}px;height:auto;border:0;outline:none;margin:${mgn};border-radius:${st.radius ?? 0}px;-ms-interpolation-mode:bicubic;"/></td></tr>`;
      }
      // Text: brand wordmark on a panel.
      if (mode === 'text') {
        return `<tr><td align="${align}" style="background:${st.background || s.panelBg};padding:26px 32px;text-align:${align};"><span style="font-family:${famFor(st, g, s.fontFamily)};font-size:${st.fontSize ?? 24}px;font-weight:${weightFor(st, 700)};${italicFor(st)}color:${st.color || s.headlineColor};letter-spacing:.04em;">${esc(brand)}</span></td></tr>`;
      }
      // Logo (and banner fallback when no composite exists): a sized, positioned logo.
      const logo = b.logoUrl || getBrandLogo(brand) || c.logo_url || '';
      const lw = st.width ?? 180;
      const pad = st.logoPad ?? 12;
      const m = `margin:${st.spaceTop ?? 0}px 0 ${st.spaceBottom ?? 0}px;`;
      // The logo sits on a padded CARD (default white) so it stays visible even when the
      // email background is the same colour as the logo. The card floats on the canvas
      // tone (pal.cardBg). A bare wordmark (no logo) keeps the dark brand panel.
      const inner = logo
        ? `<span style="display:inline-block;${m}background:${st.background || '#ffffff'};padding:${pad}px ${pad + 8}px;border-radius:${st.radius ?? 8}px;"><img src="${esc(safeUrl(logo))}" alt="${esc(brand)}" width="${lw}" style="display:block;border:0;width:${lw}px;max-width:100%;height:auto;-ms-interpolation-mode:bicubic;"/></span>`
        : `<span style="display:inline-block;${m}font-family:${famFor(st, g, s.fontFamily)};font-size:${st.fontSize ?? 24}px;font-weight:${weightFor(st, 700)};${italicFor(st)}color:${st.color || s.headlineColor};letter-spacing:.04em;">${esc(brand)}</span>`;
      const tdBg = logo ? pal.cardBg : (st.background || s.panelBg);
      return `<tr><td align="${align}" style="background:${tdBg};padding:24px 32px;text-align:${align};">${inner}</td></tr>`;
    }
    case 'hero': {
      const src = b.mode === 'banner' ? (c.banner_url || '') : b.mode === 'url' ? (b.url || '') : '';
      if (b.mode === 'css' || !src) {
        // CSS hero: a solid panel + brand wordmark. Background, text colour and
        // alignment are all overridable so it can be white / any colour and
        // left / center / right aligned.
        const align = st.align ?? 'center';
        const bg = st.background || s.panelBg;
        const txt = st.color || s.accentColor;
        const m = `margin:${st.spaceTop ?? 0}px 0 ${st.spaceBottom ?? 0}px;`;
        return `<tr><td align="${align}" style="background:${bg};padding:32px;text-align:${align};">` +
          `<span style="display:inline-block;${m}font-family:${famFor(st, g, s.fontFamily)};font-size:${st.fontSize ?? 28}px;font-weight:${weightFor(st, 800)};${italicFor(st)}color:${txt};letter-spacing:.04em;">${esc(brand)}</span></td></tr>`;
      }
      const mw = st.width ?? 340;
      const align = st.align ?? 'center';
      // Vertical spacing as margin (supports negative); horizontal margin aligns the image.
      const mgn = align === 'left'
        ? `${st.spaceTop ?? 20}px auto ${st.spaceBottom ?? 4}px 0`
        : align === 'right'
        ? `${st.spaceTop ?? 20}px 0 ${st.spaceBottom ?? 4}px auto`
        : `${st.spaceTop ?? 20}px auto ${st.spaceBottom ?? 4}px auto`;
      return `<tr><td align="${align}" style="padding:0 32px;"><img src="${esc(safeUrl(src))}" alt="${esc(brand)}" width="${mw}" style="display:block;border:0;width:100%;max-width:${mw}px;height:auto;margin:${mgn};border-radius:${st.radius ?? 10}px;-ms-interpolation-mode:bicubic;"/></td></tr>`;
    }
    case 'heading':
      return cell(`<h1 style="${spacing(st, 24, 0)}font-family:${famFor(st, g, s.fontFamily)};font-size:${st.fontSize ?? 24}px;font-weight:${weightFor(st, 700)};${italicFor(st)}line-height:1.3;color:${st.color || pal.headline};text-align:${st.align ?? 'left'};">${esc(b.text)}</h1>`);
    case 'paragraph':
      return cell(`<p style="${spacing(st, 14, 0)}font-family:${famFor(st, g, FONT_STACK)};font-size:${st.fontSize ?? g.size ?? 15}px;${st.bold ? 'font-weight:700;' : ''}${italicFor(st)}line-height:1.65;color:${st.color || pal.body};text-align:${st.align ?? 'left'};">${esc(b.text).replace(/\n/g, '<br/>')}</p>`);
    case 'bonus': {
      const code = b.code
        ? `<div style="margin-top:8px;font-family:${FONT_STACK};font-size:13px;color:${pal.muted};">${esc(lbl.useCode)} <strong style="color:${s.accentColor};">${esc(b.code)}</strong></div>`
        : '';
      // Accent rule side: explicit ruleSide wins; fall back to legacy hideRule.
      const side = st.ruleSide ?? (st.hideRule ? 'none' : 'left');
      const rule = side === 'right'
        ? `border-right:3px solid ${s.accentColor};`
        : side === 'none'
        ? ''
        : `border-left:3px solid ${s.accentColor};`;
      return cell(`<div style="${spacing(st, 20, 0)}${rule}background:${st.background || pal.footerBg};padding:14px 18px;text-align:${st.align ?? 'left'};">` +
        `<div style="font-family:${famFor(st, g, s.fontFamily)};font-size:${st.fontSize ?? 18}px;font-weight:${weightFor(st, 700)};${italicFor(st)}color:${st.color || pal.headline};">${esc(b.offer)}</div>${code}</div>`);
    }
    case 'cta': {
      const href = safeUrl(b.url) || '#';
      // Colours: per-block override → brand default. Button is built bulletproof
      // (VML for Outlook + padded <a> elsewhere) so it survives every client/ESP.
      const btnBg = st.buttonBg || s.buttonBg;
      const btnTxt = st.buttonColor || s.buttonText;
      const fam = famFor(st, g, s.fontFamily);
      return cell(`<div style="text-align:${st.align ?? 'center'};${spacing(st, 26, 6)}">` +
        renderButton(b.label, href, btnBg, btnTxt, st.radius ?? 6, fam, !!st.fullWidth) + `</div>`);
    }
    case 'divider':
      return cell(`<div style="border-top:1px solid ${st.color || pal.line};${spacing(st, 24, 0)}"></div>`);
    case 'wordmark': {
      const mark = `<span style="font-family:${famFor(st, g, s.fontFamily)};font-size:${st.fontSize ?? 20}px;font-weight:${weightFor(st, 700)};${italicFor(st)}color:${st.color || s.accentColor};letter-spacing:.04em;">${esc(brand)}</span>`;
      const inner = c.wordmark_dark_bg
        ? `<span style="display:inline-block;background:${s.panelBg};padding:8px 16px;border-radius:6px;">${mark}</span>`
        : mark;
      return cell(`<div style="text-align:${st.align ?? 'center'};${spacing(st, 24, 0)}">${inner}</div>`);
    }
    case 'social': {
      const links = ([
        ['Facebook', b.facebook], ['Twitter', b.twitter], ['Instagram', b.instagram], ['Website', b.website || c.website_url || ''],
      ] as [string, string | undefined | null][]).filter((x) => x[1]) as [string, string][];
      if (!links.length) return '';
      const items = links
        .map(([n, u]) => `<a href="${esc(safeUrl(u))}" style="color:${s.accentColor};text-decoration:none;">${n}</a>`)
        .join(' <span style="color:#c1c7d0;">|</span> ');
      return cell(`<div style="text-align:${st.align ?? 'center'};${spacing(st, 24, 0)}font-family:${famFor(st, g, FONT_STACK)};font-size:${st.fontSize ?? 13}px;${italicFor(st)}color:${pal.muted};">${items}</div>`);
    }
    case 'footer': {
      const attribution = b.attribution || c.footer_attribution || '';
      const legal = b.legal || c.legal_text || '';
      const unsub = safeUrl(b.unsubscribeUrl || c.unsubscribe_url || '');
      const unsubLine = unsub
        ? `<div style="margin-top:8px;"><a href="${esc(unsub)}" style="color:${pal.muted};text-decoration:underline;">${esc(lbl.unsubscribe)}</a></div>`
        : '';
      const fAlign = st.align ?? 'left';
      return `<tr><td style="background:${pal.footerBg};border-top:2px solid ${s.accentColor};padding:22px 32px;font-family:${famFor(st, g, FONT_STACK)};font-size:${st.fontSize ?? 12}px;${italicFor(st)}line-height:1.6;color:${st.color || pal.light};text-align:${fAlign};">` +
        (attribution ? `<div style="color:${st.color || pal.muted};">${esc(attribution)}</div>` : '') +
        (legal ? `<div style="margin-top:6px;">${esc(legal)}</div>` : '') +
        unsubLine + `</td></tr>`;
    }
    default:
      return '';
  }
}

function blockText(b: EmailBlock, c: BrandEmailConfig, brand: string, lbl: Labels): string {
  switch (b.type) {
    case 'header': return brand;
    case 'heading': return b.text;
    case 'paragraph': return b.text;
    case 'bonus': return b.offer + (b.code ? `\n${lbl.useCode} ${b.code}` : '');
    case 'cta': return `${b.label}: ${safeUrl(b.url)}`;
    case 'wordmark': return brand;
    case 'social': {
      const links = ([
        ['Facebook', b.facebook], ['Twitter', b.twitter], ['Instagram', b.instagram], ['Website', b.website || c.website_url || ''],
      ] as [string, string | undefined | null][]).filter((x) => x[1]) as [string, string][];
      return links.map(([n, u]) => `${n}: ${safeUrl(u)}`).join('\n');
    }
    case 'footer': {
      const parts = [b.attribution || c.footer_attribution, b.legal || c.legal_text].filter(Boolean) as string[];
      const unsub = safeUrl(b.unsubscribeUrl || c.unsubscribe_url || '');
      if (unsub) parts.push(`${lbl.unsubscribe}: ${unsub}`);
      return parts.join('\n');
    }
    default: return '';
  }
}

export function buildBrandedEmail(
  doc: EmailDoc,
  style: BrandStyle,
  config: BrandEmailConfig = {},
): { html: string; text: string } {
  const brand = doc.meta.brand || 'Brand';
  // Custom background colour (if set) wins over the Light/Dark toggle.
  const pal = doc.meta.bgColor ? paletteForBg(doc.meta.bgColor) : doc.meta.dark ? DARK : LIGHT;
  const lbl = labelsFor(doc.meta.locale);
  // Global font defaults — threaded into every block so per-block style can override them.
  const g: FontDefaults = { family: doc.meta.fontFamily || undefined, size: doc.meta.fontSize };
  const blocksHtml = doc.blocks.map((b) => renderBlock(b, style, config, brand, pal, lbl, g)).join('');
  const fontHref = `https://fonts.googleapis.com/css2?family=${style.googleFont}&display=swap`;
  // ESP/Outlook-hardened scaffold:
  //  • MSO OfficeDocumentSettings → correct Outlook (Word engine) DPI scaling
  //  • x-apple-disable-message-reformatting / format-detection → stop client auto-rewrites
  //  • <style> kept ONLY for the @media mobile rule + minimal resets; every visual style is
  //    inline (importers strip <head> CSS), and resets are also duplicated inline on <body>
  //  • bgcolor attributes alongside inline background (some clients drop CSS background)
  //  • [if mso] ghost table forces the 600px container width in Outlook
  //  • web font is progressive enhancement only — every font-family carries a full fallback
  const html =
`<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="x-apple-disable-message-reformatting"/>
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no"/>
<title>${esc(doc.meta.subject || brand)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<link href="${esc(fontHref)}" rel="stylesheet"/>
<style>body{margin:0;padding:0;background:${pal.pageBg};}table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}a{text-decoration:none;}@media (max-width:620px){.container{width:100%!important;}}</style>
</head><body style="margin:0;padding:0;background:${pal.pageBg};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(doc.meta.preheader || '')}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${pal.pageBg}" style="background:${pal.pageBg};"><tr><td align="center" style="padding:24px 0;">
<!--[if mso]><table role="presentation" width="${WIDTH}" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="container" width="${WIDTH}" cellspacing="0" cellpadding="0" border="0" bgcolor="${pal.cardBg}" style="width:${WIDTH}px;max-width:${WIDTH}px;background:${pal.cardBg};border-radius:0 0 8px 8px;overflow:hidden;">
${blocksHtml}
<tr><td style="height:28px;"></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  const text = doc.blocks.map((b) => blockText(b, config, brand, lbl)).filter(Boolean).join('\n\n');
  return { html, text };
}
