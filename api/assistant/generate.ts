import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateToken } from '../_assistant-token.js';
import { chat } from '../_llm.js';
import { buildGenerateSystemPrompt, GENERATE_JSON_SCHEMA } from '../_assistant-prompts.js';
import { logLlmCall } from '../_assistant-log.js';
import { checkSpendCap } from '../_spend-cap.js';
import { ASSISTANT_MODELS } from '../_assistant-models.js';

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

  const cap = await checkSpendCap(auth.test_user_id);
  if (!cap.allowed) {
    return res.status(429).json({ error: cap.reason, spent_today_usd: cap.spent_today_usd, cap_usd: cap.cap_usd });
  }

  const stage = ASSISTANT_MODELS.generate[model];
  const chosenModel = stage.model;

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
      reasoningEffort: stage.effort,
      maxTokens: stage.maxTokens,
    });

    const fields = JSON.parse(result.text);
    await logLlmCall(auth.test_user_id, 'generate', {
      provider: model, model: chosenModel, ...result.usage,
    });
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
