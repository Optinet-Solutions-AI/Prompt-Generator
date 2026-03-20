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

  const baseUrl = process.env.CLOUD_RUN_URL || 'https://image-generator-933050179388.us-central1.run.app';
  const cloudRunUrl = `${baseUrl}/edit-image`;

  try {
    const { imageUrl, editInstructions, resolution = '1K' } = req.body;

    if (!imageUrl || !editInstructions) {
      return res.status(400).json({ error: 'Image URL and edit instructions are required' });
    }

    const idToken = await getCloudRunIdToken();

    console.log('Sending image edit request to Cloud Run:', { imageUrl, editInstructions, resolution });

    const response = await fetch(cloudRunUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ imageUrl, editInstructions, resolution }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cloud Run edit error:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to edit image', details: errorText });
    }

    const data = await response.json();
    console.log('Cloud Run image edit response:', data);

    const webViewLink =
      data.webViewLink ||
      data.viewUrl ||
      (data.fileId ? `https://drive.google.com/file/d/${data.fileId}/view?usp=drivesdk` : null);

    return res.status(200).json({ ...data, webViewLink });

  } catch (error) {
    console.error('Image edit error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
