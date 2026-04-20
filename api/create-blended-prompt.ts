import type { VercelRequest, VercelResponse } from '@vercel/node';

// Brand color palettes — same as generate-prompt.ts. Keep in sync when adding new brands.
const BRAND_PALETTES: Record<string, string> = {
  FortunePlay: 'Yellow, orange, gold, warm amber, warm casino lighting. NEVER use blue, purple, cyan, neon, or cold tones.',
  SpinJo:      'Purple, violet, magenta, neon-blue, electric cyan, deep space black. Sci-fi/futuristic palette. NEVER use gold, warm amber, orange, or earthy warm tones.',
  Roosterbet:  'Red, crimson, fiery orange, black, bold white. High-energy sports palette. NEVER use pastel, soft pink, or muted tones.',
  LuckyVibe:   'Golden hour warm tones, sunset orange, tropical coral, soft amber, warm backlight. NEVER use cold blue, purple, or neon tones.',
  SpinsUp:     'Neon purple, electric magenta, showman gold accents, deep black, circus-bright. Magical/mystical palette. NEVER use muted earthy tones or pastels.',
  PlayMojo:    'Dark noir black, bold white, sharp red accent. Sleek, cinematic. NEVER use warm gold, pastel, or cheerful bright colors.',
  Lucky7even:  'Deep purple, electric violet, metallic gold accents, black. Rich premium palette. NEVER use flat grey, earthy tones, or muted colors.',
  NovaDreams:  'Cosmic blue, electric cyan, white, deep navy black. Space/futuristic palette. NEVER use warm orange, red, gold, or earthy tones.',
  Rollero:     'Crimson red, dark charcoal grey, black, sharp white highlight. Warrior/combat palette. NEVER use pastel, neon, or soft warm tones.',
};

// Brand scene mandates — signature visual elements that MUST always appear.
const BRAND_SCENE_MANDATES: Record<string, string> = {
  Roosterbet:  'FIRE IS MANDATORY AND MUST ORIGINATE FROM THE PLAYER: Fire and flames MUST burst outward FROM the athlete — erupting from their feet, legs, arms, or movement trail as they perform the action. The player should appear to be GENERATING the fire through their athletic intensity and power. Do NOT place fire only in the background or floor — it must come FROM the player\'s body and movement. Make the fire dynamic, explosive, and visually striking — an extension of the player\'s energy. This is the Roosterbet signature.',
  FortunePlay: 'GOLD IS MANDATORY: The scene MUST include gold accents AND gold dust/particles — floating golden light, golden sparkles, or shimmering gold dust in the air. This is the FortunePlay signature. If the base prompt lacks these, ADD them to the atmosphere or lighting.',
  LuckyVibe:   'BEACH/SUNSET IS MANDATORY: The scene MUST feature sunset lighting as the primary light source, AND sand must be visible somewhere in the frame. Palm trees MUST appear in the background. This is the LuckyVibe signature.',
};

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

    // Build brand color enforcement rule
    const palette = BRAND_PALETTES[brand];
    const brandColorRule = palette
      ? `BRAND COLOR ENFORCEMENT: This is a ${brand} branded image. Approved color palette: ${palette} All lighting, mood, atmosphere, and background colors MUST comply with this palette. Replace any off-brand colors with on-brand alternatives.`
      : `BRAND COLOR ENFORCEMENT: This is a ${brand} branded image. Preserve the same color palette as the reference prompts. Do NOT introduce colors not present in the originals. Keep the brand's visual identity consistent.`;

    // Build brand scene mandate rule (only for brands that have one)
    const mandate = BRAND_SCENE_MANDATES[brand];
    const brandSceneMandate = mandate
      ? `\nBRAND SCENE MANDATE (HIGHEST PRIORITY): ${mandate} This rule OVERRIDES everything else.`
      : '';

    const systemPrompt = `You are a creative director for casino and gambling brand imagery. You will receive multiple existing image prompts from a brand's reference library. Your task is to create a NEW and UNIQUE prompt that blends creative elements from the references while staying true to the brand's visual identity.

CRITICAL — PRESERVE SUBJECTS AND THEMES FROM THE REFERENCES:
Before writing anything, read all the reference prompts and identify:
1. The recurring subject(s), character(s), mascot(s), or hero object(s) — e.g. a rabbit mascot, a specific athlete, a dragon, a roulette wheel, etc.
2. The recurring themes — e.g. speed, luck, luxury, combat, space travel, etc.
3. The recurring visual motifs — e.g. playing cards, coins, neon signs, fire, etc.

The new prompt MUST feature the SAME subject(s)/character(s)/mascot(s) from the references. Do NOT replace or swap the subject with something unrelated. If the references show a rabbit mascot, the output must show a rabbit mascot. If they show an athlete, the output must show an athlete. What changes is the SCENE, POSE, COMPOSITION, and SETTING — not WHO or WHAT is in the image.

Think of it as: "Same character, same brand, brand new scene" — NOT "same colors, completely new idea."

The result must feel like it belongs to the ${brand} brand — same colors, same atmosphere, same style — AND like it belongs in the same content series as the reference prompts.

${brandColorRule}${brandSceneMandate}

Each field must be written with the SAME level of detail and length as a professional image brief — multiple sentences, specific visual details, camera angles, composition notes, colors, textures. DO NOT write short summaries.

For the "positive_prompt" field specifically — this is the actual text sent to an AI image generator. Write it as clear, vivid, descriptive natural language (NOT a comma-separated tag list). Include ALL of the following:
- Character/subject description: who they are, what they wear, their pose, expression, and exact placement in frame. Be specific — "fitted black suit with a sharp red silk tie, white dress shirt, silver cufflinks" beats "wearing a suit".
- Scene and setting: the environment, surfaces, props, and depth layers (foreground, midground, background).
- Lighting: describe the light sources, direction, colors, and effects — e.g. "a single dramatic key light from upper-left casting deep shadows across the face, with a red neon rim light outlining the silhouette from behind".
- Atmosphere: mood-enhancing details like smoke haze, bokeh background, reflections on wet floor, floating particles, volumetric light shafts.
- Visual render quality: always end the description with "hyperrealistic cinematic render quality, sharp photorealistic details, dramatic professional lighting, no text, no watermarks, no logos." This applies to every content type — mascot characters, real humans, objects, and scenes alike.
  Do NOT use words like "character art", "illustration", "painting", "digital art", or "artwork" — these produce a painted look instead of a sharp cinematic render.
  Do NOT use software names like octane, blender, or unreal.

The prompt should be vivid, specific, and completely visual. No vague adjectives.

IMPORTANT — ASPECT RATIO RULE:
Never mention a specific aspect ratio, pixel dimensions, or canvas shape (e.g. do NOT write "16:9", "landscape", "portrait", "square", "wide cinematic frame", "1920x1080", etc.) anywhere in ANY field. The user controls the output dimensions separately — the prompt must work at any ratio. Describe composition using subject placement and depth only (e.g. "centered in frame", "positioned left of center", "foreground subject against a deep background").

Return ONLY valid JSON with exactly these keys, no extra text, no markdown:
{
  "format_layout": "Describe the composition layout and how elements are positioned — subject placement, foreground/midground/background layers, camera angle, depth. Do NOT mention any specific aspect ratio or canvas size.",
  "primary_object": "Describe the hero/main object in rich visual detail — material, size, style, decorative elements, proportions. Multiple sentences.",
  "subject": "Describe the subject/character in full detail — pose, clothing, accessories, expression, placement in frame. Multiple sentences.",
  "lighting": "Describe all light sources, colors, direction, shadows, highlights, glow effects, and mood they create. Multiple sentences.",
  "mood": "Describe the emotional atmosphere, feeling, energy, and visual tone in detail. Multiple sentences.",
  "background": "Describe the environment, depth, textures, colors, and background elements in detail. Multiple sentences.",
  "positive_prompt": "REQUIRED: Write 5–8 sentences of vivid, natural language art direction. Describe the character, scene, lighting, atmosphere, and visual render quality. No comma-tag lists. No software names. Do NOT mention any aspect ratio, canvas size, or orientation. Do NOT use words like illustration, painting, artwork, or digital art — the target output is a cinematic hyperrealistic render, not a painting.",
  "negative_prompt": "bad anatomy, deformed hands, extra limbs, malformed face, poorly rendered fur, plastic-looking skin, text, watermarks, logos, blurry, overexposed, flat lighting, muddy colors, low resolution, jpeg artifacts, amateur render quality, multiple subjects unless intentional."
}`;

    const refList = references
      .map((r: { name: string; positive_prompt: string }, i: number) =>
        `${i + 1}. ${r.name}:\n${r.positive_prompt}`)
      .join('\n\n');

    const userPrompt = `Brand: ${brand}\n\n${brandColorRule}${brandSceneMandate}\n\nReference prompts to blend:\n${refList}\n\nCreate a new unique prompt inspired by these references. KEEP the same subject(s), character(s), and mascot(s) from the references — only the scene, pose, composition, and setting should be new. The result must be visually fresh but unmistakably ${brand} in style, AND clearly from the same content series as these references.`;

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
