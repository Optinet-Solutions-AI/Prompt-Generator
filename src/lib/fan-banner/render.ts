/**
 * Fan Banner drawing — paints the banner onto a canvas and exports it as PNG.
 *
 * Browser-only (needs <canvas>, fonts and images). All positions come from
 * layout.ts; this file only draws them, in this order:
 *   picture → dark fade on the text side → logo → text → button → bonus code,
 * all clipped to a 40px rounded rectangle so the PNG's corners are see-through.
 */
import { roundedRectPath } from '@/lib/imageDownload';
import { fontCss, googleFontsHref, type FanBannerBrand, type Paint } from './brands';
import {
  FAN_CORNER_RADIUS, FAN_H, FAN_W, layoutFanBanner,
  type FanBannerLayout, type FanBannerTexts, type FanSide, type Measure,
} from './layout';
import { CENTERED, placePicture, type PictureFraming } from './picture';

// ── Loading ──────────────────────────────────────────────────────────────────

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The picture could not be opened.'));
    img.src = src;
  });
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (blob.size < 100) throw new Error('Empty image');
  return blob;
}

/**
 * Loads a picture in a way that lets the canvas export it afterwards.
 * Pictures on Google Drive / OpenAI can't be drawn-then-saved directly
 * (the browser blocks it), so we fetch the bytes first — straight from the
 * source, or through the app's image proxy when the source refuses.
 */
export async function loadPicture(url: string): Promise<HTMLImageElement> {
  if (url.startsWith('data:') || url.startsWith('blob:')) return loadImg(url);
  let blob: Blob;
  try {
    blob = await fetchImageBlob(url);
  } catch {
    blob = await fetchImageBlob(`/api/image-proxy?url=${encodeURIComponent(url)}`);
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadImg(objectUrl);
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const logoCache = new Map<string, Promise<HTMLImageElement>>();
/** Brand logos live in public/, so they load directly (and are cached). */
export function loadLogo(path: string): Promise<HTMLImageElement> {
  if (!logoCache.has(path)) {
    const p = loadImg(path);
    p.catch(() => logoCache.delete(path)); // allow a retry after a failure
    logoCache.set(path, p);
  }
  return logoCache.get(path)!;
}

const stylesheets = new Map<string, Promise<void>>();
function ensureStylesheet(href: string): Promise<void> {
  if (!stylesheets.has(href)) {
    stylesheets.set(href, new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => resolve(); // fall back to system fonts rather than hang
      document.head.appendChild(link);
    }));
  }
  return stylesheets.get(href)!;
}

/**
 * Makes sure the brand's fonts are ready before drawing — a canvas silently
 * uses a fallback font otherwise. Passing the actual text also pulls in the
 * extra character sets (€, Å, Ø …) Google splits into separate files.
 */
export async function loadBrandFonts(brand: FanBannerBrand, sampleText: string): Promise<void> {
  await ensureStylesheet(googleFontsHref(brand));
  const text = sampleText || 'A';
  await Promise.all(
    Object.values(brand.fonts).map((f) => document.fonts.load(fontCss(f, 64), text).catch(() => [])),
  );
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function paintStyle(ctx: CanvasRenderingContext2D, paint: Paint, box: { x: number; y: number; w: number; h: number }) {
  if (typeof paint === 'string') return paint;
  const g = paint.direction === 'vertical'
    ? ctx.createLinearGradient(0, box.y, 0, box.y + box.h)
    : ctx.createLinearGradient(box.x, 0, box.x + box.w, 0);
  paint.stops.forEach((c, i) => g.addColorStop(paint.stops.length === 1 ? 0 : i / (paint.stops.length - 1), c));
  return g;
}

function canvasMeasure(ctx: CanvasRenderingContext2D): Measure {
  return (text, font) => {
    ctx.font = font;
    const m = ctx.measureText(text);
    return { width: m.width, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
  };
}

function textShadow(ctx: CanvasRenderingContext2D, strength: 'soft' | 'strong') {
  ctx.shadowColor = strength === 'strong' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = strength === 'strong' ? 12 : 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = strength === 'strong' ? 3 : 1;
}

function noShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** Fill the banner with the picture at the chosen position and zoom (no stretching, no gaps). */
function drawPicture(ctx: CanvasRenderingContext2D, img: HTMLImageElement, framing: PictureFraming) {
  const p = placePicture({ w: img.naturalWidth, h: img.naturalHeight }, framing);
  ctx.drawImage(img, p.x, p.y, p.w, p.h);
}

export interface DrawFanBannerOptions {
  brand: FanBannerBrand;
  texts: FanBannerTexts;
  side: FanSide;
  picture: HTMLImageElement | null;
  logo: HTMLImageElement | null;
  /** Where the picture sits behind the text; centred if left out. */
  framing?: PictureFraming;
}

/** Draws the full banner onto `canvas` (resized to 1200×600) and returns the layout used. */
export function drawFanBanner(canvas: HTMLCanvasElement, opts: DrawFanBannerOptions): FanBannerLayout {
  const { brand, texts, side, picture, logo } = opts;
  canvas.width = FAN_W;
  canvas.height = FAN_H;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('This browser cannot draw images (no canvas support).');

  const layout = layoutFanBanner({
    brand, texts, side,
    logoAspect: logo ? logo.naturalWidth / logo.naturalHeight : null,
    measure: canvasMeasure(ctx),
  });

  ctx.clearRect(0, 0, FAN_W, FAN_H);
  ctx.save();
  roundedRectPath(ctx, 0, 0, FAN_W, FAN_H, FAN_CORNER_RADIUS);
  ctx.clip();

  // 1. Picture (or the brand's dark tone if there is none).
  ctx.fillStyle = brand.colors.panel;
  ctx.fillRect(0, 0, FAN_W, FAN_H);
  if (picture) drawPicture(ctx, picture, opts.framing ?? CENTERED);

  // 2. Dark fade so the text stays readable over any picture.
  const { fade } = layout;
  const g = ctx.createLinearGradient(fade.fromX, 0, fade.toX, 0);
  g.addColorStop(0, hexToRgba(fade.color, 0));
  g.addColorStop(0.55, hexToRgba(fade.color, 0.6));
  g.addColorStop(1, hexToRgba(fade.color, 0.88));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FAN_W, FAN_H);

  // 3. Logo.
  if (logo && layout.logo) {
    const l = layout.logo;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.drawImage(logo, l.x, l.y, l.w, l.h);
    noShadow(ctx);
  }

  // 4. Number, offer word and coloured lines.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const t of layout.texts) {
    const left = t.centerX - t.width / 2;
    ctx.font = t.font;
    ctx.fillStyle = paintStyle(ctx, t.paint, { x: left, y: t.baseline - t.ascent, w: t.width, h: t.ascent + t.descent });
    textShadow(ctx, t.role === 'headline' ? 'strong' : 'soft');
    ctx.fillText(t.text, left, t.baseline);
  }
  noShadow(ctx);

  // 5. Button.
  if (layout.button) {
    const b = layout.button;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    roundedRectPath(ctx, b.x, b.y, b.w, b.h, b.radius);
    ctx.fillStyle = paintStyle(ctx, b.fill, b);
    ctx.fill();
    ctx.font = b.font;
    ctx.textAlign = 'center';
    ctx.fillStyle = b.textColor;
    textShadow(ctx, 'soft');
    ctx.fillText(b.text, b.x + b.w / 2, b.baseline);
    noShadow(ctx);
    ctx.textAlign = 'left';
  }

  // 6. Bonus code: the label in one colour, the code itself in the brand colour.
  if (layout.code) {
    const c = layout.code;
    const left = c.centerX - c.width / 2;
    ctx.font = c.font;
    textShadow(ctx, 'strong');
    if (c.label) {
      ctx.fillStyle = c.labelColor;
      ctx.fillText(c.label, left, c.baseline);
    }
    ctx.fillStyle = c.valueColor;
    ctx.fillText(c.value, left + c.labelWidth + c.gap, c.baseline);
    noShadow(ctx);
  }

  ctx.restore();
  return layout;
}

/** The canvas as a PNG file. */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the PNG file.'))), 'image/png');
  });
}
