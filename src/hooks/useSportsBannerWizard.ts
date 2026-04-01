/**
 * useSportsBannerWizard
 *
 * Manages the 5-step Sports Banner Wizard state and assembles the final FormData
 * that gets sent to the generate-prompt API.
 *
 * Steps:
 *  0 — Q1: Sport
 *  1 — Q2: Scene (player role, count, action, kit, gender, team nationality)
 *  2 — Q3: Subject position
 *  3 — Q4: Background (type, country, flag, lighting tone, props)
 *  4 — Q5: Banner size + occasion
 */

import { useState, useCallback } from 'react';
import { SportsBannerData, FormData } from '@/types/prompt';
import { PositionCell } from '@/components/sports-wizard/scene-presets';
import { buildNarrativePrompt, buildNegativePrompt, BRAND_KIT_DEFAULTS } from '@/components/sports-wizard/prompt-intelligence';

export type { SportsBannerData };

// ─────────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────────

const INITIAL_WIZARD_DATA: SportsBannerData = {
  // Q1
  sport: '',
  // Q2
  playerRole: '',
  playerCount: '1',
  action: '',
  kitColors: '',
  gender: 'Male',
  teamNationality: '',
  // Q3
  subjectPosition: 'Centered',
  negativeSpaceRule: 'subject centered, balanced composition',
  // Q4
  backgroundCategory: '',
  backgroundDetail: '',
  matchCountry: '',
  flagInBackground: false,
  flagCountry: '',
  lightingTone: '',
  lightingToneDetail: '',
  hasTrophy: false,
  hasScoreboard: false,
  scoreboardText: '0 - 0',
  hasEquipment: false,
  // Q5
  bannerSizeId: '',
  bannerSizeLabel: '',
  bannerDimensions: '',
  aspectRatio: '16:9',
  occasion: '',
  occasionMood: '',
};

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export const TOTAL_STEPS = 5;

export function useSportsBannerWizard() {
  const [step, setStep] = useState(0);
  const [wizardData, setWizardData] = useState<SportsBannerData>(INITIAL_WIZARD_DATA);

  const updateField = useCallback(<K extends keyof SportsBannerData>(
    field: K,
    value: SportsBannerData[K]
  ) => {
    setWizardData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updatePosition = useCallback((cell: PositionCell) => {
    setWizardData((prev) => ({
      ...prev,
      subjectPosition: cell.value,
      negativeSpaceRule: cell.negativeSpaceRule,
    }));
  }, []);

  const goNext = useCallback(() => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1)), []);
  const goBack = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);
  const resetWizard = useCallback(() => {
    setStep(0);
    setWizardData(INITIAL_WIZARD_DATA);
  }, []);

  /**
   * Returns true when the user has filled enough to advance from the current step.
   * Steps 3 and 4 are mostly optional — only size + occasion are required on step 4.
   */
  const canAdvance = useCallback((): boolean => {
    switch (step) {
      case 0: return !!wizardData.sport;
      case 1: return !!wizardData.action; // role optional, action required
      case 2: return !!wizardData.subjectPosition;
      case 3: return true; // everything on background is optional
      case 4: {
        const sizeOk = !!wizardData.bannerSizeId;
        const occasionOk = !!wizardData.occasion && (wizardData.occasion !== 'custom' || !!wizardData.occasionMood);
        return sizeOk && occasionOk;
      }
      default: return false;
    }
  }, [step, wizardData]);

  const assembleFormData = useCallback((brand: string): Partial<FormData> => {
    const kitColors = wizardData.kitColors || BRAND_KIT_DEFAULTS[brand] || 'branded team colors';
    const positive_prompt = buildNarrativePrompt(wizardData, brand);
    // Pass kitColors so the negative prompt doesn't block colors needed for athlete clothing
    const negative_prompt = buildNegativePrompt(brand, kitColors);

    const countLabel = wizardData.playerCount === '1' ? 'Single' : wizardData.playerCount === '2' ? 'Two' : 'Team of';
    const roleStr = wizardData.playerRole ? ` ${wizardData.playerRole}` : '';
    const nationalityStr = wizardData.teamNationality ? ` — ${wizardData.teamNationality}` : '';

    return {
      brand,
      reference: `Sports Banner (${wizardData.sport})`,
      subjectPosition: wizardData.subjectPosition,
      aspectRatio: wizardData.aspectRatio,
      theme: `${wizardData.sport} sports banner — ${
        wizardData.occasion === 'custom'
          ? wizardData.occasionMood
          : wizardData.occasion.replace(/-/g, ' ')
      }`,
      description: '',
      format_layout: wizardData.bannerSizeLabel
        ? `${wizardData.bannerSizeLabel} (${wizardData.bannerDimensions}), ${wizardData.negativeSpaceRule}`
        : wizardData.negativeSpaceRule,
      primary_object: wizardData.hasTrophy ? 'golden championship trophy' : '',
      subject: `${countLabel} ${wizardData.gender.toLowerCase()} ${wizardData.sport} ${wizardData.playerCount === '1' ? 'athlete' : 'athletes'}${wizardData.playerRole ? ` — ${wizardData.playerRole} position` : ''}${wizardData.teamNationality ? `, from ${wizardData.teamNationality}` : ''}, ${wizardData.action}`,
      lighting: wizardData.lightingToneDetail
        || (wizardData.backgroundCategory === 'minimal'
          ? 'single spotlight, dramatic rim light'
          : 'dynamic sports photography lighting, high contrast'),
      mood: wizardData.occasionMood || 'energetic, dynamic, high-impact',
      background: [
        wizardData.backgroundDetail,
        wizardData.matchCountry && `${wizardData.matchCountry} atmosphere`,
        wizardData.flagInBackground && wizardData.flagCountry && `${wizardData.flagCountry} flag`,
        wizardData.hasTrophy && 'championship trophy',
        wizardData.hasScoreboard && `scoreboard: ${wizardData.scoreboardText || '0 - 0'}`,
        wizardData.hasEquipment && `${wizardData.sport} equipment props`,
      ].filter(Boolean).join(', '),
      positive_prompt,
      negative_prompt,
    };
  }, [wizardData]);

  return {
    step,
    wizardData,
    updateField,
    updatePosition,
    goNext,
    goBack,
    resetWizard,
    canAdvance,
    assembleFormData,
  };
}
