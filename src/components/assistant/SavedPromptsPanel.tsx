import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bookmark } from 'lucide-react';

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

  if (error) return <p className="mt-12 text-sm text-destructive">{error}</p>;
  if (rows.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-4">
        <Bookmark className="w-5 h-5 text-primary" />
        <h2 className="text-2xl font-semibold">Your saved prompts</h2>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map(r => (
          <Card key={r.id} className="hover:shadow-md hover:border-primary/30 transition-all">
            <CardHeader>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {r.brand} · {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </div>
              <CardTitle className="text-base leading-snug">
                {r.picked_concept?.title ?? r.task}
              </CardTitle>
            </CardHeader>
            {r.picked_concept?.description && (
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                  {r.picked_concept.description}
                </p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}
