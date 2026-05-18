import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
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
  // Prefer the cost_usd that was computed and stored at write time. If absent
  // (older rows or backend couldn't price it), recompute from pricing.ts.
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
  const { llm, images, loadError } = useCostTracker(testUserId);

  const llmRows = llm.map(c => ({ c, usd: llmCostFor(c) }));
  const imgRows = images.map(i => ({ i, usd: i.cost_usd }));

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
        <Button variant="outline" size="sm">
          <Wallet className="h-4 w-4 mr-1" />Cost
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Cost Tracker</SheetTitle>
        </SheetHeader>

        <div className="text-sm mt-4 space-y-4">
          {loadError && <p className="text-destructive text-xs">{loadError}</p>}

          <div>
            <div className="font-medium">Today</div>
            <div>${(todayLlm + todayImg).toFixed(4)}
              <span className="text-muted-foreground"> (LLM ${todayLlm.toFixed(4)} · Img ${todayImg.toFixed(4)})</span>
            </div>
          </div>

          <div>
            <div className="font-medium">This month</div>
            <div>${(monthLlm + monthImg).toFixed(4)}</div>
          </div>

          <div className="pt-4 border-t">
            <div className="font-medium mb-1">Recent LLM calls</div>
            <ul className="space-y-1 text-xs">
              {llmRows.slice(0, 10).map(({ c, usd }) => (
                <li key={c.id} className="flex justify-between">
                  <span>{new Date(c.created_at).toLocaleTimeString()} · {c.model ?? '?'}</span>
                  <span>{usd === null ? 'price unknown' : `$${usd.toFixed(5)}`}</span>
                </li>
              ))}
              {llmRows.length === 0 && <li className="text-muted-foreground">No calls yet</li>}
            </ul>
          </div>

          <div className="pt-4 border-t">
            <div className="font-medium mb-1">Recent image gens</div>
            <ul className="space-y-1 text-xs">
              {imgRows.slice(0, 10).map(({ i, usd }) => (
                <li key={i.id} className="flex justify-between">
                  <span>{new Date(i.created_at).toLocaleTimeString()} · {i.provider} {i.size ?? ''}</span>
                  <span>{usd === null ? 'price unknown' : `$${usd.toFixed(5)}`}</span>
                </li>
              ))}
              {imgRows.length === 0 && <li className="text-muted-foreground">No images yet</li>}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground pt-2">
            Logged per call on the server. Visible across browsers and devices.
            Prices as of {latestPriceDate}. "Price unknown" rows need
            <code>src/lib/pricing.ts</code> filled in.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
