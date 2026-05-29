// Shared helpers for downloading images from the app.
// Two flavours: a plain blob download, and one that applies rounded corners
// via canvas before saving.

const DEFAULT_CORNER_RADIUS = 40;

function triggerBlobDownload(blob: Blob, filename: string) {
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(blobUrl);
}

// Normal download — fetches the image as a blob (works for cross-origin URLs
// like Supabase / Drive) and saves it.
export async function downloadImageBlob(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  triggerBlobDownload(blob, filename || `image-${Date.now()}.png`);
}

// Rounded / mirrored download — draws the image onto a canvas applying any
// combination of rounded-rect clip and horizontal mirror, then saves as PNG.
// Rounded corners stay transparent (no fill). Falls back to opening the
// original in a new tab if anything fails (e.g. canvas tainted by CORS).
export interface DownloadTransformOptions {
  radius?: number;     // 0 = square corners; >0 = rounded with that px radius
  mirror?: boolean;    // horizontally flip (for Arabic RTL layouts)
  overlayUrl?: string; // optional PNG composited on top, stretched to fit
  // Exact output size. When BOTH are set the saved PNG is rendered at exactly
  // this pixel size (e.g. 1200×600 for a CRM email banner). The source image
  // is mapped into the frame using `fit` below. When omitted, the canvas keeps
  // the source image's natural size (original behaviour — no resize).
  targetWidth?: number;
  targetHeight?: number;
  // How the source maps into the target frame when proportions differ.
  //   'cover'   (default) — fill the frame, cropping overflow. No bars/distortion.
  //   'contain'           — fit the whole image, leaving transparent bars.
  //   'stretch'           — stretch to fill exactly (may distort).
  fit?: 'cover' | 'contain' | 'stretch';
  // Convenience inputs — when targetWidth/Height aren't given explicitly, these
  // are resolved into a target size once the source image is loaded:
  //   bannerDimensions "1200 × 600" → exact pixels (source of truth)
  //   aspectRatio      "16:9"       → correct proportions at source resolution
  bannerDimensions?: string;
  aspectRatio?: string;
}

// Parse a dimension string like "1200 × 600", "1200x600" or "1200 x 600".
function parseDimensions(s?: string): { width: number; height: number } | null {
  if (!s) return null;
  // Split on x / × / * with optional surrounding spaces.
  const m = s.trim().match(/^(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const width = Math.round(parseFloat(m[1]));
  const height = Math.round(parseFloat(m[2]));
  if (!width || !height) return null;
  return { width, height };
}

// Resolve the exact output size for a download from whatever the caller knows:
//   1. An explicit pixel string ("1200 × 600") — used verbatim (source of truth).
//   2. An aspect-ratio string ("16:9") applied to the source image — produces a
//      correctly-proportioned target at the source's resolution (no upscaling).
// Returns null when there's nothing reliable to resize to (caller keeps source size).
export function resolveTargetDims(input: {
  bannerDimensions?: string;
  aspectRatio?: string;
  sourceWidth?: number;
  sourceHeight?: number;
}): { width: number; height: number } | null {
  // 1. Explicit pixels win.
  const exact = parseDimensions(input.bannerDimensions);
  if (exact) return exact;

  // 2. Derive from aspect ratio + source resolution (cover fit, no upscaling).
  const { aspectRatio, sourceWidth, sourceHeight } = input;
  if (aspectRatio && sourceWidth && sourceHeight) {
    const parts = aspectRatio.split(':');
    if (parts.length === 2) {
      const rw = parseFloat(parts[0]);
      const rh = parseFloat(parts[1]);
      if (!isNaN(rw) && !isNaN(rh) && rw > 0 && rh > 0) {
        const targetRatio = rw / rh;
        const srcRatio = sourceWidth / sourceHeight;
        // Inscribe the target ratio inside the source so we never upscale.
        let width: number;
        let height: number;
        if (targetRatio >= srcRatio) {
          width = sourceWidth;
          height = Math.round(sourceWidth / targetRatio);
        } else {
          height = sourceHeight;
          width = Math.round(sourceHeight * targetRatio);
        }
        if (width > 0 && height > 0) return { width, height };
      }
    }
  }
  return null;
}

export class BrandOverlayMissingError extends Error {
  constructor(url: string) {
    super(`Brand overlay not found at ${url}`);
    this.name = 'BrandOverlayMissingError';
  }
}

export async function downloadImageRounded(
  url: string,
  filename: string,
  radiusOrOptions: number | DownloadTransformOptions = DEFAULT_CORNER_RADIUS,
) {
  const opts: DownloadTransformOptions =
    typeof radiusOrOptions === 'number'
      ? { radius: radiusOrOptions }
      : radiusOrOptions;
  const radius = opts.radius ?? DEFAULT_CORNER_RADIUS;
  const mirror = !!opts.mirror;
  const overlayUrl = opts.overlayUrl || null;

  // Pre-load the overlay before touching the main image so we can throw
  // a friendly error if the brand hasn't uploaded one yet.
  let overlayImg: HTMLImageElement | null = null;
  if (overlayUrl) {
    try {
      overlayImg = await loadImage(overlayUrl);
    } catch {
      throw new BrandOverlayMissingError(overlayUrl);
    }
  }

  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);

  try {
    const img = await loadImage(objectUrl);
    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;

    // Output size: exact target px when both provided, else the source size
    // (original behaviour). This is what makes the saved PNG e.g. exactly 1200×600.
    const hasTarget = !!(opts.targetWidth && opts.targetHeight);
    const outW = hasTarget ? Math.round(opts.targetWidth!) : srcW;
    const outH = hasTarget ? Math.round(opts.targetHeight!) : srcH;
    const fit = opts.fit ?? 'cover';

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    // alpha:true keeps the canvas transparent so the rounded corners (and any
    // 'contain' bars) stay see-through instead of filling white.
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.clearRect(0, 0, outW, outH); // explicit transparent base

    // Clip in target pixel space first so the rounded shape isn't affected by the
    // mirror transform AND the overlay sits inside the rounded silhouette. Radius
    // now scales relative to the final banner size.
    if (radius > 0) {
      const r = Math.max(0, Math.min(radius, Math.min(outW, outH) / 2));
      roundedRectPath(ctx, 0, 0, outW, outH, r);
      ctx.clip();
    }

    // Map the source image into the target frame (cover / contain / stretch).
    // dw/dh = drawn size, dx/dy = top-left offset (centered).
    let dw = outW;
    let dh = outH;
    let dx = 0;
    let dy = 0;
    if (fit !== 'stretch') {
      const scale =
        fit === 'cover'
          ? Math.max(outW / srcW, outH / srcH)  // fill, crop overflow
          : Math.min(outW / srcW, outH / srcH); // fit, leave transparent bars
      dw = srcW * scale;
      dh = srcH * scale;
      dx = (outW - dw) / 2;
      dy = (outH - dh) / 2;
    }

    // Base image (with mirror transform if requested). Mirror composes on top of
    // the cover/contain geometry by flipping the whole target frame horizontally.
    ctx.save();
    if (mirror) {
      ctx.translate(outW, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();

    // Brand overlay sits on top of the base, stretched to fit the banner.
    // It's still inside the rounded clip so the shadow follows the curve.
    if (overlayImg) {
      ctx.drawImage(overlayImg, 0, 0, canvas.width, canvas.height);
    }

    const outBlob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b), 'image/png'),
    );
    if (!outBlob) throw new Error('canvas.toBlob returned null');

    const baseName = filename || `image-${Date.now()}.png`;
    const tagParts: string[] = [];
    if (mirror) tagParts.push('mirrored');
    if (radius > 0) tagParts.push(`rounded${radius}`);
    if (overlayImg) tagParts.push('shadow');
    const tag = tagParts.length ? `-${tagParts.join('-')}` : '';
    const outName = baseName.replace(/(\.[^.]+)?$/, `${tag}.png`);
    triggerBlobDownload(outBlob, outName);
  } finally {
    window.URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export const ROUNDED_CORNER_RADIUS = DEFAULT_CORNER_RADIUS;
