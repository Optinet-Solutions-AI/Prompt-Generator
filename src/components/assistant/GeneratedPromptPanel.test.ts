import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callImageGen } from './GeneratedPromptPanel';

// callImageGen is the only piece of GeneratedPromptPanel.tsx with real logic
// (building the /api/generate-image request body) — everything else is JSX,
// and vitest.config.ts runs in plain Node (no jsdom), so we can't render the
// component. This mocks fetch and checks the body directly instead.

function mockFetchOnce(imageUrl = 'https://drive.example/pic.png') {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ imageUrl }),
    text: async () => '',
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('callImageGen request body', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('with nothing picked (today\'s defaults), sends the same body the hardcoded version always sent', async () => {
    const fetchMock = mockFetchOnce();
    await callImageGen({
      positivePrompt: 'a neon sign',
      brand: 'SpinJo',
      provider: 'chatgpt',
      token: 'user-1',
      geminiModel: 'gemini-2.5-flash-image',
      bannerDimensions: '', // "Aspect ratio" preset — the default
      aspectRatio: '16:9',  // the default
      resolution: '1K',     // the default — see the cost comment in GeneratedPromptPanel.tsx
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/generate-image');
    const body = JSON.parse(init.body as string);
    // These three are exactly what the old hardcoded call sent — unchanged
    // when the user hasn't touched the new size/resolution controls.
    expect(body.aspectRatio).toBe('16:9');
    expect(body.backend).toBe('cloud-run');
    expect(body.resolution).toBe('1K');
    // bannerDimensions is now always present, but empty means "not set" to the
    // backend (ratioFromString('') is null, same as ratioFromString(undefined)
    // — see api/generate-image.ts), so this is not a behaviour change.
    expect(body.bannerDimensions).toBe('');
  });

  it('sends the picked banner size, aspect ratio and resolution when the user chooses them', async () => {
    const fetchMock = mockFetchOnce();
    await callImageGen({
      positivePrompt: 'a wide email banner',
      brand: 'Roosterbet',
      provider: 'gemini',
      token: 'user-2',
      geminiModel: 'gemini-2.5-flash-image',
      bannerDimensions: '1200 × 600', // Email banner preset
      aspectRatio: '2:1',
      resolution: '2K',
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.bannerDimensions).toBe('1200 × 600');
    expect(body.aspectRatio).toBe('2:1');
    expect(body.resolution).toBe('2K');
    expect(body.backend).toBe('cloud-run'); // unaffected by the new controls
  });

  it('throws with the response text when the API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    }));
    await expect(callImageGen({
      positivePrompt: 'x',
      brand: 'SpinJo',
      provider: 'chatgpt',
      token: 't',
      geminiModel: 'gemini-2.5-flash-image',
      bannerDimensions: '',
      aspectRatio: '16:9',
      resolution: '1K',
    })).rejects.toThrow('Image gen failed (500): boom');
  });
});
