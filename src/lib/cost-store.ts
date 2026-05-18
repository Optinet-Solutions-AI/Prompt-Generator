// Browser-side cost accumulator. Backed by localStorage, scoped per
// test_user_id. Updated synchronously after every LLM or image-gen call so
// the Cost Tracker reflects real-time usage without depending on Supabase.
//
// Later, a backend `assistant_llm_calls` table can take over for cross-device
// persistence; for now this gives accurate numbers immediately.

const KEY_PREFIX = 'assistant_cost:';
const UPDATE_EVENT = 'cost-tracker:update';

export interface LlmCallEntry {
  id: string;
  kind: 'llm';
  created_at: string;
  step: 'concepts' | 'generate' | 'refine';
  provider: string;
  model: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

export interface ImageGenEntry {
  id: string;
  kind: 'image';
  created_at: string;
  provider: string;        // 'chatgpt' | 'gemini'
  model: string;           // 'gpt-image-1' | 'imagen' etc.
  size: string;            // '1024x1024' or fallback like '16:9'
  quality: string | null;
  image_count: number;
}

export type CostEntry = LlmCallEntry | ImageGenEntry;

function storageKey(testUserId: string): string {
  return KEY_PREFIX + testUserId;
}

function readAll(testUserId: string): CostEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(testUserId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(testUserId: string, entries: CostEntry[]): void {
  try {
    localStorage.setItem(storageKey(testUserId), JSON.stringify(entries));
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: { testUserId } }));
  } catch {
    // Storage quota or private-mode failure — non-fatal, the user just loses
    // cost tracking persistence. Don't break the page.
  }
}

export function recordLlmCall(
  testUserId: string,
  step: LlmCallEntry['step'],
  usage: {
    provider: string;
    model: string;
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
  },
): void {
  if (!testUserId) return;
  const entries = readAll(testUserId);
  entries.push({
    id: crypto.randomUUID(),
    kind: 'llm',
    created_at: new Date().toISOString(),
    step,
    ...usage,
  });
  writeAll(testUserId, entries);
}

export function recordImageGen(
  testUserId: string,
  info: {
    provider: string;
    model: string;
    size: string;
    quality: string | null;
    image_count: number;
  },
): void {
  if (!testUserId) return;
  const entries = readAll(testUserId);
  entries.push({
    id: crypto.randomUUID(),
    kind: 'image',
    created_at: new Date().toISOString(),
    ...info,
  });
  writeAll(testUserId, entries);
}

export function getCostEntries(testUserId: string): CostEntry[] {
  return readAll(testUserId);
}

/** Subscribe to cost-store changes (added/removed entries). Returns an unsubscribe fn. */
export function subscribeCostStore(handler: () => void): () => void {
  window.addEventListener(UPDATE_EVENT, handler);
  // Also react to localStorage changes from other tabs (rare for single-user, but safe).
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(UPDATE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function clearCostEntries(testUserId: string): void {
  localStorage.removeItem(storageKey(testUserId));
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: { testUserId } }));
}
