import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateToken } from '../_assistant-token';
import { chat } from '../_llm';
import { buildGenerateSystemPrompt, GENERATE_JSON_SCHEMA } from '../_assistant-prompts';

const GENERATE_MODEL: Record<'openai' | 'gemini', string> = {
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-pro',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, brand, task, description, pickedConcept, model } = (req.body ?? {}) as {
    token?: string; brand?: string; task?: string; description?: string;
    pickedConcept?: { title: string; description: string };
    model?: 'openai' | 'gemini' | 'claude';
  };

  const auth = validateToken(token);
  if (!auth) return res.status(401).json({ error: 'Invalid token' });

  if (!brand || !task || !model || !pickedConcept) {
    return res.status(400).json({ error: 'brand, task, model, and pickedConcept are required' });
  }
  if (model === 'claude') {
    return res.status(400).json({ error: 'Claude provider is not yet available' });
  }

  const chosenModel = GENERATE_MODEL[model];

  try {
    const system = buildGenerateSystemPrompt(brand);
    const user = [
      `Task topic: ${task}`,
      `Extra detail: ${description ?? '(none)'}`,
      `Picked concept title: ${pickedConcept.title}`,
      `Picked concept description: ${pickedConcept.description}`,
    ].join('\n');

    const result = await chat({
      provider: model,
      model: chosenModel,
      system,
      user,
      json: true,
      jsonSchema: GENERATE_JSON_SCHEMA,
      maxTokens: 1200,
    });

    const fields = JSON.parse(result.text);
    return res.status(200).json({
      success: true,
      prompt: fields.positive_prompt,
      metadata: { brand, ...fields },
      usage: { provider: model, model: chosenModel, ...result.usage },
    });
  } catch (err) {
    console.error('assistant/generate error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
