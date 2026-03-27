/**
 * SportSelect — Q1: What sport is this banner for?
 * Shows a grid of sport icons. Tapping one selects it and advances the wizard.
 */
import { SPORTS, SportPreset } from './scene-presets';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

type Props = {
  value: string;
  onChange: (sport: string) => void;
};

export function SportSelect({ value, onChange }: Props) {
  const [customSport, setCustomSport] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const handleSelect = (sport: SportPreset) => {
    setShowCustom(false);
    onChange(sport.id);
  };

  const handleCustomToggle = () => {
    setShowCustom(true);
    onChange('');
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomSport(e.target.value);
    onChange(e.target.value);
  };

  return (
    <div className="space-y-4">
      {/* Sport grid */}
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
        {SPORTS.map((sport) => (
          <button
            key={sport.id}
            type="button"
            onClick={() => handleSelect(sport)}
            className={[
              'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-150',
              'hover:border-primary/60 hover:bg-primary/5',
              value === sport.id
                ? 'border-primary bg-primary/10 shadow-sm'
                : 'border-border bg-card',
            ].join(' ')}
          >
            <span className="text-2xl" role="img" aria-label={sport.label}>
              {sport.emoji}
            </span>
            <span className="text-xs font-medium text-center leading-tight text-foreground">
              {sport.label}
            </span>
          </button>
        ))}

        {/* Custom option */}
        <button
          type="button"
          onClick={handleCustomToggle}
          className={[
            'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-150',
            'hover:border-primary/60 hover:bg-primary/5',
            showCustom
              ? 'border-primary bg-primary/10 shadow-sm'
              : 'border-border bg-card',
          ].join(' ')}
        >
          <span className="text-2xl">✏️</span>
          <span className="text-xs font-medium text-center leading-tight text-foreground">
            Other
          </span>
        </button>
      </div>

      {/* Custom sport text input */}
      {showCustom && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            What sport? (e.g. "Volleyball", "F1 Racing")
          </label>
          <Input
            placeholder="Type sport name…"
            value={customSport}
            onChange={handleCustomChange}
            autoFocus
            className="max-w-xs"
          />
        </div>
      )}
    </div>
  );
}
