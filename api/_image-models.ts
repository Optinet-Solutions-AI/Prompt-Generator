// Single source of truth for IMAGE generation models.
//
// KEEP IN SYNC with src/lib/image-models.ts. The two files duplicate the same
// constants so the backend (choosing a model, costing a call) and the frontend
// (the dropdown label + price) agree without importing across the api/src
// boundary. This mirrors the existing _pricing.ts / pricing.ts pair.
//
// Every rate below is from the official published rate card, captured
// 2026-08-20 and confirmed by real API calls. Do NOT add a model without a
// verified rate — a wrong number here silently misleads the cost comparison
// this whole feature exists to support.

export type ImageTransport =
  | 'gemini-api'   // generativelanguage.googleapis.com, auth via GEMINI_API_KEY
  | 'openai'       // api.openai.com, auth via OPENAI_API_KEY
  | 'vertex';      // *-aiplatform.googleapis.com, auth via GCP workload identity

export interface ImageModelSpec {
  /** Literal model id sent to the API. */
  id: string;
  /** Short human label for the dropdown. */
  label: string;
  transport: ImageTransport;
  /** The model in use before this feature. Shows "(current)", never a price. */
  isCurrent: boolean;
  /** false = usable via the registry but not offered in the UI. */
  inDropdown: boolean;
  /**
   * Aspect ratio tokens the API accepts. For Gemini this list is exhaustive —
   * the API returns 400 INVALID_ARGUMENT for anything else. Empty for OpenAI,
   * which takes explicit pixel sizes instead (see pickOpenAiImageSize).
   */
  supportedAspectRatios: string[];
  /** What the API actually returns. Varies per model — check each entry. */
  outputMime: 'image/jpeg' | 'image/png';
  textInputRatePerMillion: number;
  imageOutputRatePerMillion: number;
  /**
   * Headline price shown in the dropdown, from the official rate card.
   * null = do not show a price (the current model, and models not offered).
   */
  displayPricePerImage: number | null;
  rateSource: string;
  lastVerified: string;
}

/** The 14 aspect ratios the Gemini image API accepts. Note: NO 2:1. */
const GEMINI_RATIOS = [
  '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1',
  '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9',
];

export const IMAGE_MODELS: Record<string, ImageModelSpec> = {
  // ── Gemini ────────────────────────────────────────────────────────────
  'gemini-2.5-flash-image': {
    id: 'gemini-2.5-flash-image',
    label: '2.5 Flash Image',
    // The Vertex/Cloud Run path calls a retired Imagen model
    // (imagen-4.0-fast-generate-001) and returns 404, so this model now uses
    // the Gemini Developer API instead — same as the newer model below.
    // Verified working live: ~9s per image, $0.039/image.
    transport: 'gemini-api',
    isCurrent: true,
    inDropdown: true,
    supportedAspectRatios: GEMINI_RATIOS,
    outputMime: 'image/png',      // verified live: this model returns PNG, not JPEG
    textInputRatePerMillion: 0.30,
    imageOutputRatePerMillion: 30.00,
    displayPricePerImage: null,   // "(current)" — no price shown
    rateSource: 'ai.google.dev/gemini-api/docs/pricing ($0.039/image, 1290 tokens @ $30/M)',
    lastVerified: '2026-08-20',
  },
  'gemini-3-pro-image': {
    id: 'gemini-3-pro-image',
    label: '3 Pro Image',
    transport: 'gemini-api',
    isCurrent: false,
    inDropdown: true,
    supportedAspectRatios: GEMINI_RATIOS,
    outputMime: 'image/jpeg',
    textInputRatePerMillion: 2.00,
    imageOutputRatePerMillion: 120.00,
    displayPricePerImage: 0.134,  // official: $0.134 per 1K/2K image
    rateSource: 'ai.google.dev/gemini-api/docs/pricing ($0.134 per 1K/2K, $0.24 per 4K)',
    lastVerified: '2026-08-20',
  },
  // Available but hidden. If 3 Pro is judged not worth 3.4x, flip inDropdown
  // to true here and this becomes the middle option — no other code changes.
  'gemini-3.1-flash-image': {
    id: 'gemini-3.1-flash-image',
    label: '3.1 Flash Image',
    transport: 'gemini-api',
    isCurrent: false,
    inDropdown: false,
    supportedAspectRatios: GEMINI_RATIOS,
    outputMime: 'image/jpeg',
    textInputRatePerMillion: 0.50,
    imageOutputRatePerMillion: 60.00,
    displayPricePerImage: 0.101,  // official: $0.067 @1K, $0.101 @2K, $0.151 @4K
    rateSource: 'ai.google.dev/gemini-api/docs/pricing',
    lastVerified: '2026-08-20',
  },
  // Test option (Nov 2026): looked clearly better than 2.5 Flash in a
  // side-by-side test. Thinking tokens (~270/image, ~$0.002) are billed at the
  // text-output rate and are NOT counted by the cost code, which only prices
  // image output tokens.
  'gemini-nano-banana-2.1': {
    id: 'gemini-nano-banana-2.1',
    label: 'Nano Banana 2.1 (test)',
    transport: 'gemini-api',
    isCurrent: false,
    inDropdown: true,
    supportedAspectRatios: GEMINI_RATIOS,
    outputMime: 'image/jpeg',     // verified live 2026-11-19: returns JPEG
    textInputRatePerMillion: 1.50,
    imageOutputRatePerMillion: 30.00,
    displayPricePerImage: 0.050,  // official: $0.0336 @1K, $0.0504 @2K, $0.113 @4K
    rateSource: 'aistudio.google.com/docs/pricing (input $1.50/M, image output $30/M, $0.0504 per 2K image)',
    lastVerified: '2026-11-19',
  },

  // ── OpenAI ────────────────────────────────────────────────────────────
  // The "(current)" option of the ChatGPT model dropdown, and the default.
  'gpt-image-2': {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    transport: 'openai',
    isCurrent: true,
    inDropdown: true,
    supportedAspectRatios: [],    // uses explicit pixel sizes instead
    outputMime: 'image/png',
    textInputRatePerMillion: 5.00,
    imageOutputRatePerMillion: 30.00,
    displayPricePerImage: null,   // "(current)" — no price shown
    rateSource: 'developers.openai.com/api/docs/pricing',
    lastVerified: '2026-08-20',
  },
  // Test option (Nov 2026): same token rates as gpt-image-2 but uses far fewer
  // output tokens. OpenAI publishes no per-image price, so the shown price is
  // measured (2K, high quality, 3 prompts).
  'gpt-image-2.6-flare': {
    id: 'gpt-image-2.6-flare',
    label: 'GPT Image 2.6 (test)',
    transport: 'openai',
    isCurrent: false,
    inDropdown: true,
    supportedAspectRatios: [],    // uses explicit pixel sizes instead
    outputMime: 'image/png',
    textInputRatePerMillion: 5.00,
    imageOutputRatePerMillion: 30.00,
    displayPricePerImage: 0.042,  // measured, not published
    rateSource: 'developers.openai.com/api/docs/pricing (text input $5/M, image output $30/M)',
    lastVerified: '2026-11-19',
  },
  // Retained ONLY so historical assistant_image_gens rows still price correctly.
  // Not selectable and not used for new generations.
  'gpt-image-1': {
    id: 'gpt-image-1',
    label: 'GPT Image 1 (retired)',
    transport: 'openai',
    isCurrent: false,
    inDropdown: false,
    supportedAspectRatios: [],
    outputMime: 'image/png',
    textInputRatePerMillion: 5.00,
    imageOutputRatePerMillion: 40.00,
    displayPricePerImage: null,
    rateSource: 'developers.openai.com/api/docs/pricing',
    lastVerified: '2026-08-20',
  },
};

export const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
export const OPENAI_IMAGE_MODEL = 'gpt-image-2';

export function getImageModel(id: string): ImageModelSpec | null {
  return IMAGE_MODELS[id] ?? null;
}

/** The Gemini models offered in the UI, current model first. */
export function geminiDropdownModels(): ImageModelSpec[] {
  return Object.values(IMAGE_MODELS)
    .filter(m => m.inDropdown && m.transport !== 'openai')
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
}

/**
 * Turn a possibly-missing, possibly-bogus requested model id into a real
 * Gemini spec. Anything unrecognised (or an OpenAI id sent by mistake) falls
 * back to the current model, so a bad request can never change what the user
 * is billed for without them choosing it.
 */
export function resolveGeminiModel(requested: string | undefined): ImageModelSpec {
  const m = requested ? IMAGE_MODELS[requested] : undefined;
  if (m && m.transport !== 'openai') return m;
  return IMAGE_MODELS[DEFAULT_GEMINI_IMAGE_MODEL];
}

/** The ChatGPT (OpenAI) models offered in the UI, current model first. */
export function openaiDropdownModels(): ImageModelSpec[] {
  return Object.values(IMAGE_MODELS)
    .filter(m => m.inDropdown && m.transport === 'openai')
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
}

/**
 * Same idea as resolveGeminiModel, for the ChatGPT path. Only a model offered
 * in the ChatGPT dropdown is accepted; anything else (missing, unknown, a
 * Gemini id, or the retired gpt-image-1) falls back to the current model.
 */
export function resolveOpenAiModel(requested: string | undefined): ImageModelSpec {
  const m = requested ? IMAGE_MODELS[requested] : undefined;
  if (m && m.transport === 'openai' && m.inDropdown) return m;
  return IMAGE_MODELS[OPENAI_IMAGE_MODEL];
}

/** Parse "16:9" → 1.777… */
function ratioValue(token: string): number {
  const [w, h] = token.split(':').map(Number);
  return w / h;
}

/**
 * Snap any requested ratio to the closest one the model actually accepts.
 * Sending an unsupported ratio makes the Gemini API return 400, and sending a
 * far-off one means resizeToExact has to mirror-extend a large gap. A 2:1
 * banner lands on 16:9 (distance 0.222) rather than 21:9 (0.333).
 */
export function nearestSupportedRatio(modelId: string, requestedRatio: number): string {
  const spec = getImageModel(modelId);
  const list = spec?.supportedAspectRatios?.length ? spec.supportedAspectRatios : GEMINI_RATIOS;
  return list.reduce((best, cur) =>
    Math.abs(ratioValue(cur) - requestedRatio) < Math.abs(ratioValue(best) - requestedRatio)
      ? cur
      : best
  );
}
