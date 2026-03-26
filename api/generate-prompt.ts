import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * generate-prompt — matches the n8n "Prod - Prompt Generator" workflow exactly.
 * The n8n workflow sends ONE user message containing the full editing instructions.
 * Model in n8n: gpt-5.2 — we use gpt-4o-mini (or gpt-4o for higher quality).
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

    const body = req.body;

    // Brand color palettes — known brands get strict enforcement.
    // Unknown/new brands get a fallback rule: "preserve the reference prompt's colors".
    // To add a new brand, just add a key here. Everything else adapts automatically.
    const BRAND_PALETTES: Record<string, string> = {
      FortunePlay: 'Yellow, orange, gold, warm amber, warm casino lighting. NEVER use blue, purple, cyan, neon, or cold tones.',
      SpinJo: 'Purple, violet, magenta, neon-blue, electric cyan, deep space black. Sci-fi/futuristic palette. NEVER use gold, warm amber, orange, or earthy warm tones.',
      Roosterbet: 'Red, crimson, fiery orange, black, bold white. High-energy sports palette. NEVER use pastel, soft pink, or muted tones.',
      LuckyVibe: 'Golden hour warm tones, sunset orange, tropical coral, soft amber, warm backlight. NEVER use cold blue, purple, or neon tones.',
      SpinsUp: 'Neon purple, electric magenta, showman gold accents, deep black, circus-bright. Magical/mystical palette. NEVER use muted earthy tones or pastels.',
    };

    let brandColorRule = '';
    if (body.brand) {
      const palette = BRAND_PALETTES[body.brand];
      if (palette) {
        // Known brand — strict palette enforcement
        brandColorRule = `\n6) BRAND COLOR ENFORCEMENT\nThis is a ${body.brand} branded image. Approved color palette: ${palette}\nAll lighting, mood, atmosphere, and background colors in the output MUST comply with this palette. Replace any off-brand colors with on-brand alternatives.\n`;
      } else {
        // Unknown/new brand — preserve whatever colors are already in the reference prompt
        brandColorRule = `\n6) BRAND COLOR ENFORCEMENT\nThis is a ${body.brand} branded image. Preserve the same color palette as the Base prompt. Do NOT introduce colors not present in the original. Keep the brand's visual identity consistent.\n`;
      }
    }

    // Build the EXACT same user message as the n8n "Message a model" node.
    // In n8n this is the only message sent (no separate system prompt).
    const userMessage = `You are an editing engine for image generation prompts.

Your job: Edit the Base prompt (final_ready) to comply with the provided Theme, Description, Main Subject Position, and Aspect Ratio.

INPUTS
Base prompt (final_ready):
${(body.positive_prompt || '') + ' ' + (body.negative_prompt || '')}

Theme:
${body.theme || ''}

Description:
${body.description || ''}

Main Subject Position:
${body.subjectPosition || ''}

Aspect Ratio:
${body.aspectRatio || ''}

RULES (follow in order)

1) MAIN SUBJECT POSITION
If Main Subject Position is not "default", do ALL of the following:
- DELETE every composition/placement/negative-space instruction from the Base prompt (examples: \u201Cpositioned on the right/left\u201D, \u201Cleft 55\u201360% negative space\u201D, \u201Cright third\u201D, \u201Ccenter-left\u201D, \u201Crule of thirds\u201D, \u201Cempty space on the left\u201D, etc.).
- REPLACE it with ONE clear, explicit placement instruction that matches Main Subject Position EXACTLY.
- Do NOT keep, paraphrase, or blend any previous placement instructions from the Base prompt.

If Main Subject Position is "default", keep the Base prompt\u2019s placement instructions unchanged.

2) NEGATIVE SPACE (only when Main Subject Position is left-aligned or right-aligned, and not default)
- left-aligned \u2192 ensure clear negative space on the right
- right-aligned \u2192 ensure clear negative space on the left
Remove any conflicting negative-space wording from the Base prompt.

3) ASPECT RATIO OVERRIDE
If Aspect Ratio is not "default":
- DELETE any existing aspect ratio flags or aspect instructions from the Base prompt (including any --ar and any wording implying a specific banner/wide/square framing if it conflicts).
- Adjust framing/cropping language so the composition suits the requested Aspect Ratio.
If Aspect Ratio is "default", do not add any new --ar flag.

4) THEME + DESCRIPTION APPLICATION (background only)
Apply Theme and Description ONLY to background, environment, lighting, atmosphere, mood, and secondary elements.
They must NOT change the main subject\u2019s identity, expression, clothing, accessories/props, or realism level.

${brandColorRule}5) MIDJOURNEY FLAG
Append exactly ONE --ar flag at the very end ONLY if Aspect Ratio is not "default", using this mapping:
1:2 -> --ar 1:2
6:11 -> --ar 6:11
9:16 -> --ar 9:16
2:3 -> --ar 2:3
3:4 -> --ar 3:4
4:5 -> --ar 4:5
5:6 -> --ar 5:6
1:1 -> --ar 1:1
6:5 -> --ar 6:5
5:4 -> --ar 5:4
4:3 -> --ar 4:3
3:2 -> --ar 3:2
16:9 -> --ar 16:9
2:1 -> --ar 2:1
21:9 -> --ar 21:9

OUTPUT
Return ONLY the final edited prompt text (and optional --ar flag). No explanations.`;

    // Call OpenAI — n8n sends this as a single user message with no system prompt
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      throw new Error(`OpenAI API failed (${openaiRes.status}): ${err}`);
    }

    const data = await openaiRes.json();
    const promptText = data.choices[0].message.content.trim();

    // Return in the same shape as the n8n workflow response
    return res.status(200).json({
      success: true,
      message: 'AI prompt generated successfully',
      prompt: promptText,
      metadata: {
        brand: body.brand,
        reference: body.reference,
        subjectPosition: body.subjectPosition,
        aspectRatio: body.aspectRatio,
        theme: body.theme,
        description: body.description,
        format_layout: body.format_layout || '',
        primary_object: body.primary_object || '',
        subject: body.subject || '',
        lighting: body.lighting || '',
        mood: body.mood || '',
        background: body.background || '',
        positive_prompt: body.positive_prompt || '',
        negative_prompt: body.negative_prompt || '',
      },
    });

  } catch (error) {
    console.error('Generate prompt error:', error);
    return res.status(500).json({
      error: 'Failed to generate prompt',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
