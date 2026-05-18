import { useEffect, useState } from 'react';

const SUPABASE_URL  = (import.meta.env.VITE_SUPABASE_URL      as string) || '';
const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

function headersFor(token: string) {
  return {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
    // RLS policy on the assistant_* tables checks this header to scope reads
    // to the current tester. Without it the request returns zero rows.
    'x-assistant-token': token,
  };
}

export interface LlmCall {
  id: string;
  created_at: string;
  step: string | null;
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
  cost_usd: number | null;
}

export function useCostTracker(testUserId: string) {
  const [llm, setLlm] = useState<LlmCall[]>([]);
  const [images, setImages] = useState<ImageGen[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!SUPABASE_URL || !SUPABASE_ANON) {
        setLoadError('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing');
        return;
      }
      try {
        const llmQs = new URLSearchParams({
          select: 'id,created_at,step,provider,model,input_tokens,cached_input_tokens,output_tokens',
          test_user_id: `eq.${testUserId}`,
          order: 'created_at.desc',
          limit: '100',
        });
        const imgQs = new URLSearchParams({
          select: 'id,created_at,provider,model,size,quality,image_count,cost_usd',
          test_user_id: `eq.${testUserId}`,
          order: 'created_at.desc',
          limit: '100',
        });
        const headers = headersFor(testUserId);
        const [lRes, iRes] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/assistant_llm_calls?${llmQs}`, { headers }),
          fetch(`${SUPABASE_URL}/rest/v1/assistant_image_gens?${imgQs}`, { headers }),
        ]);
        if (!lRes.ok) throw new Error(`LLM fetch ${lRes.status}: ${await lRes.text()}`);
        if (!iRes.ok) throw new Error(`Image gens fetch ${iRes.status}: ${await iRes.text()}`);
        const l = (await lRes.json()) as LlmCall[];
        const i = (await iRes.json()) as ImageGen[];
        if (cancelled) return;
        setLlm(l);
        setImages(i);
        setLoadError(null);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    }

    load();

    // Auto-refresh every 10s so newly-logged calls land in the tracker
    // without the user having to close/reopen the panel.
    const interval = setInterval(load, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [testUserId, refreshKey]);

  return {
    llm,
    images,
    loadError,
    refresh: () => setRefreshKey(k => k + 1),
  };
}
