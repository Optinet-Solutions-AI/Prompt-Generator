/**
 * BackgroundSelect — Q4: What kind of background?
 * Category chips → detail sub-chips + optional toggles for trophy / scoreboard / equipment.
 */
import { BACKGROUND_CATEGORIES, BackgroundCategory } from './scene-presets';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SportsBannerData } from '@/types/prompt';
import { useState } from 'react';

type Props = {
  sport: string;
  backgroundCategory: string;
  backgroundDetail: string;
  hasTrophy: boolean;
  hasScoreboard: boolean;
  scoreboardText: string;
  hasEquipment: boolean;
  onChange: (
    field: keyof Pick<
      SportsBannerData,
      'backgroundCategory' | 'backgroundDetail' | 'hasTrophy' | 'hasScoreboard' | 'scoreboardText' | 'hasEquipment'
    >,
    value: string | boolean
  ) => void;
};

export function BackgroundSelect({
  sport,
  backgroundCategory,
  backgroundDetail,
  hasTrophy,
  hasScoreboard,
  scoreboardText,
  hasEquipment,
  onChange,
}: Props) {
  const [customDetail, setCustomDetail] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const selectedCategory: BackgroundCategory | undefined = BACKGROUND_CATEGORIES.find(
    (c) => c.id === backgroundCategory
  );

  const handleCategorySelect = (cat: BackgroundCategory) => {
    setShowCustom(false);
    onChange('backgroundCategory', cat.id);
    onChange('backgroundDetail', ''); // clear detail when category changes
  };

  const handleDetailSelect = (detail: string) => {
    setShowCustom(false);
    setCustomDetail('');
    onChange('backgroundDetail', detail);
  };

  const handleCustomDetailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomDetail(e.target.value);
    onChange('backgroundDetail', e.target.value);
  };

  return (
    <div className="space-y-5">
      {/* Category chips */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-foreground">Background type</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BACKGROUND_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategorySelect(cat)}
              className={[
                'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-150',
                'hover:border-primary/60 hover:bg-primary/5',
                backgroundCategory === cat.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card',
              ].join(' ')}
            >
              <span className="text-xl">{cat.emoji}</span>
              <span className="text-xs font-medium text-center leading-tight text-foreground">
                {cat.label}
              </span>
            </button>
          ))}
          {/* Custom */}
          <button
            type="button"
            onClick={() => {
              setShowCustom(true);
              onChange('backgroundCategory', 'custom');
              onChange('backgroundDetail', customDetail);
            }}
            className={[
              'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-150',
              'hover:border-primary/60 hover:bg-primary/5',
              backgroundCategory === 'custom'
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card',
            ].join(' ')}
          >
            <span className="text-xl">✏️</span>
            <span className="text-xs font-medium text-center leading-tight text-foreground">Custom</span>
          </button>
        </div>
      </div>

      {/* Detail sub-chips (only when a known category is selected) */}
      {selectedCategory && !showCustom && (
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-foreground">Background detail</Label>
          <div className="flex flex-wrap gap-2">
            {selectedCategory.details.map((detail) => (
              <button
                key={detail}
                type="button"
                onClick={() => handleDetailSelect(detail)}
                className={[
                  'px-3 py-1.5 rounded-full border text-sm transition-all duration-150',
                  'hover:border-primary/60 hover:bg-primary/5',
                  backgroundDetail === detail
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border bg-card text-muted-foreground',
                ].join(' ')}
              >
                {detail}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom background free text */}
      {(showCustom || backgroundCategory === 'custom') && (
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-foreground">Describe the background</Label>
          <Input
            placeholder="e.g. rain-soaked rooftop under a neon billboard at night…"
            value={customDetail}
            onChange={handleCustomDetailChange}
            autoFocus={showCustom}
            className="text-sm"
          />
        </div>
      )}

      {/* Optional props toggles */}
      <div className="space-y-3 pt-1 border-t border-border">
        <p className="text-sm font-semibold text-foreground pt-2">Optional props</p>

        {/* Trophy toggle */}
        <div className="flex items-center justify-between max-w-sm">
          <label htmlFor="toggle-trophy" className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <span>🏆</span> Add championship trophy
          </label>
          <Switch
            id="toggle-trophy"
            checked={hasTrophy}
            onCheckedChange={(checked) => onChange('hasTrophy', checked)}
          />
        </div>

        {/* Scoreboard toggle */}
        <div className="space-y-2">
          <div className="flex items-center justify-between max-w-sm">
            <label htmlFor="toggle-scoreboard" className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <span>📊</span> Add scoreboard
            </label>
            <Switch
              id="toggle-scoreboard"
              checked={hasScoreboard}
              onCheckedChange={(checked) => onChange('hasScoreboard', checked)}
            />
          </div>
          {hasScoreboard && (
            <Input
              placeholder='Score text e.g. "0 - 0" or "2 - 1"'
              value={scoreboardText}
              onChange={(e) => onChange('scoreboardText', e.target.value)}
              className="max-w-[200px] text-sm"
            />
          )}
        </div>

        {/* Equipment toggle */}
        <div className="flex items-center justify-between max-w-sm">
          <label htmlFor="toggle-equipment" className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <span>🎯</span> Add floating {sport.toLowerCase()} equipment
          </label>
          <Switch
            id="toggle-equipment"
            checked={hasEquipment}
            onCheckedChange={(checked) => onChange('hasEquipment', checked)}
          />
        </div>
      </div>
    </div>
  );
}
