export type Provider = 'openai' | 'gemini' | 'claude';

export interface ChatOptions {
  provider: Provider;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  json?: boolean;
  jsonSchema?: object;
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
      throw new Error('Gemini provider not yet implemented');
    case 'claude':
      throw new Error('Claude provider not yet wired');
  }
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

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

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
