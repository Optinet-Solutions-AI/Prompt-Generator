import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseDelete } from './_supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { record_id, img_url } = req.body;
    if (!record_id && !img_url) return res.status(400).json({ error: 'record_id or img_url is required' });

    // Delete by record_id if available, otherwise by img_url
    if (record_id) {
      await supabaseDelete(`liked_images?record_id=eq.${encodeURIComponent(record_id)}`);
    } else {
      await supabaseDelete(`liked_images?img_url=eq.${encodeURIComponent(img_url)}`);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in unlike-img:', error);
    return res.status(500).json({
      error: 'Failed to unlike image',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
