import type { VercelRequest, VercelResponse } from '@vercel/node';
import { guard } from './_session.js';

const SUPABASE_URL             = process.env.SUPABASE_URL             || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function sbDelete(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey':        SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!res.ok) throw new Error(`Supabase DELETE failed (${res.status}): ${await res.text()}`);
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Signed-in users only; they can remove their own favorites and the old
  // team favorites from before accounts (owner_id is null), nobody else's.
  const me = await guard(req, res);
  if (!me) return;
  const mineOrTeam = `&or=(owner_id.eq.${me.id},owner_id.is.null)`;

  try {
    const { record_id, img_url } = req.body;
    if (!record_id && !img_url) return res.status(400).json({ error: 'record_id or img_url is required' });

    if (record_id) {
      await sbDelete(`liked_images?record_id=eq.${encodeURIComponent(record_id)}${mineOrTeam}`);
    } else {
      await sbDelete(`liked_images?img_url=eq.${encodeURIComponent(img_url)}${mineOrTeam}`);
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
