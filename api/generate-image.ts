import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, provider, aspectRatio, imageSize, backend, resolution } = req.body;

    if (!prompt || !provider) {
      return res.status(400).json({ error: 'Prompt and provider are required' });
    }

    // ── Cloud Run backend (high-res 1K/2K/4K) ──────────────────────────────
    if (backend === 'cloud-run') {
      const cloudRunUrl = process.env.CLOUD_RUN_IMAGE_GENERATOR_URL;
      if (!cloudRunUrl) {
        return res.status(500).json({ error: 'CLOUD_RUN_IMAGE_GENERATOR_URL is not configured' });
      }

      console.log('Sending to Cloud Run backend:', { prompt, provider, aspectRatio, resolution });

      const response = await fetch(cloudRunUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        return res.status(response.status).json({ error: 'Cloud Run failed', details: errorText });
      }

      const data = await response.json();
      console.log('Cloud Run RAW response:', JSON.stringify(data));
      const result = Array.isArray(data) ? data[0] : data;
      return res.status(200).json(result);
    }

    // ── n8n backend (default) ──────────────────────────────────────────────
    const webhookUrl = process.env.N8N_WEBHOOK_GENERATE_IMAGE;
    if (!webhookUrl) {
      console.error('N8N_WEBHOOK_GENERATE_IMAGE is not configured');
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
      console.error('n8n webhook error:', response.status, errorText);
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