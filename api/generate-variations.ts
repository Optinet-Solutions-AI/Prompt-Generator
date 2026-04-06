import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Generate Image Variations via OpenAI gpt-image-1 ──────────────────────────
// Uses OpenAI's image edit API directly — no GCP/Cloud Run auth needed.
//
// SPECTRUM APPROACH (v2):
//   Instead of sending the same prompt N times (producing near-duplicate results),
//   we generate 4 variations using 4 DIFFERENT prompts at increasing creative levels:
//
//   Tier 1 — Color Grade:    Adjust warmth/tone only. Almost identical to original.
//   Tier 2 — Lighting:       Change light direction, mood, atmosphere.
//   Tier 3 — Composition:    Shift camera angle, subject position, background layout.
//   Tier 4 — Reimagine:      Fresh execution — new pose, new energy, same brand.
//
//   Mode controls which tiers are used:
//     subtle → T1, T1, T2, T2  (conservative spread — color & lighting range)
//     strong → T2, T3, T3, T4  (creative spread — composition & reimagining range)
//
//   This ensures each of the 4 outputs looks visibly different from the others
//   while all remaining recognizably related to the original.

export const config = {
  maxDuration: 300,
};

// ------------------------------------------------------------------
// Helper: read width/height from raw PNG or JPEG bytes
// ------------------------------------------------------------------
function detectImageDimensions(buffer: ArrayBuffer): { width: number; height: number } | null {
  const bytes = new Uint8Array(buffer);

  // PNG: magic bytes 0-7, IHDR chunk starts at byte 8
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    const width  = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }

  // JPEG: starts with FF D8 — scan for SOF0-SOF3 markers
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let i = 2;
    while (i < bytes.length - 8) {
      if (bytes[i] === 0xFF) {
        const marker = bytes[i + 1];
        if (marker >= 0xC0 && marker <= 0xC3) {
          const height = (bytes[i + 5] << 8) | bytes[i + 6];
          const width  = (bytes[i + 7] << 8) | bytes[i + 8];
          return { width, height };
        }
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

  return null;
}

function qualityForDimensions(dims: { width: number; height: number } | null): 'low' | 'medium' | 'high' {
  if (!dims) return 'medium';
  const longest = Math.max(dims.width, dims.height);
  if (longest >= 1800) return 'high';
  if (longest >= 900)  return 'medium';
  return 'low';
}

function sizeForDimensions(dims: { width: number; height: number } | null): string {
  if (!dims) return 'auto';
  const { width, height } = dims;
  if (width > height) return '1536x1024';
  if (height > width) return '1024x1536';
  return '1024x1024';
}

// ------------------------------------------------------------------
// Build a SPECTRUM of 4 prompts — each targets a different tier of change.
//
// Every prompt is kept SHORT (3-4 sentences) and NON-CONTRADICTORY.
// The brand rule is condensed to one sentence per prompt.
// Each prompt says clearly what TO change — not a long list of what NOT to change.
// ------------------------------------------------------------------
function buildPromptSpectrum(mode: string, guidance: string, brand: string): string[] {
  // One-sentence brand rule included in every prompt
  const brandRule = brand
    ? `Preserve "${brand}" brand colors in the background and lighting; keep the subject's clothing/outfit colors exactly as in the original.`
    : 'Preserve the exact color palette and visual style of the original image.';

  const qualityRule = 'Match or exceed the original image quality and resolution.';

  const guidanceSuffix = guidance ? ` Creative direction: ${guidance}` : '';

  // ── TIER DEFINITIONS ─────────────────────────────────────────────
  // T1 — Color Grade only
  const t1 = [
    'Create a subtle variation of this image — like applying a different color grade or photo filter.',
    brandRule,
    'Keep the exact composition, subject, pose, and all elements. Only shift the overall warmth, color temperature, or tonal balance slightly.',
    qualityRule,
  ].join(' ') + guidanceSuffix;

  // T2 — Lighting & Atmosphere
  const t2 = [
    'Create a variation of this image with different lighting and atmosphere.',
    brandRule,
    'Keep the same composition and subject position. Change the lighting direction, intensity, or time-of-day feel — for example warmer golden-hour light, cooler studio light, or softer diffused light.',
    qualityRule,
  ].join(' ') + guidanceSuffix;

  // T3 — Composition Shift
  const t3 = [
    'Create a variation of this image with a refreshed composition.',
    brandRule,
    'Keep the same subject, brand theme, and overall concept. Adjust the camera angle, subject positioning, or background arrangement — give it a different but equally strong layout.',
    qualityRule,
  ].join(' ') + guidanceSuffix;

  // T4 — Creative Reimagining
  const t4 = [
    'Create a fresh alternate version of this image — same brand and concept, completely new execution.',
    brandRule,
    'Reimagine the subject pose, expression, and background. The viewer should recognize it as the same brand campaign but feel it is a genuinely different image that could stand on its own.',
    qualityRule,
  ].join(' ') + guidanceSuffix;

  // ── MODE → TIER SELECTION ─────────────────────────────────────────
  // subtle: conservative spread (color grade + lighting, 2 of each)
  // strong: creative spread (lighting → composition → reimagine)
  if (mode === 'subtle') {
    return [t1, t1, t2, t2];
  }
  // strong
  return [t2, t3, t3, t4];
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
    const { imageUrl, mode = 'subtle', guidance = '', count = 4, brand = '' } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    // ------------------------------------------------------------------
    // 1. Fetch the source image
    // ------------------------------------------------------------------
    let imgArrayBuffer: ArrayBuffer;
    let contentType = 'image/png';

    if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
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
    // 2. Detect source resolution
    // ------------------------------------------------------------------
    const sourceDims = detectImageDimensions(imgArrayBuffer);
    const outputQuality = qualityForDimensions(sourceDims);
    const outputSize    = sizeForDimensions(sourceDims);

    console.log(`[generate-variations] source dims: ${JSON.stringify(sourceDims)} → quality=${outputQuality}, size=${outputSize}, mode=${mode}`);

    // ------------------------------------------------------------------
    // 3. Build the spectrum of 4 different prompts
    // ------------------------------------------------------------------
    const numVariations = Math.min(Number(count) || 4, 4);
    const prompts = buildPromptSpectrum(mode, guidance, brand);
    // Use only as many prompts as requested (slice in case count < 4)
    const activePrompts = prompts.slice(0, numVariations);

    console.log(`[generate-variations] generating ${numVariations} variations with ${activePrompts.length} distinct prompts`);

    // ------------------------------------------------------------------
    // 4. Fire requests in parallel — each with a different tier prompt
    // ------------------------------------------------------------------
    const requests = activePrompts.map((prompt) => {
      const form = new FormData();
      form.append('model', 'gpt-image-1');
      form.append('image', new File([imgArrayBuffer], `source.${ext}`, { type: baseMime }));
      form.append('prompt', prompt);
      form.append('n', '1');
      form.append('quality', outputQuality);
      form.append('size', outputSize);

      return fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: form,
      });
    });

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
