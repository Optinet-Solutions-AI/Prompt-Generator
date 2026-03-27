/**
 * SportsBannerWizard
 *
 * A 5-step guided assistant for generating sports banners quickly.
 * The user answers 5 simple questions — the wizard assembles a complete
 * prompt and calls the existing generate-prompt API.
 *
 * Steps:
 *  1 — What sport?
 *  2 — Who's in the banner? (players, action, kit, gender)
 *  3 — Where should the subject be placed?
 *  4 — What kind of background?
 *  5 — Banner size & occasion
 */

import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSportsBannerWizard, TOTAL_STEPS } from '@/hooks/useSportsBannerWizard';
import { SportSelect } from './sports-wizard/SportSelect';
import { SceneSelect } from './sports-wizard/SceneSelect';
import { PositionGrid } from './sports-wizard/PositionGrid';
import { BackgroundSelect } from './sports-wizard/BackgroundSelect';
import { BannerSizeSelect } from './sports-wizard/BannerSizeSelect';
import { BRANDS } from '@/types/prompt';
import { useState } from 'react';

type Props = {
  /** Called with assembled FormData when the wizard completes */
  onSubmit: (data: Record<string, string>) => void;
};

const STEP_LABELS = [
  'What sport?',
  "Who's in the banner?",
  'Subject placement',
  'Background',
  'Size & occasion',
];

export function SportsBannerWizard({ onSubmit }: Props) {
  const {
    step,
    wizardData,
    updateField,
    updatePosition,
    goNext,
    goBack,
    resetWizard,
    canAdvance,
    assembleFormData,
  } = useSportsBannerWizard();

  const [brand, setBrand] = useState('');

  const isLastStep = step === TOTAL_STEPS - 1;
  const progressPct = ((step + 1) / TOTAL_STEPS) * 100;

  const handleGenerate = () => {
    if (!brand) return;
    const formData = assembleFormData(brand);
    onSubmit(formData as Record<string, string>);
  };

  const handleReset = () => {
    setBrand('');
    resetWizard();
  };

  return (
    <div className="space-y-5">
      {/* Brand selector — always visible at top */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">Brand</label>
        <Select value={brand} onValueChange={setBrand}>
          <SelectTrigger className="max-w-xs">
            <SelectValue placeholder="Select brand…" />
          </SelectTrigger>
          <SelectContent>
            {BRANDS.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!brand && (
          <p className="text-xs text-muted-foreground">
            Brand colors are automatically applied to the generated prompt.
          </p>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Step {step + 1} of {TOTAL_STEPS} — <span className="text-foreground font-medium">{STEP_LABELS[step]}</span>
          </span>
          <span>{Math.round(progressPct)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Step content */}
      <div className="min-h-[260px]">
        {step === 0 && (
          <SportSelect
            value={wizardData.sport}
            onChange={(sport) => updateField('sport', sport)}
          />
        )}

        {step === 1 && (
          <SceneSelect
            sport={wizardData.sport}
            playerCount={wizardData.playerCount}
            action={wizardData.action}
            kitColors={wizardData.kitColors}
            gender={wizardData.gender}
            onChange={(field, value) =>
              updateField(field as keyof typeof wizardData, value as never)
            }
          />
        )}

        {step === 2 && (
          <PositionGrid
            value={wizardData.subjectPosition}
            onChange={updatePosition}
          />
        )}

        {step === 3 && (
          <BackgroundSelect
            sport={wizardData.sport}
            backgroundCategory={wizardData.backgroundCategory}
            backgroundDetail={wizardData.backgroundDetail}
            hasTrophy={wizardData.hasTrophy}
            hasScoreboard={wizardData.hasScoreboard}
            scoreboardText={wizardData.scoreboardText}
            hasEquipment={wizardData.hasEquipment}
            onChange={(field, value) =>
              updateField(field as keyof typeof wizardData, value as never)
            }
          />
        )}

        {step === 4 && (
          <BannerSizeSelect
            bannerSizeId={wizardData.bannerSizeId}
            occasion={wizardData.occasion}
            onChange={(field, value) =>
              updateField(field as keyof typeof wizardData, value as never)
            }
          />
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={goBack}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
          {step === 0 && (
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
              Reset
            </Button>
          )}
        </div>

        <div className="flex gap-2 items-center">
          {/* Skip button (steps 3 and 4 are optional) */}
          {(step === 3) && !isLastStep && (
            <Button
              variant="ghost"
              size="sm"
              onClick={goNext}
              className="text-muted-foreground"
            >
              Skip
            </Button>
          )}

          {!isLastStep ? (
            <Button
              size="sm"
              onClick={goNext}
              disabled={!canAdvance()}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={!canAdvance() || !brand}
              className="gap-2"
            >
              <Zap className="w-4 h-4" />
              Generate Banner
            </Button>
          )}
        </div>
      </div>

      {/* Validation hint */}
      {isLastStep && !brand && (
        <p className="text-xs text-destructive">Please select a brand above before generating.</p>
      )}
    </div>
  );
}
