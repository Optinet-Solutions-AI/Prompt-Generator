/**
 * useSportsBannerWizard
 *
 * Manages the 5-step Sports Banner Wizard state and assembles the final FormData
 * that gets sent to the generate-prompt API.
 *
 * Steps:
 *  0 — Q1: Sport
 *  1 — Q2: Scene (players, action, kit, gender)
 *  2 — Q3: Subject position
 *  3 — Q4: Background
 *  4 — Q5: Banner size + occasion
 */

import { useState, useCallback } from 'react';
import { SportsBannerData, FormData } from '@/types/prompt';
import { POSITION_GRID, PositionCell } from '@/components/sports-wizard/scene-presets';
import { BRAND_PALETTES } from '@/lib/brand-colors';

// Re-export types for convenience
export type { SportsBannerData };

// ─────────────────────────────────────────────
// Brand-specific kit color defaults
// (prevents brand-clash when user skips kit colors)
// ─────────────────────────────────────────────
const BRAND_KIT_DEFAULTS: Record<string, string> = {
  FortunePlay: 'gold and black',
  SpinJo: 'purple and white',
  Roosterbet: 'red and black',
  LuckyVibe: 'sunset orange and white',
  SpinsUp: 'neon purple and black',
  PlayMojo: 'white and red',
  Lucky7even: 'purple and gold',
  NovaDreams: 'white and blue',
  Rollero: 'crimson and dark grey',
};

// ─────────────────────────────────────────────
// Prompt assembly helpers
// ─────────────────────────────────────────────

/**
 * Builds the full positive_prompt string from wizard data.
 * This becomes the "Base prompt" that GPT edits (applying position + aspect ratio rules).
 */
function buildPositivePrompt(data: SportsBannerData, brand: string): string {
  const kitColors = data.kitColors || BRAND_KIT_DEFAULTS[brand] || 'branded team colors';

  // Player description
  const countMap: Record<string, string> = { '1': 'A single', '2': 'Two', '3+': 'A team of' };
  const countLabel = countMap[data.playerCount] ?? 'A';
  const genderLabel = data.gender === 'Mixed' ? 'male and female' : data.gender.toLowerCase();
  const playerWord = data.playerCount === '1' ? 'athlete' : 'athletes';
  const subjectDesc = `${countLabel} ${genderLabel} ${data.sport} ${playerWord}`;

  // Background string
  let bgParts = [data.backgroundDetail || `${data.sport} stadium`];
  if (data.hasTrophy) bgParts.push('a golden championship trophy prominently featured in the scene');
  if (data.hasScoreboard) bgParts.push(`a scoreboard showing "${data.scoreboardText || '0 - 0'}"`);
  if (data.hasEquipment) bgParts.push(`floating ${data.sport.toLowerCase()} equipment scattered in the frame`);
  const bgDesc = bgParts.join(', ');

  // Composition / negative space
  const positionCell = POSITION_GRID.find((c) => c.value === data.subjectPosition);
  const negSpaceRule = positionCell?.negativeSpaceRule ?? 'balanced composition';

  // Format / size
  const sizeDesc = data.bannerSizeLabel
    ? `${data.bannerSizeLabel} banner (${data.bannerDimensions})`
    : 'wide banner';

  // Assemble
  const prompt = [
    `${subjectDesc}, ${data.action}, wearing ${kitColors} kit and matching ${data.sport.toLowerCase()} gear.`,
    `Background: ${bgDesc}.`,
    `Mood: ${data.occasionMood || 'energetic, dynamic, high-impact'}.`,
    `Composition: ${negSpaceRule}.`,
    `Format: ${sizeDesc}, designed as a branded sports promotional banner.`,
    'Ultra-realistic sports photography. Dynamic action shot. Professional sports advertising. Cinematic lighting. High contrast. Photorealistic.',
  ].join(' ');

  return prompt;
}

/**
 * Standard negative prompt for sports banners.
 */
function buildNegativePrompt(brand: string): string {
  // Collect forbidden colors from brand palette string
  const paletteStr = BRAND_PALETTES[brand] ?? '';
  const neverMatch = paletteStr.match(/NEVER use ([^.]+)\./);
  const forbiddenColors = neverMatch ? neverMatch[1] : '';

  const base = 'text, logos, watermarks, blurry, out of focus, cartoon, illustration, low quality, nsfw, brand logos, typography, words, lettering, signatures';
  return forbiddenColors ? `${base}, ${forbiddenColors} colors` : base;
}

// ─────────────────────────────────────────────
// Initial wizard state
// ─────────────────────────────────────────────

const INITIAL_WIZARD_DATA: SportsBannerData = {
  sport: '',
  playerCount: '1',
  action: '',
  kitColors: '',
  gender: 'Male',
  subjectPosition: 'Centered',
  negativeSpaceRule: 'subject centered, balanced composition',
  backgroundCategory: '',
  backgroundDetail: '',
  hasTrophy: false,
  hasScoreboard: false,
  scoreboardText: '0 - 0',
  hasEquipment: false,
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
  const [step, setStep] = useState(0); // 0-4
  const [wizardData, setWizardData] = useState<SportsBannerData>(INITIAL_WIZARD_DATA);

  // Update any single field
  const updateField = useCallback(<K extends keyof SportsBannerData>(
    field: K,
    value: SportsBannerData[K]
  ) => {
    setWizardData((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Q3: position grid cell selection (updates both value and negativeSpaceRule)
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
   * Validates the current step — returns true if the user can advance.
   * Each step has a minimum required field.
   */
  const canAdvance = useCallback((): boolean => {
    switch (step) {
      case 0: return !!wizardData.sport;                              // must pick a sport
      case 1: return !!wizardData.action;                             // must pick an action
      case 2: return !!wizardData.subjectPosition;                    // always has a default
      case 3: return true;                                            // background is optional
      case 4: return !!wizardData.bannerSizeId && !!wizardData.occasion; // must pick size + occasion
      default: return false;
    }
  }, [step, wizardData]);

  /**
   * Assembles the final FormData from wizard answers.
   * Call this right before submitting to the generate-prompt API.
   */
  const assembleFormData = useCallback((brand: string): Partial<FormData> => {
    const positive_prompt = buildPositivePrompt(wizardData, brand);
    const negative_prompt = buildNegativePrompt(brand);

    // Build a concise theme string for metadata / UI display
    const theme = `${wizardData.sport} sports banner — ${
      wizardData.occasion.replace(/-/g, ' ')
    }`;

    return {
      brand,
      // Reference label — shows what generated this in the result view
      reference: `Sports Banner (${wizardData.sport})`,
      subjectPosition: wizardData.subjectPosition,
      aspectRatio: wizardData.aspectRatio,
      theme,
      description: '', // already encoded in positive_prompt
      // Reference data fields — built by wizard
      format_layout: wizardData.bannerSizeLabel
        ? `${wizardData.bannerSizeLabel} (${wizardData.bannerDimensions}), ${wizardData.negativeSpaceRule}`
        : wizardData.negativeSpaceRule,
      primary_object: wizardData.hasTrophy ? 'golden championship trophy' : '',
      subject: `${wizardData.playerCount === '1' ? 'Single' : wizardData.playerCount === '2' ? 'Two' : 'Team of'} ${wizardData.gender.toLowerCase()} ${wizardData.sport} ${wizardData.playerCount === '1' ? 'athlete' : 'athletes'}, ${wizardData.action}`,
      lighting: wizardData.backgroundCategory === 'minimal'
        ? 'single spotlight, dramatic rim light'
        : 'dynamic sports photography lighting, high contrast',
      mood: wizardData.occasionMood || 'energetic, dynamic, high-impact',
      background: [
        wizardData.backgroundDetail,
        wizardData.hasTrophy && 'golden championship trophy featured',
        wizardData.hasScoreboard && `scoreboard: ${wizardData.scoreboardText || '0 - 0'}`,
        wizardData.hasEquipment && `${wizardData.sport} equipment props`,
      ]
        .filter(Boolean)
        .join(', '),
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
