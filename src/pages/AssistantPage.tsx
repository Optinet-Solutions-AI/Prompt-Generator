import { useParams } from 'react-router-dom';
import { useState, useRef } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import NotFound from './NotFound';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModelSelect } from '@/components/assistant/ModelSelect';
import { CostTrackerPanel } from '@/components/assistant/CostTrackerPanel';
import { requestConcepts, requestGenerate } from '@/lib/assistant-client';
import { mergeAvoid } from '@/lib/concept-avoid';
import type { AssistantProvider, AssistantConcept, PromptVersion } from '@/lib/assistant-types';
import { appendVersion } from '@/lib/prompt-versions';
import { GeneratedPromptPanel } from '@/components/assistant/GeneratedPromptPanel';
import { VersionStrip } from '@/components/assistant/VersionStrip';
import { SavedPromptsPanel } from '@/components/assistant/SavedPromptsPanel';
import { parseBoldSegments } from '@/lib/inline-bold';
import '@/components/assistant/assistant-theme.css';

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
  const [generating, setGenerating] = useState(false);
  // Which concept card is currently generating, purely so that card (and only
  // that one) can show "Generating…" while the others stay put. This is
  // separate from prompt history — it never outlives the in-flight request.
  const [generatingTitle, setGeneratingTitle] = useState<string | null>(null);
  // Prompt history. This used to be a single `generated` slot plus two
  // side-tables (pickedConcept, generatedUsage) that could drift out of sync
  // with it. Those are per-version facts, so they live on the version now.
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // One definition, many readers — every place that used to read `generated`
  // reads this instead, so a missed site is a type error rather than stale data.
  const active = versions[activeIndex] ?? null;
  const [avoid, setAvoid] = useState<string[]>([]);
  const avoidKeyRef = useRef<string>('');

  async function onPick(c: AssistantConcept) {
    setError(null); setGenerating(true); setGeneratingTitle(c.title);
    try {
      const r = await requestGenerate({ token: token!, brand, task, description, model, pickedConcept: c });
      // Append rather than replace: picking a second concept to look at an
      // alternative must not destroy the prompt you already had.
      setVersions(prev => {
        const next = appendVersion(prev, {
          fields: r.metadata, concept: c, source: 'generated', usage: r.usage,
        });
        setActiveIndex(next.length - 1);   // newest stays active
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false); setGeneratingTitle(null);
    }
  }

  async function onSuggest() {
    setError(null); setLoading(true); setConcepts(null);
    // New brief — clear prompt history so an old brief's prompts don't
    // linger under new concepts.
    setVersions([]); setActiveIndex(0);
    // Reset the avoid-list when the brief (brand+task) changes; otherwise accumulate
    // so each regenerate avoids every idea already shown for this brief.
    const key = `${brand}␟${task}`;
    const base = key === avoidKeyRef.current ? avoid : [];
    avoidKeyRef.current = key;
    try {
      const r = await requestConcepts({ token: token!, brand, task, description, model, avoid: base });
      setConcepts(r.concepts);
      setRecommendation(r.recommendation);
      setAvoid(mergeAvoid(base, r.concepts));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Decorative gradient blobs — same treatment as the main app */}
      <div className="absolute -top-1/2 -right-1/4 w-[800px] h-[800px] rounded-full gradient-primary opacity-[0.03] blur-3xl pointer-events-none" />
      <div className="absolute -bottom-1/2 -left-1/4 w-[600px] h-[600px] rounded-full gradient-primary opacity-[0.03] blur-3xl pointer-events-none" />

      <main className="relative container max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">

        {/* Hero — mirrors the main app's pattern */}
        <header className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl gradient-primary shadow-glow mb-4 sm:mb-6">
            <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            AI Concept Assistant
          </h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Describe what you need. The AI drafts three concept directions, writes
            the prompt, and renders the image.
          </p>

          <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
            <CostTrackerPanel testUserId={token!} />
            <ModelSelect value={model} onChange={setModel} />
          </div>
        </header>

        {/* Brief form */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Brief</CardTitle>
            <CardDescription>What's the moment we're creating for?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ax-brand">Brand</Label>
                <Select value={brand} onValueChange={setBrand}>
                  <SelectTrigger id="ax-brand"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_BRANDS.map(b => (
                      <SelectItem key={b} value={b}>{b} (pilot)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ax-task">Task topic <span className="text-destructive">*</span></Label>
                <Input
                  id="ax-task"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="e.g. new year banner, weekend rocket boost"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="ax-desc">Extra detail <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="ax-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Anything that nudges the direction — mood, time of day, what to lean into."
                rows={3}
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Button
                onClick={onSuggest}
                disabled={loading || generating || !task.trim()}
                size="lg"
                className="gap-2"
              >
                {loading ? 'Drafting…' : <>Draft 3 concepts <ArrowRight className="w-4 h-4" /></>}
              </Button>
              {error && (
                <p className="text-sm text-destructive font-medium">{error}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Concept cards */}
        {concepts && (
          <section className="mt-10">
            <div className="mb-4">
              <h2 className="text-2xl font-semibold">{concepts.length} direction{concepts.length === 1 ? '' : 's'}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Pick one to develop into a prompt + image.
              </p>
            </div>

            {recommendation && (
              <Card className="mb-5 border-primary/30 bg-primary/5">
                <CardContent className="py-3 px-4 flex gap-3 items-start text-sm">
                  <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-foreground/80">
                    <span className="font-medium text-primary">I'd lean toward:</span>{' '}
                    {/* The model writes markdown whether we ask it to or not, so
                        **bold** is turned into real emphasis rather than shown as
                        literal asterisks. Rendered as React elements, never as
                        HTML — this string is model output. */}
                    {parseBoldSegments(recommendation).map((seg, i) =>
                      seg.bold
                        ? <strong key={i} className="font-semibold">{seg.text}</strong>
                        : <span key={i}>{seg.text}</span>
                    )}
                  </span>
                </CardContent>
              </Card>
            )}

            <div className="grid md:grid-cols-3 gap-4">
              {concepts.map((c, i) => (
                <Card key={i} className="flex flex-col hover:shadow-lg hover:border-primary/30 transition-all">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                        Concept {i + 1}
                      </span>
                    </div>
                    <CardTitle className="text-lg leading-snug">{c.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                      {c.description}
                    </p>
                    <Button
                      onClick={() => onPick(c)}
                      disabled={generating}
                      variant="outline"
                      className="mt-4 gap-2"
                    >
                      {generating && generatingTitle === c.title
                        ? 'Generating…'
                        : <>Develop this <ArrowRight className="w-4 h-4" /></>}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Generated prompt + chat */}
        {active && concepts && (
          <>
            <VersionStrip
              versions={versions}
              activeIndex={activeIndex}
              onSelect={setActiveIndex}
            />
            <GeneratedPromptPanel
              key={active.concept.title}
              version={active}
              token={token!}
              task={task}
              description={description}
              allConcepts={concepts}
              refineModel={model}
              onNewVersion={(fields, usage) => {
                setVersions(prev => {
                  const next = appendVersion(prev, {
                    fields, concept: active.concept, source: 'refined', usage,
                  });
                  setActiveIndex(next.length - 1);
                  return next;
                });
              }}
            />
          </>
        )}

        <SavedPromptsPanel testUserId={token!} />
      </main>
    </div>
  );
}
