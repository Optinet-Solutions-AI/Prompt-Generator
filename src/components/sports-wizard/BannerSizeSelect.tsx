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
  mirrorArabic: boolean;
  subjectPosition: string;
  onChange: (
    field: keyof Pick<SportsBannerData, 'bannerSizeId' | 'bannerSizeLabel' | 'bannerDimensions' | 'aspectRatio' | 'occasion' | 'occasionMood'>,
    value: string
  ) => void;
  onMirrorArabicChange: (value: boolean) => void;
};

/**
 * Given a subject position label, returns what the mirrored position will be.
 * Center positions are flagged — flipping produces an identical image.
 */
function getMirrorInfo(position: string): { flippedPosition: string; isCentered: boolean } {
  const p = position.toLowerCase();
  if (p.includes('left') && !p.includes('right')) {
    const flipped = position.replace(/left/gi, 'Right').replace(/Left/g, 'Right');
    return { flippedPosition: flipped, isCentered: false };
  }
  if (p.includes('right') && !p.includes('left')) {
    const flipped = position.replace(/right/gi, 'Left').replace(/Right/g, 'Left');
    return { flippedPosition: flipped, isCentered: false };
  }
  return { flippedPosition: position, isCentered: true };
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

export function BannerSizeSelect({ bannerSizeId, occasion, mirrorArabic, onChange, onMirrorArabicChange }: Props) {
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

      {/* ── Arabic version ── */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-foreground">Arabic version</Label>
        <p className="text-xs text-muted-foreground">
          Generate a mirrored copy of the banner for Arabic (RTL) layouts — subjects are flipped horizontally.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onMirrorArabicChange(false)}
            className={[
              'px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-150',
              !mirrorArabic
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:border-primary/60 hover:bg-primary/5',
            ].join(' ')}
          >
            No
          </button>
          <button
            type="button"
            onClick={() => onMirrorArabicChange(true)}
            className={[
              'px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-150',
              mirrorArabic
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:border-primary/60 hover:bg-primary/5',
            ].join(' ')}
          >
            Yes
          </button>
        </div>
      </div>

    </div>
  );
}
