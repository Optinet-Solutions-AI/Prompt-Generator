/**
 * BannerSizeSelect — Q5: Banner size & occasion.
 * Size preset cards (with visual aspect ratio preview) + occasion chips.
 */
import { BANNER_SIZES, OCCASIONS, BannerSizePreset } from './scene-presets';
import { Label } from '@/components/ui/label';
import { SportsBannerData } from '@/types/prompt';

type Props = {
  bannerSizeId: string;
  occasion: string;
  onChange: (
    field: keyof Pick<SportsBannerData, 'bannerSizeId' | 'bannerSizeLabel' | 'bannerDimensions' | 'aspectRatio' | 'occasion' | 'occasionMood'>,
    value: string
  ) => void;
};

/** Visual aspect ratio preview box — fills proportionally */
function AspectPreview({ ratio, selected }: { ratio: number; selected: boolean }) {
  // Clamp so leaderboard (very wide) still looks reasonable in the card
  const clampedRatio = Math.min(ratio, 4);
  const width = Math.min(clampedRatio * 28, 80);
  const height = 28;

  return (
    <div
      className={[
        'rounded border-2 transition-colors',
        selected ? 'border-primary bg-primary/20' : 'border-border bg-muted/40',
      ].join(' ')}
      style={{ width, height }}
    />
  );
}

export function BannerSizeSelect({ bannerSizeId, occasion, onChange }: Props) {
  const handleSizeSelect = (size: BannerSizePreset) => {
    onChange('bannerSizeId', size.id);
    onChange('bannerSizeLabel', size.label);
    onChange('bannerDimensions', size.dimensions);
    onChange('aspectRatio', size.aspectRatio);
  };

  const handleOccasionSelect = (occ: typeof OCCASIONS[0]) => {
    onChange('occasion', occ.id);
    onChange('occasionMood', occ.mood);
  };

  return (
    <div className="space-y-6">
      {/* Banner size */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-foreground">Banner size</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BANNER_SIZES.map((size) => (
            <button
              key={size.id}
              type="button"
              onClick={() => handleSizeSelect(size)}
              className={[
                'flex flex-col items-start gap-2 p-3 rounded-xl border-2 transition-all duration-150',
                'hover:border-primary/60 hover:bg-primary/5 text-left',
                bannerSizeId === size.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card',
              ].join(' ')}
            >
              <AspectPreview ratio={size.previewRatio} selected={bannerSizeId === size.id} />
              <div>
                <p className="text-sm font-medium text-foreground">{size.label}</p>
                <p className="text-xs text-muted-foreground">{size.subtitle}</p>
                <p className="text-xs text-muted-foreground">{size.dimensions}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Occasion */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-foreground">Campaign occasion</Label>
        <div className="flex flex-wrap gap-2">
          {OCCASIONS.map((occ) => (
            <button
              key={occ.id}
              type="button"
              onClick={() => handleOccasionSelect(occ)}
              className={[
                'px-3 py-1.5 rounded-full border text-sm transition-all duration-150',
                'hover:border-primary/60 hover:bg-primary/5',
                occasion === occ.id
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border bg-card text-muted-foreground',
              ].join(' ')}
            >
              {occ.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
