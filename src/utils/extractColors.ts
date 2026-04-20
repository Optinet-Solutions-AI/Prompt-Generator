// Extracts the dominant colors from an image by drawing it to a small canvas
// and counting the most frequent color buckets. Pure JS, zero cost, ~50ms.
export async function extractDominantColors(imageUrl: string, k = 5): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve([]); return; }

        ctx.drawImage(img, 0, 0, 100, 100);

        let pixels: ImageData;
        try {
          pixels = ctx.getImageData(0, 0, 100, 100);
        } catch {
          // CORS taint — can't read pixels from this image
          resolve([]); return;
        }

        const data = pixels.data;
        const totalPixels = 100 * 100;

        // Measure how much of the image is near-black or near-white
        let darkCount = 0, lightCount = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (r < 30 && g < 30 && b < 30) darkCount++;
          if (r > 225 && g > 225 && b > 225) lightCount++;
        }
        const darkRatio  = darkCount  / totalPixels;
        const lightRatio = lightCount / totalPixels;

        // Bucket pixels into 32-step bins (8 levels per channel → 512 possible buckets)
        // Quantizing to the midpoint of each bin so similar colors collapse together.
        const buckets = new Map<number, number>();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];

          // Skip near-black pixels unless the image is predominantly dark
          if (r < 30 && g < 30 && b < 30 && darkRatio < 0.4) continue;
          // Skip near-white pixels unless the image is predominantly bright
          if (r > 225 && g > 225 && b > 225 && lightRatio < 0.4) continue;

          const rb = Math.floor(r / 32) * 32 + 16;
          const gb = Math.floor(g / 32) * 32 + 16;
          const bb = Math.floor(b / 32) * 32 + 16;
          const key = (rb << 16) | (gb << 8) | bb;
          buckets.set(key, (buckets.get(key) || 0) + 1);
        }

        // Sort by frequency, return top-k as hex strings
        const topColors = [...buckets.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, k)
          .map(([key]) => {
            const r = (key >> 16) & 0xff;
            const g = (key >> 8)  & 0xff;
            const b =  key        & 0xff;
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          });

        resolve(topColors);
      } catch {
        resolve([]);
      }
    };

    img.onerror = () => resolve([]);
    img.src = imageUrl;
  });
}
