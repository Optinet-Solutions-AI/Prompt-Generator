import { Button } from '@/components/ui/button';
import { versionLabel } from '@/lib/prompt-versions';
import type { PromptVersion } from '@/lib/assistant-types';

interface Props {
  versions: PromptVersion[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Lets you step back to an earlier prompt.
 *
 * Renders NOTHING with one version or none — the control must not appear
 * before it has a purpose, which is the common case (generate once, render,
 * done). It only shows up once there is actually somewhere to go back to.
 */
export function VersionStrip({ versions, activeIndex, onSelect }: Props) {
  if (versions.length <= 1) return null;

  return (
    // mt-10 (not mb-3) is deliberate: this strip sits between the concept
    // cards above and the generated-prompt panel below (which itself opens
    // with mt-10). Giving the strip its own top margin — instead of a bottom
    // margin that would collapse against the panel's mt-10 anyway — puts
    // equal space on both sides instead of sitting flush under the cards, so
    // it no longer reads as part of the concept-cards block above it.
    <div className="mt-10">
      <p className="text-xs text-muted-foreground mb-1">Versions</p>
      <div className="flex flex-wrap gap-2">
        {versions.map((v, i) => (
          <Button
            key={v.id}
            type="button"
            size="sm"
            variant={i === activeIndex ? 'default' : 'outline'}
            onClick={() => onSelect(i)}
            className={i === activeIndex ? 'gradient-primary' : ''}
            title={`${v.concept.title} — ${new Date(v.createdAt).toLocaleTimeString()}`}
          >
            {versionLabel(v, i)}
          </Button>
        ))}
      </div>
    </div>
  );
}
