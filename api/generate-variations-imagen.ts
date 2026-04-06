import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Generate Image Variations via Gemini Native Image Generation ─────────────
//
// Uses Gemini's native image generation (generateContent with image output).
// Gemini sees the FULL image and generates a completely new variation.
//
// SPECTRUM APPROACH (v2):
//   Generates 4 variations using 4 DIFFERENT prompts at increasing creative levels,
//   each paired with an appropriate temperature value:
//
//   Tier 1 — Color Grade:    temp 0.3  — almost identical, just color grade shift
//   Tier 2 — Lighting:       temp 0.5  — same composition, different light/mood
//   Tier 3 — Composition:    temp 0.8  — different angle/layout, same subject
//   Tier 4 — Reimagine:      temp 1.0  — fresh execution, same brand/concept
//
//   Mode controls which tiers are used:
//     subtle → T1, T1, T2, T2  (conservative spread)
//     strong → T2, T3, T3, T4  (creative spread)
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

function getProjectNumber(): string {
  const wp = process.env.GCP_WORKLOAD_PROVIDER || '';
  const match = wp.match(/^projects\/(\d+)\//);
  if (match) return match[1];
  const explicit = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (explicit) return explicit;
  return '69452143295';
}

// ------------------------------------------------------------------
// Build a SPECTRUM of 4 prompts for Gemini.
//
// Gemini generates images from scratch (not inpainting like OpenAI edits),
// so the prompts include a "CRITICAL: generate a FULL NEW IMAGE" instruction.
// Each prompt is kept concise (3-4 sentences) to avoid contradictions.
// Temperature is paired per tier for natural progression.
// ------------------------------------------------------------------
function buildGeminiPromptSpectrum(
  mode: string,
  guidance: string,
  brand: string
): Array<{ prompt: string; temperature: number }> {
  // One-sentence brand rule
  const brandRule = brand
    ? `Preserve "${brand}" brand colors in the background and lighting; keep the subject's clothing/outfit colors exactly as in the original.`
    : 'Preserve the exact color palette and visual style of the original image.';

  const criticalRule = 'CRITICAL: Generate a FULL NEW IMAGE at the same dimensions and aspect ratio as the reference. Do NOT crop, zoom, or just filter the input — create a genuinely new image.';
  const qualityRule  = 'Photorealistic, high detail, no text, no logos. Match or exceed original quality.';

  const guidanceSuffix = guidance ? ` Creative direction: ${guidance}` : '';

  // T1 — Color Grade only (temp 0.3)
  const t1 = {
    prompt: [
      'Generate a NEW image that is a subtle color-grade variation of the reference image.',
      criticalRule,
      brandRule,
      'Keep the exact composition, subject, pose, and all elements identical. Only shift the overall warmth, color temperature, or tonal balance — like applying a different photo filter.',
      qualityRule,
    ].join(' ') + guidanceSuffix,
    temperature: 0.3,
  };

  // T2 — Lighting & Atmosphere (temp 0.5)
  const t2 = {
    prompt: [
      'Generate a NEW image that is a lighting variation of the reference image.',
      criticalRule,
      brandRule,
      'Keep the same composition and subject position. Change the lighting direction, intensity, or time-of-day feel — warmer golden-hour light, cooler studio light, or softer diffused light.',
      qualityRule,
    ].join(' ') + guidanceSuffix,
    temperature: 0.5,
  };

  // T3 — Composition Shift (temp 0.8)
  const t3 = {
    prompt: [
      'Generate a NEW image that is a composition variation of the reference image.',
      criticalRule,
      brandRule,
      'Keep the same subject, brand theme, and overall concept. Adjust the camera angle, subject positioning, or background arrangement — a different but equally compelling layout.',
      qualityRule,
    ].join(' ') + guidanceSuffix,
    temperature: 0.8,
  };

  // T4 — Creative Reimagining (temp 1.0)
  const t4 = {
    prompt: [
      'Using the reference image as inspiration, generate a COMPLETELY NEW IMAGE that is a fresh creative variation.',
      criticalRule,
      brandRule,
      'Same brand and general concept, completely new execution. Reimagine the subject pose, expression, and background. It should feel like an alternate version a professional designer created — same campaign, fresh energy.',
      qualityRule,
    ].join(' ') + guidanceSuffix,
    temperature: 1.0,
  };

  // Mode → tier selection
  if (mode === 'subtle') {
    return [t1, t1, t2, t2];
  }
  // strong
  return [t2, t3, t3, t4];
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageUrl, mode = 'subtle', guidance = '', count = 4, brand = '' } = req.body;
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
    // 2. Build the spectrum of prompts + temperatures
    // ------------------------------------------------------------------
    const numVariations = Math.min(Number(count) || 4, 4);
    const spectrum = buildGeminiPromptSpectrum(mode, guidance, brand).slice(0, numVariations);

    console.log(`[generate-variations-gemini] mode=${mode}, generating ${numVariations} tiered variations`);

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
            maxOutputTokens: 8192,
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
