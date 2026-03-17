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

  const cloudRunUrl = 'https://image-generator-933050179388.us-central1.run.app/edit-image';

  try {
    const { imageUrl, editInstructions, resolution = '1K' } = req.body;

    if (!imageUrl || !editInstructions) {
      return res.status(400).json({ error: 'Image URL and edit instructions are required' });
    }

    console.log('Sending image edit request to Cloud Run:', { imageUrl, editInstructions, resolution });

    const response = await fetch(cloudRunUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrl,
        editInstructions,
        resolution,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cloud Run edit error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Failed to edit image',
        details: errorText,
      });
    }

    const data = await response.json();
    console.log('Cloud Run image edit response:', data);

    // 🔹 Normalize webViewLink
    const webViewLink =
      data.webViewLink ||
      data.viewUrl ||
      (data.fileId ? `https://drive.google.com/file/d/${data.fileId}/view?usp=drivesdk` : null);

    if (!webViewLink) {
      console.warn('No webViewLink or fileId found in n8n response');
    }

    return res.status(200).json({
      ...data,
      webViewLink,
    });
  } catch (error) {
    console.error('Image edit error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
