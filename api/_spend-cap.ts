// Per-token daily spend cap. Each LLM endpoint calls `assertUnderSpendCap()`
// before invoking the model. We query the `assistant_llm_calls` table for the
// rows logged in the last 24h for this token, compute their cost using the
// shared pricing config, and refuse with 429 if the total exceeds the cap.
//
// Setting: ASSISTANT_DAILY_SPEND_CAP_USD env var (default $1.00 per token).
//
// This is intentionally simple. It does NOT account for:
//   - In-flight calls (a tester firing many requests in parallel before any
//     have logged can still over-spend; mitigated by Vercel's 10s function
//     concurrency limits and a real human user pattern)
//   - Image generation cost (only LLM is checked; image gens use their own
//     budget which is bounded by the gen-image endpoint's own resource limits)
//
// If logging fails (network blip), this function fails OPEN — it lets the call
// through. We prefer false-negatives (occasional over-cap) to false-positives
// (locking the tester out due to a DB hiccup).

import { computeLlmCost } from './_pricing.js';

const DEFAULT_CAP_USD = 1.0;

export interface SpendCapResult {
  allowed: boolean;
  spent_today_usd: number;
  cap_usd: number;
  reason?: string;
}

interface LlmCallRow {
  model: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

function capFromEnv(): number {
  const raw = process.env.ASSISTANT_DAILY_SPEND_CAP_USD;
  if (!raw) return DEFAULT_CAP_USD;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CAP_USD;
}

export async function checkSpendCap(testUserId: string): Promise<SpendCapResult> {
  const cap = capFromEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Fail open if Supabase isn't configured (dev / first-run).
    return { allowed: true, spent_today_usd: 0, cap_usd: cap };
  }

  try {
    const qs = new URLSearchParams({
      select: 'model,input_tokens,cached_input_tokens,output_tokens',
      test_user_id: `eq.${testUserId}`,
      created_at: `gte.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}`,
      limit: '1000',
    });
    const res = await fetch(`${url}/rest/v1/assistant_llm_calls?${qs}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.warn('[spend-cap] query failed, allowing call:', res.status);
      return { allowed: true, spent_today_usd: 0, cap_usd: cap };
    }
    const rows = (await res.json()) as LlmCallRow[];
    const total = rows.reduce((acc, r) => {
      const cost = computeLlmCost(r.model, {
        input_tokens: r.input_tokens ?? 0,
        cached_input_tokens: r.cached_input_tokens ?? 0,
        output_tokens: r.output_tokens ?? 0,
      });
      return acc + (cost ?? 0);
    }, 0);

    if (total >= cap) {
      return {
        allowed: false,
        spent_today_usd: total,
        cap_usd: cap,
        reason: `Daily spend cap of $${cap.toFixed(2)} reached ($${total.toFixed(4)} used in last 24h). Try again later or raise ASSISTANT_DAILY_SPEND_CAP_USD.`,
      };
    }
    return { allowed: true, spent_today_usd: total, cap_usd: cap };
  } catch (err) {
    console.warn('[spend-cap] unexpected error, allowing call:', err);
    return { allowed: true, spent_today_usd: 0, cap_usd: cap };
  }
}
