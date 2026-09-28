import type { VercelRequest, VercelResponse } from '@vercel/node';
import { guard } from './_session.js';

const SUPABASE_URL             = process.env.SUPABASE_URL             || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function sbPost(path: string, body: object, extra?: Record<string, string>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey':        SUPABASE_SERVICE_ROLE_KEY,
      ...extra,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase POST failed (${res.status}): ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Signed-in users only; the favorite belongs to them.
  const me = await guard(req, res);
  if (!me) return;

  try {
    const { record_id, img_url, brand_name } = req.body;
    if (!img_url) return res.status(400).json({ error: 'img_url is required' });

    await sbPost(
      'liked_images',
      {
        record_id:  record_id || `liked-${Date.now()}`,
        img_url,
        brand_name: brand_name || null,
        owner_id:   me.id,
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
