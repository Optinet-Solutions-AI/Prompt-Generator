import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateToken } from '../_assistant-token.js';
import { chat } from '../_llm.js';
import { buildBrandRules } from '../_brand-rules.js';
import { logLlmCall } from '../_assistant-log.js';
import { checkSpendCap } from '../_spend-cap.js';
import { ASSISTANT_MODELS } from '../_assistant-models.js';

const PERSONALITY = `You are a senior visual concept partner working with a creative director.
You already generated a structured prompt for them. They have now seen the image and
want to iterate.

Speak in first person. Be direct. No filler ("Great", "Sure", "I'd be happy to").
Output the work, not commentary about the work.`;

// Two-mode output: the model picks "clarify" when the user's intent could reasonably
// go several ways, otherwise "refine" and updates the prompt directly. The shape is
// enforced by the system prompt (not a strict json_schema — its conditional fields
// aren't OpenAI-strict-compatible).

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

  const { token, brand, currentFields, chatHistory, userMessage, model, task, description } = (req.body ?? {}) as {
    token?: string;
    brand?: string;
    currentFields?: GeneratedFields;
    chatHistory?: ChatTurn[];
    userMessage?: string;
    model?: 'openai' | 'gemini' | 'claude';
    task?: string;
    description?: string;
  };

  const auth = validateToken(token);
  if (!auth) return res.status(401).json({ error: 'Invalid token' });

  if (!brand || !currentFields || !userMessage || !model) {
    return res.status(400).json({ error: 'brand, currentFields, userMessage, and model are required' });
  }
  if (model === 'claude') {
    return res.status(400).json({ error: 'Claude provider is not yet available' });
  }

  const cap = await checkSpendCap(auth.test_user_id);
  if (!cap.allowed) {
    return res.status(429).json({ error: cap.reason, spent_today_usd: cap.spent_today_usd, cap_usd: cap.cap_usd });
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
    'ORIGINAL BRIEF — what the user asked for at the very start. Honor it throughout:',
    task ? `  Task: ${task}` : '  Task: (not provided)',
    description ? `  Detail: ${description}` : '',
    '',
    'INTENT RULE (important): If the user says the image is MISSING something they asked',
    'for — e.g. "this is not a christmas banner like I told you", "where is the snow I',
    'asked for" — it means the image FAILED to include it, so ADD or RESTORE that element.',
    'NEVER read "this is not X like I told you" as "remove X". If the direction is genuinely',
    'unclear, use action="clarify" and ask.',
    '',
    'CURRENT STRUCTURED PROMPT (the basis for the image the user just saw):',
    JSON.stringify(currentFields, null, 2),
    '',
    'YOU HAVE TWO POSSIBLE ACTIONS:',
    '',
    '1) action="refine" — when the user\'s feedback is clear and specific enough',
    '   to act on directly (e.g. "make rockets smaller", "put him on a beach",',
    '   "change to night time"). Return:',
    '   { action: "refine",',
    '     message: "<1-2 sentence acknowledgement>",',
    '     refinedFields: { all 8 keys, updated with edits applied } }',
    '',
    '2) action="clarify" — when the feedback is vague or could reasonably go',
    '   multiple distinct ways (e.g. "make it better", "different vibe", "not',
    '   what I wanted"). Return:',
    '   { action: "clarify",',
    '     message: "<1 short sentence framing the question>",',
    '     options: [',
    '       { label: "<3-6 word option name>", description: "<1 sentence>" },',
    '       ... 2 or 3 options total, visually/conceptually distinct',
    '     ] }',
    '',
    'CHOOSE INTELLIGENTLY. Don\'t ask for clarification when the intent is clear.',
    'Don\'t just refine when the user is being vague — three options helps them think.',
    'When refining: positive_prompt must be a single rich paragraph the image model can use directly.',
    '',
    'OUTPUT: respond with ONE JSON object only and no prose outside it. For action="refine"',
    'include "refinedFields" (all 8 keys). For action="clarify" include "options" (2-3 items).',
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
      // Lenient JSON mode (no strict schema): the two-mode output (clarify | refine)
      // has conditional fields that OpenAI strict json_schema rejects ("additionalProperties
      // must be false") — which 500'd every ChatGPT refine. The system prompt fully
      // specifies the shape, and we validate refinedFields below.
      json: true,
      maxTokens: MAX_TOKENS[model],
    });

    const parsed = JSON.parse(result.text);
    await logLlmCall(auth.test_user_id, 'refine', {
      provider: model, model: chosenModel, ...result.usage,
    });

    if (parsed.action === 'clarify') {
      return res.status(200).json({
        action: 'clarify',
        message: parsed.message,
        options: parsed.options ?? [],
        usage: { provider: model, model: chosenModel, ...result.usage },
      });
    }

    // Default to refine. Validate the fields are present.
    if (!parsed.refinedFields) {
      throw new Error('Model returned action=refine but no refinedFields');
    }
    return res.status(200).json({
      action: 'refine',
      message: parsed.message,
      refinedFields: parsed.refinedFields,
      usage: { provider: model, model: chosenModel, ...result.usage },
    });
  } catch (err) {
    console.error('assistant/refine error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
