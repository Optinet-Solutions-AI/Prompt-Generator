import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Generate Image Variations via OpenAI gpt-image-1 ──────────────────────────
//
// SPECTRUM APPROACH (v3 — brand color lock):
//   Generates 4 variations using 4 DIFFERENT prompts at increasing creative levels.
//
//   The #1 problem with v2 was that brand identity (colors) was lost because:
//     1. The model doesn't know brand-specific colors just from a brand name.
//     2. Tier prompts suggested color changes (e.g. "cooler studio light") that
//        contradicted the brand palette.
//
//   Fix: A "COLOR LOCK" instruction is now the FIRST and HIGHEST-PRIORITY rule
//   in every prompt. It explicitly names the brand's known dominant colors AND
//   instructs the model to derive the palette from the source image.
//   Tier prompts now only allow changes that don't touch the color palette.
//
//   Tier summary:
//     T1 — Composition angle: different camera angle, same lighting & colors
//     T2 — Subject pose:      different subject pose/expression, same background & colors
//     T3 — Background detail: fresh background arrangement, same subject & colors
//     T4 — Creative:          new overall composition, same brand colors & concept

export const config = {
  maxDuration: 300,
};

// ------------------------------------------------------------------
// Known brand color palettes.
// Giving the model explicit color names is far more reliable than
// asking it to infer colors from a brand name it may not recognize.
// ------------------------------------------------------------------
const BRAND_PALETTES: Record<string, string> = {
  fortuneplay: 'rich gold, warm amber, deep bronze, warm orange glow — a luxurious golden casino aesthetic',
  spinjo:      'vibrant purple, electric blue, silver chrome, neon purple-blue energy',
  roosterbet:  'deep crimson red, warm gold accents, dark rich backgrounds with red highlights',
  luckyvibe:   'emerald green, bright gold, vivid neon green-and-gold energy',
  spinsup:     'royal blue, silver, electric white, clean dynamic energy',
};

function getBrandColorDescription(brand: string): string {
  const key = brand.toLowerCase().replace(/\s+/g, '');
  return BRAND_PALETTES[key] || '';
}

// ------------------------------------------------------------------
// COLOR LOCK — the single most important rule in every prompt.
// This always comes FIRST so the model cannot miss it.
// ------------------------------------------------------------------
function buildColorLock(brand: string): string {
  const knownColors = brand ? getBrandColorDescription(brand) : '';

  if (knownColors) {
    return (
      `⚠️ COLOR LOCK — ABSOLUTE RULE, NEVER VIOLATE: ` +
      `This image belongs to the ${brand} brand whose signature palette is: ${knownColors}. ` +
      `You MUST replicate these EXACT dominant colors in the variation. ` +
      `The background, lighting, and atmosphere MUST stay within this palette. ` +
      `NEVER switch to cool blues, purples, dark moody tones, or any color NOT present in the source image. ` +
      `If the source image is warm and golden, the variation MUST also be warm and golden. ` +
      `Clothing and outfit colors on the subject must remain exactly as in the source.`
    );
  }

  // Fallback: no known brand — instruct model to derive palette from source image
  return (
    `⚠️ COLOR LOCK — ABSOLUTE RULE, NEVER VIOLATE: ` +
    `Study the dominant color palette in the source image very carefully. ` +
    `Whatever those dominant colors are (the background tones, lighting color, atmosphere), ` +
    `you MUST preserve them exactly in the variation. ` +
    `Do NOT introduce dominant colors that were not prominent in the source image. ` +
    `Clothing and outfit colors on the subject must remain exactly as in the source.`
  );
}

// ------------------------------------------------------------------
// Helper: read width/height from raw PNG or JPEG bytes
// ------------------------------------------------------------------
function detectImageDimensions(buffer: ArrayBuffer): { width: number; height: number } | null {
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    const width  = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }

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
// Build the spectrum of 4 tier prompts.
//
// KEY CHANGE from v2:
//   - COLOR LOCK appears FIRST (not buried in the middle)
//   - Tier instructions only describe STRUCTURAL changes (angle, pose, layout)
//   - No tier instruction suggests changing colors, warmth, or light color
//   - Lighting changes = direction/softness ONLY, never color temperature
// ------------------------------------------------------------------
function buildPromptSpectrum(mode: string, guidance: string, brand: string): string[] {
  const colorLock = buildColorLock(brand);
  const qualityRule = 'Output quality must match or exceed the original.';
  const guidanceSuffix = guidance ? ` User direction: ${guidance}.` : '';

  // T1 — Composition angle: vary the camera perspective
  const t1 = [
    colorLock,
    'Create a variation of this image with a different camera angle or perspective.',
    'Keep the exact same subject, lighting color, color palette, and brand aesthetic.',
    'Only change: the viewing angle (slightly closer, further, or shifted), OR the subject framing within the shot.',
    qualityRule,
  ].join(' ') + guidanceSuffix;

  // T2 — Subject pose/expression: vary what the subject is doing
  const t2 = [
    colorLock,
    'Create a variation of this image where the subject has a different pose or expression.',
    'Keep the exact same background, lighting color, color palette, and brand aesthetic.',
    'Only change: the subject\'s pose, stance, or facial expression — everything else stays the same.',
    qualityRule,
  ].join(' ') + guidanceSuffix;

  // T3 — Background detail: vary the background arrangement
  const t3 = [
    colorLock,
    'Create a variation of this image with a refreshed background.',
    'Keep the same subject, subject pose, lighting color, and color palette.',
    'Only change: background details and arrangement — same overall color palette but different background elements or depth.',
    qualityRule,
  ].join(' ') + guidanceSuffix;

  // T4 — Creative: new overall scene energy
  const t4 = [
    colorLock,
    'Create a fresh alternate version of this image — same brand, concept, and color palette; completely new composition and energy.',
    'Keep the exact same color palette and brand aesthetic from the source.',
    'Change: the overall composition, subject pose, and background layout. Make it feel like a strong alternate creative for the same campaign.',
    qualityRule,
  ].join(' ') + guidanceSuffix;

  // Mode → tier selection
  // subtle: minimal changes (angle + pose)
  // strong: bigger changes (pose + background + creative)
  if (mode === 'subtle') {
    return [t1, t1, t2, t2];
  }
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

    console.log(`[generate-variations] source dims: ${JSON.stringify(sourceDims)} → quality=${outputQuality}, size=${outputSize}, mode=${mode}, brand=${brand}`);

    // ------------------------------------------------------------------
    // 3. Build spectrum prompts
    // ------------------------------------------------------------------
    const numVariations = Math.min(Number(count) || 4, 4);
    const prompts = buildPromptSpectrum(mode, guidance, brand);
    const activePrompts = prompts.slice(0, numVariations);

    console.log(`[generate-variations] generating ${numVariations} variations`);

    // ------------------------------------------------------------------
    // 4. Fire requests in parallel — each with its own tier prompt
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
