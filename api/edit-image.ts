import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Edit Image ─────────────────────────────────────────────────────────────────
//
// Routes to the correct engine based on the `provider` field in the request body:
//
//   provider === 'gemini'  → Vertex AI gemini-2.5-flash-image (strict preservation)
//   provider === 'chatgpt' → OpenAI gpt-image-1 (primary) or Cloud Run (fallback)
//
// Gemini images MUST be edited by Gemini — sending them to OpenAI causes a
// visual "downgrade" because the two models have different style signatures.
// OpenAI images likewise stay on OpenAI.

export const config = { maxDuration: 300 };

// ── Helpers ──────────────────────────────────────────────────────────────────

// Read width/height from raw PNG or JPEG bytes to match output resolution.
function detectImageDimensions(buffer: ArrayBuffer): { width: number; height: number } | null {
  const bytes = new Uint8Array(buffer);

  // PNG: IHDR at byte 16-23
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    const width  = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }

  // JPEG: scan for SOF0-SOF3
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
        } else break;
      } else i++;
    }
  }

  return null;
}

function sizeForDimensions(dims: { width: number; height: number } | null): string {
  if (!dims) return 'auto';
  const { width, height } = dims;
  if (width > height) return '1536x1024';
  if (height > width) return '1024x1536';
  return '1024x1024';
}

// Match quality to source resolution — 'high' is significantly slower (~70s vs ~30s).
function qualityForDimensions(dims: { width: number; height: number } | null): 'low' | 'medium' | 'high' {
  if (!dims) return 'medium';
  const longest = Math.max(dims.width, dims.height);
  if (longest >= 1800) return 'high';   // 2K+ → high
  if (longest >= 900)  return 'medium'; // ~1K → medium
  return 'low';                          // thumbnails → low
}

// ── Gemini Edit (Vertex AI) ──────────────────────────────────────────────────

async function getGCPAccessToken(req: VercelRequest): Promise<string> {
  const workloadProvider = process.env.GCP_WORKLOAD_PROVIDER;
  const serviceAccount   = process.env.GCP_SERVICE_ACCOUNT;

  if (!workloadProvider || !serviceAccount) {
    throw new Error('Missing GCP_WORKLOAD_PROVIDER or GCP_SERVICE_ACCOUNT env vars');
  }

  const oidcToken =
    (req.headers['x-vercel-oidc-token'] as string | undefined) ||
    process.env.VERCEL_OIDC_TOKEN;

  if (!oidcToken) {
    throw new Error('No Vercel OIDC token found. OIDC must be enabled in Vercel project settings.');
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
  if (!stsRes.ok) throw new Error(`STS exchange failed (${stsRes.status}): ${await stsRes.text()}`);
  const { access_token: federatedToken } = await stsRes.json();

  const saRes = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${federatedToken}` },
      body: JSON.stringify({ scope: ['https://www.googleapis.com/auth/cloud-platform'] }),
    }
  );
  if (!saRes.ok) throw new Error(`SA token failed (${saRes.status}): ${await saRes.text()}`);
  const { accessToken } = await saRes.json();
  return accessToken;
}

function getGCPProjectNumber(): string {
  const wp = process.env.GCP_WORKLOAD_PROVIDER || '';
  const match = wp.match(/^projects\/(\d+)\//);
  if (match) return match[1];
  return process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '69452143295';
}

// Build a strict preservation prompt for Gemini edits.
// The constraint is front-loaded and emphatic so Gemini doesn't creatively
// reinterpret the image — it must make exactly one change and nothing else.
function buildGeminiEditPrompt(editInstructions: string): string {
  return [
    '⚠️ STRICT PRESERVATION EDIT — ABSOLUTE RULES, NEVER VIOLATE:',
    '1. Preserve ALL colors EXACTLY — every hue, saturation, and tone from the original must be maintained without change.',
    '2. Preserve the subject\'s appearance, clothing, and pose unless the edit instruction explicitly changes them.',
    '3. Preserve all lighting, shadows, atmospheric effects, and background style EXACTLY.',
    '4. Preserve the overall composition, layout, mood, quality, and visual style of the original image.',
    '5. Do NOT introduce any new visual elements, color shifts, style changes, or creative interpretations.',
    '',
    `THE ONLY CHANGE TO MAKE: ${editInstructions}`,
    '',
    'Apply ONLY the change described above. Every pixel that is not directly affected by that change must remain identical to the source image. No creative liberties. No improvements. No reinterpretations.',
  ].join('\n');
}

async function editViaGemini(
  imgArrayBuffer: ArrayBuffer,
  mimeType: string,
  editInstructions: string,
  req: VercelRequest,
): Promise<{ imageUrl: string }> {
  const accessToken = await getGCPAccessToken(req);
  const project     = getGCPProjectNumber();

  const b64Image = Buffer.from(imgArrayBuffer).toString('base64');
  const prompt   = buildGeminiEditPrompt(editInstructions);

  const vertexUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/${project}/locations/us-central1/publishers/google/models/gemini-2.5-flash-image:generateContent`;

  console.log('[edit-image] Using Gemini edit (strict preservation)');

  const resp = await fetch(vertexUrl, {
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
        // Low temperature enforces strict preservation — minimises creative drift
        temperature: 0.1,
        maxOutputTokens: 16384,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
      ],
    }),
  });

  if (!resp.ok) {
    throw new Error(`Vertex AI edit failed (${resp.status}): ${await resp.text()}`);
  }

  const data = await resp.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const outMime = part.inlineData.mimeType || 'image/png';
      return { imageUrl: `data:${outMime};base64,${part.inlineData.data}` };
    }
  }

  throw new Error(`No image in Gemini edit response: ${JSON.stringify(data).substring(0, 300)}`);
}

// ── OpenAI Direct Edit ───────────────────────────────────────────────────────

// Resolution-aware quality: when the user explicitly picks a resolution, use that.
function qualityForResolution(resolution: string): 'low' | 'medium' | 'high' {
  if (resolution === '4K' || resolution === '3K') return 'high';
  if (resolution === '2K') return 'medium';
  return 'low';
}

function sizeForResolution(resolution: string, dims: { width: number; height: number } | null): string {
  if (resolution === '4K' || resolution === '3K' || resolution === '2K') {
    if (!dims) return '1536x1024';
    return dims.width > dims.height ? '1536x1024'
         : dims.height > dims.width ? '1024x1536'
         : '1024x1024';
  }
  return sizeForDimensions(dims);
}

async function editViaOpenAI(
  imgArrayBuffer: ArrayBuffer,
  mimeType: string,
  editInstructions: string,
  resolution: string = '',
): Promise<{ imageUrl: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const extMap: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/webp': 'webp', 'image/gif': 'gif',
  };
  const baseMime = mimeType.split(';')[0].trim();
  const ext = extMap[baseMime] || 'png';

  const dims = detectImageDimensions(imgArrayBuffer);
  const outputSize    = resolution ? sizeForResolution(resolution, dims) : sizeForDimensions(dims);
  const outputQuality = resolution ? qualityForResolution(resolution) : qualityForDimensions(dims);

  console.log(`[edit-image] source dims: ${JSON.stringify(dims)}, resolution=${resolution} → quality=${outputQuality}, size=${outputSize}`);

  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('image', new File([imgArrayBuffer], `source.${ext}`, { type: baseMime }));
  form.append('prompt', editInstructions);
  form.append('n', '1');
  form.append('quality', outputQuality);
  form.append('size', outputSize);

  const resp = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI edit failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json() as { data?: Array<{ b64_json?: string; url?: string }> };
  const item = data.data?.[0];
  if (item?.url) return { imageUrl: item.url };
  if (item?.b64_json) return { imageUrl: `data:image/png;base64,${item.b64_json}` };
  throw new Error('No image in OpenAI response');
}

// ── Cloud Run Fallback ───────────────────────────────────────────────────────

async function getCloudRunIdToken(cloudRunUrl: string, req: VercelRequest): Promise<string> {
  const workloadProvider = process.env.GCP_WORKLOAD_PROVIDER;
  const serviceAccount   = process.env.GCP_SERVICE_ACCOUNT;

  if (!workloadProvider || !serviceAccount) {
    throw new Error('Missing GCP_WORKLOAD_PROVIDER or GCP_SERVICE_ACCOUNT env vars');
  }

  const oidcToken =
    (req.headers['x-vercel-oidc-token'] as string | undefined) ||
    process.env.VERCEL_OIDC_TOKEN;

  if (!oidcToken) {
    throw new Error('No Vercel OIDC token found');
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

  const idTokenRes = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateIdToken`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${federatedToken}`,
      },
      body: JSON.stringify({ audience: cloudRunUrl, includeEmail: true }),
    }
  );

  if (!idTokenRes.ok) {
    throw new Error(`generateIdToken failed (${idTokenRes.status}): ${await idTokenRes.text()}`);
  }
  const { token } = await idTokenRes.json();
  return token;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageUrl, editInstructions, resolution = '1K', provider = 'chatgpt' } = req.body;

    if (!imageUrl || !editInstructions) {
      return res.status(400).json({ error: 'Image URL and edit instructions are required' });
    }

    // Route Gemini images back to Gemini — NEVER fall through to OpenAI.
    // This prevents the visual downgrade that occurs when a Gemini-generated
    // image is edited by a different model with a different style signature.
    const useGemini = provider === 'gemini';

    // ── Resolve Google Drive view URLs to direct image links ──────────
    let resolvedUrl = imageUrl;
    if (typeof resolvedUrl === 'string') {
      // Convert Drive view URLs to direct download URLs
      const driveMatch = resolvedUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (driveMatch?.[1] && resolvedUrl.includes('drive.google.com')) {
        resolvedUrl = `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
        console.log('[edit-image] Resolved Drive URL to:', resolvedUrl);
      }
    }

    // ── Fetch + decode the source image ────────────────────────────────
    let imgArrayBuffer: ArrayBuffer;
    let mimeType = 'image/png';

    if (typeof resolvedUrl === 'string' && resolvedUrl.startsWith('data:')) {
      const [header, b64] = resolvedUrl.split(',');
      mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png';
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      imgArrayBuffer = arr.buffer;
    } else {
      const imgRes = await fetch(resolvedUrl as string);
      if (!imgRes.ok) {
        return res.status(400).json({ error: `Failed to fetch source image (${imgRes.status})` });
      }
      mimeType = imgRes.headers.get('content-type')?.split(';')[0].trim() || 'image/png';
      imgArrayBuffer = await imgRes.arrayBuffer();
    }

    // ── Gemini path — used for all Gemini-generated images ────────────
    if (useGemini) {
      const result = await editViaGemini(imgArrayBuffer, mimeType, editInstructions, req);
      return res.status(200).json({
        success: true,
        imageUrl: result.imageUrl,
        thumbnailUrl: result.imageUrl,
      });
    }

    // ── Primary: OpenAI direct edit (ChatGPT images only) ─────────────
    if (process.env.OPENAI_API_KEY) {
      console.log('[edit-image] Using OpenAI direct edit');
      const result = await editViaOpenAI(imgArrayBuffer, mimeType, editInstructions, resolution);
      return res.status(200).json({
        success: true,
        imageUrl: result.imageUrl,
        thumbnailUrl: result.imageUrl,
      });
    }

    // ── Fallback: Cloud Run proxy ──────────────────────────────────────
    const baseUrl =
      process.env.GCP_CLOUD_RUN_URL ||
      process.env.CLOUD_RUN_URL ||
      'https://image-generator-69452143295.us-central1.run.app';

    console.log('[edit-image] Falling back to Cloud Run:', baseUrl);
    const idToken = await getCloudRunIdToken(baseUrl, req);

    const response = await fetch(`${baseUrl}/edit-image`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ imageUrl, editInstructions, resolution }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[edit-image] Cloud Run error:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to edit image', details: errorText });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('[edit-image] error:', error);
    return res.status(500).json({
      error: 'Failed to edit image',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
