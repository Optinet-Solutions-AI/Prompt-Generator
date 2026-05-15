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

// Rounded download — draws the image onto a canvas with a rounded-rect clip
// at `radius` px, then saves the resulting PNG. Falls back to opening the
// original in a new tab if anything fails (e.g. canvas tainted by CORS).
export async function downloadImageRounded(
  url: string,
  filename: string,
  radius: number = DEFAULT_CORNER_RADIUS,
) {
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

    // Clip to a rounded rectangle the size of the image, then draw.
    // Clamp radius so it never exceeds half the shorter side.
    const r = Math.max(0, Math.min(radius, Math.min(canvas.width, canvas.height) / 2));
    roundedRectPath(ctx, 0, 0, canvas.width, canvas.height, r);
    ctx.clip();
    ctx.drawImage(img, 0, 0);

    const outBlob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b), 'image/png'),
    );
    if (!outBlob) throw new Error('canvas.toBlob returned null');

    const baseName = filename || `image-${Date.now()}.png`;
    const roundedName = baseName.replace(/(\.[^.]+)?$/, `-rounded${radius}.png`);
    triggerBlobDownload(outBlob, roundedName);
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
