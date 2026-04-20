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
      SpinJo:      'Purple, violet, magenta, neon-blue, electric cyan, deep space black. Sci-fi/futuristic palette. NEVER use gold, warm amber, orange, or earthy warm tones.',
      Roosterbet:  'Red, crimson, fiery orange, black, bold white. High-energy sports palette. NEVER use pastel, soft pink, or muted tones.',
      LuckyVibe:   'Golden hour warm tones, sunset orange, tropical coral, soft amber, warm backlight. NEVER use cold blue, purple, or neon tones.',
      SpinsUp:     'Neon purple, electric magenta, showman gold accents, deep black, circus-bright. Magical/mystical palette. NEVER use muted earthy tones or pastels.',
      PlayMojo:    'Dark noir black, bold white, sharp red accent. Sleek, cinematic. NEVER use warm gold, pastel, or cheerful bright colors.',
      Lucky7even:  'Deep purple, electric violet, metallic gold accents, black. Rich premium palette. NEVER use flat grey, earthy tones, or muted colors.',
      NovaDreams:  'Cosmic blue, electric cyan, white, deep navy black. Space/futuristic palette. NEVER use warm orange, red, gold, or earthy tones.',
      Rollero:     'Crimson red, dark charcoal grey, black, sharp white highlight. Warrior/combat palette. NEVER use pastel, neon, or soft warm tones.',
    };

    // Brand scene mandates — specific visual elements that MUST always appear.
    // These are Roosterbet, FortunePlay, and LuckyVibe signature style rules.
    const BRAND_SCENE_MANDATES: Record<string, string> = {
      Roosterbet:  'FIRE IS MANDATORY AND MUST ORIGINATE FROM THE PLAYER: Fire and flames MUST burst outward FROM the athlete — erupting from their feet, legs, arms, or movement trail as they perform the action. The player should appear to be GENERATING the fire through their athletic intensity and power. Do NOT place fire only in the background or floor — it must come FROM the player\'s body and movement. Make the fire dynamic, explosive, and visually striking — an extension of the player\'s energy. This is the Roosterbet signature.',
      FortunePlay: 'GOLD IS MANDATORY: The scene MUST include gold accents AND gold dust/particles — floating golden light, golden sparkles, or shimmering gold dust in the air. This is the FortunePlay signature. If the base prompt lacks these, ADD them to the atmosphere or lighting.',
      LuckyVibe:   'BEACH/SUNSET IS MANDATORY: The scene MUST feature sunset lighting as the primary light source, AND sand must be visible somewhere in the frame (even if the setting is a stadium with grass, add sand at the edges or as a foreground element). Palm trees MUST appear in the background. This is the LuckyVibe signature. If the base prompt lacks these, ADD them naturally.',
    };

    let brandColorRule = '';
    let brandSceneMandate = '';
    if (body.brand) {
      const palette = BRAND_PALETTES[body.brand];
      if (palette) {
        // Known brand — strict palette enforcement
        brandColorRule = `\n6) BRAND COLOR ENFORCEMENT\nThis is a ${body.brand} branded image. Approved color palette: ${palette}\nAll lighting, mood, atmosphere, and background colors in the output MUST comply with this palette. Replace any off-brand colors with on-brand alternatives.\nIMPORTANT EXCEPTION: If the prompt specifies athlete/subject clothing colors (jersey, shorts, uniform kit), those clothing colors are FIXED and must NOT be changed to match the brand palette. Brand palette applies to background, lighting, and atmosphere ONLY.\n`;
      } else {
        // Unknown/new brand — preserve whatever colors are already in the reference prompt
        brandColorRule = `\n6) BRAND COLOR ENFORCEMENT\nThis is a ${body.brand} branded image. Preserve the same color palette as the Base prompt. Do NOT introduce colors not present in the original. Keep the brand's visual identity consistent.\n`;
      }
      // Apply scene mandate if this brand has one
      const mandate = BRAND_SCENE_MANDATES[body.brand];
      if (mandate) {
        brandSceneMandate = `\n7) BRAND SCENE MANDATE (HIGHEST PRIORITY)\n${mandate}\nThis rule OVERRIDES everything else. The brand signature element MUST appear in the final output no matter what.\n`;
      }
    }

    // Build the user message sent to GPT.
    // IMPORTANT: Only the positive_prompt is passed as the Base prompt.
    // The negative_prompt must NEVER be concatenated into the Base prompt —
    // GPT picks up the negative keywords (e.g. "anime", "cartoon") and
    // hallucinates them into the output, producing stylized/non-photorealistic images.
    const userMessage = `You are a precision editor for AI image generation prompts.

Your job: Make TARGETED edits to the Base prompt to apply the Subject Position, Aspect Ratio, Theme/Description, and Brand Color rules below. Do NOT rewrite or restructure the prompt.

INPUTS
Base prompt:
${body.positive_prompt || ''}

Theme:
${body.theme || ''}

Description:
${body.description || ''}

Main Subject Position:
${body.subjectPosition || ''}

Aspect Ratio:
${body.aspectRatio || ''}

RULES (apply in order, make only the minimum changes needed)

1) PRESERVE FORMAT
Keep the exact narrative style of the Base prompt. Do NOT reformat it into labeled lists (Background: ... Lighting: ... Mood: ...). Keep it as flowing prose. Only change what the rules below require.

2) MAIN SUBJECT POSITION
If Main Subject Position is not "default", do ALL of the following:
- DELETE every composition/placement/negative-space instruction from the Base prompt (e.g. "subject on left third", "right two-thirds clear", "subject centered", "balanced composition", etc.).
- REPLACE with ONE placement instruction that matches Main Subject Position EXACTLY.
If Main Subject Position is "default", keep the Base prompt's placement instructions unchanged.

3) NEGATIVE SPACE (only when Main Subject Position is left-aligned or right-aligned)
- left-aligned → ensure clear negative space on the right
- right-aligned → ensure clear negative space on the left
Remove any conflicting negative-space wording.

4) ASPECT RATIO OVERRIDE
If Aspect Ratio is not "default":
- DELETE any existing --ar flags or aspect ratio wording from the Base prompt.
- Adjust framing language to match the requested Aspect Ratio.
If Aspect Ratio is "default", do not add any --ar flag.

5) THEME + DESCRIPTION (background only)
Apply Theme and Description ONLY to background, environment, lighting, atmosphere, mood, and secondary elements. Do NOT change the main subject's identity, clothing, pose, or realism level.

5b) ETHNICITY / RACE — DO NOT ASSUME
Unless the Base prompt explicitly names a nationality, ethnicity, or skin tone for the subject, do NOT introduce or imply any specific race. If the prompt already states a nationality (e.g. "representing Brazil", "Filipino athlete"), keep it. If no ethnicity is stated, the subject remains ethnically unspecified — do not add any race-specific language.

${brandColorRule}
${brandSceneMandate}
6) MIDJOURNEY FLAG
Append exactly ONE --ar flag at the very end ONLY if Aspect Ratio is not "default":
1:2->--ar 1:2 | 6:11->--ar 6:11 | 9:16->--ar 9:16 | 2:3->--ar 2:3 | 3:4->--ar 3:4 | 4:5->--ar 4:5 | 5:6->--ar 5:6 | 1:1->--ar 1:1 | 6:5->--ar 6:5 | 5:4->--ar 5:4 | 4:3->--ar 4:3 | 3:2->--ar 3:2 | 16:9->--ar 16:9 | 2:1->--ar 2:1 | 21:9->--ar 21:9

OUTPUT
Return ONLY the final edited prompt text. No explanations, no labels, no extra text.`;

    // Call OpenAI — n8n sends this as a single user message with no system prompt
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
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
