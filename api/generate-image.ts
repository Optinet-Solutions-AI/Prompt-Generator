import type { VercelRequest, VercelResponse } from '@vercel/node';

async function getCloudRunIdToken(): Promise<string> {
  const refreshToken = process.env.CLOUD_RUN_REFRESH_TOKEN;
  const clientId     = process.env.CLOUD_RUN_CLIENT_ID;
  const clientSecret = process.env.CLOUD_RUN_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing Cloud Run auth env vars');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh Cloud Run token: ${error}`);
  }

  const data = await response.json();
  if (data.id_token) return data.id_token;
  throw new Error('No id_token returned from Google token endpoint');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, provider, aspectRatio, imageSize, backend, resolution } = req.body;

    if (!prompt || !provider) {
      return res.status(400).json({ error: 'Prompt and provider are required' });
    }

    // ── Cloud Run backend (high-res 1K/2K/4K) ──────────────────────────────
    if (backend === 'cloud-run') {
      const cloudRunUrl = process.env.CLOUD_RUN_URL || process.env.NEXT_PUBLIC_IMAGE_API_URL;
      if (!cloudRunUrl) {
        return res.status(500).json({ error: 'CLOUD_RUN_URL is not configured' });
      }

      const idToken = await getCloudRunIdToken();

      console.log('Sending to Cloud Run backend:', { prompt, provider, aspectRatio, resolution });

      const response = await fetch(`${cloudRunUrl}/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          prompt,
          provider,
          aspectRatio: aspectRatio || '1:1',
          resolution: resolution || '1K',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Cloud Run error:', response.status, errorText);
        return res.status(500).json({
          error: `Cloud Run failed (${response.status}): ${errorText || 'No details returned'}`
        });
      }

      const data = await response.json();
      console.log('Cloud Run RAW response:', JSON.stringify(data));
      const result = Array.isArray(data) ? data[0] : data;
      return res.status(200).json(result);
    }

    // ── n8n backend (default) ──────────────────────────────────────────────
    const webhookUrl = process.env.N8N_WEBHOOK_GENERATE_IMAGE;
    if (!webhookUrl) {
      return res.status(500).json({ error: 'Image generation webhook URL is not configured' });
    }

    console.log('Sending image generation request to n8n:', { prompt, provider, aspectRatio, imageSize });

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        provider,
        aspectRatio: aspectRatio || '1:1',
        imageSize: imageSize || 'default',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: 'Failed to generate image', details: errorText });
    }

    const data = await response.json();
    console.log('n8n RAW response:', JSON.stringify(data));
    const result = Array.isArray(data) ? data[0] : data;
    return res.status(200).json(result);

  } catch (error) {
    console.error('Image generation error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
