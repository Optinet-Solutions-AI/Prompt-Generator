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

// Neutral ink palette — body sits on a white canvas; brand color is a restrained cue.
const INK_HEADLINE = '#172b4d';
const INK_BODY = '#42526e';
const INK_MUTED = '#5e6c84';
const INK_LIGHT = '#97a0af';
const LINE_COLOR = '#ebecf0';
const PAGE_BG = '#ffffff';
const FOOTER_BG = '#fafbfc';
const FONT_STACK = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";
const WIDTH = 600;

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

function renderBlock(b: EmailBlock, s: BrandStyle, c: BrandEmailConfig, brand: string): string {
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
        return `<tr><td align="${align}" style="background:${st.background || s.panelBg};padding:26px 32px;text-align:${align};"><span style="font-family:${s.fontFamily};font-size:${st.fontSize ?? 24}px;font-weight:700;color:${st.color || s.headlineColor};letter-spacing:.04em;">${esc(brand)}</span></td></tr>`;
      }
      // Logo (and banner fallback when no composite exists): a sized, positioned logo.
      const logo = b.logoUrl || getBrandLogo(brand) || c.logo_url || '';
      const lw = st.width ?? 180;
      // A logo sits on white (safe for any logo colour); a bare wordmark uses the dark brand panel.
      const bg = st.background || (logo ? '#ffffff' : s.panelBg);
      const m = `margin:${st.spaceTop ?? 0}px 0 ${st.spaceBottom ?? 0}px;`;
      const inner = logo
        ? `<img src="${esc(safeUrl(logo))}" alt="${esc(brand)}" width="${lw}" style="display:inline-block;${m}border:0;width:${lw}px;max-width:80%;height:auto;-ms-interpolation-mode:bicubic;"/>`
        : `<span style="display:inline-block;${m}font-family:${s.fontFamily};font-size:${st.fontSize ?? 24}px;font-weight:700;color:${st.color || s.headlineColor};letter-spacing:.04em;">${esc(brand)}</span>`;
      return `<tr><td align="${align}" style="background:${bg};padding:24px 32px;text-align:${align};">${inner}</td></tr>`;
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
          `<span style="display:inline-block;${m}font-family:${s.fontFamily};font-size:${st.fontSize ?? 28}px;font-weight:800;color:${txt};letter-spacing:.04em;">${esc(brand)}</span></td></tr>`;
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
      return cell(`<h1 style="${spacing(st, 24, 0)}font-family:${s.fontFamily};font-size:${st.fontSize ?? 24}px;line-height:1.3;color:${st.color || INK_HEADLINE};text-align:${st.align ?? 'left'};">${esc(b.text)}</h1>`);
    case 'paragraph':
      return cell(`<p style="${spacing(st, 14, 0)}font-family:${FONT_STACK};font-size:${st.fontSize ?? 15}px;line-height:1.65;color:${st.color || INK_BODY};text-align:${st.align ?? 'left'};">${esc(b.text).replace(/\n/g, '<br/>')}</p>`);
    case 'bonus': {
      const code = b.code
        ? `<div style="margin-top:8px;font-family:${FONT_STACK};font-size:13px;color:${INK_MUTED};">Use code: <strong style="color:${s.accentColor};">${esc(b.code)}</strong></div>`
        : '';
      const rule = st.hideRule ? '' : `border-left:3px solid ${s.accentColor};`;
      return cell(`<div style="${spacing(st, 20, 0)}${rule}background:${st.background || FOOTER_BG};padding:14px 18px;text-align:${st.align ?? 'left'};">` +
        `<div style="font-family:${s.fontFamily};font-size:${st.fontSize ?? 18}px;font-weight:700;color:${st.color || INK_HEADLINE};">${esc(b.offer)}</div>${code}</div>`);
    }
    case 'cta': {
      const href = safeUrl(b.url) || '#';
      const disp = st.fullWidth
        ? 'display:block;width:100%;box-sizing:border-box;text-align:center;'
        : 'display:inline-block;';
      return cell(`<div style="text-align:${st.align ?? 'center'};${spacing(st, 26, 6)}"><a href="${esc(href)}" style="${disp}background:${s.buttonBg};color:${s.buttonText};font-family:${s.fontFamily};font-size:${st.fontSize ?? 15}px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:${st.radius ?? 6}px;box-shadow:0 6px 18px ${s.buttonShadow};">${esc(b.label)}</a></div>`);
    }
    case 'divider':
      return cell(`<div style="border-top:1px solid ${st.color || LINE_COLOR};${spacing(st, 24, 0)}"></div>`);
    case 'wordmark': {
      const mark = `<span style="font-family:${s.fontFamily};font-size:${st.fontSize ?? 20}px;font-weight:700;color:${st.color || s.accentColor};letter-spacing:.04em;">${esc(brand)}</span>`;
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
      return cell(`<div style="text-align:${st.align ?? 'center'};${spacing(st, 24, 0)}font-family:${FONT_STACK};font-size:${st.fontSize ?? 13}px;color:${INK_MUTED};">${items}</div>`);
    }
    case 'footer': {
      const attribution = b.attribution || c.footer_attribution || '';
      const legal = b.legal || c.legal_text || '';
      const unsub = safeUrl(b.unsubscribeUrl || c.unsubscribe_url || '');
      const unsubLine = unsub
        ? `<div style="margin-top:8px;"><a href="${esc(unsub)}" style="color:${INK_MUTED};text-decoration:underline;">Unsubscribe</a></div>`
        : '';
      const fAlign = st.align ?? 'left';
      return `<tr><td style="background:${FOOTER_BG};border-top:2px solid ${s.accentColor};padding:22px 32px;font-family:${FONT_STACK};font-size:${st.fontSize ?? 12}px;line-height:1.6;color:${st.color || INK_LIGHT};text-align:${fAlign};">` +
        (attribution ? `<div style="color:${st.color || INK_MUTED};">${esc(attribution)}</div>` : '') +
        (legal ? `<div style="margin-top:6px;">${esc(legal)}</div>` : '') +
        unsubLine + `</td></tr>`;
    }
    default:
      return '';
  }
}

function blockText(b: EmailBlock, c: BrandEmailConfig, brand: string): string {
  switch (b.type) {
    case 'header': return brand;
    case 'heading': return b.text;
    case 'paragraph': return b.text;
    case 'bonus': return b.offer + (b.code ? `\nUse code: ${b.code}` : '');
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
      if (unsub) parts.push(`Unsubscribe: ${unsub}`);
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
  const blocksHtml = doc.blocks.map((b) => renderBlock(b, style, config, brand)).join('');
  const fontHref = `https://fonts.googleapis.com/css2?family=${style.googleFont}&display=swap`;
  const html =
`<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<link href="${esc(fontHref)}" rel="stylesheet"/>
<style>body{margin:0;padding:0;background:${PAGE_BG};}table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}img{border:0;outline:none;text-decoration:none;}@media (max-width:620px){.container{width:100%!important;}}</style>
</head><body>
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(doc.meta.preheader || '')}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${PAGE_BG};"><tr><td align="center" style="padding:24px 0;">
<table role="presentation" class="container" width="${WIDTH}" cellspacing="0" cellpadding="0" border="0" style="width:${WIDTH}px;max-width:${WIDTH}px;background:#ffffff;border-radius:0 0 8px 8px;overflow:hidden;">
${blocksHtml}
<tr><td style="height:28px;"></td></tr>
</table></td></tr></table></body></html>`;
  const text = doc.blocks.map((b) => blockText(b, config, brand)).filter(Boolean).join('\n\n');
  return { html, text };
}
