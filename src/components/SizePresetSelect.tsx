/**
 * SizePresetSelect — exact output-size picker for the normal prompt flow.
 *
 * Mirrors the wizard's banner-size control: quick presets (incl. the requested
 * Email 1200×600) plus a Custom W×H input. Selecting a size sets BOTH:
 *   - bannerDimensions ("1200 × 600") — drives the exact server-side crop + download crop
 *   - aspectRatio (nearest supported --ar token) — keeps the prompt's framing in sync
 * "Aspect ratio only" clears bannerDimensions, restoring the ratio-slider behaviour.
 */
import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { nearestAspectToken, parseDimensions } from '@/lib/aspectRatio';

type Field = 'bannerDimensions' | 'aspectRatio';

interface Props {
  bannerDimensions?: string;
  onChange: (field: Field, value: string) => void;
  disabled?: boolean;
}

const SIZE_PRESETS = [
  { id: 'ratio',  label: 'Aspect ratio', sub: 'Use slider',  dimensions: '' },
  { id: 'email',  label: 'Email banner', sub: '1200 × 600',  dimensions: '1200 × 600' },
  { id: 'square', label: 'Square',       sub: '1080 × 1080', dimensions: '1080 × 1080' },
  { id: 'social', label: 'Social',       sub: '1200 × 628',  dimensions: '1200 × 628' },
  { id: 'story',  label: 'Story',        sub: '1080 × 1920', dimensions: '1080 × 1920' },
  { id: 'custom', label: 'Custom',       sub: 'W × H',       dimensions: '' },
] as const;

export function SizePresetSelect({ bannerDimensions, onChange, disabled }: Props) {
  // Which preset matches the current dimensions? Exact px match → that preset;
  // a non-matching non-empty value → custom; empty → ratio-only.
  const matched = SIZE_PRESETS.find(p => p.dimensions && p.dimensions === bannerDimensions);
  const initialId = matched ? matched.id : bannerDimensions ? 'custom' : 'ratio';

  const [activeId, setActiveId] = useState<string>(initialId);
  const initialDims = parseDimensions(bannerDimensions);
  const [customW, setCustomW] = useState(initialId === 'custom' && initialDims ? String(initialDims.width) : '');
  const [customH, setCustomH] = useState(initialId === 'custom' && initialDims ? String(initialDims.height) : '');

  // Keep the highlighted preset in sync if bannerDimensions changes elsewhere —
  // e.g. moving the aspect-ratio slider clears it, switching us back to "Aspect ratio".
  useEffect(() => {
    const m = SIZE_PRESETS.find(p => p.dimensions && p.dimensions === bannerDimensions);
    setActiveId(m ? m.id : bannerDimensions ? 'custom' : 'ratio');
  }, [bannerDimensions]);

  const selectPreset = (id: string, dimensions: string) => {
    setActiveId(id);
    if (id === 'ratio') {
      onChange('bannerDimensions', ''); // clear exact size; ratio slider takes over
      onChange('aspectRatio', '16:9');  // reset to a normal landscape default (not stuck on 2:1)
      return;
    }
    if (id === 'custom') return; // wait for W×H input
    onChange('bannerDimensions', dimensions);
    const d = parseDimensions(dimensions);
    if (d) onChange('aspectRatio', nearestAspectToken(d.width, d.height));
  };

  const onCustom = (w: string, h: string) => {
    setCustomW(w);
    setCustomH(h);
    onChange('bannerDimensions', w && h ? `${w} × ${h}` : '');
    if (w && h) onChange('aspectRatio', nearestAspectToken(Number(w), Number(h)));
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-foreground">Output size</Label>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {SIZE_PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => selectPreset(p.id, p.dimensions)}
            className={[
              'flex flex-col items-start gap-0.5 p-2 rounded-lg border-2 text-left transition-all duration-150',
              'hover:border-primary/60 hover:bg-primary/5 disabled:opacity-50',
              activeId === p.id ? 'border-primary bg-primary/10' : 'border-border bg-card',
            ].join(' ')}
          >
            <span className="text-xs font-medium text-foreground">{p.label}</span>
            <span className="text-[10px] text-muted-foreground">{p.sub}</span>
          </button>
        ))}
      </div>

      {activeId === 'custom' && (
        <div className="flex items-center gap-2 mt-1">
          <Input
            type="number"
            placeholder="Width px"
            value={customW}
            disabled={disabled}
            onChange={e => onCustom(e.target.value, customH)}
            className="w-28 text-sm"
          />
          <span className="text-muted-foreground text-sm">×</span>
          <Input
            type="number"
            placeholder="Height px"
            value={customH}
            disabled={disabled}
            onChange={e => onCustom(customW, e.target.value)}
            className="w-28 text-sm"
          />
        </div>
      )}

      {activeId !== 'ratio' && (
        <p className="text-[11px] text-muted-foreground">
          Generated at the closest AI size, then cropped to your exact dimensions on download.
        </p>
      )}
    </div>
  );
}
