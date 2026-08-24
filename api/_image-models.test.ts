import { describe, it, expect } from 'vitest';
import {
  IMAGE_MODELS,
  DEFAULT_GEMINI_IMAGE_MODEL,
  OPENAI_IMAGE_MODEL,
  getImageModel,
  geminiDropdownModels,
  resolveGeminiModel,
  nearestSupportedRatio,
} from './_image-models.js';

describe('IMAGE_MODELS registry', () => {
  it('pins the current Gemini model as the default so behaviour is unchanged', () => {
    expect(DEFAULT_GEMINI_IMAGE_MODEL).toBe('gemini-2.5-flash-image');
    expect(IMAGE_MODELS[DEFAULT_GEMINI_IMAGE_MODEL].isCurrent).toBe(true);
  });

  it('pins OpenAI to gpt-image-2', () => {
    expect(OPENAI_IMAGE_MODEL).toBe('gpt-image-2');
    expect(IMAGE_MODELS['gpt-image-2'].transport).toBe('openai');
  });

  it('carries the official token rates for gemini-3-pro-image', () => {
    const m = IMAGE_MODELS['gemini-3-pro-image'];
    expect(m.textInputRatePerMillion).toBe(2.00);
    expect(m.imageOutputRatePerMillion).toBe(120.00);
    expect(m.displayPricePerImage).toBe(0.134);
  });

  it('carries the official token rates for the current Gemini model', () => {
    const m = IMAGE_MODELS['gemini-2.5-flash-image'];
    expect(m.textInputRatePerMillion).toBe(0.30);
    expect(m.imageOutputRatePerMillion).toBe(30.00);
    // The current model shows "(current)", never a price.
    expect(m.displayPricePerImage).toBeNull();
  });

  it('carries the official OpenAI rates for both image models', () => {
    expect(IMAGE_MODELS['gpt-image-2'].imageOutputRatePerMillion).toBe(30.00);
    expect(IMAGE_MODELS['gpt-image-2'].textInputRatePerMillion).toBe(5.00);
    // gpt-image-1 is kept ONLY so already-logged historical rows still price.
    expect(IMAGE_MODELS['gpt-image-1'].imageOutputRatePerMillion).toBe(40.00);
  });

  it('every entry has a rate, a source and a verification date', () => {
    for (const [id, m] of Object.entries(IMAGE_MODELS)) {
      expect(m.id, id).toBe(id);
      expect(m.imageOutputRatePerMillion, id).toBeGreaterThan(0);
      expect(m.textInputRatePerMillion, id).toBeGreaterThan(0);
      expect(m.rateSource, id).toBeTruthy();
      expect(m.lastVerified, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.outputMime, id).toMatch(/^image\/(jpeg|png)$/);
    }
  });

  it('exposes exactly two Gemini models in the dropdown, current first', () => {
    const d = geminiDropdownModels();
    expect(d.map(m => m.id)).toEqual(['gemini-2.5-flash-image', 'gemini-3-pro-image']);
  });

  it('keeps gemini-3.1-flash-image available but hidden from the dropdown', () => {
    expect(IMAGE_MODELS['gemini-3.1-flash-image'].inDropdown).toBe(false);
    expect(IMAGE_MODELS['gemini-3.1-flash-image'].imageOutputRatePerMillion).toBe(60.00);
  });

  it('has exactly one model flagged isCurrent', () => {
    expect(Object.values(IMAGE_MODELS).filter(m => m.isCurrent)).toHaveLength(1);
  });
});

describe('getImageModel', () => {
  it('returns the spec for a known id', () => {
    expect(getImageModel('gemini-3-pro-image')?.label).toBe('3 Pro Image');
  });

  it('returns null for an unknown id rather than guessing', () => {
    expect(getImageModel('gemini-99-imaginary')).toBeNull();
  });
});

describe('resolveGeminiModel', () => {
  it('falls back to the current model when nothing is requested', () => {
    expect(resolveGeminiModel(undefined).id).toBe('gemini-2.5-flash-image');
  });

  it('falls back to the current model when an unknown id is requested', () => {
    expect(resolveGeminiModel('gemini-99-imaginary').id).toBe('gemini-2.5-flash-image');
  });

  it('honours a valid requested id', () => {
    expect(resolveGeminiModel('gemini-3-pro-image').id).toBe('gemini-3-pro-image');
  });

  it('refuses an OpenAI id on the Gemini path', () => {
    expect(resolveGeminiModel('gpt-image-2').id).toBe('gemini-2.5-flash-image');
  });
});

describe('nearestSupportedRatio', () => {
  // The Gemini API has NO 2:1. Distance from 2.0: 16:9 = 0.222, 21:9 = 0.333.
  // So a 2:1 email banner must snap to 16:9, not 21:9.
  it('snaps a 2:1 banner to 16:9', () => {
    expect(nearestSupportedRatio('gemini-3-pro-image', 2)).toBe('16:9');
  });

  it('returns an exact match unchanged', () => {
    expect(nearestSupportedRatio('gemini-3-pro-image', 1)).toBe('1:1');
    expect(nearestSupportedRatio('gemini-3-pro-image', 16 / 9)).toBe('16:9');
  });

  it('snaps a tall portrait to 9:16', () => {
    expect(nearestSupportedRatio('gemini-3-pro-image', 0.56)).toBe('9:16');
  });

  it('never returns a ratio the API rejects', () => {
    const allowed = IMAGE_MODELS['gemini-3-pro-image'].supportedAspectRatios;
    for (const r of [0.1, 0.5, 1, 1.5, 2, 2.4, 5, 9]) {
      expect(allowed).toContain(nearestSupportedRatio('gemini-3-pro-image', r));
    }
  });
});
