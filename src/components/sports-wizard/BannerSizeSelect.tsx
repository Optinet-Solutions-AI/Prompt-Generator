/**
 * BannerSizeSelect — Q5: Banner size & occasion.
 * Size preset cards + occasion chips — both with Custom free-text override.
 */
import { useState } from 'react';
import { BANNER_SIZES, OCCASIONS, BannerSizePreset } from './scene-presets';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SportsBannerData } from '@/types/prompt';

type Props = {
  bannerSizeId: string;
  occasion: string;
  onChange: (
    field: keyof Pick<SportsBannerData, 'bannerSizeId' | 'bannerSizeLabel' | 'bannerDimensions' | 'aspectRatio' | 'occasion' | 'occasionMood'>,
    value: string
  ) => void;
};

// Supported --ar tokens (must match api/generate-prompt.ts rule 6). A free-text
// custom size is snapped to the closest one so the generated prompt's --ar flag
// actually reflects the dimensions the user typed (e.g. 1200×600 → 2:1).
const SUPPORTED_RATIOS: Array<{ token: string; value: number }> = [
  { token: '1:2', value: 0.5 }, { token: '6:11', value: 6 / 11 }, { token: '9:16', value: 9 / 16 },
  { token: '2:3', value: 2 / 3 }, { token: '3:4', value: 0.75 }, { token: '4:5', value: 0.8 },
  { token: '5:6', value: 5 / 6 }, { token: '1:1', value: 1 }, { token: '6:5', value: 1.2 },
  { token: '5:4', value: 1.25 }, { token: '4:3', value: 4 / 3 }, { token: '3:2', value: 1.5 },
  { token: '16:9', value: 16 / 9 }, { token: '2:1', value: 2 }, { token: '21:9', value: 21 / 9 },
];

function nearestAspectToken(w: number, h: number): string {
  if (!w || !h) return '16:9';
  const r = w / h;
  return SUPPORTED_RATIOS.reduce((best, cur) =>
    Math.abs(cur.value - r) < Math.abs(best.value - r) ? cur : best
  ).token;
}

function AspectPreview({ ratio, selected }: { ratio: number; selected: boolean }) {
  const clampedRatio = Math.min(ratio, 4);
  const width = Math.min(clampedRatio * 28, 80);
  const height = 28;
  return (
    <div
      className={['rounded border-2 transition-colors', selected ? 'border-primary bg-primary/20' : 'border-border bg-muted/40'].join(' ')}
      style={{ width, height }}
    />
  );
}

export function BannerSizeSelect({ bannerSizeId, occasion, onChange }: Props) {
  const [customOccasion, setCustomOccasion] = useState('');
  const [showCustomOccasion, setShowCustomOccasion] = useState(false);
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');
  const [showCustomSize, setShowCustomSize] = useState(false);

  const handleSizeSelect = (size: BannerSizePreset) => {
    setShowCustomSize(false);
    onChange('bannerSizeId', size.id);
    onChange('bannerSizeLabel', size.label);
    onChange('bannerDimensions', size.dimensions);
    onChange('aspectRatio', size.aspectRatio);
  };

  const handleCustomSize = () => {
    setShowCustomSize(true);
    onChange('bannerSizeId', 'custom');
    onChange('bannerSizeLabel', 'Custom size');
    onChange('bannerDimensions', customWidth && customHeight ? `${customWidth} × ${customHeight}` : '');
    onChange('aspectRatio', '16:9'); // default fallback
  };

  const handleCustomSizeDimensions = (w: string, h: string) => {
    setCustomWidth(w);
    setCustomHeight(h);
    onChange('bannerDimensions', w && h ? `${w} × ${h}` : '');
  };

  const handleOccasionSelect = (occ: typeof OCCASIONS[0]) => {
    setShowCustomOccasion(false);
    setCustomOccasion('');
    onChange('occasion', occ.id);
    onChange('occasionMood', occ.mood);
  };

  return (
    <div className="space-y-6">

      {/* ── Banner size ── */}
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
                bannerSizeId === size.id ? 'border-primary bg-primary/10' : 'border-border bg-card',
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
          {/* Custom size */}
          <button
            type="button"
            onClick={handleCustomSize}
            className={[
              'flex flex-col items-start gap-2 p-3 rounded-xl border-2 transition-all duration-150',
              'hover:border-primary/60 hover:bg-primary/5 text-left',
              bannerSizeId === 'custom' ? 'border-primary bg-primary/10' : 'border-border bg-card',
            ].join(' ')}
          >
            <div className="w-10 h-7 rounded border-2 border-dashed border-border flex items-center justify-center text-muted-foreground text-xs">✏️</div>
            <div>
              <p className="text-sm font-medium text-foreground">Custom size</p>
              <p className="text-xs text-muted-foreground">Any dimensions</p>
            </div>
          </button>
        </div>

        {/* Custom size inputs */}
        {(showCustomSize || bannerSizeId === 'custom') && (
          <div className="flex items-center gap-2 mt-2">
            <Input
              type="number"
              placeholder="Width px"
              value={customWidth}
              onChange={(e) => handleCustomSizeDimensions(e.target.value, customHeight)}
              className="w-28 text-sm"
            />
            <span className="text-muted-foreground text-sm">×</span>
            <Input
              type="number"
              placeholder="Height px"
              value={customHeight}
              onChange={(e) => handleCustomSizeDimensions(customWidth, e.target.value)}
              className="w-28 text-sm"
            />
          </div>
        )}
      </div>

      {/* ── Occasion ── */}
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
          {/* Custom occasion */}
          <button
            type="button"
            onClick={() => {
              setShowCustomOccasion(true);
              onChange('occasion', 'custom');
              onChange('occasionMood', customOccasion);
            }}
            className={[
              'px-3 py-1.5 rounded-full border text-sm transition-all duration-150',
              'hover:border-primary/60 hover:bg-primary/5',
              occasion === 'custom'
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-border bg-card text-muted-foreground',
            ].join(' ')}
          >
            ✏️ Custom
          </button>
        </div>
        {(showCustomOccasion || occasion === 'custom') && (
          <Input
            placeholder="Describe the occasion and mood… e.g. Ramadan special, VIP event"
            value={customOccasion}
            onChange={(e) => {
              setCustomOccasion(e.target.value);
              onChange('occasionMood', e.target.value);
            }}
            autoFocus={showCustomOccasion}
            className="text-sm max-w-sm"
          />
        )}
      </div>

    </div>
  );
}
