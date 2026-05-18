import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SUPABASE_URL  = (import.meta.env.VITE_SUPABASE_URL      as string) || '';
const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

function headersFor(token: string) {
  return {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
    // RLS policy scopes reads to this tester only.
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
        const res = await fetch(`${SUPABASE_URL}/rest/v1/assistant_prompts?${qs}`, { headers: SB_HEADERS });
        if (!res.ok) throw new Error(`Saved prompts fetch ${res.status}`);
        const data = (await res.json()) as SavedRow[];
        setRows(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
  }, [testUserId]);

  if (error) return <p className="mt-12 text-sm text-destructive">{error}</p>;
  if (rows.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold mb-3">Your saved prompts</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map(r => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="text-base">{r.picked_concept?.title ?? r.task}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <div>{r.brand} · {new Date(r.created_at).toLocaleString()}</div>
              {r.picked_concept?.description && <div>{r.picked_concept.description}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
