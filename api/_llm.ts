export type Provider = 'openai' | 'gemini' | 'claude';

export interface ChatOptions {
  provider: Provider;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  json?: boolean;
  jsonSchema?: object;
  temperature?: number;
  /** OpenAI gpt-5.x reasoning control. Ignored by Gemini and non-5.x models. */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
}

export interface ChatResult {
  text: string;
  usage: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
  };
}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  switch (opts.provider) {
    case 'openai':
      return chatOpenAI(opts);
    case 'gemini':
      return chatGemini(opts);
    case 'claude':
      throw new Error('Claude provider not yet wired');
  }
}

// Both OpenAI and Gemini occasionally return transient 5xx errors under load
// (Gemini 2.5 Pro especially). We retry once with a short backoff before
// surfacing the failure. Kept conservative — Vercel hobby has a 10s function
// timeout, so we can't afford long retry chains.
const RETRIABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAY_MS = 600;

async function fetchWithRetry(url: string, init: RequestInit, label: string): Promise<Response> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!RETRIABLE_STATUSES.has(res.status) || attempt === 2) return res;
      // 5xx + still have retries → wait then loop
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    } catch (err) {
      // Network error → retry once then rethrow
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  // Unreachable in practice; satisfies the type checker.
  throw new Error(`${label}: retry loop exited without response`);
}

// Gemini's responseSchema follows a subset of OpenAPI 3.0 — it rejects JSON
// Schema Draft 7 keywords like `additionalProperties` that OpenAI requires for
// strict mode. We strip those keys recursively before sending to Gemini, keeping
// the original schema untouched for the OpenAI path.
function sanitizeSchemaForGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForGemini);
  if (schema === null || typeof schema !== 'object') return schema;
  const UNSUPPORTED = new Set(['additionalProperties', '$schema', '$id', 'const']);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (UNSUPPORTED.has(k)) continue;
    out[k] = sanitizeSchemaForGemini(v);
  }
  return out;
}

async function chatGemini(opts: ChatOptions): Promise<ChatResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${apiKey}`;

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: opts.maxTokens,
  };
  // Gemini 2.5 Flash allows disabling thinking (saves tokens on simple JSON
  // tasks). Gemini 2.5 Pro REQUIRES thinking — rejects thinkingBudget=0. So we
  // only disable thinking for Flash models; for Pro we leave the default on
  // and rely on the caller giving us enough maxTokens to cover both thinking
  // and output.
  if (opts.model.includes('flash')) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  if (opts.json) {
    generationConfig.responseMimeType = 'application/json';
    if (opts.jsonSchema) generationConfig.responseSchema = sanitizeSchemaForGemini(opts.jsonSchema);
  }
  if (opts.temperature !== undefined) generationConfig.temperature = opts.temperature;

  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: 'user', parts: [{ text: opts.user }] }],
    generationConfig,
  };

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 'Gemini');

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const text = candidate?.content?.parts?.[0]?.text ?? '';

  // Truncated outputs are a leading source of bad JSON downstream — fail loudly.
  if (finishReason && finishReason !== 'STOP') {
    throw new Error(
      `Gemini stopped early (finishReason=${finishReason}). ` +
      `Output was ${text.length} chars. ` +
      `Raise maxTokens or check for safety filters. Raw text preview: ${text.slice(0, 120)}`
    );
  }

  return {
    text,
    usage: {
      input_tokens: data.usageMetadata?.promptTokenCount ?? 0,
      cached_input_tokens: 0,
      output_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

async function chatOpenAI(opts: ChatOptions): Promise<ChatResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user',   content: opts.user },
    ],
    max_completion_tokens: opts.maxTokens,
  };

  if (opts.json) {
    body.response_format = opts.jsonSchema
      ? { type: 'json_schema', json_schema: { name: 'assistant_output', strict: true, schema: opts.jsonSchema } }
      : { type: 'json_object' };
  }
  // gpt-5.x reasoning models reject a custom temperature — only send it for non-5.x.
  const isGpt5 = opts.model.startsWith('gpt-5');
  if (opts.temperature !== undefined && !isGpt5) body.temperature = opts.temperature;
  // reasoning_effort is a gpt-5.x control (none|low|medium|high). Send when provided.
  if (opts.reasoningEffort !== undefined) body.reasoning_effort = opts.reasoningEffort;

  const res = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  }, 'OpenAI');

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    text: data.choices[0]?.message?.content ?? '',
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      cached_input_tokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    },
  };
}
