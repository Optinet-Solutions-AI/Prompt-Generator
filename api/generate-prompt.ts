import type { VercelRequest, VercelResponse } from '@vercel/node';

async function chatCompletion(opts: {
  systemPrompt: string; userPrompt: string; temperature?: number; model?: string;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const body: any = {
    model: opts.model || 'gpt-4o-mini',
    messages: [{ role: 'system', content: opts.systemPrompt }, { role: 'user', content: opts.userPrompt }],
    temperature: opts.temperature ?? 1.0,
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`OpenAI API failed (${res.status}): ${err}`); }
  const data = await res.json();
  return data.choices[0].message.content;
}

interface FormData {
  brand: string;
  reference: string;
  subjectPosition: string;
  aspectRatio: string;
  theme: string;
  description: string;
  format_layout?: string;
  primary_object?: string;
  subject?: string;
  lighting?: string;
  mood?: string;
  background?: string;
  positive_prompt?: string;
  negative_prompt?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body: FormData = req.body;

    const systemPrompt = `You are an editing engine for image generation prompts.

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
- DELETE every composition/placement/negative-space instruction from the Base prompt (examples: "positioned on the right/left", "left 55–60% negative space", "right third", "center-left", "rule of thirds", "empty space on the left", etc.).
- REPLACE it with ONE clear, explicit placement instruction that matches Main Subject Position EXACTLY.
- Do NOT keep, paraphrase, or blend any previous placement instructions from the Base prompt.

If Main Subject Position is "default", keep the Base prompt's placement instructions unchanged.

2) NEGATIVE SPACE (only when Main Subject Position is left-aligned or right-aligned, and not default)
- left-aligned → ensure clear negative space on the right
- right-aligned → ensure clear negative space on the left
Remove any conflicting negative-space wording from the Base prompt.

3) ASPECT RATIO OVERRIDE
If Aspect Ratio is not "default":
- DELETE any existing aspect ratio flags or aspect instructions from the Base prompt (including any --ar and any wording implying a specific banner/wide/square framing if it conflicts).
- Adjust framing/cropping language so the composition suits the requested Aspect Ratio.
If Aspect Ratio is "default", do not add any new --ar flag.

4) THEME + DESCRIPTION APPLICATION (background only)
Apply Theme and Description ONLY to background, environment, lighting, atmosphere, mood, and secondary elements.
They must NOT change the main subject's identity, expression, clothing, accessories/props, or realism level.

5) MIDJOURNEY FLAG
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

    const userPrompt = systemPrompt; // The n8n workflow sends everything as the user message

    const prompt = await chatCompletion({
      systemPrompt: 'You are an editing engine for image generation prompts. Follow the instructions precisely.',
      userPrompt,
      model: 'gpt-4o-mini',
      temperature: 0.7,
    });

    const result = {
      success: true,
      message: 'AI prompt generated successfully',
      prompt: prompt.trim(),
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
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('Generate prompt error:', error);
    return res.status(500).json({
      error: 'Failed to generate prompt',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
