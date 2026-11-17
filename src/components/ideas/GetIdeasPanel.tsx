import { ChevronDown, Lightbulb, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { AssistantConcept } from '@/lib/assistant-types';
import { canAskForIdeas } from '@/lib/ideas';
import type { Ideas } from '@/hooks/useIdeas';

/**
 * "Get ideas" — an optional, folded card in Custom prompt. Type what the image
 * is for, get 3 ideas for the chosen brand, and "Use this idea" sends one
 * through the normal Generate prompt. Nothing here is required: the reference
 * dropdown works exactly as before.
 */
interface GetIdeasPanelProps {
  brand: string;
  ideas: Ideas;
  onUseIdea: (idea: AssistantConcept) => void;
  /** A prompt is being made: ideas can't be used meanwhile. */
  busy: boolean;
}

export function GetIdeasPanel({ brand, ideas, onUseIdea, busy }: GetIdeasPanelProps) {
  const preparing = !!ideas.preparingTitle;
  const canAsk = canAskForIdeas(brand, ideas.task) && !ideas.loading && !preparing;
  const shown = ideas.ideas && ideas.ideas.length > 0 ? ideas.ideas : null;

  return (
    <Collapsible open={ideas.open} onOpenChange={ideas.setOpen} className="rounded-xl border border-border bg-muted/30">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-muted/50">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Lightbulb className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">Get ideas</span>
            <span className="block text-xs text-muted-foreground">fresh directions for this brand, no reference needed</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', ideas.open && 'rotate-180')} />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-4 px-4 pb-4">
        {!brand ? (
          <p className="text-sm text-muted-foreground">Pick a brand first</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ideas-task" className="text-xs">
                  What's it for? <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="ideas-task"
                  value={ideas.task}
                  onChange={(e) => ideas.setTask(e.target.value)}
                  placeholder="new year banner, weekend boost…"
                  maxLength={200}
                  disabled={ideas.loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ideas-description" className="text-xs">Anything specific?</Label>
                <Input
                  id="ideas-description"
                  value={ideas.description}
                  onChange={(e) => ideas.setDescription(e.target.value)}
                  placeholder="mood, time of day, what to lean into…"
                  maxLength={300}
                  disabled={ideas.loading}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button type="button" onClick={() => void ideas.getIdeas()} disabled={!canAsk} className="gap-2">
                {ideas.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {shown ? 'More ideas' : 'Get 3 ideas'}
              </Button>
              <span className="text-xs text-muted-foreground">
                {ideas.loading ? 'Thinking up ideas — takes about 20 seconds' : 'takes about 20 seconds'}
              </span>
            </div>

            {ideas.error && <p role="alert" className="text-sm text-destructive">{ideas.error}</p>}

            {shown && (
              <div className="grid gap-3 sm:grid-cols-3">
                {shown.map((idea, i) => (
                  <div key={`${i}-${idea.title}`} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3">
                    <p className="text-sm font-semibold text-foreground">{idea.title}</p>
                    <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{idea.description}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onUseIdea(idea)}
                      disabled={busy || preparing || ideas.loading}
                      className="gap-1.5"
                    >
                      {ideas.preparingTitle === idea.title
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing…</>
                        : 'Use this idea'}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {shown && ideas.recommendation && (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Our pick:</span> {ideas.recommendation}
              </p>
            )}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
