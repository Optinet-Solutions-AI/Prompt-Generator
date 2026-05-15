// MUST be kept in sync with api/_pricing.ts.
// Frontend (Cost Tracker) and backend (cost-at-write-time logging) compute the same numbers.

export interface ModelPrice {
  input_per_million: number | null;
  cached_input_per_million: number | null;
  output_per_million: number | null;
  last_updated: string | null;
  source: string;
}

export const LLM_PRICING: Record<string, ModelPrice> = {
  'gemini-2.5-flash': { input_per_million: 0.30, cached_input_per_million: null, output_per_million: 2.50, last_updated: '2026-05-14', source: 'ai.google.dev/pricing' },
  'gemini-2.5-pro':   { input_per_million: 1.25, cached_input_per_million: null, output_per_million: 10.00, last_updated: '2026-05-14', source: 'ai.google.dev/pricing' },
  'gpt-4o':           { input_per_million: null, cached_input_per_million: null, output_per_million: null, last_updated: null, source: 'openai.com/api/pricing — TODO fill in before going live' },
  'gpt-4o-mini':      { input_per_million: null, cached_input_per_million: null, output_per_million: null, last_updated: null, source: 'openai.com/api/pricing — TODO fill in before going live' },
};

export function computeLlmCost(
  model: string,
  usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number }
): number | null {
  const p = LLM_PRICING[model];
  if (!p || p.input_per_million === null || p.output_per_million === null) return null;
  const billableInput = usage.input_tokens - usage.cached_input_tokens;
  const cachedRate = p.cached_input_per_million ?? p.input_per_million;
  return (
    billableInput * p.input_per_million +
    usage.cached_input_tokens * cachedRate +
    usage.output_tokens * p.output_per_million
  ) / 1_000_000;
}
