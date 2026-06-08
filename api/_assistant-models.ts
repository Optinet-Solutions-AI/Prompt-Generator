// Single source of truth for the assistant's per-stage model tiering.
// Tiering axes: Gemini model tier, and OpenAI reasoning_effort.
// Constraint: every entry must return within Vercel's 10s function timeout —
// that is why no Pro/flagship tier appears here and reasoning effort stays low.

export type AssistantStage = 'concepts' | 'generate' | 'refine';
export type AssistantProvider = 'openai' | 'gemini';

export interface ProviderModel {
  model: string;
  /** OpenAI reasoning_effort. Omitted for Gemini entries. */
  effort?: 'none' | 'low' | 'medium' | 'high';
  maxTokens: number;
}

export const ASSISTANT_MODELS: Record<AssistantStage, Record<AssistantProvider, ProviderModel>> = {
  // Creativity + diversity, fast. Diversity comes from the rotating lens + avoid-list
  // (gpt-5.x ignores the temperature lever; Gemini still honours it in the endpoint).
  concepts: {
    openai: { model: 'gpt-5.2', effort: 'none', maxTokens: 1200 },
    gemini: { model: 'gemini-3.5-flash', maxTokens: 1200 },
  },
  // Templated 8-field structured JSON — cheapest/fastest current tier is enough.
  generate: {
    openai: { model: 'gpt-5.2', effort: 'none', maxTokens: 1200 },
    gemini: { model: 'gemini-3.1-flash-lite', maxTokens: 2000 },
  },
  // Intent disambiguation (clarify vs refine, "not-X = add-X") benefits from light
  // reasoning. maxTokens raised so reasoning tokens don't truncate the JSON output.
  refine: {
    openai: { model: 'gpt-5.2', effort: 'low', maxTokens: 3000 },
    gemini: { model: 'gemini-3.5-flash', maxTokens: 2000 },
  },
};
