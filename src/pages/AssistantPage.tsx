import { useParams } from 'react-router-dom';
import { useState } from 'react';
import NotFound from './NotFound';
import { ModelSelect } from '@/components/assistant/ModelSelect';
import { CostTrackerPanel } from '@/components/assistant/CostTrackerPanel';
import { requestConcepts, requestGenerate } from '@/lib/assistant-client';
import type { AssistantProvider, AssistantConcept, AssistantUsage, GeneratedFields } from '@/lib/assistant-types';
import { GeneratedPromptPanel } from '@/components/assistant/GeneratedPromptPanel';
import { SavedPromptsPanel } from '@/components/assistant/SavedPromptsPanel';
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function onSuggest() {
    setError(null); setLoading(true); setConcepts(null);
    setGenerated(null); setPickedConcept(null);
    try {
      const r = await requestConcepts({ token: token!, brand, task, description, model });
      setConcepts(r.concepts);
      setRecommendation(r.recommendation);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="ax-root">
      <div className="mx-auto max-w-5xl px-6 py-10 md:px-10 md:py-14">

        {/* ──────────── HERO ──────────── */}
        <header className="ax-fade-up flex items-start justify-between gap-6 mb-12 md:mb-16">
          <div className="flex items-start gap-4">
            <div className="ax-reactor mt-2" aria-hidden />
            <div>
              <div className="ax-eyebrow mb-2">AI Concept Studio · {brand}</div>
              <h1 className="ax-display text-5xl md:text-6xl leading-[1.05]">
                Brief in.<br />
                <em>Concept out.</em>
              </h1>
              <p className="mt-3 text-sm text-[var(--ax-ink-dim)] max-w-md leading-relaxed">
                Tell us the moment you need. The studio drafts three directions,
                writes the prompt, and renders the shot.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CostTrackerPanel testUserId={token!} />
            <ModelSelect value={model} onChange={setModel} />
          </div>
        </header>

        {/* ──────────── BRIEF FORM ──────────── */}
        <section className="ax-card ax-fade-up ax-fade-up-delay-1 p-7 md:p-9">
          <div className="grid md:grid-cols-[180px_1fr] gap-x-10 gap-y-6">
            <div>
              <span className="ax-label">For</span>
              {/* Single-brand pilot — surface as static identity, not a dropdown */}
              <div className="flex items-center gap-2 mt-1">
                <span className="font-medium text-[var(--ax-ink)]">{brand}</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ax-ink-fade)] border border-[var(--ax-line)] rounded px-1.5 py-0.5">
                  Pilot
                </span>
              </div>
              {/* Hidden select preserved so the state stays controllable later */}
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="hidden"
              >
                {AVAILABLE_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="space-y-5">
              <div>
                <label htmlFor="ax-task" className="ax-label">The moment</label>
                <input
                  id="ax-task"
                  className="ax-input"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="A weekend rocket boost. New Year. Welcome banner…"
                />
              </div>

              <div>
                <label htmlFor="ax-desc" className="ax-label">Notes <span className="text-[var(--ax-ink-fade)] normal-case tracking-normal">(optional)</span></label>
                <textarea
                  id="ax-desc"
                  className="ax-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Anything that should nudge the direction — mood, time of day, what to lean into."
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-4 pt-2">
                <button
                  onClick={onSuggest}
                  disabled={loading || !task.trim()}
                  className="ax-btn-primary"
                >
                  {loading ? (
                    <span className="ax-thinking" style={{ color: 'inherit' }}>
                      <span className="ax-thinking-dot" />
                      <span className="ax-thinking-dot" />
                      <span className="ax-thinking-dot" />
                      Drafting…
                    </span>
                  ) : (
                    <>Draft 3 concepts <span aria-hidden>→</span></>
                  )}
                </button>
                {error && (
                  <p className="text-sm text-red-400 font-medium">{error}</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ──────────── CONCEPT CARDS ──────────── */}
        {concepts && (
          <section className="mt-14">
            <div className="flex items-baseline justify-between mb-6">
              <div>
                <span className="ax-eyebrow">Three directions</span>
                <h2 className="ax-display text-3xl mt-1">Pick one to develop.</h2>
              </div>
            </div>

            {recommendation && (
              <div className="ax-recommendation mb-6">
                <strong>I'd pick</strong>
                <span>{recommendation}</span>
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-5">
              {concepts.map((c, i) => (
                <article key={i} className={`ax-concept-card ax-fade-up ax-fade-up-delay-${(i % 3) + 1}`}>
                  <span className="ax-concept-number" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                  <span className="ax-eyebrow" style={{ fontSize: 10 }}>Concept</span>
                  <h3 className="ax-concept-title">{c.title}</h3>
                  <p className="ax-concept-desc">{c.description}</p>
                  <div className="mt-2 pt-3 border-t border-[var(--ax-line)]">
                    <button
                      disabled={generating}
                      onClick={() => onPick(c)}
                      className="ax-btn-ghost w-full justify-center"
                    >
                      {generating && pickedConcept?.title === c.title
                        ? <>Composing…</>
                        : <>Develop this <span aria-hidden>→</span></>}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ──────────── GENERATED PROMPT + CHAT ──────────── */}
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

        {/* ──────────── SAVED ──────────── */}
        <SavedPromptsPanel testUserId={token!} />

      </div>
    </main>
  );
}
