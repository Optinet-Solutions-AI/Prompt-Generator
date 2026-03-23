import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseGet } from './_supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error: 'reference is required' });

    // 'reference' is the prompt_name — look it up in Supabase
    const encoded = encodeURIComponent(reference.trim());
    const rows = await supabaseGet(`web_image_analysis?prompt_name=eq.${encoded}&select=*&limit=1`);
    const result = Array.isArray(rows) ? rows[0] : rows;

    if (!result) return res.status(404).json({ error: `Prompt not found: "${reference}"` });

    return res.status(200).json({
      format_layout:   result.format_layout   || '',
      primary_object:  result.primary_object  || '',
      subject:         result.subject         || '',
      lighting:        result.lighting        || '',
      mood:            result.mood            || '',
      background:      result.background      || '',
      positive_prompt: result.positive_prompt || '',
      negative_prompt: result.negative_prompt || '',
    });

  } catch (error) {
    console.error('Error in show-prompt-data:', error);
    return res.status(500).json({
      error: 'Failed to fetch prompt data',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
