import type { VercelRequest, VercelResponse } from '@vercel/node';
import { chat } from './_llm.js';
import { buildDissectSystemPrompt, DISSECT_JSON_SCHEMA } from './_assistant-prompts.js';

// Every slow route in this repo declares its budget. api/generate-image.ts was
// the one that did not, and its renders were killed at the 60s plan default
// until that was fixed — so this one says so up front.
export const config = { maxDuration: 60 };

// Cheapest model verified working for this shape of call: ~$0.005 per
// dissection, ~7s. NOT gemini-3.5-flash-lite — it returns HTTP 400 for the
// thinkingBudget: 0 that _llm.ts injects for any model matching /flash/.
const DISSECT_MODEL = 'gemini-3.7-flash';

// Gemini's output budget includes thinking tokens, and one of the eight fields
// is the entire source prompt echoed back. The concepts stage truncated
// mid-JSON at 1200 for exactly this reason.
const DISSECT_MAX_TOKENS = 4000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, brand } = (req.body ?? {}) as { prompt?: string; brand?: string };

  // Validate before calling the model — a blank prompt would cost money and
  // return eight invented fields.
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'prompt is required' });
  if (!brand) return res.status(400).json({ error: 'brand is required' });

  try {
    const result = await chat({
      provider: 'gemini',
      model: DISSECT_MODEL,
      system: buildDissectSystemPrompt(brand),
      user: `Dissect this prompt:\n\n${prompt.trim()}`,
      json: true,
      jsonSchema: { type: 'object' } as any, // MUTATION-TEST: temporarily not the real schema
      maxTokens: DISSECT_MAX_TOKENS,
    });

    const fields = JSON.parse(result.text);
    return res.status(200).json({ fields, usage: result.usage });
  } catch (err) {
    console.error('dissect-prompt error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
