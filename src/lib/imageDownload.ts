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
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');

    // Clip in pixel space first so the rounded shape isn't affected by the
    // mirror transform AND the overlay sits inside the rounded silhouette.
    if (radius > 0) {
      const r = Math.max(0, Math.min(radius, Math.min(canvas.width, canvas.height) / 2));
      roundedRectPath(ctx, 0, 0, canvas.width, canvas.height, r);
      ctx.clip();
    }

    // Base image (with mirror transform if requested).
    ctx.save();
    if (mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, 0, 0);
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
