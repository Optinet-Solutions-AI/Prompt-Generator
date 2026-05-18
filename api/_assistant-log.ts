// Server-side cost logger. Each LLM endpoint (concepts / generate / refine)
// calls this after a successful response so the Cost Tracker has accurate,
// cross-device numbers. Failures are non-fatal — never break the user
// response just because logging hit a transient DB issue.

interface LlmUsage {
  provider: string;
  model: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

export type AssistantStep = 'concepts' | 'generate' | 'refine';

export async function logLlmCall(
  testUserId: string,
  step: AssistantStep,
  usage: LlmUsage,
): Promise<void> {
  if (!testUserId) return;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[assistant-log] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — skipping cost log');
    return;
  }
  try {
    const row = {
      test_user_id: testUserId,
      step,
      provider: usage.provider,
      model: usage.model,
      input_tokens: usage.input_tokens,
      cached_input_tokens: usage.cached_input_tokens,
      output_tokens: usage.output_tokens,
    };
    const res = await fetch(`${url}/rest/v1/assistant_llm_calls`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[assistant-log] insert failed (${res.status}): ${errText}`);
    }
  } catch (err) {
    console.error('[assistant-log] unexpected error:', err);
  }
}
