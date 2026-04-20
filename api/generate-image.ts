import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Google Drive helpers (inlined — Vercel API routes must be self-contained) ──

async function getGoogleAccessToken(): Promise<string> {
  const refreshToken = process.env.CLOUD_RUN_REFRESH_TOKEN;
  const clientId     = process.env.CLOUD_RUN_CLIENT_ID;
  const clientSecret = process.env.CLOUD_RUN_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing CLOUD_RUN_REFRESH_TOKEN / CLIENT_ID / CLIENT_SECRET');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: refreshToken,
      client_id: clientId, client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json() as { access_token?: string };
  if (data.access_token) return data.access_token;
  throw new Error('No access_token returned');
}

/** Make a Drive file readable by anyone with the link (so server-side fetches work). */
async function makeFilePublic(fileId: string, accessToken: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
}

async function uploadImageToDrive(params: {
  imageBuffer: Buffer; mimeType: string; filename: string;
  folderId: string; provider: string; aspectRatio: string;
  resolution: string; accessToken: string;
}): Promise<string> {
  const { imageBuffer, mimeType, filename, folderId, provider, aspectRatio, resolution, accessToken } = params;
  const metadata = { name: filename, parents: [folderId], appProperties: { provider, aspectRatio, resolution } };
  const boundary = 'drive_upload_boundary_xyz';
  const metaJson = JSON.stringify(metadata);
  const partHeaders =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(partHeaders, 'utf-8'), imageBuffer, Buffer.from(closing, 'utf-8')]);
  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary="${boundary}"` }, body }
  );
  if (!uploadRes.ok) throw new Error(`Drive upload failed: ${await uploadRes.text()}`);
  const file = await uploadRes.json() as { id: string };
  return file.id;
}

// ------------------------------------------------------------------
// Brand-specific mandatory style rules.
// These are injected into EVERY prompt for the matching brand so the
// image model cannot ignore them. Use strong, imperative language.
// ------------------------------------------------------------------
const BRAND_STYLES: Record<string, string> = {
  roosterbet:
    '[MANDATORY BRAND SIGNATURE — DO NOT OMIT] ' +
    'Intense fire elements and flames MUST be clearly visible throughout the scene. ' +
    'Flames, embers, and fiery glow are NON-NEGOTIABLE regardless of the outfit, sport, or match depicted. ' +
    'The fire must feel dramatic and integrated into the composition — not a subtle overlay.',
  fortuneplay:
    '[MANDATORY BRAND SIGNATURE — DO NOT OMIT] ' +
    'Luxurious aesthetics are required: prominent gold accents, warm gold lighting, and floating gold dust particles ' +
    'MUST be visible in the scene. Every surface should catch golden light. ' +
    'The overall mood must feel opulent, rich, and premium — gold is the defining visual element.',
  luckyvibe:
    '[MANDATORY BRAND SIGNATURE — DO NOT OMIT] ' +
    'Sunset lighting is required with a warm beach-like environment. ' +
    'Sand MUST be visibly integrated into the scene — even if the setting is a grass stadium, sand must be present. ' +
    'Palm trees MUST appear in the background. The atmosphere should feel tropical and vibrant.',
};

/**
 * Enriches a raw user prompt with brand-mandatory style rules.
 * The brand rules are prepended so the model sees them FIRST (highest priority).
 */
function enrichPromptWithBrandStyle(prompt: string, brand: string): string {
  if (!brand) return prompt;
  const key = brand.toLowerCase().replace(/\s+/g, '');
  const style = BRAND_STYLES[key];
  if (!style) return prompt;
  return `${style}\n\n${prompt}`;
}

/**
 * Authenticates to Cloud Run using Vercel Workload Identity Federation (WIF).
 *
 * Flow:
 *  1. Vercel injects a short-lived OIDC token into each function invocation
 *  2. We swap it with Google STS for a federated access token
 *  3. We use that access token to impersonate the service account and get a
 *     Cloud Run ID token (the thing Cloud Run actually accepts)
 *
 * No keys, no refresh tokens — everything is automatic.
 */
async function getCloudRunIdToken(cloudRunUrl: string, req: VercelRequest): Promise<string> {
  const workloadProvider = process.env.GCP_WORKLOAD_PROVIDER;
  const serviceAccount   = process.env.GCP_SERVICE_ACCOUNT;

  if (!workloadProvider || !serviceAccount) {
    const missing = [
      !workloadProvider && 'GCP_WORKLOAD_PROVIDER',
      !serviceAccount   && 'GCP_SERVICE_ACCOUNT',
    ].filter(Boolean).join(', ');
    throw new Error(`Missing env vars: ${missing}`);
  }

  // Vercel injects the OIDC token into the request header for each invocation
  const oidcToken =
    (req.headers['x-vercel-oidc-token'] as string | undefined) ||
    process.env.VERCEL_OIDC_TOKEN;

  if (!oidcToken) {
    throw new Error(
      'No Vercel OIDC token found. Make sure OIDC is enabled in Vercel project settings ' +
      '(Settings → Security → Enable Vercel Authentication).'
    );
  }

  // ── Step 1: Exchange Vercel OIDC token → Google federated access token ──
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
    const err = await stsRes.text();
    throw new Error(`Google STS token exchange failed (${stsRes.status}): ${err}`);
  }
  const { access_token: federatedToken } = await stsRes.json();

  // ── Step 2: Use federated token to generate a Cloud Run ID token ─────────
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
    const err = await idTokenRes.text();
    throw new Error(`generateIdToken failed (${idTokenRes.status}): ${err}`);
  }
  const { token } = await idTokenRes.json();
  return token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, provider, aspectRatio, imageSize, backend, resolution, brand } = req.body;

    if (!prompt || !provider) {
      return res.status(400).json({ error: 'Prompt and provider are required' });
    }

    // Inject brand-mandatory style rules into the prompt
    const enrichedPrompt = enrichPromptWithBrandStyle(prompt, brand || '');

    // ChatGPT prefix — gpt-image-1 responds to natural language quality descriptors
    const CHATGPT_PREFIX = 'Photorealistic, cinematic photography, hyperrealistic render, ultra-sharp focus, professional DSLR quality. ';
    const finalPrompt = CHATGPT_PREFIX + enrichedPrompt;

    // Gemini/Imagen prefix — Imagen responds well to comma-separated quality tags up front
    const GEMINI_PREFIX = 'photorealistic, hyperrealistic, cinematic lighting, sharp focus, high detail, 8K resolution, professional color grading, dramatic composition, volumetric atmosphere, award-winning photography. ';
    const geminiPrompt = GEMINI_PREFIX + enrichedPrompt;

    // ── Primary: OpenAI direct generation (ChatGPT provider) ────────────────
    // Uses gpt-image-1 via Vercel's OPENAI_API_KEY — no Cloud Run needed.
    const openaiKey = process.env.OPENAI_API_KEY;
    if (provider === 'chatgpt' && openaiKey) {
      console.log('[generate-image] Using OpenAI direct generation');

      // Map aspect ratio to OpenAI image size
      const sizeMap: Record<string, string> = {
        '16:9': '1536x1024',
        '9:16': '1024x1536',
        '1:1':  '1024x1024',
        '4:3':  '1536x1024',
        '3:4':  '1024x1536',
      };
      const outputSize = sizeMap[aspectRatio] || '1536x1024';

      // Map resolution to quality
      const qualityMap: Record<string, 'low' | 'medium' | 'high'> = {
        '4K': 'high', '3K': 'high', '2K': 'medium', '1K': 'low',
      };
      const outputQuality = qualityMap[resolution] || 'medium';

      console.log(`[generate-image] aspectRatio=${aspectRatio} → size=${outputSize}, resolution=${resolution} → quality=${outputQuality}`);

      const resp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: finalPrompt,
          n: 1,
          size: outputSize,
          quality: outputQuality,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('[generate-image] OpenAI error:', resp.status, errText);
        return res.status(500).json({ error: `OpenAI failed (${resp.status}): ${errText}` });
      }

      const data = await resp.json() as { data?: Array<{ b64_json?: string; url?: string }> };
      const item = data.data?.[0];
      const imageUrl = item?.url
        ? item.url
        : item?.b64_json
          ? `data:image/png;base64,${item.b64_json}`
          : null;

      if (!imageUrl) {
        return res.status(500).json({ error: 'No image returned from OpenAI' });
      }

      // ── Save ChatGPT image to Google Drive ─────────────────────────────
      // This makes it persistent and visible in the Image Library across
      // any domain/deployment — not just in the current browser's localStorage.
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (folderId) {
        try {
          const accessToken = await getGoogleAccessToken();

          // Fetch or decode the image bytes
          let imageBuffer: Buffer;
          let imageMime = 'image/png';

          if (imageUrl.startsWith('data:')) {
            const [header, b64] = imageUrl.split(',');
            imageMime    = header.match(/data:([^;]+)/)?.[1] || 'image/png';
            imageBuffer  = Buffer.from(b64, 'base64');
          } else {
            const imgRes = await fetch(imageUrl);
            imageMime    = imgRes.headers.get('content-type')?.split(';')[0] || 'image/png';
            imageBuffer  = Buffer.from(await imgRes.arrayBuffer());
          }

          const ext      = imageMime.split('/')[1] || 'png';
          const filename = `chatgpt-${Date.now()}.${ext}`;

          const fileId = await uploadImageToDrive({
            imageBuffer,
            mimeType:    imageMime,
            filename,
            folderId,
            provider:    'chatgpt',
            aspectRatio: aspectRatio || '16:9',
            resolution:  resolution  || '1K',
            accessToken,
          });

          // Make public so server-side fetches (edit, variations) work without auth
          await makeFilePublic(fileId, accessToken);

          // Return Drive URL so frontend stores Drive link (not temp OpenAI URL)
          const driveUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
          return res.status(200).json({
            fileId,
            public_url: driveUrl,
            imageUrl:   driveUrl,
            url:        driveUrl,
          });

        } catch (driveErr) {
          // Drive upload failed — fall back to returning the OpenAI URL
          console.error('[generate-image] Drive upload failed, returning OpenAI URL:', driveErr);
        }
      }

      // Fallback: no Drive folder configured or upload failed
      return res.status(200).json({ imageUrl, url: imageUrl });
    }

    // ── Fallback: Cloud Run backend ─────────────────────────────────────────
    if (backend === 'cloud-run') {
      const cloudRunUrl =
        process.env.GCP_CLOUD_RUN_URL ||
        process.env.CLOUD_RUN_URL ||
        process.env.NEXT_PUBLIC_IMAGE_API_URL;

      if (!cloudRunUrl) {
        return res.status(500).json({ error: 'GCP_CLOUD_RUN_URL is not configured' });
      }

      const idToken = await getCloudRunIdToken(cloudRunUrl, req);

      console.log('Sending to Cloud Run:', { provider, aspectRatio, resolution });

      // Retry helper — tries the Cloud Run call up to `maxAttempts` times.
      // Retries on network timeout or 5xx server errors. Gives up on 4xx (bad request).
      const TIMEOUT_MS   = 120_000; // 2 minutes — image generation can be slow
      const MAX_ATTEMPTS = 2;

      let lastError: string = 'Unknown error';

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        // AbortController lets us cancel the fetch if it takes too long
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
          const response = await fetch(`${cloudRunUrl}/generate-image`, {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              prompt: enrichedPrompt,
              provider,
              aspectRatio: aspectRatio || '1:1',
              resolution:  resolution  || '1K',
            }),
            signal: controller.signal,
          });

          clearTimeout(timer);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Cloud Run error (attempt ${attempt}):`, response.status, errorText);

            // 4xx = bad request — retrying won't help, fail immediately
            if (response.status >= 400 && response.status < 500) {
              return res.status(500).json({
                error: `Cloud Run failed (${response.status}): ${errorText || 'No details returned'}`
              });
            }

            // 5xx = server error — record it and retry
            lastError = `Cloud Run failed (${response.status}): ${errorText || 'No details returned'}`;
            continue;
          }

          const data = await response.json();
          console.log('Cloud Run response:', JSON.stringify(data));
          const result = Array.isArray(data) ? data[0] : data;

          // ── Save Gemini image to our Drive folder ───────────────────────
          // Cloud Run may save to its own folder. We re-save to our designated
          // folder so the Image Library can list ALL images from one place.
          const geminiFolder = process.env.GOOGLE_DRIVE_FOLDER_ID;
          if (geminiFolder) {
            try {
              // Get the image URL from Cloud Run response
              const cloudRunImageUrl =
                result.public_url || result.imageUrl || result.image_url ||
                result.url || result.displayUrl ||
                (result.fileId ? `https://lh3.googleusercontent.com/d/${result.fileId}` : null);

              if (cloudRunImageUrl && !cloudRunImageUrl.startsWith('data:')) {
                const geminiAccessToken = await getGoogleAccessToken();
                const imgRes  = await fetch(cloudRunImageUrl);
                const imgMime = imgRes.headers.get('content-type')?.split(';')[0] || 'image/png';
                const imgBuf  = Buffer.from(await imgRes.arrayBuffer());
                const ext     = imgMime.split('/')[1] || 'png';

                const geminiFileId = await uploadImageToDrive({
                  imageBuffer: imgBuf,
                  mimeType:    imgMime,
                  filename:    `gemini-${Date.now()}.${ext}`,
                  folderId:    geminiFolder,
                  provider:    'gemini',
                  aspectRatio: aspectRatio || '16:9',
                  resolution:  resolution  || '1K',
                  accessToken: geminiAccessToken,
                });

                // Make public so server-side fetches (edit, variations) work without auth
                await makeFilePublic(geminiFileId, geminiAccessToken);

                const driveUrl = `https://lh3.googleusercontent.com/d/${geminiFileId}`;
                // Return Drive URL so Image Library always gets a persistent link
                return res.status(200).json({
                  ...result,
                  fileId:     geminiFileId,
                  public_url: driveUrl,
                  imageUrl:   driveUrl,
                  url:        driveUrl,
                });
              }
            } catch (driveErr) {
              console.error('[generate-image] Gemini Drive save failed:', driveErr);
              // Fall through and return original Cloud Run result
            }
          }

          return res.status(200).json(result);

        } catch (fetchError: unknown) {
          clearTimeout(timer);

          // AbortError = our timeout fired — the request took too long
          const isTimeout =
            fetchError instanceof Error && fetchError.name === 'AbortError';

          if (isTimeout) {
            console.error(`Cloud Run timed out after ${TIMEOUT_MS / 1000}s (attempt ${attempt})`);
            lastError = `Cloud Run did not respond within ${TIMEOUT_MS / 1000} seconds`;
          } else {
            console.error(`Cloud Run network error (attempt ${attempt}):`, fetchError);
            lastError = fetchError instanceof Error ? fetchError.message : 'Network error';
          }

          // If this was the last attempt, fall through to the error response below
        }
      }

      // All attempts exhausted
      return res.status(500).json({ error: lastError });
    }

    // Cloud Run is the only supported backend
    return res.status(400).json({
      error: 'Only cloud-run backend is supported. Set backend: "cloud-run" in the request.',
    });

  } catch (error) {
    console.error('Image generation error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
