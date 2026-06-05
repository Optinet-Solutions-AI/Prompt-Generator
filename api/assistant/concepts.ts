import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateToken } from '../_assistant-token.js';
import { chat } from '../_llm.js';
import { buildConceptsSystemPrompt, CONCEPTS_JSON_SCHEMA, pickConceptLens, buildAvoidClause } from '../_assistant-prompts.js';
import { logLlmCall } from '../_assistant-log.js';
import { checkSpendCap } from '../_spend-cap.js';

const CONCEPTS_MODEL: Record<'openai' | 'gemini', string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, brand, task, description, model, avoid } = (req.body ?? {}) as {
    token?: string; brand?: string; task?: string; description?: string;
    model?: 'openai' | 'gemini' | 'claude'; avoid?: string[];
  };

  const auth = validateToken(token);
  if (!auth) return res.status(401).json({ error: 'Invalid token' });

  if (!brand || !task || !model) {
    return res.status(400).json({ error: 'brand, task, and model are required' });
  }
  if (model === 'claude') {
    return res.status(400).json({ error: 'Claude provider is not yet available' });
  }

  const cap = await checkSpendCap(auth.test_user_id);
  if (!cap.allowed) {
    return res.status(429).json({ error: cap.reason, spent_today_usd: cap.spent_today_usd, cap_usd: cap.cap_usd });
  }

  const chosenModel = CONCEPTS_MODEL[model];

  try {
    const system = buildConceptsSystemPrompt(brand);
    // A different creative lens per request pushes the model off its default anchor,
    // so repeated regenerations explore new ground instead of repeating the same top idea.
    const lens = pickConceptLens();
    let user = `Task topic: ${task}\nExtra detail: ${description ?? '(none)'}\n\nCREATIVE LENS for THIS set — use it to find a fresh angle and avoid repeating the obvious default: ${lens}`;
    const avoidClause = buildAvoidClause(avoid ?? []);
    if (avoidClause) user += `\n\n${avoidClause}`;
    const result = await chat({
      provider: model,
      model: chosenModel,
      system,
      user,
      json: true,
      jsonSchema: CONCEPTS_JSON_SCHEMA,
      // 1200 (up from 600): the diversity prompt + creative lens produce richer, longer
      // concept descriptions that were overflowing 600 tokens and truncating (~1 in 4
      // calls hit Gemini MAX_TOKENS). 1200 gives comfortable headroom for 3 concepts.
      maxTokens: 1200,
      // Higher temperature widens the spread between the 3 concepts (diversity).
      temperature: 0.9,
    });

    const parsed = JSON.parse(result.text);
    await logLlmCall(auth.test_user_id, 'concepts', {
      provider: model, model: chosenModel, ...result.usage,
    });
    return res.status(200).json({
      concepts: parsed.concepts,
      recommendation: parsed.recommendation,
      usage: { provider: model, model: chosenModel, ...result.usage },
    });
  } catch (err) {
    console.error('assistant/concepts error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
