import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BRAND_PALETTES, BRAND_SCENE_MANDATES } from './_brand-rules.js';

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

    // The image's actual output ratio is driven by the exact pixel size
    // (bannerDimensions) when present. Derive the prompt's aspect ratio from THAT
    // so the prompt's --ar and framing always match the real output (e.g.
    // 1200×600 → "2:1"), preventing a "16:9 prompt but 2:1 image" mismatch.
    const SUPPORTED_RATIOS_GP: Array<{ token: string; value: number }> = [
      { token: '1:2', value: 0.5 }, { token: '6:11', value: 6 / 11 }, { token: '9:16', value: 9 / 16 },
      { token: '2:3', value: 2 / 3 }, { token: '3:4', value: 0.75 }, { token: '4:5', value: 0.8 },
      { token: '5:6', value: 5 / 6 }, { token: '1:1', value: 1 }, { token: '6:5', value: 1.2 },
      { token: '5:4', value: 1.25 }, { token: '4:3', value: 4 / 3 }, { token: '3:2', value: 1.5 },
      { token: '16:9', value: 16 / 9 }, { token: '2:1', value: 2 }, { token: '21:9', value: 21 / 9 },
    ];
    function tokenFromDims(s: unknown): string | null {
      const m = String(s || '').match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
      if (!m) return null;
      const w = parseInt(m[1], 10), h = parseInt(m[2], 10);
      if (!w || !h) return null;
      const r = w / h;
      return SUPPORTED_RATIOS_GP.reduce((b, c) => Math.abs(c.value - r) < Math.abs(b.value - r) ? c : b).token;
    }
    const effectiveAspect = tokenFromDims(body.bannerDimensions) || body.aspectRatio || '';

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
        brandSceneMandate = `\n7) BRAND SCENE MANDATE (HIGH PRIORITY)\n${mandate}\nApply this brand signature exactly as described above, HONORING any conditions it states (only add a signature element when the mandate says it applies). It takes priority over generic styling choices.\n`;
      }
    }

    // Wide-banner composition guidance. Wide outputs (e.g. 1200×600 email banners,
    // 16:9 and wider) are produced by generating the closest AI size and cropping
    // top/bottom — so tell the model to frame the subject for a wide strip with
    // safe margins, otherwise heads/feet/logos get cropped off.
    let wideBannerRule = '';
    {
      const parts = String(effectiveAspect || '').split(':');
      const ratio = parts.length === 2 ? parseFloat(parts[0]) / parseFloat(parts[1]) : NaN;
      if (!isNaN(ratio) && ratio >= 1.7) {
        wideBannerRule = `\n8) WIDE BANNER COMPOSITION (OVERRIDES THE BASE PROMPT'S FRAMING)\nThis is a WIDE horizontal banner (aspect ${effectiveAspect}). It MUST be framed as a wide ESTABLISHING shot: show the FULL main subject together with its surrounding environment, at a medium-to-wide camera distance, with the composition spread horizontally across the full width (use the side space for the environment or secondary elements).\nIMPORTANT: If the Base prompt specifies a close-up, portrait, head-and-shoulders, "sharp focus on face", or any tight/shallow framing, DELETE that framing wording and REPLACE it with this wide establishing shot — the wide-banner framing takes priority over the base prompt's framing. Keep the subject's identity, wardrobe and style intact, but pull the camera back so the whole subject and scene fit comfortably within the short, wide strip. Use a natural, non-symmetric composition (the subject need not be dead-centre). CROP-SAFE, FULL-BLEED LAYOUT: the scene must fill the ENTIRE frame edge to edge — the environment (walls, ceiling, floor, sky, crowd, stage) extends all the way to the top and bottom of the frame with continuous scenery and NO empty space, NO black bars, NO letterbox, NO borders anywhere. Keep the main subject and all key elements (head, feet, hands, ball, logo, text) comfortably within the central area, with that continuing background filling the space above and below them, so the banner is a clean full-bleed scene. HEADROOM: position the subject so the top of its head (comb, hat, helmet, or raised arms) sits well below the top edge and its feet/base sit above the bottom edge, with the continuous environment — ceiling, sky, walls, floor, crowd — naturally filling the area above the head and below the feet as ordinary full-bleed scenery. The banner is cropped a little from the top and bottom, so the subject's extremities must stay clear of those edges and the trimmed area is plain background scenery (never an empty, white, or solid-coloured strip).\n`;
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
${effectiveAspect}

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
${wideBannerRule}
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

    // NOTE: we deliberately do NOT append an extra brand "safeguard" clause here.
    // (Duplicating the fire description over-weighted fire and pushed gpt-image-1
    // toward a flaming athlete.)
    //
    // Deterministic CLOSE-UP CLEANUP for wide banners: the editor frequently KEEPS
    // the reference's close-up wording ("sharp focus on face", "shallow depth of
    // field", "portrait") even after being told to reframe wide. gpt-image-1 then
    // latches onto those words and renders a tight close-up. Strip them so the wide
    // establishing framing wins. Only applied when this is a wide banner.
    let finalPrompt = promptText;
    if (wideBannerRule) {
      finalPrompt = finalPrompt
        .replace(/\b(extreme\s+|tight\s+)?close[-\s]?ups?\b/gi, 'wide establishing shot')
        .replace(/\bhead[-\s]and[-\s]shoulders\b/gi, 'full wide shot')
        .replace(/\bportraits?\b/gi, 'wide banner scene')
        .replace(/,?\s*shallow depth of field\b/gi, '')
        .replace(/,?\s*sharp focus on (the\s+)?(face|subject|character)(\s+and\s+[a-z]+)?\b/gi, '')
        .replace(/,?\s*(soft|blurred)\s+bokeh\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,.])/g, '$1')
        .replace(/,(\s*,)+/g, ',')
        .replace(/,\s*--ar/g, ' --ar')
        .trim();
    }

    // Return in the same shape as the n8n workflow response
    return res.status(200).json({
      success: true,
      message: 'AI prompt generated successfully',
      prompt: finalPrompt,
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
