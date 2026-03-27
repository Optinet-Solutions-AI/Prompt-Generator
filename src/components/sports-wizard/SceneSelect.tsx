/**
 * SceneSelect — Q2: Who's in the banner?
 * Collects: player count, action (chips adapt to sport + count), kit colors, gender.
 */
import { SPORTS, PlayerCount } from './scene-presets';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SportsBannerData } from '@/types/prompt';

type Props = {
  sport: string;
  playerCount: PlayerCount;
  action: string;
  kitColors: string;
  gender: SportsBannerData['gender'];
  onChange: (field: keyof Pick<SportsBannerData, 'playerCount' | 'action' | 'kitColors' | 'gender'>, value: string) => void;
};

const PLAYER_COUNT_OPTIONS: { value: PlayerCount; label: string; emoji: string }[] = [
  { value: '1', label: '1 Player', emoji: '🧑' },
  { value: '2', label: '2 Players', emoji: '👥' },
  { value: '3+', label: 'Team', emoji: '👨‍👩‍👧‍👦' },
];

const GENDER_OPTIONS: { value: SportsBannerData['gender']; label: string }[] = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Mixed', label: 'Mixed' },
];

export function SceneSelect({ sport, playerCount, action, kitColors, gender, onChange }: Props) {
  // Find the action chips for the current sport + count
  const sportPreset = SPORTS.find((s) => s.id === sport);
  const actionChips: string[] = sportPreset?.actions[playerCount] ?? [];

  return (
    <div className="space-y-5">
      {/* Player count */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-foreground">How many players?</Label>
        <div className="flex gap-2">
          {PLAYER_COUNT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange('playerCount', opt.value);
                // Clear the action when count changes — chips will differ
                onChange('action', '');
              }}
              className={[
                'flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-medium text-sm transition-all duration-150',
                'hover:border-primary/60 hover:bg-primary/5',
                playerCount === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground',
              ].join(' ')}
            >
              <span>{opt.emoji}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action chips */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-foreground">What are they doing?</Label>
        <div className="flex flex-wrap gap-2">
          {actionChips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onChange('action', chip)}
              className={[
                'px-3 py-1.5 rounded-full border text-sm transition-all duration-150',
                'hover:border-primary/60 hover:bg-primary/5',
                action === chip
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border bg-card text-muted-foreground',
              ].join(' ')}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Free text override */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Or describe the action yourself:</p>
          <Input
            placeholder="e.g. jumping over a defender…"
            value={actionChips.includes(action) ? '' : action}
            onChange={(e) => onChange('action', e.target.value)}
            className="max-w-sm text-sm"
          />
        </div>
      </div>

      {/* Kit colors */}
      <div className="space-y-2">
        <Label htmlFor="kit-colors" className="text-sm font-semibold text-foreground">
          Kit / outfit colors{' '}
          <span className="font-normal text-muted-foreground">(optional — defaults to brand colors)</span>
        </Label>
        <Input
          id="kit-colors"
          placeholder="e.g. red and white striped, all black, navy blue…"
          value={kitColors}
          onChange={(e) => onChange('kitColors', e.target.value)}
          className="max-w-sm text-sm"
        />
      </div>

      {/* Gender */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-foreground">Gender</Label>
        <div className="flex gap-2">
          {GENDER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange('gender', opt.value)}
              className={[
                'px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all duration-150',
                'hover:border-primary/60 hover:bg-primary/5',
                gender === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
