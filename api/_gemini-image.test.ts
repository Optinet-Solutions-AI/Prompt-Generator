import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import { generateGeminiImage } from './_gemini-image.js';

const fetchMock = vi.fn();

// A minimal successful Gemini image response: one inlineData part + usage.
function okResponse(imageB64 = 'AAAA', mime = 'image/jpeg', imageTokens = 1120) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: mime, data: imageB64 } }] } }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: imageTokens }],
      },
    }),
  };
}

describe('generateGeminiImage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.GEMINI_API_KEY = 'test-key';
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('calls the Developer API endpoint for the requested model', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'a cat' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('models/gemini-3-pro-image:generateContent');
    expect(url).toContain('key=test-key');
  });

  it('returns decoded bytes, the real mime, and parsed usage', async () => {
    fetchMock.mockResolvedValue(okResponse('SGVsbG8=', 'image/jpeg', 1120));
    const r = await generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'a cat' });
    expect(r.bytes.toString()).toBe('Hello');
    expect(r.mime).toBe('image/jpeg');
    expect(r.usage).toEqual({ text_input_tokens: 10, image_output_tokens: 1120 });
  });

  it('snaps an unsupported 2:1 ratio to 16:9 before sending', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await generateGeminiImage({
      modelId: 'gemini-3-pro-image', prompt: 'banner', aspectRatio: '2:1',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('16:9');
  });

  it('passes a supported ratio through untouched', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await generateGeminiImage({
      modelId: 'gemini-3-pro-image', prompt: 'banner', aspectRatio: '21:9',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('21:9');
  });

  it('requests both IMAGE and TEXT modalities (IMAGE alone is rejected)', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'x' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.generationConfig.responseModalities).toEqual(['IMAGE', 'TEXT']);
  });

  it('sends text only when no inlineImage is given (fresh generation)', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'a cat' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.contents[0].parts).toEqual([{ text: 'a cat' }]);
  });

  it('sends the source image first when editing, so the model sees it as context', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await generateGeminiImage({
      modelId: 'gemini-3-pro-image',
      prompt: 'make it blue',
      inlineImage: { mimeType: 'image/png', base64: 'QUJD' },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.contents[0].parts[0]).toEqual({
      inlineData: { mimeType: 'image/png', data: 'QUJD' },
    });
    expect(body.contents[0].parts[1]).toEqual({ text: 'make it blue' });
    // 'QUJD' is not a readable image, so the shape falls back to square.
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('1:1');
  });

  // Without this, every edit and variation was sent as 1:1 and a landscape
  // banner came back as a square crop (seen live with Nano Banana 2.1, 2026-11-19).
  it('an edit keeps a landscape source picture\'s shape when no ratio is asked for', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const src = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: '#800' } }).png().toBuffer();
    await generateGeminiImage({
      modelId: 'gemini-nano-banana-2.1', prompt: 'make it blue',
      inlineImage: { mimeType: 'image/png', base64: src.toString('base64') },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('3:2');
  });

  it('an edit keeps a portrait source picture\'s shape', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const src = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#080' } }).jpeg().toBuffer();
    await generateGeminiImage({
      modelId: 'gemini-2.5-flash-image', prompt: 'make it blue',
      inlineImage: { mimeType: 'image/jpeg', base64: src.toString('base64') },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('9:16');
  });

  // 1:4, 4:1, 1:8 and 8:1 are not accepted by every Gemini model, and an edit
  // used to work (as a square) for these pictures — it must not start failing.
  it('a very wide source picture is kept within the shapes every Gemini model accepts', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const src = await sharp({ create: { width: 2000, height: 500, channels: 3, background: '#800' } }).png().toBuffer();
    await generateGeminiImage({
      modelId: 'gemini-2.5-flash-image', prompt: 'make it blue',
      inlineImage: { mimeType: 'image/png', base64: src.toString('base64') },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('21:9');
  });

  it('a very tall source picture is kept within the shapes every Gemini model accepts', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const src = await sharp({ create: { width: 500, height: 2000, channels: 3, background: '#080' } }).png().toBuffer();
    await generateGeminiImage({
      modelId: 'gemini-2.5-flash-image', prompt: 'make it blue',
      inlineImage: { mimeType: 'image/png', base64: src.toString('base64') },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('9:16');
  });

  it('an explicitly asked-for ratio still wins over the source picture\'s shape', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const src = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: '#008' } }).png().toBuffer();
    await generateGeminiImage({
      modelId: 'gemini-nano-banana-2.1', prompt: 'make it blue', aspectRatio: '1:1',
      inlineImage: { mimeType: 'image/png', base64: src.toString('base64') },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('1:1');
  });

  it('throws a readable error when the API returns a failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 400,
      text: async () => '{"error":{"message":"aspect_ratio must be one of ..."}}',
    });
    await expect(
      generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'x' })
    ).rejects.toThrow(/gemini-3-pro-image.*400/);
  });

  it('throws when the response carries no image part', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'refused' }] } }] }),
    });
    await expect(
      generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'x' })
    ).rejects.toThrow(/no image/i);
  });

  it('throws a clear error when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(
      generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'x' })
    ).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it('refuses a model that is not on the gemini-api transport', async () => {
    await expect(
      generateGeminiImage({ modelId: 'gpt-image-2', prompt: 'x' })
    ).rejects.toThrow(/transport/i);
  });

  it('throws a clear error for an unrecognized model id', async () => {
    await expect(
      generateGeminiImage({ modelId: 'unknown-model-xyz', prompt: 'x' })
    ).rejects.toThrow(/not a recognized image model/);
  });

  it('falls back to candidatesTokenCount when per-modality breakdown is missing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }] } }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 2000,
          // Note: no candidatesTokensDetails array, so per-modality breakdown is missing.
        },
      }),
    });
    const r = await generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'a cat' });
    expect(r.usage).toEqual({ text_input_tokens: 10, image_output_tokens: 2000 });
  });
});
