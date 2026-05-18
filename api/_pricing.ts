// KEEP IN SYNC with src/lib/pricing.ts. The two files duplicate the same
// constants and helpers so that the backend (cost-at-write-time logging,
// spend-cap checks) and the frontend (Cost Tracker display) compute the same
// numbers without one needing to import across the api/src boundary.

export interface ModelPrice {
  input_per_million: number | null;
  cached_input_per_million: number | null;
  output_per_million: number | null;
  last_updated: string | null;
  source: string;
}

export const LLM_PRICING: Record<string, ModelPrice> = {
  'gemini-2.5-flash': {
    input_per_million: 0.30,
    cached_input_per_million: null,
    output_per_million: 2.50,
    last_updated: '2026-05-14',
    source: 'ai.google.dev/pricing',
  },
  'gemini-2.5-pro': {
    input_per_million: 1.25,
    cached_input_per_million: null,
    output_per_million: 10.00,
    last_updated: '2026-05-14',
    source: 'ai.google.dev/pricing',
  },
  // OpenAI rates: rough estimates as of 2026-05. Verify at openai.com/api/pricing before going to production.
  'gpt-4o': {
    input_per_million: 2.50,
    cached_input_per_million: 1.25,
    output_per_million: 10.00,
    last_updated: '2026-05-18 (estimate)',
    source: 'openai.com/api/pricing — verify',
  },
  'gpt-4o-mini': {
    input_per_million: 0.15,
    cached_input_per_million: 0.075,
    output_per_million: 0.60,
    last_updated: '2026-05-18 (estimate)',
    source: 'openai.com/api/pricing — verify',
  },
  // Test fixture only — referenced by _pricing.test.ts to verify cache discount math.
  'test-cache-model': {
    input_per_million: 1.00,
    cached_input_per_million: 0.50,
    output_per_million: 0.00,
    last_updated: '2026-05-15',
    source: 'test fixture',
  },
};

export interface ImagePrice {
  cost_per_image_usd: number | null;
  size: string;
  quality: string | null;
  provider: string;          // 'openai' | 'gemini'
  last_updated: string | null;
  source: string;
}

// Per-image pricing estimates as of 2026-05. Verify before going to production.
export const IMAGE_PRICING: ImagePrice[] = [
  { cost_per_image_usd: 0.040, size: '1024x1024', quality: 'standard', provider: 'openai', last_updated: '2026-05-18 (estimate)', source: 'openai.com/api/pricing — verify' },
  { cost_per_image_usd: 0.080, size: '1024x1024', quality: 'hd',       provider: 'openai', last_updated: '2026-05-18 (estimate)', source: 'openai.com/api/pricing — verify' },
  { cost_per_image_usd: 0.060, size: '1536x1024', quality: 'standard', provider: 'openai', last_updated: '2026-05-18 (estimate)', source: 'openai.com/api/pricing — verify' },
  { cost_per_image_usd: 0.060, size: '1024x1536', quality: 'standard', provider: 'openai', last_updated: '2026-05-18 (estimate)', source: 'openai.com/api/pricing — verify' },
  { cost_per_image_usd: 0.040, size: '1024x1024', quality: null,       provider: 'gemini', last_updated: '2026-05-18 (estimate)', source: 'cloud.google.com/vertex-ai/generative-ai/pricing — verify' },
  { cost_per_image_usd: 0.040, size: '16:9',      quality: null,       provider: 'gemini', last_updated: '2026-05-18 (estimate)', source: 'cloud.google.com/vertex-ai/generative-ai/pricing — verify' },
  { cost_per_image_usd: 0.040, size: '9:16',      quality: null,       provider: 'gemini', last_updated: '2026-05-18 (estimate)', source: 'cloud.google.com/vertex-ai/generative-ai/pricing — verify' },
];

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

export function computeImageCost(
  provider: string,
  size: string | null,
  quality: string | null,
  count: number,
): number | null {
  const entry = IMAGE_PRICING.find(p =>
    p.provider === provider &&
    p.size === (size ?? '') &&
    (p.quality ?? null) === (quality ?? null)
  );
  if (!entry || entry.cost_per_image_usd === null) return null;
  return entry.cost_per_image_usd * count;
}
