import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Generate Image Variations via Vertex AI Imagen (imagegeneration@006 bgswap) ──
//
// bgswap = background swap: Imagen automatically detects the foreground subject
// and replaces ONLY the background based on the prompt.
// This is ideal for brand images — the character/subject is preserved pixel-perfect,
// only the environment around them changes.
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
  // (generateAccessToken gives a proper SA-level token that Vertex AI accepts)
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
// Format: "projects/{number}/locations/global/workloadIdentityPools/..."
function getProjectNumber(): string {
  const wp = process.env.GCP_WORKLOAD_PROVIDER || '';
  const match = wp.match(/^projects\/(\d+)\//);
  if (match) return match[1];
  // Fallback env vars
  const explicit = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (explicit) return explicit;
  // Last resort: hard-coded from the Cloud Run URL we already have
  return '69452143295';
}

// Read width/height from raw PNG or JPEG header bytes — same logic as generate-variations.ts
function detectDimensions(buffer: ArrayBuffer): { width: number; height: number } | null {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return {
      width:  (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19],
      height: (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23],
    };
  }
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let i = 2;
    while (i < bytes.length - 8) {
      if (bytes[i] === 0xFF) {
        const marker = bytes[i + 1];
        if (marker >= 0xC0 && marker <= 0xC3) {
          return {
            height: (bytes[i + 5] << 8) | bytes[i + 6],
            width:  (bytes[i + 7] << 8) | bytes[i + 8],
          };
        }
        if (i + 3 < bytes.length) {
          i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
        } else break;
      } else {
        i++;
      }
    }
  }
  return null;
}

// Map source aspect ratio → Vertex AI accepted string
function aspectRatioString(dims: { width: number; height: number } | null): string {
  if (!dims) return '1:1';
  const r = dims.width / dims.height;
  if (r > 1.6)  return '16:9';
  if (r > 1.2)  return '4:3';
  if (r < 0.65) return '9:16';
  if (r < 0.85) return '3:4';
  return '1:1';
}

// Build the background description prompt for Imagen bgswap.
//
// Key difference from OpenAI:
//   - OpenAI receives the full image + instructions and edits inline.
//   - Imagen bgswap receives the image as a pixel mask and the PROMPT describes
//     the NEW BACKGROUND ONLY. The foreground subject comes from the image automatically.
//   - So the prompt must be a scene/environment description, NOT editing instructions.
//
// We still apply the same anti-dark-bias logic for strong mode.
function buildImagenPrompt(mode: string, guidance: string): string {
  const brightKeywords = [
    'day', 'bright', 'sun', 'solar', 'noon', 'snow', 'stadium', 'beach',
    'outdoor', 'sky', 'high-key', 'studio', 'white', 'light', 'morning',
    'afternoon', 'cloudy', 'overcast',
  ];
  const userWantsBright = guidance.length > 0 &&
    brightKeywords.some(kw => guidance.toLowerCase().includes(kw));

  if (mode === 'subtle') {
    // For subtle, describe a near-identical scene with only minor changes
    const base = 'Same scene as the original. Very slight variation in ambient lighting warmth and color temperature only. Keep composition and environment essentially identical.';
    return guidance ? `${base} ${guidance}.` : base;
  }

  // Strong mode — describe moderate changes to the same scene, not a full replacement
  const lightingNote = userWantsBright
    ? 'Brightly lit environment, high-key lighting, vivid colors, no dark shadows. '
    : 'Avoid dark or moody backgrounds unless the direction specifically calls for it. ';

  const qualityNote = 'Photorealistic, high quality, cinematic lighting, no text, no logos, no watermarks.';

  if (guidance) {
    return `${lightingNote}The same environment as the original with moderate variations. ${guidance}. ${qualityNote}`;
  }
  return `${lightingNote}The same environment as the original with moderate variations. Shift the color palette, change the time of day, alter background details like crowd placement or atmospheric effects. Keep the same general setting and location type. ${qualityNote}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageUrl, mode = 'subtle', guidance = '', count = 2 } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });

    // ------------------------------------------------------------------
    // 1. Fetch + encode source image as base64 (Vertex AI needs raw bytes)
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

    const dims        = detectDimensions(imgArrayBuffer);
    const aspectRatio = aspectRatioString(dims);
    const prompt      = buildImagenPrompt(mode, guidance);
    const b64Image    = Buffer.from(imgArrayBuffer).toString('base64');

    console.log(`[generate-variations-imagen] dims=${JSON.stringify(dims)}, ratio=${aspectRatio}, mode=${mode}, prompt="${prompt.substring(0, 80)}..."`);

    // ------------------------------------------------------------------
    // 2. Authenticate
    // ------------------------------------------------------------------
    const accessToken = await getServiceAccountAccessToken(req);
    const project     = getProjectNumber();

    // ------------------------------------------------------------------
    // 3. Call Vertex AI imagen-3.0-capability-001 with BGSWAP edit mode
    //
    // API format changed in Imagen 3 capability model vs the old imagegeneration@006:
    //   - Image goes in referenceImages[] with referenceType REFERENCE_TYPE_RAW
    //   - editMode moves to parameters level (not inside editConfig)
    //   - editConfig now takes baseSteps instead of editMode
    //   - Mask auto-detection via MASK_MODE_BACKGROUND (no mask image required)
    // ------------------------------------------------------------------
    const vertexUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/${project}/locations/us-central1/publishers/google/models/imagen-3.0-capability-001:predict`;

    const numVariations = Math.min(Number(count) || 2, 2);

    // Use different seeds per request so we get actual variation between the two results
    const makeRequest = (seed: number) =>
      fetch(vertexUrl, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          instances: [{
            prompt,
            referenceImages: [
              {
                // The source image to edit
                referenceType: 'REFERENCE_TYPE_RAW',
                referenceId: 1,
                referenceImage: {
                  bytesBase64Encoded: b64Image,
                },
              },
              {
                // Auto-detect background for masking — no mask image needed
                referenceType: 'REFERENCE_TYPE_MASK',
                referenceId: 2,
                maskImageConfig: {
                  maskMode: 'MASK_MODE_BACKGROUND',
                  dilation: 0.0,
                },
              },
            ],
          }],
          parameters: {
            // Subtle: BGSWAP keeps scene nearly identical with minor tweaks
            // Strong: INPAINT_INSERTION modifies the background region without full replacement
            editMode: mode === 'subtle' ? 'EDIT_MODE_BGSWAP' : 'EDIT_MODE_INPAINT_INSERTION',
            editConfig: {
              baseSteps: mode === 'subtle' ? 75 : 50,
            },
            sampleCount: 1,
            seed,
            safetyFilterLevel: 'block_some',
            personGeneration: 'allow_adult',
          },
        }),
      });

    const seeds   = Array.from({ length: numVariations }, () => Math.floor(Math.random() * 2 ** 31));
    const results = await Promise.allSettled(seeds.map(makeRequest));

    const variations: { imageUrl: string }[] = [];
    const apiErrors: string[] = [];

    for (const result of results) {
      if (result.status === 'rejected') {
        const msg = String(result.reason);
        console.error('[imagen] request rejected:', msg);
        apiErrors.push(msg);
        continue;
      }
      const resp = result.value;
      if (!resp.ok) {
        const errText = await resp.text();
        const msg = `Vertex AI HTTP ${resp.status}: ${errText}`;
        console.error('[imagen]', msg);
        apiErrors.push(msg);
        continue;
      }
      const data = await resp.json() as {
        predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
      };
      const pred = data.predictions?.[0];
      if (pred?.bytesBase64Encoded) {
        const outMime = pred.mimeType || 'image/png';
        variations.push({ imageUrl: `data:${outMime};base64,${pred.bytesBase64Encoded}` });
      } else {
        const msg = `No bytesBase64Encoded in prediction: ${JSON.stringify(data).substring(0, 300)}`;
        console.error('[imagen]', msg);
        apiErrors.push(msg);
      }
    }

    if (variations.length === 0) {
      return res.status(500).json({
        error:     'Imagen failed to generate any variations.',
        apiErrors,
        hint:      'bgswap requires a clear foreground subject. Ensure the source image has a distinct subject.',
      });
    }

    // Return variations + engine tag so the frontend can label them correctly
    return res.status(200).json({ variations, engine: 'imagen' });

  } catch (error) {
    console.error('[imagen] error:', error);
    return res.status(500).json({
      error:   'Imagen variation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
