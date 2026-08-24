import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateToken } from '../_assistant-token.js';
import { chat } from '../_llm.js';
import {
  buildSingleConceptSystemPrompt,
  SINGLE_CONCEPT_JSON_SCHEMA,
  buildRecommendationPrompt,
  pickConceptLenses,
  buildAvoidClause,
} from '../_assistant-prompts.js';
import { logLlmCall } from '../_assistant-log.js';
import { checkSpendCap } from '../_spend-cap.js';
import { ASSISTANT_MODELS } from '../_assistant-models.js';

// The shape of one successful concept call's result. Declared up here (rather
// than inline) so the Promise.allSettled results below can be filtered down
// to a concrete, named type instead of reaching for `as any`.
type ConceptResult = {
  concept: { title: string; description: string };
  usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number };
};

// Three parallel Pro-tier concept calls plus a synthesis call put this endpoint's
// wall time at an estimated ~20-25s (up from ~8s pre-fan-out). 60s gives headroom
// over that without matching the 300s the image routes (edit-image, generate-
// variations) need for actual image generation work.
export const config = { maxDuration: 60 };

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

  const stage = ASSISTANT_MODELS.concepts[model];
  const recStage = ASSISTANT_MODELS.recommend[model];
  const CONCEPT_COUNT = 3;

  try {
    const system = buildSingleConceptSystemPrompt(brand);
    const avoidClause = buildAvoidClause(avoid ?? []);

    // One call per concept, each under a DIFFERENT creative lens. Three
    // concepts from ONE call converge on a single strong direction and come
    // back as variations of each other; three independent calls under
    // different constraints diverge structurally instead of being asked to.
    const lenses = pickConceptLenses(CONCEPT_COUNT);

    const settled = await Promise.allSettled(lenses.map(async (lens): Promise<ConceptResult> => {
      let user = `Task topic: ${task}\nExtra detail: ${description ?? '(none)'}\n\nCREATIVE LENS for this concept — obey it, it is the whole point of this concept: ${lens}`;
      if (avoidClause) user += `\n\n${avoidClause}`;
      const r = await chat({
        provider: model,
        model: stage.model,
        system,
        user,
        json: true,
        jsonSchema: SINGLE_CONCEPT_JSON_SCHEMA,
        reasoningEffort: stage.effort,
        maxTokens: stage.maxTokens,
        // Diversity across the set is now structural (the lenses), but a high
        // temperature still pushes each concept off its own likeliest answer.
        temperature: 0.9,
      });
      const parsed = JSON.parse(r.text) as { concepts?: Array<{ title: string; description: string }> };
      const concept = parsed.concepts?.[0];
      if (!concept?.title || !concept?.description) throw new Error('incomplete concept in response (missing title or description)');
      return { concept, usage: r.usage };
    }));

    const ok = settled.filter(
      (s): s is PromiseFulfilledResult<ConceptResult> => s.status === 'fulfilled',
    );
    for (const s of settled) {
      if (s.status === 'rejected') console.error('assistant/concepts: one concept call failed:', s.reason);
    }

    // Only a total wipeout is an error. Losing one of three still gives the
    // user something to work with, which beats a 500.
    if (ok.length === 0) {
      const first = settled.find(s => s.status === 'rejected') as PromiseRejectedResult | undefined;
      throw new Error(first ? String(first.reason) : 'all concept calls failed');
    }

    const concepts = ok.map(s => s.value.concept);

    // Cost is logged per call so the Cost Tracker attributes each model
    // correctly — the aggregated `usage` in the response is only a summary.
    // Logged concurrently (not a sequential for-loop) so these Supabase round
    // trips don't stack extra latency between the fan-out and the recommendation
    // call below. logLlmCall already swallows its own errors and never throws,
    // so Promise.all here can't turn a logging hiccup into a failed request.
    await Promise.all(ok.map(s => logLlmCall(auth.test_user_id, 'concepts', {
      provider: model, model: stage.model, ...s.value.usage,
    })));

    // The recommendation needs to compare all the concepts, so it cannot be
    // folded into the parallel calls. A failure here is not worth losing the
    // concepts over — fall back to an empty string, which the UI handles.
    let recommendation = '';
    let recUsage: ConceptResult['usage'] = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 };
    try {
      const { system: recSystem, user: recUser } = buildRecommendationPrompt(concepts);
      const r = await chat({
        provider: model,
        model: recStage.model,
        system: recSystem,
        user: recUser,
        reasoningEffort: recStage.effort,
        maxTokens: recStage.maxTokens,
      });
      recommendation = r.text.trim();
      recUsage = r.usage;
      await logLlmCall(auth.test_user_id, 'concepts-recommend', {
        provider: model, model: recStage.model, ...r.usage,
      });
    } catch (recErr) {
      console.error('assistant/concepts: recommendation call failed (non-fatal):', recErr);
    }

    // Summed across every call. `model` names the concepts model because that
    // is the dominant spend; the per-call log rows carry the exact breakdown.
    const usage = {
      provider: model,
      model: stage.model,
      input_tokens: ok.reduce((n, s) => n + s.value.usage.input_tokens, 0) + recUsage.input_tokens,
      cached_input_tokens: ok.reduce((n, s) => n + s.value.usage.cached_input_tokens, 0) + recUsage.cached_input_tokens,
      output_tokens: ok.reduce((n, s) => n + s.value.usage.output_tokens, 0) + recUsage.output_tokens,
    };

    return res.status(200).json({ concepts, recommendation, usage });
  } catch (err) {
    console.error('assistant/concepts error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
