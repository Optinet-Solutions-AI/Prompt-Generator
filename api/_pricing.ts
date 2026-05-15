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
  'gpt-4o': {
    input_per_million: null,
    cached_input_per_million: null,
    output_per_million: null,
    last_updated: null,
    source: 'openai.com/api/pricing — TODO fill in before going live',
  },
  'gpt-4o-mini': {
    input_per_million: null,
    cached_input_per_million: null,
    output_per_million: null,
    last_updated: null,
    source: 'openai.com/api/pricing — TODO fill in before going live',
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
  last_updated: string | null;
  source: string;
}

export const IMAGE_PRICING: ImagePrice[] = [
  { cost_per_image_usd: null, size: '1024x1024', quality: 'standard', last_updated: null, source: 'openai.com — TODO' },
  { cost_per_image_usd: null, size: '1024x1024', quality: 'hd',       last_updated: null, source: 'openai.com — TODO' },
  { cost_per_image_usd: null, size: '1536x1024', quality: 'standard', last_updated: null, source: 'openai.com — TODO' },
  { cost_per_image_usd: null, size: '1024x1536', quality: 'standard', last_updated: null, source: 'openai.com — TODO' },
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

export function computeImageCost(size: string, quality: string | null, count: number): number | null {
  const entry = IMAGE_PRICING.find(p => p.size === size && (p.quality ?? null) === quality);
  if (!entry || entry.cost_per_image_usd === null) return null;
  return entry.cost_per_image_usd * count;
}
