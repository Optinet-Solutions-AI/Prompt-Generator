// Single source of truth for the assistant's per-stage model tiering.
// Tiering axes: Gemini model tier, and OpenAI reasoning_effort.
//
// Budget: a production /api/generate-image call was measured succeeding at 27
// seconds on 2026-08-22, so the function budget is at least that — NOT the 10s
// this file previously assumed. That stale assumption is why the concepts stage
// sat on a Flash tier with reasoning off. Entries are now chosen for quality
// within roughly 30s.

export type AssistantStage = 'concepts' | 'generate' | 'refine' | 'recommend';
export type AssistantProvider = 'openai' | 'gemini';

export interface ProviderModel {
  model: string;
  /** OpenAI reasoning_effort. Omitted for Gemini entries. */
  effort?: 'none' | 'low' | 'medium' | 'high';
  maxTokens: number;
}

export const ASSISTANT_MODELS: Record<AssistantStage, Record<AssistantProvider, ProviderModel>> = {
  // Ideation. This is the stage the user reported as "obvious / clichéd", so it
  // gets the strongest tier that fits the budget: gemini-3.1-pro-preview
  // measured 17s for one concept, and the three concept calls run in parallel.
  // Fallback if that ever becomes too slow: gemini-3.7-flash (7s, and cheaper
  // than the gemini-3.5-flash this replaced) — a one-field change.
  concepts: {
    openai: { model: 'gpt-5.2', effort: 'low', maxTokens: 4000 },
    gemini: { model: 'gemini-3.1-pro-preview', maxTokens: 4000 },
  },
  // Templated 8-field structured JSON. gemini-3.1-flash-lite was tried first (cheapest),
  // but the 2026-06-08 smoke test showed it dropped fields AND the requested theme on
  // richer briefs (e.g. a Christmas promo). gemini-3.5-flash fills all 8 fields reliably.
  generate: {
    openai: { model: 'gpt-5.2', effort: 'none', maxTokens: 1200 },
    gemini: { model: 'gemini-3.5-flash', maxTokens: 2000 },
  },
  // Intent disambiguation (clarify vs refine, "not-X = add-X") benefits from light
  // reasoning. maxTokens raised so reasoning tokens don't truncate the JSON output.
  refine: {
    openai: { model: 'gpt-5.2', effort: 'low', maxTokens: 3000 },
    gemini: { model: 'gemini-3.5-flash', maxTokens: 2000 },
  },
  // Picks which of the drafted concepts to recommend. A short comparative
  // judgement over text already written, so it runs on a cheap tier that
  // accepts the thinkingBudget: 0 config injected by _llm.ts for flash-named
  // models. (gemini-3.5-flash-lite cannot be used here — it returns 400
  // INVALID_ARGUMENT when sent thinkingBudget: 0, so gemini-3.7-flash is the
  // cheap alternative that works.)
  recommend: {
    openai: { model: 'gpt-5.2', effort: 'none', maxTokens: 600 },
    gemini: { model: 'gemini-3.7-flash', maxTokens: 600 },
  },
};
