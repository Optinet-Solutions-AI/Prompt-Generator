// Per-token daily spend cap. Every paid assistant call — an LLM call
// (api/assistant/concepts.ts, generate.ts, refine.ts) AND an image generation
// call that is assistant-scoped (api/generate-image.ts, when the request
// carries source: 'assistant' + a test_user_id) — calls checkSpendCap()
// before spending money. We sum the last 24h of BOTH:
//   - `assistant_llm_calls`, priced using the shared pricing config
//     (computeLlmCost), and
//   - `assistant_image_gens`, using its stored `cost_usd` column AS-IS. That
//     column is computed once, at write time, from the tokens the image
//     provider actually reported — we read it rather than recompute it here,
//     so this check can never disagree with what the Cost Tracker shows for
//     the same rows.
// and refuse with 429 if the combined total meets or exceeds the cap.
//
// Setting: ASSISTANT_DAILY_SPEND_CAP_USD env var (default $1.00 per token).
//
// This is intentionally simple. It does NOT account for:
//   - In-flight calls (a tester firing many requests in parallel before any
//     have logged can still over-spend). The "Vercel's 10s function concurrency
//     limits" this used to say as the mitigation is stale — a production call
//     was measured at 27s — and the concepts endpoint (api/assistant/concepts.ts)
//     made the exposure materially worse: it fires 4 model calls (3 concepts +
//     1 recommendation) per request with the cap checked ONCE up front, so a
//     set now costs roughly $0.016 rather than the ~$0.002 of the old single-call
//     design. A $1/day cap is now about 62 sets, not ~475. The real mitigation
//     is just the real-human-user pattern (nobody fires dozens of concept
//     requests within the same second) — there is no hard concurrency backstop.
//
// If a query fails (network blip, Supabase unconfigured, anything throws),
// this function fails OPEN — it lets the call through rather than lock a
// tester out over a DB hiccup. We prefer false-negatives (occasional
// over-cap) to false-positives. That failing-open behaviour applies per
// query too: if only ONE of the two queries above fails, we still enforce
// the cap using whatever total the OTHER query produced, instead of
// throwing away a perfectly good total just because its sibling failed.

import { computeLlmCost } from './_pricing.js';

// Raised from $1.00 to $10.00 on 2026-08-25. $1.00 turned out to be far too low
// to evaluate the tool with: a measured breakdown of one real testing day was
// 11 concept sets ($0.70) plus TWO images ($0.32) = $1.05, i.e. the cap was hit
// after an hour of ordinary use. At current prices one gpt-image-2 image costs
// ~$0.16, so a $1 cap allows about six images a day — the cap was effectively
// a limit on looking at pictures, which is the point of the tool.
//
// $10/day is a working budget, not a blank cheque: ~60 images or ~150 concept
// sets. Override per-environment with ASSISTANT_DAILY_SPEND_CAP_USD, which
// takes precedence over this and needs no code change.
const DEFAULT_CAP_USD = 10.0;

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

// PostgREST can (and does) serialize a `numeric` column as a JSON string
// rather than a number, so cost_usd may arrive as either — or as `null` for
// a row whose cost couldn't be computed at write time (unknown model).
interface ImageGenRow {
  cost_usd: number | string | null;
}

function capFromEnv(): number {
  const raw = process.env.ASSISTANT_DAILY_SPEND_CAP_USD;
  if (!raw) return DEFAULT_CAP_USD;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CAP_USD;
}

// Sums the last 24h of LLM spend for this token, priced via computeLlmCost.
// Never throws — a query failure (bad status or a network error) is logged
// and treated as "0 known spend from this table", so the OTHER table's total
// (image spend) still gets enforced instead of the whole check failing open.
async function fetchLlmSpend(
  url: string,
  key: string,
  testUserId: string,
  sinceIso: string,
): Promise<number> {
  try {
    const qs = new URLSearchParams({
      select: 'model,input_tokens,cached_input_tokens,output_tokens',
      test_user_id: `eq.${testUserId}`,
      created_at: `gte.${sinceIso}`,
      limit: '1000',
    });
    const res = await fetch(`${url}/rest/v1/assistant_llm_calls?${qs}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.warn('[spend-cap] assistant_llm_calls query failed, excluding from total:', res.status);
      return 0;
    }
    const rows = (await res.json()) as LlmCallRow[];
    return rows.reduce((acc, r) => {
      const cost = computeLlmCost(r.model, {
        input_tokens: r.input_tokens ?? 0,
        cached_input_tokens: r.cached_input_tokens ?? 0,
        output_tokens: r.output_tokens ?? 0,
      });
      return acc + (cost ?? 0);
    }, 0);
  } catch (err) {
    console.warn('[spend-cap] assistant_llm_calls query threw, excluding from total:', err);
    return 0;
  }
}

// Sums the last 24h of image spend for this token, reading the exact
// `cost_usd` column that was written at generation time — NOT recomputed
// here (see the file-header comment for why). Never throws, for the same
// reason as fetchLlmSpend above: one table's outage must not zero out the
// other table's already-known total.
async function fetchImageSpend(
  url: string,
  key: string,
  testUserId: string,
  sinceIso: string,
): Promise<number> {
  try {
    const qs = new URLSearchParams({
      select: 'cost_usd',
      test_user_id: `eq.${testUserId}`,
      created_at: `gte.${sinceIso}`,
      limit: '1000',
    });
    const res = await fetch(`${url}/rest/v1/assistant_image_gens?${qs}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.warn('[spend-cap] assistant_image_gens query failed, excluding from total:', res.status);
      return 0;
    }
    const rows = (await res.json()) as ImageGenRow[];
    return rows.reduce((acc, r) => {
      // Number(null) is 0 (fine), Number(undefined) is NaN, and a malformed
      // string is NaN — coerce every non-finite result to 0 so one bad/absent
      // row can't turn the whole sum into NaN.
      const n = Number(r.cost_usd);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
  } catch (err) {
    console.warn('[spend-cap] assistant_image_gens query threw, excluding from total:', err);
    return 0;
  }
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
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Both queries run concurrently (Promise.all, not one-after-the-other) —
    // this function runs before every assistant call and sits on the latency
    // path, so summing sequentially would double the wait for no reason.
    // Neither helper above throws, so Promise.all here can't reject: a query
    // that fails just contributes 0, and the other table's total still counts.
    const [llmTotal, imageTotal] = await Promise.all([
      fetchLlmSpend(url, key, testUserId, sinceIso),
      fetchImageSpend(url, key, testUserId, sinceIso),
    ]);
    const total = llmTotal + imageTotal;

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
