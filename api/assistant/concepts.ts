import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateToken } from '../_assistant-token.js';
import { chat } from '../_llm.js';
import { buildConceptsSystemPrompt, CONCEPTS_JSON_SCHEMA } from '../_assistant-prompts.js';

const CONCEPTS_MODEL: Record<'openai' | 'gemini', string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, brand, task, description, model } = (req.body ?? {}) as {
    token?: string; brand?: string; task?: string; description?: string;
    model?: 'openai' | 'gemini' | 'claude';
  };

  const auth = validateToken(token);
  if (!auth) return res.status(401).json({ error: 'Invalid token' });

  if (!brand || !task || !model) {
    return res.status(400).json({ error: 'brand, task, and model are required' });
  }
  if (model === 'claude') {
    return res.status(400).json({ error: 'Claude provider is not yet available' });
  }

  const chosenModel = CONCEPTS_MODEL[model];

  try {
    const system = buildConceptsSystemPrompt(brand);
    const user = `Task topic: ${task}\nExtra detail: ${description ?? '(none)'}`;
    const result = await chat({
      provider: model,
      model: chosenModel,
      system,
      user,
      json: true,
      jsonSchema: CONCEPTS_JSON_SCHEMA,
      maxTokens: 600,
    });

    const parsed = JSON.parse(result.text);
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
