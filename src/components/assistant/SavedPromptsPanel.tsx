import { useEffect, useState } from 'react';

const SUPABASE_URL  = (import.meta.env.VITE_SUPABASE_URL      as string) || '';
const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

function headersFor(token: string) {
  return {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
    'x-assistant-token': token,
  };
}

interface SavedRow {
  id: string;
  brand: string;
  task: string;
  picked_concept: { title: string; description: string } | null;
  created_at: string;
}

export function SavedPromptsPanel({ testUserId }: { testUserId: string }) {
  const [rows, setRows] = useState<SavedRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!SUPABASE_URL || !SUPABASE_ANON) {
        setError('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing');
        return;
      }
      try {
        const qs = new URLSearchParams({
          select: 'id,brand,task,picked_concept,created_at',
          test_user_id: `eq.${testUserId}`,
          liked: 'eq.true',
          order: 'created_at.desc',
          limit: '30',
        });
        const res = await fetch(`${SUPABASE_URL}/rest/v1/assistant_prompts?${qs}`, { headers: headersFor(testUserId) });
        if (!res.ok) throw new Error(`Saved prompts fetch ${res.status}`);
        const data = (await res.json()) as SavedRow[];
        setRows(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
  }, [testUserId]);

  if (error) return <p className="mt-12 text-xs text-red-400">{error}</p>;
  if (rows.length === 0) return null;

  return (
    <section className="mt-20 ax-fade-up">
      <div className="mb-6">
        <span className="ax-eyebrow">Your archive</span>
        <h2 className="ax-display text-3xl mt-1">Saved frames.</h2>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map(r => (
          <article key={r.id} className="ax-card p-5 hover:border-[var(--ax-gold)] transition-colors">
            <span className="ax-eyebrow" style={{ fontSize: 10 }}>
              {r.brand} · {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
            <h3 className="ax-display text-lg mt-2 leading-tight text-[var(--ax-ink)]">
              {r.picked_concept?.title ?? r.task}
            </h3>
            {r.picked_concept?.description && (
              <p className="text-xs text-[var(--ax-ink-dim)] mt-2 leading-relaxed line-clamp-3">
                {r.picked_concept.description}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
