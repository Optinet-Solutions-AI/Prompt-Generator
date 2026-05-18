import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateToken } from '../_assistant-token.js';
import { chat } from '../_llm.js';
import { buildBrandRules } from '../_brand-rules.js';
import { logLlmCall } from '../_assistant-log.js';

const REFINE_MODEL: Record<'openai' | 'gemini', string> = {
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-flash',
};

const MAX_TOKENS: Record<'openai' | 'gemini', number> = {
  openai: 1200,
  gemini: 2000,
};

const PERSONALITY = `You are a senior visual concept partner working with a creative director.
You already generated a structured prompt for them. They have now seen the image and
want to iterate. Read their feedback, acknowledge it in one short conversational sentence,
then return updated structured prompt fields reflecting the change.

Speak in first person. Be direct. No filler ("Great", "Sure", "I'd be happy to").
Output the work, not commentary about the work.`;

const REFINE_JSON_SCHEMA = {
  type: 'object',
  required: ['message', 'refinedFields'],
  properties: {
    message: { type: 'string' },
    refinedFields: {
      type: 'object',
      required: [
        'format_layout', 'primary_object', 'subject', 'lighting', 'mood',
        'background', 'positive_prompt', 'negative_prompt',
      ],
      properties: {
        format_layout:   { type: 'string' },
        primary_object:  { type: 'string' },
        subject:         { type: 'string' },
        lighting:        { type: 'string' },
        mood:            { type: 'string' },
        background:      { type: 'string' },
        positive_prompt: { type: 'string' },
        negative_prompt: { type: 'string' },
      },
    },
  },
} as const;

interface GeneratedFields {
  format_layout: string;
  primary_object: string;
  subject: string;
  lighting: string;
  mood: string;
  background: string;
  positive_prompt: string;
  negative_prompt: string;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, brand, currentFields, chatHistory, userMessage, model } = (req.body ?? {}) as {
    token?: string;
    brand?: string;
    currentFields?: GeneratedFields;
    chatHistory?: ChatTurn[];
    userMessage?: string;
    model?: 'openai' | 'gemini' | 'claude';
  };

  const auth = validateToken(token);
  if (!auth) return res.status(401).json({ error: 'Invalid token' });

  if (!brand || !currentFields || !userMessage || !model) {
    return res.status(400).json({ error: 'brand, currentFields, userMessage, and model are required' });
  }
  if (model === 'claude') {
    return res.status(400).json({ error: 'Claude provider is not yet available' });
  }

  const { palette, mandate } = buildBrandRules(brand);
  const chosenModel = REFINE_MODEL[model];

  const system = [
    PERSONALITY,
    '',
    `BRAND: ${brand}`,
    palette ? `COLOR PALETTE: ${palette}` : '',
    mandate ? `STYLE MANDATE: ${mandate}` : '',
    '',
    'CURRENT STRUCTURED PROMPT (the basis for the image the user just saw):',
    JSON.stringify(currentFields, null, 2),
    '',
    'Return strict JSON: {"message": "...", "refinedFields": { all 8 fields }}.',
    'message: 1-2 sentences acknowledging the change and confirming what you are adjusting.',
    'refinedFields: every key from the current prompt, with edits applied. Keep brand rules.',
    'positive_prompt must be a single rich paragraph the image model can use directly.',
    '',
    'IMAGE-GEN SAFETY (HARD RULES — image generators reject prompts that violate these):',
    '- Never name any real person, celebrity, actor, athlete, musician, or public figure.',
    '- Never reference copyrighted franchises, films, shows, characters, or brand names.',
    '- Use generic descriptive terms instead.',
  ].filter(Boolean).join('\n');

  const historyBlock = (chatHistory ?? [])
    .map(t => `${t.role.toUpperCase()}: ${t.content}`)
    .join('\n');

  const user = [
    historyBlock ? `CHAT SO FAR:\n${historyBlock}\n` : '',
    `USER'S NEW FEEDBACK: ${userMessage}`,
  ].filter(Boolean).join('\n');

  try {
    const result = await chat({
      provider: model,
      model: chosenModel,
      system,
      user,
      json: true,
      jsonSchema: REFINE_JSON_SCHEMA,
      maxTokens: MAX_TOKENS[model],
    });

    const parsed = JSON.parse(result.text);
    return res.status(200).json({
      message: parsed.message,
      refinedFields: parsed.refinedFields,
      usage: { provider: model, model: chosenModel, ...result.usage },
    });
  } catch (err) {
    console.error('assistant/refine error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
