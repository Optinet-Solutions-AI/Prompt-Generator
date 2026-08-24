import { describe, it, expect } from 'vitest';
import { geminiDropdownModels, DEFAULT_GEMINI_IMAGE_MODEL } from '@/lib/image-models';
import { optionLabelFor, GEMINI_MODEL_STORAGE_KEY } from './ImageModelSelect';

describe('ImageModelSelect labels', () => {
  it('shows "(current)" and no price for the current model', () => {
    expect(optionLabelFor(DEFAULT_GEMINI_IMAGE_MODEL)).toBe('2.5 Flash Image (current)');
  });

  it('shows the price for the new model so the cost is visible at the point of choice', () => {
    expect(optionLabelFor('gemini-3-pro-image')).toBe('3 Pro Image — $0.134 / image');
  });

  it('offers exactly the two dropdown models', () => {
    expect(geminiDropdownModels()).toHaveLength(2);
  });

  it('uses a stable storage key so the choice survives a reload', () => {
    expect(GEMINI_MODEL_STORAGE_KEY).toBe('promptgen.geminiImageModel');
  });

  it('falls back to a plain label for an unknown id instead of crashing', () => {
    expect(optionLabelFor('gemini-99-imaginary')).toBe('gemini-99-imaginary');
  });
});
