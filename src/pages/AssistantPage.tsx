import { useParams } from 'react-router-dom';
import { useState } from 'react';
import NotFound from './NotFound';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModelSelect } from '@/components/assistant/ModelSelect';
import { CostTrackerPanel } from '@/components/assistant/CostTrackerPanel';
import { requestConcepts, requestGenerate } from '@/lib/assistant-client';
import { recordLlmCall } from '@/lib/cost-store';
import type { AssistantProvider, AssistantConcept, AssistantUsage, GeneratedFields } from '@/lib/assistant-types';
import { GeneratedPromptPanel } from '@/components/assistant/GeneratedPromptPanel';
import { SavedPromptsPanel } from '@/components/assistant/SavedPromptsPanel';

function isAllowed(token: string | undefined): boolean {
  if (!token) return false;
  const raw = import.meta.env.VITE_ASSISTANT_TOKENS as string | undefined;
  if (!raw) return false;
  return raw.split(',').map(s => s.trim()).includes(token);
}

const AVAILABLE_BRANDS = ['RocketSpin'];

export default function AssistantPage() {
  const { token } = useParams();
  if (!isAllowed(token)) return <NotFound />;

  const [model, setModel] = useState<AssistantProvider>('gemini');
  const [brand, setBrand] = useState<string>('RocketSpin');
  const [task, setTask] = useState('');
  const [description, setDescription] = useState('');
  const [concepts, setConcepts] = useState<AssistantConcept[] | null>(null);
  const [recommendation, setRecommendation] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<(GeneratedFields & { brand: string }) | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pickedConcept, setPickedConcept] = useState<AssistantConcept | null>(null);
  const [generatedUsage, setGeneratedUsage] = useState<AssistantUsage | null>(null);

  async function onPick(c: AssistantConcept) {
    setError(null); setGenerating(true); setGenerated(null);
    setPickedConcept(c);
    try {
      const r = await requestGenerate({ token: token!, brand, task, description, model, pickedConcept: c });
      setGenerated(r.metadata);
      setGeneratedUsage(r.usage);
      recordLlmCall(token!, 'generate', r.usage);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function onSuggest() {
    setError(null); setLoading(true); setConcepts(null);
    try {
      const r = await requestConcepts({ token: token!, brand, task, description, model });
      setConcepts(r.concepts);
      setRecommendation(r.recommendation);
      recordLlmCall(token!, 'concepts', r.usage);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">AI Concept Assistant</h1>
        <div className="flex items-center gap-2">
          <CostTrackerPanel testUserId={token!} />
          <ModelSelect value={model} onChange={setModel} />
        </div>
      </header>

      <section className="space-y-4 rounded-lg border p-6 bg-card">
        <div>
          <Label htmlFor="brand">Brand</Label>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger id="brand" className="w-[240px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {AVAILABLE_BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="task">Task topic</Label>
          <Input id="task" value={task} onChange={(e) => setTask(e.target.value)}
                 placeholder="e.g. banner for weekend rocket boost" />
        </div>

        <div>
          <Label htmlFor="desc">Extra detail (optional)</Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)}
                    placeholder="Anything that nudges the concepts in a direction…" rows={3} />
        </div>

        <Button onClick={onSuggest} disabled={loading || !task.trim()}>
          {loading ? 'Thinking…' : 'Suggest 3 concepts'}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>

      {concepts && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-2">Concepts</h2>
          {recommendation && (
            <p className="text-sm text-muted-foreground mb-4 italic">{recommendation}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {concepts.map((c, i) => (
              <article key={i} className="rounded-lg border p-4 bg-card flex flex-col">
                <h3 className="font-medium">{c.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 flex-1">{c.description}</p>
                <Button className="mt-4" size="sm" disabled={generating} onClick={() => onPick(c)}>
                  {generating ? 'Generating…' : 'Pick →'}
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}

      {generated && concepts && (
        <GeneratedPromptPanel
          fields={generated}
          token={token!}
          task={task}
          description={description}
          pickedConcept={pickedConcept!}
          allConcepts={concepts}
          usage={generatedUsage!}
          refineModel={model}
        />
      )}

      <SavedPromptsPanel testUserId={token!} />
    </main>
  );
}
