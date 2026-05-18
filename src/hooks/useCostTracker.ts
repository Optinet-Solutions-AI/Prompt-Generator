import { useEffect, useState } from 'react';
import {
  getCostEntries,
  subscribeCostStore,
  type CostEntry,
  type LlmCallEntry,
  type ImageGenEntry,
} from '@/lib/cost-store';

/** Backwards-compatible reshape so the existing CostTrackerPanel keeps working. */
export interface LlmCall {
  id: string;
  created_at: string;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
}

export interface ImageGen {
  id: string;
  created_at: string;
  provider: string;
  model: string | null;
  size: string | null;
  quality: string | null;
  image_count: number;
  cost_usd: number | null;   // unused in browser-only mode; image cost is computed on read
}

function isLlm(e: CostEntry): e is LlmCallEntry { return e.kind === 'llm'; }
function isImg(e: CostEntry): e is ImageGenEntry { return e.kind === 'image'; }

export function useCostTracker(testUserId: string) {
  const [entries, setEntries] = useState<CostEntry[]>(() => getCostEntries(testUserId));

  useEffect(() => {
    // Re-read on mount in case entries landed before the hook subscribed.
    setEntries(getCostEntries(testUserId));
    const unsub = subscribeCostStore(() => setEntries(getCostEntries(testUserId)));
    return unsub;
  }, [testUserId]);

  // Newest-first to match the existing panel order.
  const sorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const llm: LlmCall[] = sorted.filter(isLlm).map(e => ({
    id: e.id,
    created_at: e.created_at,
    provider: e.provider,
    model: e.model,
    input_tokens: e.input_tokens,
    cached_input_tokens: e.cached_input_tokens,
    output_tokens: e.output_tokens,
  }));

  const images: ImageGen[] = sorted.filter(isImg).map(e => ({
    id: e.id,
    created_at: e.created_at,
    provider: e.provider,
    model: e.model,
    size: e.size,
    quality: e.quality,
    image_count: e.image_count,
    cost_usd: null,
  }));

  return { llm, images, loadError: null as string | null };
}
