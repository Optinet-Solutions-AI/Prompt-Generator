import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Generate Image Variations via Gemini Native Image Generation ─────────────
//
// SPECTRUM APPROACH (v3 — brand color lock):
//   Generates 4 variations using 4 DIFFERENT prompts at increasing creative levels,
//   each paired with an appropriate temperature value.
//
//   The #1 problem with v2 was color drift — Gemini generates from scratch so
//   without a very strong color lock, it drifts to its own preferred palette.
//
//   Fix:
//     1. COLOR LOCK is the first and most emphatic rule in every prompt
//     2. Explicit brand palette names so Gemini knows the exact colors to use
//     3. Temperatures lowered (max 0.75) — Gemini is more sensitive than OpenAI
//     4. Tier prompts only describe structural changes, never color changes
//
//   Tier summary:
//     T1 — Composition angle: different camera angle, same colors
//     T2 — Subject pose:      different pose/expression, same colors
//     T3 — Background detail: fresh background arrangement, same colors
//     T4 — Creative:          new composition energy, same brand colors
//
// Auth flow:
//   Vercel OIDC token → Google STS federated token → SA access token → Vertex AI

export const config = { maxDuration: 300 };

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getServiceAccountAccessToken(req: VercelRequest): Promise<string> {
  const workloadProvider = process.env.GCP_WORKLOAD_PROVIDER;
  const serviceAccount   = process.env.GCP_SERVICE_ACCOUNT;

  if (!workloadProvider || !serviceAccount) {
    throw new Error('Missing GCP_WORKLOAD_PROVIDER or GCP_SERVICE_ACCOUNT env vars');
  }

  const oidcToken =
    (req.headers['x-vercel-oidc-token'] as string | undefined) ||
    process.env.VERCEL_OIDC_TOKEN;

  if (!oidcToken) {
    throw new Error(
      'No Vercel OIDC token found. OIDC must be enabled in Vercel project settings.'
    );
  }

  const stsRes = await fetch('https://sts.googleapis.com/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:           'urn:ietf:params:oauth:grant-type:token-exchange',
      audience:             `//iam.googleapis.com/${workloadProvider}`,
      scope:                'https://www.googleapis.com/auth/cloud-platform',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_token_type:   'urn:ietf:params:oauth:token-type:jwt',
      subject_token:        oidcToken,
    }),
  });
  if (!stsRes.ok) {
    throw new Error(`STS exchange failed (${stsRes.status}): ${await stsRes.text()}`);
  }
  const { access_token: federatedToken } = await stsRes.json();

  const saRes = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${federatedToken}`,
      },
      body: JSON.stringify({
        scope: ['https://www.googleapis.com/auth/cloud-platform'],
      }),
    }
  );
  if (!saRes.ok) {
    throw new Error(`SA access token generation failed (${saRes.status}): ${await saRes.text()}`);
  }
  const { accessToken } = await saRes.json();
  return accessToken;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getProjectNumber(): string {
  const wp = process.env.GCP_WORKLOAD_PROVIDER || '';
  const match = wp.match(/^projects\/(\d+)\//);
  if (match) return match[1];
  const explicit = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (explicit) return explicit;
  return '69452143295';
}

// ------------------------------------------------------------------
// Known brand color palettes — explicit colors prevent Gemini from guessing.
// ------------------------------------------------------------------
const BRAND_PALETTES: Record<string, string> = {
  fortuneplay: 'rich gold, warm amber, deep bronze, warm orange glow — luxurious golden casino aesthetic',
  playmojo:    'vibrant orange, electric yellow, warm energetic tones — bold punchy casino aesthetic',
  spinjo:      'vibrant purple, electric blue, silver chrome, neon purple-blue energy',
  roosterbet:  'deep crimson red, warm gold accents, dark rich backgrounds with red highlights',
  spinsup:     'royal blue, silver, electric white, clean dynamic energy',
  luckyvibe:   'emerald green, bright gold, vivid neon green-and-gold energy',
  lucky7even:  'classic casino red, deep black, bright gold, lucky seven aesthetics',
  novadreams:  'cosmic purple, deep navy blue, silver stardust, dreamy nebula tones',
  rollero:     'warm casino red, gold, deep mahogany — classic rolling dice aesthetic',
};

function getBrandColorDescription(brand: string): string {
  const key = brand.toLowerCase().replace(/\s+/g, '');
  return BRAND_PALETTES[key] || '';
}

// ------------------------------------------------------------------
// COLOR LOCK — first and most emphatic rule in every Gemini prompt.
// Priority: (1) actual extracted source colors, (2) recipe fields,
// (3) brand palette hint. Gemini generates from scratch so this must
// be extremely explicit. Source image always wins over brand average.
// ------------------------------------------------------------------
interface SourceRecipe {
  lighting?: string;
  mood?: string;
  background?: string;
}

function buildColorLock(
  brand: string,
  sourceColors: string[] = [],
  sourceRecipe?: SourceRecipe | null,
): string {
  const parts: string[] = ['⚠️ COLOR LOCK — ABSOLUTE RULE #1, NEVER VIOLATE:'];

  if (sourceColors.length > 0) {
    parts.push(
      `The source image's dominant colors are: ${sourceColors.join(', ')}. ` +
      `You MUST reproduce these EXACT colors in the variation. ` +
      `Do NOT introduce any dominant color outside this set.`
    );
  }

  if (sourceRecipe) {
    const recipeParts: string[] = [];
    if (sourceRecipe.lighting)   recipeParts.push(`lighting: ${sourceRecipe.lighting}`);
    if (sourceRecipe.mood)       recipeParts.push(`mood: ${sourceRecipe.mood}`);
    if (sourceRecipe.background) recipeParts.push(`background: ${sourceRecipe.background}`);
    if (recipeParts.length > 0) {
      parts.push(`Source image recipe — preserve exactly: ${recipeParts.join('; ')}.`);
    }
  }

  const knownColors = brand ? getBrandColorDescription(brand) : '';
  if (knownColors) {
    parts.push(`Brand context (secondary reference only): ${brand} uses ${knownColors}.`);
  }

  if (sourceColors.length === 0 && !sourceRecipe) {
    parts.push(
      `Study the dominant color palette in the source image very carefully before generating. ` +
      `Identify the key colors: background tones, lighting color, and atmospheric palette. ` +
      `You MUST replicate those exact dominant colors in the variation. ` +
      `Do NOT introduce new dominant colors not prominent in the source.`
    );
  }

  parts.push(`Clothing and outfit colors on the subject must remain exactly as shown in the source image.`);

  return parts.join(' ');
}

// ------------------------------------------------------------------
// Build the spectrum of 4 prompts + temperatures for Gemini.
//
// v4 changes:
//   - buildColorLock now takes extracted source colors + recipe.
//   - HARD NO block appended to every prompt.
//   - Subtle mode: [T1, T1, T1, T2] — more faithful angle options.
//     Temperatures lowered further (0.15 / 0.25) for subtle.
//   - Strong mode: T4 rewritten — no "new composition and energy".
//   - Temperatures remain capped at 0.6 (was 0.75) to reduce drift.
// ------------------------------------------------------------------
function buildGeminiPromptSpectrum(
  mode: string,
  guidance: string,
  brand: string,
  sourceColors: string[] = [],
  sourceRecipe?: SourceRecipe | null,
): Array<{ prompt: string; temperature: number }> {
  const colorLock    = buildColorLock(brand, sourceColors, sourceRecipe);
  const criticalRule = 'CRITICAL: Generate a FULL NEW IMAGE at the same dimensions and aspect ratio as the source. Do NOT crop, zoom, or filter the input — create a genuinely new image.';
  const qualityRule  = 'Photorealistic, high detail, no text, no logos. Match or exceed original quality.';
  const guidanceSuffix = guidance ? ` User direction: ${guidance}.` : '';

  const hardNo = [
    'HARD NO — these changes are forbidden:',
    'Do NOT change the lighting color temperature (warm stays warm, cool stays cool, dark stays dark).',
    'Do NOT brighten a dark/moody image or darken a bright one.',
    'Do NOT replace the background material or setting type.',
    'Do NOT shift warm tones cool, or cool tones warm.',
    'Do NOT add any color that was not already dominant in the source image.',
  ].join(' ');

  // T1 — Camera angle / perspective
  const t1 = {
    prompt: [
      colorLock,
      criticalRule,
      'Generate a NEW image that is a variation of the reference, with a slightly different camera angle or framing.',
      'Keep the exact same subject, lighting color, color palette, and all visual elements.',
      'Only change: the viewing angle or how the subject is framed in the shot.',
      qualityRule,
      hardNo,
    ].join(' ') + guidanceSuffix,
    temperature: 0.15,
  };

  // T2 — Subject pose / expression
  const t2 = {
    prompt: [
      colorLock,
      criticalRule,
      'Generate a NEW image that is a variation of the reference, where the subject has a different pose or expression.',
      'Keep the exact same background, lighting color, color palette, and atmosphere.',
      'Only change: the subject\'s pose, stance, or facial expression — everything else stays identical.',
      qualityRule,
      hardNo,
    ].join(' ') + guidanceSuffix,
    temperature: 0.25,
  };

  // T3 — Background detail variation
  const t3 = {
    prompt: [
      colorLock,
      criticalRule,
      'Generate a NEW image that is a variation of the reference, with refreshed background details.',
      'Keep the same subject, subject pose, lighting color, and color palette.',
      'Only change: background elements and arrangement — same dominant colors but different background details.',
      qualityRule,
      hardNo,
    ].join(' ') + guidanceSuffix,
    temperature: 0.4,
  };

  // T4 — Strong creative: pose + framing change, scene stays the same.
  // Deliberately NOT "new composition and energy" — that was causing drift.
  const t4 = {
    prompt: [
      colorLock,
      criticalRule,
      'Generate a variation with a significantly different subject pose and camera framing.',
      'Keep the EXACT same lighting, color palette, background material, and overall mood.',
      'Do NOT reinvent the scene — only the pose and framing change. It should feel like the same campaign shot from a different angle with a different subject stance.',
      qualityRule,
      hardNo,
    ].join(' ') + guidanceSuffix,
    temperature: 0.6,
  };

  // Mode → tier selection
  if (mode === 'subtle') {
    return [t1, t1, t1, t2];
  }
  return [t2, t2, t3, t4];
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      imageUrl,
      mode = 'subtle',
      guidance = '',
      count = 4,
      brand = '',
      resolution = '',
      sourceColors = [],
      sourceRecipe = null,
    } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });

    // ------------------------------------------------------------------
    // 1. Fetch + encode source image as base64
    // ------------------------------------------------------------------
    let imgArrayBuffer: ArrayBuffer;
    let mimeType = 'image/png';

    if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
      const [header, b64] = imageUrl.split(',');
      mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png';
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      imgArrayBuffer = arr.buffer;
    } else {
      const imgRes = await fetch(imageUrl as string);
      if (!imgRes.ok) {
        return res.status(400).json({ error: `Failed to fetch source image (${imgRes.status})` });
      }
      mimeType = imgRes.headers.get('content-type')?.split(';')[0].trim() || 'image/png';
      imgArrayBuffer = await imgRes.arrayBuffer();
    }

    const b64Image = Buffer.from(imgArrayBuffer).toString('base64');

    // ------------------------------------------------------------------
    // 2. Build spectrum prompts + temperatures
    // ------------------------------------------------------------------
    const numVariations = Math.min(Number(count) || 4, 4);
    const spectrum = buildGeminiPromptSpectrum(mode, guidance, brand).slice(0, numVariations);

    console.log(`[generate-variations-gemini] mode=${mode}, brand=${brand}, resolution=${resolution}, generating ${numVariations} tiered variations`);

    // ------------------------------------------------------------------
    // 3. Authenticate with GCP
    // ------------------------------------------------------------------
    const accessToken = await getServiceAccountAccessToken(req);
    const project     = getProjectNumber();

    const geminiModel = 'gemini-2.5-flash-image';
    const vertexUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/${project}/locations/us-central1/publishers/google/models/${geminiModel}:generateContent`;

    // ------------------------------------------------------------------
    // 4. Fire requests in parallel — each with its own prompt + temperature
    // ------------------------------------------------------------------
    const requests = spectrum.map(({ prompt, temperature }) =>
      fetch(vertexUrl, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: b64Image } },
              { text: prompt },
            ],
          }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            temperature,
            maxOutputTokens: 16384,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
          ],
        }),
      })
    );

    const results = await Promise.allSettled(requests);

    const variations: { imageUrl: string }[] = [];
    const apiErrors: string[] = [];

    for (const result of results) {
      if (result.status === 'rejected') {
        const msg = String(result.reason);
        console.error('[gemini] request rejected:', msg);
        apiErrors.push(msg);
        continue;
      }
      const resp = result.value;
      if (!resp.ok) {
        const errText = await resp.text();
        const msg = `Vertex AI HTTP ${resp.status}: ${errText}`;
        console.error('[gemini]', msg);
        apiErrors.push(msg);
        continue;
      }

      const data = await resp.json() as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inlineData?: { mimeType?: string; data?: string };
              text?: string;
            }>;
          };
        }>;
      };

      const parts = data.candidates?.[0]?.content?.parts || [];
      let foundImage = false;
      for (const part of parts) {
        if (part.inlineData?.data) {
          const outMime = part.inlineData.mimeType || 'image/png';
          variations.push({ imageUrl: `data:${outMime};base64,${part.inlineData.data}` });
          foundImage = true;
          break;
        }
      }
      if (!foundImage) {
        const msg = `No image in Gemini response: ${JSON.stringify(data).substring(0, 300)}`;
        console.error('[gemini]', msg);
        apiErrors.push(msg);
      }
    }

    if (variations.length === 0) {
      return res.status(500).json({
        error:     'Gemini failed to generate any variations.',
        apiErrors,
        hint:      'Gemini native image generation may have safety-filtered the request. Try a different image or guidance.',
      });
    }

    return res.status(200).json({ variations, engine: 'imagen' });

  } catch (error) {
    console.error('[gemini] error:', error);
    return res.status(500).json({
      error:   'Gemini variation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
