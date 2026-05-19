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
