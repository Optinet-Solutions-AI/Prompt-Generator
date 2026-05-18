import type { AssistantConcept, GeneratedFields, AssistantUsage } from './assistant-types';

const SUPABASE_URL  = (import.meta.env.VITE_SUPABASE_URL      as string) || '';
const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

function headersFor(token: string) {
  return {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    // RLS policy on assistant_prompts requires this header to match
    // test_user_id on the row being inserted.
    'x-assistant-token': token,
  };
}

export interface SaveArgs {
  test_user_id: string;
  brand: string;
  task: string;
  description?: string;
  provider: string;
  model: string;
  all_concepts?: AssistantConcept[];
  picked_concept?: AssistantConcept;
  generated_fields?: GeneratedFields;
  usage?: Omit<AssistantUsage, 'provider' | 'model'>;
  image_drive_ids?: string[];
  liked: boolean;
}

export async function saveAssistantPrompt(args: SaveArgs) {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not configured');
  }
  const row = {
    test_user_id: args.test_user_id,
    brand: args.brand,
    task: args.task,
    description: args.description ?? null,
    provider: args.provider,
    model: args.model,
    all_concepts: args.all_concepts ?? null,
    picked_concept: args.picked_concept ?? null,
    generated_fields: args.generated_fields ?? null,
    image_drive_ids: args.image_drive_ids ?? [],
    liked: args.liked,
    input_tokens: args.usage?.input_tokens ?? null,
    cached_input_tokens: args.usage?.cached_input_tokens ?? null,
    output_tokens: args.usage?.output_tokens ?? null,
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/assistant_prompts`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to save (${res.status}): ${err}`);
  }
  const inserted = await res.json();
  return Array.isArray(inserted) ? inserted[0] : inserted;
}
