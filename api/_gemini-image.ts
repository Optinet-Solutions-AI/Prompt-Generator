// One function for every Gemini IMAGE call — fresh generation, edit, and
// variations all go through here. Centralising it means the model id, the
// endpoint and the usage parsing exist in exactly one place.
//
// Auth: the Gemini Developer API with GEMINI_API_KEY. Chosen over Vertex
// because it needs no OIDC (Vertex workload identity only works on Vercel,
// so it cannot be exercised locally or in tests), and because access to the
// newer image models was confirmed working on this key.

import { getImageModel, nearestSupportedRatio } from './_image-models.js';
import type { ImageUsage } from './_pricing.js';

export interface GeminiImageResult {
  bytes: Buffer;
  mime: string;
  usage: ImageUsage;
}

export interface GeminiImageArgs {
  modelId: string;
  prompt: string;
  /** Any ratio string; snapped to one the model accepts. */
  aspectRatio?: string;
  imageSize?: '1K' | '2K' | '4K';
  /** Present for edits/variations, absent for fresh generation. */
  inlineImage?: { mimeType: string; base64: string };
  temperature?: number;
}

/** Parse "16:9" / "1200 x 600" / "2:1" → numeric ratio, or null. */
function ratioFromString(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)\s*[:x×*]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  if (!w || !h) return null;
  return w / h;
}

/** Pull the image token count out of Gemini's usageMetadata. */
function parseUsage(meta: Record<string, unknown> | undefined): ImageUsage {
  const details = (meta?.candidatesTokensDetails as Array<{ modality?: string; tokenCount?: number }>) ?? [];
  const image = details.find(d => d.modality === 'IMAGE');
  return {
    text_input_tokens: Number(meta?.promptTokenCount ?? 0),
    // Prefer the per-modality IMAGE token count. If the breakdown is missing,
    // fall back to candidatesTokenCount (which includes text + image because we
    // request both modalities). This fallback is deliberately conservative —
    // it may overstate image cost, but that is preferred to silently reporting
    // zero cost, which would render as "free" in the Cost Tracker.
    image_output_tokens: Number(image?.tokenCount ?? meta?.candidatesTokenCount ?? 0),
  };
}

export async function generateGeminiImage(args: GeminiImageArgs): Promise<GeminiImageResult> {
  const spec = getImageModel(args.modelId);
  if (!spec) {
    throw new Error(
      `generateGeminiImage: "${args.modelId}" is not a recognized image model`
    );
  }
  if (spec.transport !== 'gemini-api') {
    throw new Error(
      `generateGeminiImage: "${args.modelId}" is not on the gemini-api transport`
    );
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured');

  // The API rejects any ratio outside its supported list, so always snap.
  const requested = ratioFromString(args.aspectRatio);
  const aspectRatio = requested !== null
    ? nearestSupportedRatio(spec.id, requested)
    : '1:1';

  const parts: Array<Record<string, unknown>> = [];
  // Source image first when editing — the model treats earlier parts as the
  // context the instruction applies to.
  if (args.inlineImage) {
    parts.push({ inlineData: { mimeType: args.inlineImage.mimeType, data: args.inlineImage.base64 } });
  }
  parts.push({ text: args.prompt });

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${spec.id}:generateContent?key=${key}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        // IMAGE alone is rejected — TEXT must be requested alongside it.
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          aspectRatio,
          ...(args.imageSize ? { imageSize: args.imageSize } : {}),
        },
        ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
        maxOutputTokens: 16384,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
      ],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Gemini image call failed for ${spec.id} (${resp.status}): ${detail}`);
  }

  const data = await resp.json();
  for (const c of data.candidates ?? []) {
    for (const p of c.content?.parts ?? []) {
      if (p.inlineData?.data) {
        return {
          bytes: Buffer.from(p.inlineData.data, 'base64'),
          mime: p.inlineData.mimeType || spec.outputMime,
          usage: parseUsage(data.usageMetadata),
        };
      }
    }
  }
  throw new Error(`Gemini returned no image for ${spec.id} (possibly blocked by a safety filter)`);
}
