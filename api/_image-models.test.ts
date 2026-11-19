import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  IMAGE_MODELS,
  DEFAULT_GEMINI_IMAGE_MODEL,
  OPENAI_IMAGE_MODEL,
  getImageModel,
  geminiDropdownModels,
  openaiDropdownModels,
  resolveGeminiModel,
  resolveOpenAiModel,
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

  it('exposes three Gemini models in the dropdown, current first', () => {
    const d = geminiDropdownModels();
    expect(d.map(m => m.id)).toEqual([
      'gemini-2.5-flash-image',
      'gemini-3-pro-image',
      'gemini-nano-banana-2.1',
    ]);
  });

  it('carries the official rates for the two test models', () => {
    const flare = IMAGE_MODELS['gpt-image-2.6-flare'];
    expect(flare.label).toBe('GPT Image 2.6 (test)');
    expect(flare.transport).toBe('openai');
    expect(flare.textInputRatePerMillion).toBe(5.00);
    expect(flare.imageOutputRatePerMillion).toBe(30.00);
    expect(flare.displayPricePerImage).toBe(0.042);

    const nb = IMAGE_MODELS['gemini-nano-banana-2.1'];
    expect(nb.label).toBe('Nano Banana 2.1 (test)');
    expect(nb.transport).toBe('gemini-api');
    expect(nb.textInputRatePerMillion).toBe(1.50);
    expect(nb.imageOutputRatePerMillion).toBe(30.00);
    expect(nb.displayPricePerImage).toBe(0.050);
    expect(nb.outputMime).toBe('image/jpeg');
  });

  it('keeps gemini-3.1-flash-image available but hidden from the dropdown', () => {
    expect(IMAGE_MODELS['gemini-3.1-flash-image'].inDropdown).toBe(false);
    expect(IMAGE_MODELS['gemini-3.1-flash-image'].imageOutputRatePerMillion).toBe(60.00);
  });

  // Two dropdowns (Gemini and ChatGPT), so each provider has one "current" model.
  it('has exactly one current model per provider', () => {
    const cur = Object.values(IMAGE_MODELS).filter(m => m.isCurrent);
    expect(cur.filter(m => m.transport === 'openai').map(m => m.id)).toEqual(['gpt-image-2']);
    expect(cur.filter(m => m.transport !== 'openai').map(m => m.id)).toEqual(['gemini-2.5-flash-image']);
  });

  it('the browser registry mirrors the server registry', () => {
    const from = (path: string) => {
      const text = fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
      return text.slice(text.indexOf('export const IMAGE_MODELS'));
    };
    const server = from('./_image-models.ts');
    expect(server.length).toBeGreaterThan(100);
    expect(from('../src/lib/image-models.ts')).toBe(server);
  });
});

describe('openaiDropdownModels', () => {
  it('offers the current ChatGPT model first, then the test model', () => {
    expect(openaiDropdownModels().map(m => m.id)).toEqual(['gpt-image-2', 'gpt-image-2.6-flare']);
  });
});

describe('resolveOpenAiModel', () => {
  it('honours the ChatGPT test model', () => {
    expect(resolveOpenAiModel('gpt-image-2.6-flare').id).toBe('gpt-image-2.6-flare');
  });

  it('falls back to gpt-image-2 when nothing is requested', () => {
    expect(resolveOpenAiModel(undefined).id).toBe('gpt-image-2');
  });

  it('falls back to gpt-image-2 for an unknown id', () => {
    expect(resolveOpenAiModel('gpt-image-99').id).toBe('gpt-image-2');
  });

  it('refuses a Gemini id on the ChatGPT path', () => {
    expect(resolveOpenAiModel('gemini-nano-banana-2.1').id).toBe('gpt-image-2');
  });

  it('refuses the retired gpt-image-1, which is not selectable', () => {
    expect(resolveOpenAiModel('gpt-image-1').id).toBe('gpt-image-2');
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

  it('refuses the ChatGPT test model on the Gemini path', () => {
    expect(resolveGeminiModel('gpt-image-2.6-flare').id).toBe('gemini-2.5-flash-image');
  });

  it('honours the Gemini test model', () => {
    expect(resolveGeminiModel('gemini-nano-banana-2.1').id).toBe('gemini-nano-banana-2.1');
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
