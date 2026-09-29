/**
 * _image-usage.ts — record what each person's image work costs (US dollars).
 *
 * Images are billed by OpenAI (ChatGPT) and Google (Gemini) per token, so we
 * record the tokens each call ACTUALLY reported and price them with the rates
 * in _image-models.ts. One row per action in Supabase `image_usage`:
 *   action   'generate' | 'edit' | 'variation'
 *   provider 'chatgpt' | 'gemini'
 *
 * EXACT vs ESTIMATED: OpenAI edits/variations also send the source image as
 * input ("image input tokens"). Our rate table only has OpenAI's TEXT input
 * rate, so those rows are priced with it and marked cost_exact = false.
 * Everything else (generations, all Gemini calls) is exact.
 *
 * Only main-app requests are recorded — AI Assistant tester requests keep
 * their own cost log (assistant_image_gens). Recording can NEVER break an
 * image request: every failure here is swallowed and logged.
 */
import type { VercelRequest } from '@vercel/node';
import { currentProfile, sb } from './_session.js';
import { getImageModel } from './_image-models.js';

export type ImageAction = 'generate' | 'edit' | 'variation';
export type ImageProvider = 'chatgpt' | 'gemini';

/** Tokens one call reported. image_input is the source image (edits/variations). */
export interface ImageTokens { text_input: number; image_input?: number; output: number }

/** OpenAI Images API `usage` → our token shape. */
export function openAiTokens(u: unknown): ImageTokens | null {
  const x = u as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } } | undefined;
  if (!x || typeof x.output_tokens !== 'number') return null;
  const imageIn = x.input_tokens_details?.image_tokens ?? 0;
  const textIn = x.input_tokens_details?.text_tokens ?? Math.max((x.input_tokens ?? 0) - imageIn, 0);
  return { text_input: textIn, image_input: imageIn, output: x.output_tokens };
}

/** Gemini usage (from _gemini-image parseUsage) → our token shape. */
export function geminiTokens(u: { text_input_tokens: number; image_output_tokens: number } | null | undefined): ImageTokens | null {
  return u ? { text_input: u.text_input_tokens, output: u.image_output_tokens } : null;
}

/** Add up several calls (e.g. 4 variations). */
export function sumTokens(list: Array<ImageTokens | null>): ImageTokens | null {
  const known = list.filter((t): t is ImageTokens => !!t);
  if (known.length === 0) return null;
  return known.reduce((a, t) => ({
    text_input: a.text_input + t.text_input,
    image_input: (a.image_input ?? 0) + (t.image_input ?? 0),
    output: a.output + t.output,
  }), { text_input: 0, image_input: 0, output: 0 });
}

/** Price tokens with the model's official rates. */
export function priceTokens(model: string, provider: ImageProvider, t: ImageTokens | null): { cost_usd: number | null; exact: boolean } {
  const m = getImageModel(model);
  if (!m || !t) return { cost_usd: null, exact: false };
  const imageIn = t.image_input ?? 0;
  const cost = ((t.text_input + imageIn) * m.textInputRatePerMillion + t.output * m.imageOutputRatePerMillion) / 1_000_000;
  // OpenAI bills image input at a different rate we don't have → estimate.
  const exact = !(provider === 'chatgpt' && imageIn > 0);
  return { cost_usd: Math.round(cost * 100000) / 100000, exact };
}

export async function recordImageUsage(req: VercelRequest, e: {
  action: ImageAction; provider: ImageProvider; model: string; images: number;
  tokens: ImageTokens | null; brand?: string | null; file_id?: string | null;
}): Promise<void> {
  try {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    if (body.source === 'assistant') return; // logged separately
    const p = await currentProfile(req);
    if (!p || e.images <= 0) return;
    const { cost_usd, exact } = priceTokens(e.model, e.provider, e.tokens);
    await sb('image_usage', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: p.id, user_email: p.email, user_name: p.name,
        action: e.action, provider: e.provider, model: e.model, images: e.images,
        brand: e.brand || null, file_id: e.file_id || null,
        text_input_tokens: e.tokens?.text_input ?? null,
        image_input_tokens: e.tokens?.image_input ?? null,
        output_tokens: e.tokens?.output ?? null,
        cost_usd, cost_exact: exact,
      }),
    });
  } catch (err) {
    console.error('[image-usage] could not record usage (request continues):', err);
  }
}
