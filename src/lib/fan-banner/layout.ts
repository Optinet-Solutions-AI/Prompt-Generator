/**
 * Fan Banner layout — decides where everything goes on the 1200×600 banner.
 *
 * Pure maths, no drawing: it is given a way to measure text (the browser's
 * canvas in the app, a stand-in in tests) and returns positions and sizes.
 * render.ts then draws exactly what this returns, so the preview and the
 * downloaded PNG always match.
 *
 * The layout copies the brand team's Figma examples:
 *   - a text column ~420px wide on one side (right by default), the picture
 *     showing on the other side;
 *   - top to bottom: logo, big number, offer word, one or two coloured lines,
 *     button, bonus code;
 *   - everything is centred in the column and scaled together so the stack
 *     fills the banner's height — fewer lines means bigger text;
 *   - any line that is too wide shrinks on its own until it fits.
 */
import { fontCss, type FanBannerBrand, type FanFont, type Paint } from './brands';

export const FAN_W = 1200;
export const FAN_H = 600;
/** Rounded corners the email team uses on every banner. */
export const FAN_CORNER_RADIUS = 40;

export interface FanBannerTexts {
  headline: string;  // 250%, $5, 50
  offer: string;     // BONUS, FREE SPINS
  line1: string;     // +100 FREE SPINS, NO DEPOSIT NEEDED
  line2: string;     // optional second coloured line
  button: string;    // empty = no button
  codeLabel: string; // "Bonus Code:" (translated per language)
  code: string;      // WIN250 — empty = no code line
}

export type FanSide = 'left' | 'right';

export interface TextMetrics { width: number; ascent: number; descent: number }
/** Measures `text` drawn in `font` (CSS font shorthand). */
export type Measure = (text: string, font: string) => TextMetrics;

export type TextRole = 'headline' | 'offer' | 'line1' | 'line2';

export interface PlacedText {
  role: TextRole;
  text: string;
  font: string;
  size: number;
  centerX: number;
  baseline: number;
  width: number;
  ascent: number;
  descent: number;
  paint: Paint;
}

export interface PlacedButton {
  x: number; y: number; w: number; h: number;
  radius: number;
  fill: Paint;
  text: string;
  font: string;
  textColor: string;
  baseline: number;
}

export interface PlacedCode {
  placement: 'under-button' | 'corner';
  label: string;
  value: string;
  font: string;
  size: number;
  centerX: number;
  baseline: number;
  width: number;
  labelWidth: number;
  gap: number;
  ascent: number;
  descent: number;
  labelColor: string;
  valueColor: string;
}

export interface FanBannerLayout {
  side: FanSide;
  column: { x: number; w: number };
  logo: { x: number; y: number; w: number; h: number } | null;
  texts: PlacedText[];
  button: PlacedButton | null;
  code: PlacedCode | null;
  /** The panel-colour fade over the picture runs from fromX (clear) to toX (dark). */
  fade: { fromX: number; toX: number; color: string };
}

// ── Sizes at scale 1, measured off the Figma examples (1200×600 px) ──────────
const COLUMN_W = 400;
const EDGE = 50;        // gap between the column and the banner's edge
const PAD_Y = 30;       // breathing room above the logo / below the last item
const MIN_SCALE = 0.3;
const MAX_SCALE = 1.15; // how much a short banner may grow to fill the height
const BASE = {
  logoH: 100,
  logoMaxW: 400,
  headline: 170,
  offer: 72,
  line: 46,
  buttonH: 82,
  buttonText: 34,
  buttonPadX: 28,
  code: 34,
  cornerCode: 34,
};
// Average spacing between items across the Figma examples.
const GAP = { afterLogo: 40, text: 24, line: 14, beforeButton: 32, beforeCode: 26 };
// The examples keep the logo near full size even on busy banners.
const LOGO_MIN_SCALE = 0.85;

const transform = (text: string, f: FanFont) => (f.uppercase ? text.toUpperCase() : text);

type Item =
  | { kind: 'logo'; gap: number }
  | { kind: 'text'; gap: number; role: TextRole; text: string; font: FanFont; base: number; m: TextMetrics; paint: Paint }
  | { kind: 'button'; gap: number; text: string; font: FanFont; m: TextMetrics }
  | { kind: 'code'; gap: number; label: string; value: string; font: FanFont; label_m: TextMetrics; value_m: TextMetrics };

export function layoutFanBanner(input: {
  brand: FanBannerBrand;
  texts: FanBannerTexts;
  side: FanSide;
  /** Logo width ÷ height (from the loaded logo image). */
  logoAspect: number | null;
  measure: Measure;
}): FanBannerLayout {
  const { brand, texts, side, logoAspect, measure } = input;
  const { fonts, colors } = brand;

  const column = side === 'right'
    ? { x: FAN_W - EDGE - COLUMN_W, w: COLUMN_W }
    : { x: EDGE, w: COLUMN_W };
  const centerX = column.x + column.w / 2;

  // Measure everything once at its base size; sizes scale linearly from there.
  const items: Item[] = [];
  if (logoAspect && logoAspect > 0) items.push({ kind: 'logo', gap: 0 });

  const addText = (role: TextRole, raw: string, font: FanFont, base: number, paint: Paint, gap: number) => {
    const text = transform(raw.trim(), font);
    if (!text) return;
    const size = base * (font.scale ?? 1);
    items.push({ kind: 'text', gap, role, text, font, base: size, m: measure(text, fontCss(font, size)), paint });
  };
  addText('headline', texts.headline, fonts.headline, BASE.headline, colors.headline, GAP.afterLogo);
  addText('offer', texts.offer, fonts.offer, BASE.offer, colors.offer, GAP.text);
  addText('line1', texts.line1, fonts.line, BASE.line, colors.line, GAP.text);
  addText('line2', texts.line2, fonts.line, BASE.line, colors.line, GAP.line);

  const buttonText = transform(texts.button.trim(), fonts.button);
  const buttonTextBase = BASE.buttonText * (fonts.button.scale ?? 1);
  if (buttonText) {
    items.push({ kind: 'button', gap: GAP.beforeButton, text: buttonText, font: fonts.button, m: measure(buttonText, fontCss(fonts.button, buttonTextBase)) });
  }

  const codeValue = transform(texts.code.trim(), fonts.code);
  const codeLabel = codeValue ? transform(texts.codeLabel.trim(), fonts.code) : '';
  const codeItem: Extract<Item, { kind: 'code' }> | null = codeValue
    ? {
      kind: 'code', gap: GAP.beforeCode, label: codeLabel, value: codeValue, font: fonts.code,
      label_m: codeLabel ? measure(codeLabel, fontCss(fonts.code, BASE.code)) : { width: 0, ascent: 0, descent: 0 },
      value_m: measure(codeValue, fontCss(fonts.code, BASE.code)),
    }
    : null;
  if (codeItem && brand.codePlacement === 'under-button') items.push(codeItem);

  // Size of each item at a given overall scale.
  const codeWidthAtBase = (c: Extract<Item, { kind: 'code' }>) =>
    c.label_m.width + (c.label ? BASE.code * 0.3 : 0) + c.value_m.width;

  const sizeOf = (item: Item, s: number) => {
    switch (item.kind) {
      case 'logo': {
        const h = Math.min(BASE.logoH * Math.max(s, LOGO_MIN_SCALE), BASE.logoMaxW / logoAspect!);
        return { h, w: h * logoAspect!, size: 0 };
      }
      case 'text': {
        const size = item.base * Math.min(s, column.w / Math.max(item.m.width, 1));
        const k = size / item.base;
        return { h: (item.m.ascent + item.m.descent) * k, w: item.m.width * k, size };
      }
      case 'button': {
        const room = column.w - 2 * BASE.buttonPadX;
        const size = buttonTextBase * Math.min(s, room / Math.max(item.m.width, 1));
        return { h: BASE.buttonH * s, w: column.w, size };
      }
      case 'code': {
        const size = BASE.code * Math.min(s, column.w / Math.max(codeWidthAtBase(item), 1));
        const k = size / BASE.code;
        const asc = Math.max(item.label_m.ascent, item.value_m.ascent);
        const desc = Math.max(item.label_m.descent, item.value_m.descent);
        return { h: (asc + desc) * k, w: codeWidthAtBase(item) * k, size };
      }
    }
  };

  const totalAt = (s: number) =>
    items.reduce((sum, item, i) => sum + sizeOf(item, s).h + (i === 0 ? 0 : item.gap * s), 0);

  // Largest scale whose stack still fits the banner height.
  const available = FAN_H - 2 * PAD_Y;
  let lo = MIN_SCALE;
  let hi = MAX_SCALE;
  if (totalAt(hi) <= available) lo = hi;
  else {
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (totalAt(mid) <= available) lo = mid; else hi = mid;
    }
  }
  const scale = lo;

  // Place the stack, centred vertically.
  let y = PAD_Y + (available - totalAt(scale)) / 2;
  const layout: FanBannerLayout = {
    side,
    column,
    logo: null,
    texts: [],
    button: null,
    code: null,
    fade: side === 'right'
      ? { fromX: column.x - 260, toX: column.x - 40, color: colors.panel }
      : { fromX: column.x + column.w + 260, toX: column.x + column.w + 40, color: colors.panel },
  };

  items.forEach((item, i) => {
    if (i > 0) y += item.gap * scale;
    const { h, w, size } = sizeOf(item, scale);
    if (item.kind === 'logo') {
      layout.logo = { x: centerX - w / 2, y, w, h };
    } else if (item.kind === 'text') {
      const k = size / item.base;
      layout.texts.push({
        role: item.role, text: item.text, font: fontCss(item.font, size), size, centerX,
        baseline: y + item.m.ascent * k, width: w, ascent: item.m.ascent * k, descent: item.m.descent * k,
        paint: item.paint,
      });
    } else if (item.kind === 'button') {
      const k = size / buttonTextBase;
      layout.button = {
        x: column.x, y, w, h, radius: brand.buttonRadius * Math.min(1, scale),
        fill: colors.buttonFill, text: item.text, font: fontCss(item.font, size), textColor: colors.buttonText,
        // Centre the letters' visible height inside the button.
        baseline: y + h / 2 + ((item.m.ascent - item.m.descent) * k) / 2,
      };
    } else {
      layout.code = placeCode(item, size, centerX, y, 'under-button');
    }
    y += h;
  });

  // Lucky7even: the code sits in the bottom corner over the picture instead.
  if (codeItem && brand.codePlacement === 'corner') {
    const inset = 80;
    const room = column.x - inset - 40; // same on both sides by symmetry
    const size = BASE.cornerCode * Math.min(1, room / Math.max(codeWidthAtBase(codeItem) * (BASE.cornerCode / BASE.code), 1));
    const k = size / BASE.code;
    const width = codeWidthAtBase(codeItem) * k;
    const cx = side === 'right' ? inset + width / 2 : FAN_W - inset - width / 2;
    const asc = Math.max(codeItem.label_m.ascent, codeItem.value_m.ascent) * k;
    layout.code = placeCode(codeItem, size, cx, FAN_H - 35 - asc, 'corner');
  }

  return layout;

  function placeCode(c: Extract<Item, { kind: 'code' }>, size: number, cx: number, top: number, placement: PlacedCode['placement']): PlacedCode {
    const k = size / BASE.code;
    const ascent = Math.max(c.label_m.ascent, c.value_m.ascent) * k;
    const descent = Math.max(c.label_m.descent, c.value_m.descent) * k;
    return {
      placement, label: c.label, value: c.value, font: fontCss(c.font, size), size,
      centerX: cx, baseline: top + ascent, width: codeWidthAtBase(c) * k,
      labelWidth: c.label_m.width * k, gap: c.label ? size * 0.3 : 0,
      ascent, descent, labelColor: colors.codeLabel, valueColor: colors.codeValue,
    };
  }
}
