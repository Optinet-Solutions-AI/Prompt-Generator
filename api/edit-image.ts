import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Edit Image via OpenAI gpt-image-1 (primary) or Cloud Run (fallback) ──────
//
// Primary path: Uses OpenAI's image edit API directly — same as generate-variations.ts.
// Handles both regular URLs and base64 data URLs natively.
//
// Fallback path: If OPENAI_API_KEY is not set, falls back to Cloud Run proxy
// which requires GCP Workload Identity Federation auth.

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

// ── OpenAI Direct Edit ───────────────────────────────────────────────────────

async function editViaOpenAI(
  imgArrayBuffer: ArrayBuffer,
  mimeType: string,
  editInstructions: string,
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
  const outputSize = sizeForDimensions(dims);

  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('image', new File([imgArrayBuffer], `source.${ext}`, { type: baseMime }));
  form.append('prompt', editInstructions);
  form.append('n', '1');
  form.append('quality', 'high');
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
    const { imageUrl, editInstructions, resolution = '1K' } = req.body;

    if (!imageUrl || !editInstructions) {
      return res.status(400).json({ error: 'Image URL and edit instructions are required' });
    }

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

    // ── Primary: OpenAI direct edit ────────────────────────────────────
    if (process.env.OPENAI_API_KEY) {
      console.log('[edit-image] Using OpenAI direct edit');
      const result = await editViaOpenAI(imgArrayBuffer, mimeType, editInstructions);
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
