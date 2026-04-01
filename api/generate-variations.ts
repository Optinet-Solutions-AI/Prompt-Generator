import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Generate Image Variations via OpenAI gpt-image-1 ──────────────────────────
// Uses OpenAI's image edit API directly — no GCP/Cloud Run auth needed.
// Fetches the source image from the URL, sends it to OpenAI with a variation
// prompt, and returns 2 variation images as base64 data URLs.

export const config = {
  maxDuration: 300,
};

// ------------------------------------------------------------------
// Helper: read width/height from raw PNG or JPEG bytes
// We use this to match output resolution to source resolution.
// ------------------------------------------------------------------
function detectImageDimensions(buffer: ArrayBuffer): { width: number; height: number } | null {
  const bytes = new Uint8Array(buffer);

  // PNG: magic bytes 0-7, IHDR chunk starts at byte 8
  // Width = bytes 16-19, Height = bytes 20-23 (big-endian)
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    const width  = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }

  // JPEG: starts with FF D8 — scan for SOF0-SOF3 markers which carry dimensions
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let i = 2;
    while (i < bytes.length - 8) {
      if (bytes[i] === 0xFF) {
        const marker = bytes[i + 1];
        if (marker >= 0xC0 && marker <= 0xC3) {
          // SOF segment: [FF Cx] [len 2b] [precision 1b] [height 2b] [width 2b]
          const height = (bytes[i + 5] << 8) | bytes[i + 6];
          const width  = (bytes[i + 7] << 8) | bytes[i + 8];
          return { width, height };
        }
        // Skip this JPEG segment
        if (i + 3 < bytes.length) {
          const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
          i += 2 + segLen;
        } else {
          break;
        }
      } else {
        i++;
      }
    }
  }

  return null; // WebP/GIF — fall back to 'auto'
}

// Map source dimensions → quality level for the OpenAI API.
// Higher-res originals get 'high' quality so the output matches the fidelity
// of the source rather than being downgraded to a medium/low render.
function qualityForDimensions(dims: { width: number; height: number } | null): 'low' | 'medium' | 'high' {
  if (!dims) return 'medium';
  const longest = Math.max(dims.width, dims.height);
  if (longest >= 1800) return 'high';   // 2 K+  → high
  if (longest >= 900)  return 'medium'; // ~1 K  → medium
  return 'low';                          // thumbnails → low
}

// Map source dimensions → gpt-image-1 size string.
// 'auto' tells the API to match the input image's aspect ratio and resolution
// (up to its maximum of 1536 px on the longest side).
function sizeForDimensions(dims: { width: number; height: number } | null): string {
  if (!dims) return 'auto';
  const { width, height } = dims;
  // Let OpenAI decide the exact pixel count; 'auto' preserves aspect ratio
  // and resolution instead of hard-coding 1024×1024.
  if (width > height) return '1536x1024';   // landscape
  if (height > width) return '1024x1536';   // portrait
  return '1024x1024';                        // square
}

// ------------------------------------------------------------------
// Helper: build the variation prompt based on mode and user guidance.
//
// Problem we're solving for 'strong' mode:
//   When the source image contains glowing/fire elements, GPT-image-1
//   has a strong bias toward generating DARK backgrounds because its
//   training data associates glow with night/dark scenes.
//   We break that bias by explicitly forbidding dark treatments and
//   demanding bright/high-key lighting — even more aggressively when
//   the user's guidance already hints at something bright.
// ------------------------------------------------------------------
function buildPrompt(mode: string, guidance: string, brand: string): string {
  // Brand identity rule — included in EVERY mode so the brand aesthetic is never lost.
  // IMPORTANT: brand palette applies to BACKGROUND, LIGHTING, and ATMOSPHERE only.
  // Athlete/subject clothing colors from the original image must be preserved as-is.
  const brandIdentity = brand
    ? `BRAND IDENTITY RULE (NON-NEGOTIABLE): This image belongs to the "${brand}" brand. You MUST preserve the brand's EXACT signature colors, color palette, visual style, and overall aesthetic in the variation. The dominant BACKGROUND and LIGHTING colors must match the dominant colors of the original. Do NOT introduce new colors, tones, or styles that conflict with or dilute the "${brand}" brand identity. EXCEPTION: preserve the athlete's clothing colors exactly as shown in the original image — do NOT recolor jersey, shorts, or any clothing to match the brand palette. Brand palette applies to background, atmosphere, and lighting ONLY.`
    : 'Preserve the EXACT color palette, dominant colors, and visual style of the original image. The output colors must closely match the original.';

  if (mode === 'subtle') {
    // Subtle: minor refinements — the image should look almost identical but slightly polished.
    // Think of it as the same photo with a different color grade or filter applied.
    const base = [
      'Create a subtle variation of this image.',
      brandIdentity,
      'Preserve the EXACT composition, subject, character, pose, outfit, and overall structure.',
      'Change ONLY minor color grading — slightly adjust warmth, color temperature, or tonal balance. Like applying a different photo filter.',
      'Do NOT add any new visual elements, effects, particles, lightning, sparks, glows, or any element not present in the original.',
      'Stay extremely close to the original — do not reimagine the background or alter the subject.',
      'IMPORTANT: Output quality must be EQUAL or BETTER than the original. Do NOT downgrade resolution, detail, or visual fidelity.',
    ].join(' ');
    return guidance ? `${base} Additional refinement: ${guidance}` : base;
  }

  // ── STRONG mode ────────────────────────────────────────────────────────────
  // Goal: create a FRESH, potentially BETTER version — not just a lighting shift.
  // The user should look at the variation and think "oh, this one might be better."
  // Allow real creative changes to composition, subject angle, background details,
  // and visual elements — while preserving brand identity (colors).

  // Detect whether the user is asking for something bright/outdoor
  const brightKeywords = ['day', 'bright', 'sun', 'solar', 'noon', 'snow', 'stadium', 'beach',
    'outdoor', 'sky', 'high-key', 'studio', 'white', 'light', 'golden hour', 'morning',
    'afternoon', 'cloudy', 'overcast', 'neon city'];
  const userWantsBright = brightKeywords.some(kw => guidance.toLowerCase().includes(kw));

  const antiDarkRule = userWantsBright
    ? 'LIGHTING: The scene MUST be brightly lit — high-key, vivid, well-illuminated. No dark backgrounds, no night scenes, no dim lighting.'
    : 'LIGHTING: Avoid defaulting to dark/moody backgrounds just because the subject has glowing or fire elements. Match lighting to the original or user direction.';

  const variation = [
    'Create a FRESH, improved variation of this image — like an alternate version that could be even better than the original.',
    brandIdentity,
    'What to KEEP: The same brand, same type of subject, same general theme and concept. The viewer should recognize it as the same brand and campaign.',
    'What to CHANGE CREATIVELY: Reimagine the composition — try a different angle, adjust the subject pose or position, vary the arrangement of elements, enhance or rearrange background details.',
    'Do NOT add visual effects that are not in the original image (no lightning, sparks, electric arcs, lens flares, or extra glows unless the original already has them).',
    'The variation should feel like a professional designer created an alternate version — same concept, fresh execution.',
    'IMPORTANT: Output quality must be EQUAL or BETTER than the original. Do NOT downgrade resolution, detail, or visual fidelity.',
    antiDarkRule,
  ].join('\n');

  if (guidance) {
    return `${variation}\n\nCreative direction: ${guidance}`;
  }
  return variation;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  try {
    const { imageUrl, mode = 'subtle', guidance = '', count = 2, brand = '' } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    // ------------------------------------------------------------------
    // 1. Fetch the source image and detect its content type
    // ------------------------------------------------------------------
    let imgArrayBuffer: ArrayBuffer;
    let contentType = 'image/png';

    if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
      // Handle data URLs (e.g. "data:image/png;base64,...")
      const [header, b64] = imageUrl.split(',');
      const mime = header.match(/data:([^;]+)/)?.[1] || 'image/png';
      contentType = mime;
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      imgArrayBuffer = bytes.buffer;
    } else {
      const imgRes = await fetch(imageUrl as string);
      if (!imgRes.ok) {
        return res.status(400).json({ error: `Failed to fetch source image (${imgRes.status})` });
      }
      contentType = imgRes.headers.get('content-type') || 'image/png';
      imgArrayBuffer = await imgRes.arrayBuffer();
    }

    // Determine file extension from content type
    const extMap: Record<string, string> = {
      'image/png':  'png',
      'image/jpeg': 'jpg',
      'image/jpg':  'jpg',
      'image/webp': 'webp',
      'image/gif':  'gif',
    };
    const baseMime = contentType.split(';')[0].trim();
    const ext = extMap[baseMime] || 'png';

    // ------------------------------------------------------------------
    // 2. Detect source resolution so we can match output quality/size
    // ------------------------------------------------------------------
    const sourceDims = detectImageDimensions(imgArrayBuffer);
    const outputQuality = qualityForDimensions(sourceDims);
    const outputSize    = sizeForDimensions(sourceDims);

    console.log(`[generate-variations] source dims: ${JSON.stringify(sourceDims)} → quality=${outputQuality}, size=${outputSize}`);

    // ------------------------------------------------------------------
    // 3. Build the variation prompt based on mode and guidance
    // ------------------------------------------------------------------
    const prompt = buildPrompt(mode, guidance, brand);

    // ------------------------------------------------------------------
    // 4. Fire variation requests in parallel via OpenAI image edit
    // ------------------------------------------------------------------
    const numVariations = Math.min(Number(count) || 2, 2);

    const makeRequest = () => {
      const form = new FormData();
      form.append('model', 'gpt-image-1');
      form.append('image', new File([imgArrayBuffer], `source.${ext}`, { type: baseMime }));
      form.append('prompt', prompt);
      form.append('n', '1');
      form.append('quality', outputQuality); // matched to source resolution
      form.append('size', outputSize);        // matched to source aspect ratio / resolution

      return fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: form,
      });
    };

    const requests = Array.from({ length: numVariations }, makeRequest);
    const results = await Promise.allSettled(requests);

    const variations: { imageUrl: string }[] = [];

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Variation fetch error:', result.reason);
        continue;
      }
      const resp = result.value;
      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`OpenAI image edit failed (${resp.status}):`, errText);
        continue;
      }
      const data = await resp.json() as { data?: Array<{ b64_json?: string; url?: string }> };
      const item = data.data?.[0];
      if (item?.url) {
        variations.push({ imageUrl: item.url });
      } else if (item?.b64_json) {
        // Return as data URL — browsers display these directly
        variations.push({ imageUrl: `data:image/png;base64,${item.b64_json}` });
      }
    }

    if (variations.length === 0) {
      return res.status(500).json({ error: 'Failed to generate any variations. Please try again.' });
    }

    return res.status(200).json({ variations });

  } catch (error) {
    console.error('Variations error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
