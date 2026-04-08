/**
 * SportsBannerWizard — 5-step guided assistant for sports banners.
 *
 * Smart features:
 *  - Brand auto-fills lighting tone on selection (can be overridden)
 *  - Live summary bar shows what is being built as the user fills steps
 *  - Contextual tip per step helps the user make better choices
 *  - Every field has a "Custom" escape hatch — no hard restrictions
 */

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Zap, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSportsBannerWizard, TOTAL_STEPS } from '@/hooks/useSportsBannerWizard';
import { SportSelect } from './sports-wizard/SportSelect';
import { SceneSelect } from './sports-wizard/SceneSelect';
import { PositionGrid } from './sports-wizard/PositionGrid';
import { BackgroundSelect } from './sports-wizard/BackgroundSelect';
import { BannerSizeSelect } from './sports-wizard/BannerSizeSelect';
import {
  BRANDS,
  FormData,
  SportsBannerData,
} from '@/types/prompt';
import {
  SPORTS,
  LIGHTING_TONES,
  TOP_MATCH_COUNTRIES,
  BRAND_LIGHTING_DEFAULTS,
  BRAND_LIGHTING_REASONS,
} from './sports-wizard/scene-presets';

type Props = {
  onSubmit: (data: Partial<FormData>, mirrorArabic: boolean) => void;
};

const STEP_LABELS = [
  'What sport?',
  "Who's in the banner?",
  'Subject placement',
  'Background & lighting',
  'Size & occasion',
];

// ─────────────────────────────────────────────
// Live banner summary bar
// ─────────────────────────────────────────────

function BannerSummary({ data, brand }: { data: SportsBannerData; brand: string }) {
  const parts: { icon: string; text: string }[] = [];

  if (brand) parts.push({ icon: '🏷️', text: brand });

  const sportEmoji = SPORTS.find((s) => s.id === data.sport)?.emoji ?? '';
  if (data.sport) parts.push({ icon: sportEmoji, text: data.sport });
  if (data.playerRole) parts.push({ icon: '👤', text: data.playerRole });
  if (data.playerCount !== '1') parts.push({ icon: '👥', text: `${data.playerCount} players` });
  if (data.teamNationality) parts.push({ icon: '🏃', text: data.teamNationality });

  const matchFlag = TOP_MATCH_COUNTRIES.find((c) => c.name === data.matchCountry)?.flag ?? '📍';
  if (data.matchCountry) parts.push({ icon: matchFlag, text: data.matchCountry });

  const lightingLabel = LIGHTING_TONES.find((t) => t.id === data.lightingTone)?.label;
  if (lightingLabel && data.lightingTone !== 'custom') parts.push({ icon: '💡', text: lightingLabel });
  else if (data.lightingTone === 'custom' && data.lightingToneDetail) parts.push({ icon: '💡', text: 'Custom lighting' });

  if (data.bannerSizeLabel) parts.push({ icon: '📐', text: data.bannerSizeLabel });
  if (data.occasion) parts.push({ icon: '📅', text: data.occasion.replace(/-/g, ' ') });

  if (parts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2.5 bg-muted/40 rounded-lg border border-border">
      <span className="text-xs text-muted-foreground self-center mr-1 shrink-0">Building:</span>
      {parts.map((p, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-background border border-border text-foreground"
        >
          {p.icon} {p.text}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Per-step contextual tip
// ─────────────────────────────────────────────

function getStepTip(step: number, data: SportsBannerData, brand: string): string {
  switch (step) {
    case 0:
      return 'Each sport unlocks its own player roles and action presets on the next step — pick the one that matches your brief.';

    case 1:
      if (data.playerRole && data.action) {
        return `"${data.playerRole}" + "${data.action}" is a strong combination. If you have a specific team, add it in the nationality field — the AI will match the kit colors automatically.`;
      }
      if (data.playerRole) {
        return `"${data.playerRole}" selected. Now pick what they're doing — the chips below are the most common actions for this role. You can type your own if none fit.`;
      }
      return 'Start with the player role — it determines the pose and stance. Then pick the action. All fields allow custom text if the preset options don\'t match your brief.';

    case 2:
      return 'Right or Left placement leaves a clear area on the opposite side for text overlays — the most common setup for promotional banners. Center works when text goes below the image.';

    case 3: {
      const reason = BRAND_LIGHTING_REASONS[brand];
      if (reason) return `💡 ${reason} You can override it with any other tone — or use Custom to describe exactly what you need.`;
      return 'Lighting tone sets the emotional color mood. Match it to the team\'s colors or the country\'s identity. Use Custom if you need something specific.';
    }

    case 4:
      return 'Wide Banner (16:9) is the most common for website heroes and desktop. Story (9:16) is best for Instagram and TikTok. Square works across all social platforms.';

    default:
      return '';
  }
}

function StepTip({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/15 text-sm text-foreground">
      <Lightbulb className="w-4 h-4 mt-0.5 text-primary shrink-0" />
      <span className="leading-relaxed">{message}</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

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

  // When brand changes → auto-fill the lighting tone to match brand palette.
  // The user can change it at any time on step 3.
  useEffect(() => {
    if (!brand) return;
    const defaultId = BRAND_LIGHTING_DEFAULTS[brand];
    if (defaultId) {
      const tone = LIGHTING_TONES.find((t) => t.id === defaultId);
      updateField('lightingTone', defaultId);
      updateField('lightingToneDetail', tone?.promptDetail ?? '');
    }
  }, [brand, updateField]);

  const isLastStep = step === TOTAL_STEPS - 1;
  const progressPct = ((step + 1) / TOTAL_STEPS) * 100;

  const handleGenerate = () => {
    if (!brand) return;
    onSubmit(assembleFormData(brand), wizardData.mirrorArabic);
  };

  const handleReset = () => {
    setBrand('');
    resetWizard();
  };

  const tip = getStepTip(step, wizardData, brand);

  return (
    <div className="space-y-4">

      {/* Brand selector — always visible */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">Brand</label>
        <Select value={brand} onValueChange={setBrand}>
          <SelectTrigger className="max-w-xs">
            <SelectValue placeholder="Select brand…" />
          </SelectTrigger>
          <SelectContent>
            {BRANDS.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {brand && BRAND_LIGHTING_DEFAULTS[brand] && (
          <p className="text-xs text-primary">
            ✓ Brand detected — lighting and colors auto-configured for {brand}.
          </p>
        )}
        {!brand && (
          <p className="text-xs text-muted-foreground">
            Select a brand first — it auto-sets lighting tone and brand colors.
          </p>
        )}
      </div>

      {/* Live summary */}
      <BannerSummary data={wizardData} brand={brand} />

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Step {step + 1} of {TOTAL_STEPS} —{' '}
            <span className="text-foreground font-medium">{STEP_LABELS[step]}</span>
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

      {/* Step tip */}
      <StepTip message={tip} />

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
            playerRole={wizardData.playerRole}
            playerCount={wizardData.playerCount}
            action={wizardData.action}
            kitColors={wizardData.kitColors}
            gender={wizardData.gender}
            teamNationality={wizardData.teamNationality}
            onChange={(field, value) =>
              updateField(field as keyof SportsBannerData, value as never)
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
            action={wizardData.action}
            brand={brand}
            backgroundCategory={wizardData.backgroundCategory}
            backgroundDetail={wizardData.backgroundDetail}
            matchCountry={wizardData.matchCountry}
            flagInBackground={wizardData.flagInBackground}
            flagCountry={wizardData.flagCountry}
            lightingTone={wizardData.lightingTone}
            lightingToneDetail={wizardData.lightingToneDetail}
            hasTrophy={wizardData.hasTrophy}
            hasScoreboard={wizardData.hasScoreboard}
            scoreboardText={wizardData.scoreboardText}
            hasEquipment={wizardData.hasEquipment}
            onChange={(field, value) =>
              updateField(field as keyof SportsBannerData, value as never)
            }
          />
        )}

        {step === 4 && (
          <BannerSizeSelect
            bannerSizeId={wizardData.bannerSizeId}
            occasion={wizardData.occasion}
            mirrorArabic={wizardData.mirrorArabic}
            onChange={(field, value) =>
              updateField(field as keyof SportsBannerData, value as never)
            }
            onMirrorArabicChange={(value) => updateField('mirrorArabic', value)}
          />
        )}
      </div>

      {/* Navigation */}
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
          {step === 3 && !isLastStep && (
            <Button variant="ghost" size="sm" onClick={goNext} className="text-muted-foreground">
              Skip
            </Button>
          )}

          {!isLastStep ? (
            <Button size="sm" onClick={goNext} disabled={!canAdvance()}>
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

      {isLastStep && !brand && (
        <p className="text-xs text-destructive">Please select a brand above before generating.</p>
      )}
    </div>
  );
}
