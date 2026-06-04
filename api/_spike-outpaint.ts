import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extendToWide } from './_outpaint.js';

// TEMPORARY spike endpoint — proves outpaint quality on a real image.
// POST { imageUrl, brand } → returns the extended image as a data URL + timing.
// Delete this file after the gate (Task 7).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { imageUrl, brand } = req.body || {};
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!imageUrl || !openaiKey) {
      return res.status(400).json({ error: 'imageUrl and OPENAI_API_KEY required' });
    }
    const squareBuffer = Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
    const t0 = Date.now();
    const out = await extendToWide({ squareBuffer, brand: brand || '', openaiKey });
    const ms = Date.now() - t0;
    return res.status(200).json({
      ms,
      width: out.width,
      height: out.height,
      dataUrl: `data:image/png;base64,${out.buffer.toString('base64')}`,
    });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
