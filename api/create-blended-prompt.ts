import type { VercelRequest, VercelResponse } from '@vercel/node';

async function chatCompletion(opts: {
  systemPrompt: string; userPrompt: string; temperature?: number;
  model?: string; responseFormat?: 'json' | 'text';
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const body: any = {
    model: opts.model || 'gpt-4o-mini',
    messages: [{ role: 'system', content: opts.systemPrompt }, { role: 'user', content: opts.userPrompt }],
    temperature: opts.temperature ?? 1.0,
  };
  if (opts.responseFormat === 'json') body.response_format = { type: 'json_object' };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`OpenAI API failed (${res.status}): ${err}`); }
  const data = await res.json();
  return data.choices[0].message.content;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { brand, references } = req.body;

    if (!brand || !references || !Array.isArray(references) || references.length === 0) {
      return res.status(400).json({ error: 'brand and references array are required' });
    }

    const systemPrompt = `You are a creative director for casino and gambling brand imagery. You will receive multiple existing image prompts from a brand's reference library. Your task is to create a COMPLETELY NEW and UNIQUE prompt that takes creative inspiration from the references but is visually DISTINCT from all of them.

Each field must be written with the SAME level of detail and length as a professional image brief — multiple sentences, specific visual details, camera angles, composition notes, colors, textures. DO NOT write short summaries.

Return ONLY valid JSON with exactly these keys, no extra text, no markdown:
{
  "format_layout": "Describe the frame, aspect ratio, composition layout, and how elements are positioned in detail. Multiple sentences.",
  "primary_object": "Describe the hero/main object in rich visual detail — material, size, style, decorative elements, proportions. Multiple sentences.",
  "subject": "Describe the subject/character in full detail — pose, clothing, accessories, expression, placement in frame. Multiple sentences.",
  "lighting": "Describe all light sources, colors, direction, shadows, highlights, glow effects, and mood they create. Multiple sentences.",
  "mood": "Describe the emotional atmosphere, feeling, energy, and visual tone in detail. Multiple sentences.",
  "background": "Describe the environment, depth, textures, colors, and background elements in detail. Multiple sentences.",
  "positive_prompt": "Write a complete, detailed image generation prompt — several sentences covering all visual elements, style, colors, composition, and quality descriptors.",
  "negative_prompt": "List everything to exclude — bad anatomy, text, watermarks, logos, blurry, dark areas, etc."
}`;

    const refList = references
      .map((r: { name: string; positive_prompt: string }, i: number) =>
        `${i + 1}. ${r.name}:\n${r.positive_prompt}`)
      .join('\n\n');

    const userPrompt = `Brand: ${brand}\n\nReference prompts to blend:\n${refList}\n\nCreate a new unique prompt that takes creative inspiration from these but produces a completely different image.`;

    const raw = await chatCompletion({
      systemPrompt,
      userPrompt,
      model: 'gpt-4o-mini',
      temperature: 1.0,
      responseFormat: 'json',
    });

    // Parse the JSON response, strip any markdown fences
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);

    return res.status(200).json(result);

  } catch (error) {
    console.error('Error in create-blended-prompt API:', error);
    return res.status(500).json({
      error: 'Failed to create blended prompt',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
