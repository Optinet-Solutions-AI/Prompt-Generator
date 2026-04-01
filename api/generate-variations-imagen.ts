import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Generate Image Variations via Gemini Native Image Generation ─────────────
//
// Previously used Imagen mask-based editing (BGSWAP), which could ONLY change
// the background — the subject was preserved pixel-perfect by the mask.
// This was NOT a true variation since the subject never changed.
//
// Now uses Gemini's native image generation (generateContent with image output).
// Gemini sees the FULL image and generates a completely new variation —
// both subject and background can change, just like ChatGPT's approach.
//
// Auth flow (same WIF pattern used by edit-image.ts and generate-image.ts):
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

  // Step 1: Vercel OIDC → Google federated access token
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

  // Step 2: Federated token → short-lived SA access token
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

// Extract GCP project number from GCP_WORKLOAD_PROVIDER env var.
function getProjectNumber(): string {
  const wp = process.env.GCP_WORKLOAD_PROVIDER || '';
  const match = wp.match(/^projects\/(\d+)\//);
  if (match) return match[1];
  const explicit = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (explicit) return explicit;
  return '69452143295';
}

// Build the variation prompt for Gemini native image generation.
// Unlike Imagen BGSWAP (which only edited the background), Gemini sees the
// full image and generates a new one — so the prompt describes the FULL variation.
// Same style as ChatGPT's buildPrompt() so both engines produce comparable results.
function buildGeminiPrompt(mode: string, guidance: string, brand: string): string {
  const brandIdentity = brand
    ? `BRAND IDENTITY RULE (NON-NEGOTIABLE): This image belongs to the "${brand}" brand. You MUST preserve the brand's EXACT signature colors, color palette, visual style, and overall aesthetic. The dominant colors in the output must match the dominant colors of the original. Do NOT introduce new colors, tones, or styles that conflict with the "${brand}" brand identity.`
    : 'Preserve the EXACT color palette, dominant colors, and visual style of the original image.';

  if (mode === 'subtle') {
    const base = [
      'Generate a NEW image that is a subtle variation of the reference image I provided.',
      'CRITICAL: You must OUTPUT a COMPLETE NEW IMAGE at the SAME resolution and dimensions. Do NOT crop, zoom, or trim the image. The output must be the same size as the input.',
      brandIdentity,
      'Preserve the EXACT composition, subject, character, pose, outfit, and overall structure.',
      'Change ONLY minor color grading — slightly adjust warmth, color temperature, or tonal balance. Like applying a different photo filter.',
      'Do NOT add any new visual elements, effects, particles, lightning, sparks, glows, or any element not present in the original.',
      'Stay extremely close to the original — do not reimagine the background or alter the subject.',
      'Output quality must be EQUAL or BETTER than the original. Photorealistic, high detail.',
    ].join(' ');
    return guidance ? `${base} Additional refinement: ${guidance}` : base;
  }

  // Strong mode — true variation, same concept fresh execution
  const brightKeywords = [
    'day', 'bright', 'sun', 'solar', 'noon', 'snow', 'stadium', 'beach',
    'outdoor', 'sky', 'high-key', 'studio', 'white', 'light', 'morning',
    'afternoon', 'cloudy', 'overcast',
  ];
  const userWantsBright = guidance.length > 0 &&
    brightKeywords.some(kw => guidance.toLowerCase().includes(kw));

  const antiDarkRule = userWantsBright
    ? 'LIGHTING: The scene MUST be brightly lit — high-key, vivid, well-illuminated. No dark backgrounds, no night scenes.'
    : 'LIGHTING: Avoid defaulting to dark/moody backgrounds just because the subject has glowing or fire elements. Match lighting to the original.';

  const variation = [
    'Using the reference image I provided as inspiration, GENERATE A COMPLETELY NEW IMAGE from scratch that is a creative variation of it.',
    'CRITICAL RULES:',
    '- You MUST generate a FULL NEW IMAGE at the SAME dimensions and aspect ratio as the reference. Do NOT crop, zoom, pan, or trim the reference image. Do NOT just slightly modify the reference — create something NEW.',
    '- The output must be a freshly generated image, NOT a filtered/adjusted version of the input.',
    brandIdentity,
    'What to KEEP: The same brand, same type of subject, same general theme and concept. The viewer should recognize it as the same brand and campaign.',
    'What to CHANGE CREATIVELY: Reimagine the composition — try a different angle, adjust the subject pose or position, vary the arrangement of elements, enhance or rearrange background details, experiment with different dramatic effects (particles, energy, atmosphere). Make it look like a professional designer created an alternate version.',
    'Output quality must be EQUAL or BETTER than the original. Photorealistic, high detail, no text, no logos, no watermarks.',
    antiDarkRule,
  ].join('\n');

  if (guidance) {
    return `${variation}\n\nCreative direction: ${guidance}`;
  }
  return variation;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageUrl, mode = 'subtle', guidance = '', count = 2, brand = '' } = req.body;
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

    const prompt   = buildGeminiPrompt(mode, guidance, brand);
    const b64Image = Buffer.from(imgArrayBuffer).toString('base64');

    console.log(`[generate-variations-gemini] mode=${mode}, prompt="${prompt.substring(0, 80)}..."`);

    // ------------------------------------------------------------------
    // 2. Authenticate
    // ------------------------------------------------------------------
    const accessToken = await getServiceAccountAccessToken(req);
    const project     = getProjectNumber();

    // ------------------------------------------------------------------
    // 3. Call Gemini native image generation via Vertex AI
    //
    // Uses generateContent with responseModalities: ["IMAGE", "TEXT"]
    // Gemini sees the full source image and generates a true variation
    // where BOTH subject and background can change.
    //
    // Temperature controls variation amount:
    //   subtle = 0.4 (close to original)
    //   strong = 1.0 (more creative freedom)
    // ------------------------------------------------------------------
    const geminiModel = 'gemini-2.5-flash-image';
    const vertexUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/${project}/locations/us-central1/publishers/google/models/${geminiModel}:generateContent`;

    const numVariations = Math.min(Number(count) || 2, 2);
    const temperature = mode === 'subtle' ? 0.4 : 1.4;

    const makeRequest = () =>
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
              {
                inlineData: {
                  mimeType,
                  data: b64Image,
                },
              },
              {
                text: prompt,
              },
            ],
          }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            temperature,
            maxOutputTokens: 8192,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          ],
        }),
      });

    // Fire parallel requests for variation diversity
    const results = await Promise.allSettled(
      Array.from({ length: numVariations }, makeRequest)
    );

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

      // Gemini response: { candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }, ...] } }] }
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
          break; // Take first image from each response
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

    // Return variations + engine tag so the frontend can label them correctly
    return res.status(200).json({ variations, engine: 'imagen' });

  } catch (error) {
    console.error('[gemini] error:', error);
    return res.status(500).json({
      error:   'Gemini variation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
