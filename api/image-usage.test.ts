import { describe, it, expect } from 'vitest';
import { openAiTokens, geminiTokens, sumTokens, priceTokens } from './_image-usage.js';
import { summarizeImages, type ImageUsageRow } from './video.js';

describe('image cost math', () => {
  it('reads OpenAI usage, splitting text and source-image input', () => {
    expect(openAiTokens({ input_tokens: 1200, output_tokens: 4000, input_tokens_details: { text_tokens: 200, image_tokens: 1000 } }))
      .toEqual({ text_input: 200, image_input: 1000, output: 4000 });
    expect(openAiTokens(undefined)).toBeNull();
  });

  it('prices a plain generation exactly from the model rates', () => {
    // gpt-image-2: $5/M text in, $30/M image out → 100 in + 1000 out = $0.0305
    expect(priceTokens('gpt-image-2', 'chatgpt', { text_input: 100, output: 1000 })).toEqual({ cost_usd: 0.0305, exact: true });
    // gemini-2.5-flash-image: $0.30/M in, $30/M out → 1290 out ≈ $0.0387 (Google's published ~$0.039/image)
    expect(priceTokens('gemini-2.5-flash-image', 'gemini', geminiTokens({ text_input_tokens: 0, image_output_tokens: 1290 })).cost_usd).toBeCloseTo(0.0387, 4);
  });

  it('marks OpenAI edits/variations with a source image as estimates', () => {
    expect(priceTokens('gpt-image-2', 'chatgpt', { text_input: 100, image_input: 800, output: 1000 }).exact).toBe(false);
  });

  it('returns an unknown cost for unknown models or missing tokens', () => {
    expect(priceTokens('mystery-model', 'gemini', { text_input: 1, output: 1 }).cost_usd).toBeNull();
    expect(priceTokens('gpt-image-2', 'chatgpt', null).cost_usd).toBeNull();
  });

  it('adds up the tokens of several variations, skipping ones without usage', () => {
    expect(sumTokens([{ text_input: 10, output: 100 }, null, { text_input: 5, image_input: 7, output: 50 }]))
      .toEqual({ text_input: 15, image_input: 7, output: 150 });
    expect(sumTokens([null])).toBeNull();
  });
});

describe('summarizeImages', () => {
  const row = (o: Partial<ImageUsageRow>): ImageUsageRow => ({
    user_id: 'u1', user_email: 'a@b.c', user_name: 'A', action: 'generate', provider: 'gemini', model: 'gemini-2.5-flash-image',
    images: 1, brand: 'SpinJo', cost_usd: 0.039, cost_exact: true, created_at: new Date().toISOString(), ...o,
  });
  it('splits ChatGPT vs Gemini and generate/edit/variations', () => {
    const s = summarizeImages([
      row({}),
      row({ provider: 'chatgpt', model: 'gpt-image-2', cost_usd: '0.1' }),
      row({ action: 'variation', images: 4, cost_usd: 0.16 }),
      row({ provider: 'chatgpt', action: 'edit', cost_usd: 0.05, cost_exact: false }),
      row({ cost_usd: null }),
    ]);
    expect(s.usd).toBe(0.349);
    expect(s.images).toBe(8);
    expect(s.estimated_usd).toBe(0.05);
    expect(s.unpriced).toBe(1);
    expect(s.by_provider.ChatGPT).toEqual({ images: 2, usd: 0.15 });
    expect(s.by_action.Variations).toEqual({ images: 4, usd: 0.16 });
    expect(s.by_provider_action['ChatGPT · Edit']).toEqual({ images: 1, usd: 0.05 });
  });
});
