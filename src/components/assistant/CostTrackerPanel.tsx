import { useState, useEffect, useRef } from 'react';
import { Wallet, X } from 'lucide-react';
import { useCostTracker, type LlmCall, type ImageGen } from '@/hooks/useCostTracker';
import { LLM_PRICING, computeLlmCost, computeImageCost } from '@/lib/pricing';

function llmCostFor(c: LlmCall): number | null {
  if (!c.model || c.input_tokens === null || c.output_tokens === null) return null;
  return computeLlmCost(c.model, {
    input_tokens: c.input_tokens,
    cached_input_tokens: c.cached_input_tokens ?? 0,
    output_tokens: c.output_tokens,
  });
}

function imageCostFor(i: ImageGen): number | null {
  if (i.cost_usd !== null && i.cost_usd !== undefined) return Number(i.cost_usd);
  return computeImageCost(i.provider, i.size, i.quality, i.image_count ?? 1);
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}
function isThisMonth(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

interface Props {
  testUserId: string;
}

export function CostTrackerPanel({ testUserId }: Props) {
  const [open, setOpen] = useState(false);
  const { llm, images, loadError } = useCostTracker(testUserId);
  const sheetRef = useRef<HTMLDivElement>(null);

  const llmRows = llm.map(c => ({ c, usd: llmCostFor(c) }));
  const imgRows = images.map(i => ({ i, usd: imageCostFor(i) }));

  const sum = (xs: { usd: number | null }[]) => xs.reduce((acc, x) => acc + (x.usd ?? 0), 0);
  const todayLlm = sum(llmRows.filter(x => isToday(x.c.created_at)));
  const monthLlm = sum(llmRows.filter(x => isThisMonth(x.c.created_at)));
  const todayImg = sum(imgRows.filter(x => isToday(x.i.created_at)));
  const monthImg = sum(imgRows.filter(x => isThisMonth(x.i.created_at)));

  const latestPriceDate =
    Object.values(LLM_PRICING).map(p => p.last_updated).filter(Boolean).sort().pop() ?? 'unknown';

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="ax-btn-ghost">
        <Wallet className="h-4 w-4" />
        Cost · ${(todayLlm + todayImg).toFixed(2)}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside
            ref={sheetRef}
            className="fixed right-0 top-0 z-50 h-full w-full sm:w-[420px] bg-[var(--ax-bg-rise)] border-l border-[var(--ax-card-edge)] shadow-2xl flex flex-col"
            style={{ animation: 'ax-slide-in 280ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
          >
            <header className="flex items-center justify-between px-6 py-5 border-b border-[var(--ax-line)]">
              <div>
                <span className="ax-eyebrow" style={{ fontSize: 10 }}>Ledger</span>
                <h2 className="ax-display text-xl mt-0.5">Cost Tracker</h2>
              </div>
              <button onClick={() => setOpen(false)} className="ax-btn-ghost" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="px-6 py-6 space-y-6 overflow-y-auto flex-1">
              {loadError && <p className="text-xs text-red-400">{loadError}</p>}

              {/* Totals */}
              <div className="grid grid-cols-2 gap-4">
                <div className="ax-card p-4">
                  <span className="ax-label">Today</span>
                  <div className="ax-display text-2xl text-[var(--ax-gold-bright)] mt-1">
                    ${(todayLlm + todayImg).toFixed(4)}
                  </div>
                  <div className="text-[11px] text-[var(--ax-ink-fade)] mt-1">
                    LLM ${todayLlm.toFixed(4)} · Img ${todayImg.toFixed(4)}
                  </div>
                </div>
                <div className="ax-card p-4">
                  <span className="ax-label">This month</span>
                  <div className="ax-display text-2xl text-[var(--ax-ink)] mt-1">
                    ${(monthLlm + monthImg).toFixed(4)}
                  </div>
                  <div className="text-[11px] text-[var(--ax-ink-fade)] mt-1">
                    LLM ${monthLlm.toFixed(4)} · Img ${monthImg.toFixed(4)}
                  </div>
                </div>
              </div>

              {/* LLM calls */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="ax-eyebrow">LLM calls</span>
                  <span className="text-[11px] text-[var(--ax-ink-fade)]">{llmRows.length} total</span>
                </div>
                <ul className="space-y-1.5">
                  {llmRows.slice(0, 12).map(({ c, usd }) => (
                    <li key={c.id} className="flex justify-between text-xs py-1.5 border-b border-[var(--ax-line)]">
                      <span className="text-[var(--ax-ink-dim)]">
                        {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} <span className="text-[var(--ax-ink-fade)]">·</span> {c.model ?? '?'}
                      </span>
                      <span className={usd === null ? 'text-[var(--ax-ink-fade)] italic' : 'text-[var(--ax-gold)] font-medium'}>
                        {usd === null ? '—' : `$${usd.toFixed(5)}`}
                      </span>
                    </li>
                  ))}
                  {llmRows.length === 0 && (
                    <li className="text-xs text-[var(--ax-ink-fade)] italic py-3">No calls yet</li>
                  )}
                </ul>
              </div>

              {/* Image gens */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="ax-eyebrow">Image renders</span>
                  <span className="text-[11px] text-[var(--ax-ink-fade)]">{imgRows.length} total</span>
                </div>
                <ul className="space-y-1.5">
                  {imgRows.slice(0, 12).map(({ i, usd }) => (
                    <li key={i.id} className="flex justify-between text-xs py-1.5 border-b border-[var(--ax-line)]">
                      <span className="text-[var(--ax-ink-dim)]">
                        {new Date(i.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} <span className="text-[var(--ax-ink-fade)]">·</span> {i.provider} {i.size ?? ''}
                      </span>
                      <span className={usd === null ? 'text-[var(--ax-ink-fade)] italic' : 'text-[var(--ax-gold)] font-medium'}>
                        {usd === null ? '—' : `$${usd.toFixed(5)}`}
                      </span>
                    </li>
                  ))}
                  {imgRows.length === 0 && (
                    <li className="text-xs text-[var(--ax-ink-fade)] italic py-3">No renders yet</li>
                  )}
                </ul>
              </div>

              <p className="text-[10px] leading-relaxed text-[var(--ax-ink-fade)] pt-2 border-t border-[var(--ax-line)]">
                Logged per call on the server, visible across all your browsers and devices.
                Prices as of {latestPriceDate}.
              </p>
            </div>
          </aside>
          <style>{`@keyframes ax-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        </>
      )}
    </>
  );
}
