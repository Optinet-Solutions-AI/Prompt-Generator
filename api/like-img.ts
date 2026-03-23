import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabasePost } from './_supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { record_id, img_url, brand_name } = req.body;
    if (!img_url) return res.status(400).json({ error: 'img_url is required' });

    await supabasePost(
      'liked_images',
      {
        record_id:  record_id || `liked-${Date.now()}`,
        img_url,
        brand_name: brand_name || null,
      },
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in like-img:', error);
    return res.status(500).json({
      error: 'Failed to like image',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
