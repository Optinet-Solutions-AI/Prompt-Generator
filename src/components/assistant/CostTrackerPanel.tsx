import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Wallet } from 'lucide-react';
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
  const d = new Date(iso); const now = new Date();
  return d.toDateString() === now.toDateString();
}
function isThisMonth(iso: string) {
  const d = new Date(iso); const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

interface Props {
  testUserId: string;
}

export function CostTrackerPanel({ testUserId }: Props) {
  const { llm, images, loadError } = useCostTracker(testUserId);

  const llmRows = llm.map(c => ({ c, usd: llmCostFor(c) }));
  const imgRows = images.map(i => ({ i, usd: imageCostFor(i) }));

  // Per-model rollup. This is the number Lena is actually comparing: real
  // spend and real average cost per render for each model she has tried.
  //
  // `count` and `priced` are tracked separately on purpose. `imageCostFor`
  // returns null when a row has no cost_usd AND the legacy price table has no
  // matching row (true for real historical gpt-image-1 rows) — rows the
  // pricing tables cannot price are still counted as renders (`count`) but
  // excluded from money (`usd`/`priced`), because showing them as $0.00 would
  // understate real spend and make an unpriced model look free/cheap instead
  // of merely "we don't know".
  const byModel = Object.values(
    imgRows.reduce<Record<string, { model: string; count: number; priced: number; usd: number }>>((acc, { i, usd }) => {
      const key = i.model ?? 'unknown';
      acc[key] ??= { model: key, count: 0, priced: 0, usd: 0 };
      acc[key].count += i.image_count ?? 1;
      if (usd !== null) {
        acc[key].priced += i.image_count ?? 1;
        acc[key].usd    += usd;
      }
      return acc;
    }, {})
  ).sort((a, b) => b.usd - a.usd);

  const sum = (xs: { usd: number | null }[]) => xs.reduce((acc, x) => acc + (x.usd ?? 0), 0);
  const todayLlm = sum(llmRows.filter(x => isToday(x.c.created_at)));
  const monthLlm = sum(llmRows.filter(x => isThisMonth(x.c.created_at)));
  const todayImg = sum(imgRows.filter(x => isToday(x.i.created_at)));
  const monthImg = sum(imgRows.filter(x => isThisMonth(x.i.created_at)));

  const latestPriceDate =
    Object.values(LLM_PRICING).map(p => p.last_updated).filter(Boolean).sort().pop() ?? 'unknown';

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Wallet className="h-4 w-4" />
          Cost · ${(todayLlm + todayImg).toFixed(2)}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Cost Tracker</SheetTitle>
          <SheetDescription>
            Server-logged per call. Visible across all your browsers and devices.
          </SheetDescription>
        </SheetHeader>

        <div className="text-sm mt-6 space-y-6">
          {loadError && <p className="text-destructive text-xs">{loadError}</p>}

          <div className="grid grid-cols-2 gap-3">
            <Card label="Today" value={`$${(todayLlm + todayImg).toFixed(4)}`} sub={`LLM $${todayLlm.toFixed(4)} · Img $${todayImg.toFixed(4)}`} accent />
            <Card label="This month" value={`$${(monthLlm + monthImg).toFixed(4)}`} sub={`LLM $${monthLlm.toFixed(4)} · Img $${monthImg.toFixed(4)}`} />
          </div>

          <Section
            title="Recent LLM calls"
            count={llmRows.length}
            empty="No calls yet"
            rows={llmRows.slice(0, 12).map(({ c, usd }) => ({
              key: c.id,
              left: `${new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${c.model ?? '?'}`,
              right: usd === null ? 'price unknown' : `$${usd.toFixed(5)}`,
              priced: usd !== null,
            }))}
          />

          {byModel.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Image spend by model</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="py-1">Model</th>
                    <th className="py-1 text-right">Renders</th>
                    <th className="py-1 text-right">Total</th>
                    <th className="py-1 text-right">Avg / render</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map(r => {
                    const unpriced = r.count - r.priced;
                    return (
                      <tr key={r.model} className="border-t border-border/40">
                        <td className="py-1 font-mono">
                          {r.model}
                          {/* Make the shortfall visible rather than silently averaging
                              over fewer renders than the count shown — a reader who
                              only sees "Renders: 12" would assume all 12 are reflected
                              in Total/Avg. */}
                          {unpriced > 0 && (
                            <span className="block text-[10px] text-muted-foreground/70 italic">
                              {unpriced} unpriced
                            </span>
                          )}
                        </td>
                        <td className="py-1 text-right tabular-nums">{r.count}</td>
                        {/* When nothing for this model is priced, show "—" instead of
                            "$0.0000" — $0.00 reads as "confirmed free", which is the
                            opposite of "we don't know the price" and, for gpt-image-1
                            rows priced under the legacy table, made the OLD model look
                            cheaper than the new one instead of the reverse. */}
                        <td className="py-1 text-right tabular-nums">
                          {r.priced > 0 ? `$${r.usd.toFixed(4)}` : '—'}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {r.priced > 0 ? `$${(r.usd / r.priced).toFixed(4)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <Section
            title="Recent image renders"
            count={imgRows.length}
            empty="No images yet"
            rows={imgRows.slice(0, 12).map(({ i, usd }) => ({
              key: i.id,
              left: `${new Date(i.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${i.provider} ${i.size ?? ''}`,
              right: usd === null ? 'price unknown' : `$${usd.toFixed(5)}`,
              priced: usd !== null,
            }))}
          />

          <p className="text-xs text-muted-foreground pt-2 border-t">
            Prices as of {latestPriceDate}.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Card({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'bg-primary/5 border-primary/20' : 'bg-muted/40'}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${accent ? 'text-primary' : ''}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function Section({ title, count, empty, rows }: {
  title: string;
  count: number;
  empty: string;
  rows: { key: string; left: string; right: string; priced: boolean }[];
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-sm">{title}</h4>
        <span className="text-[11px] text-muted-foreground">{count} total</span>
      </div>
      <ul className="space-y-1">
        {rows.map(r => (
          <li key={r.key} className="flex justify-between text-xs py-1.5 border-b last:border-b-0">
            <span className="text-muted-foreground">{r.left}</span>
            <span className={r.priced ? 'font-medium' : 'italic text-muted-foreground/70'}>{r.right}</span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-xs text-muted-foreground italic py-3">{empty}</li>
        )}
      </ul>
    </div>
  );
}
