import { describe, it, expect, vi, afterEach } from 'vitest';
import { geminiDropdownModels, DEFAULT_GEMINI_IMAGE_MODEL } from '@/lib/image-models';
import {
  optionLabelFor,
  GEMINI_MODEL_STORAGE_KEY,
  OPENAI_MODEL_STORAGE_KEY,
  loadSavedGeminiModel,
  loadSavedOpenAiModel,
} from './ImageModelSelect';

describe('ImageModelSelect labels', () => {
  it('shows "(current)" and no price for the current model', () => {
    expect(optionLabelFor(DEFAULT_GEMINI_IMAGE_MODEL)).toBe('2.5 Flash Image (current)');
  });

  it('shows the price for the new model so the cost is visible at the point of choice', () => {
    expect(optionLabelFor('gemini-3-pro-image')).toBe('3 Pro Image — $0.134 / image');
  });

  it('shows the price for the Gemini test model', () => {
    expect(optionLabelFor('gemini-nano-banana-2.1')).toBe('Nano Banana 2.1 (test) — $0.050 / image');
  });

  it('marks GPT Image 2 as the current ChatGPT model', () => {
    expect(optionLabelFor('gpt-image-2')).toBe('GPT Image 2 (current)');
  });

  it('shows the price for the ChatGPT test model', () => {
    expect(optionLabelFor('gpt-image-2.6-flare')).toBe('GPT Image 2.6 (test) — $0.042 / image');
  });

  // Was two; the Gemini test model makes it three (spec change, 2026-11-19).
  it('offers exactly the three Gemini dropdown models', () => {
    expect(geminiDropdownModels()).toHaveLength(3);
  });

  it('uses a stable storage key so the choice survives a reload', () => {
    expect(GEMINI_MODEL_STORAGE_KEY).toBe('promptgen.geminiImageModel');
  });

  it('uses its own stable storage key for the ChatGPT choice', () => {
    expect(OPENAI_MODEL_STORAGE_KEY).toBe('promptgen.openaiImageModel');
  });

  it('falls back to a plain label for an unknown id instead of crashing', () => {
    expect(optionLabelFor('gemini-99-imaginary')).toBe('gemini-99-imaginary');
  });
});

describe('saved model choice', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Tests run without a browser, so give them a minimal localStorage. */
  function stubStorage(store: Record<string, string>) {
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null });
  }

  it('returns the saved ChatGPT test model', () => {
    stubStorage({ [OPENAI_MODEL_STORAGE_KEY]: 'gpt-image-2.6-flare' });
    expect(loadSavedOpenAiModel()).toBe('gpt-image-2.6-flare');
  });

  it('ignores a Gemini id saved as the ChatGPT choice', () => {
    stubStorage({ [OPENAI_MODEL_STORAGE_KEY]: 'gemini-3-pro-image' });
    expect(loadSavedOpenAiModel()).toBe('gpt-image-2');
  });

  it('ignores the retired gpt-image-1 saved as the ChatGPT choice', () => {
    stubStorage({ [OPENAI_MODEL_STORAGE_KEY]: 'gpt-image-1' });
    expect(loadSavedOpenAiModel()).toBe('gpt-image-2');
  });

  it('uses gpt-image-2 when nothing is saved', () => {
    stubStorage({});
    expect(loadSavedOpenAiModel()).toBe('gpt-image-2');
  });

  it('uses gpt-image-2 when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadSavedOpenAiModel()).toBe('gpt-image-2');
  });

  it('ignores a ChatGPT id saved as the Gemini choice', () => {
    stubStorage({ [GEMINI_MODEL_STORAGE_KEY]: 'gpt-image-2.6-flare' });
    expect(loadSavedGeminiModel()).toBe('gemini-2.5-flash-image');
  });

  it('returns the saved Gemini test model', () => {
    stubStorage({ [GEMINI_MODEL_STORAGE_KEY]: 'gemini-nano-banana-2.1' });
    expect(loadSavedGeminiModel()).toBe('gemini-nano-banana-2.1');
  });
});
