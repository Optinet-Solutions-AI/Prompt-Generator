import { useState } from 'react';

interface Args {
  positivePrompt: string;
  negativePrompt: string;
  brand: string;
  provider: 'chatgpt' | 'gemini';
}

export function useAssistantImageGen(token: string) {
  const [loading, setLoading] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function generate(args: Args) {
    setLoading(true);
    setError(null);
    const body = JSON.stringify({
      // Match the main app's body shape:
      prompt: args.positivePrompt,
      provider: args.provider,
      aspectRatio: '16:9',
      backend: 'cloud-run',
      resolution: '1K',
      brand: args.brand,
      // Assistant opt-in fields:
      source: 'assistant',
      test_user_id: token,
    });
    // The render is a slow, heavy call that occasionally hits a transient server
    // 500. Retry once on a 5xx (or network blip) before surfacing a friendly
    // message. A 4xx is a real error and is shown immediately with its detail.
    const MAX_ATTEMPTS = 2;
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let res: Response;
        try {
          res = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          });
        } catch {
          if (attempt < MAX_ATTEMPTS) continue; // network blip — retry once
          throw new Error('The image server is temporarily unreachable. Please try again, or use Render with Gemini.');
        }
        if (res.ok) {
          const data = await res.json();
          const url: string | undefined = data.imageUrl ?? data.url ?? data.public_url;
          if (url) { setImageUrls(prev => [...prev, url]); return; }
          throw new Error('No image URL returned');
        }
        if (res.status >= 500) {
          if (attempt < MAX_ATTEMPTS) continue; // transient server error — retry once
          throw new Error('The render hit a temporary server error (this engine can be slow). Please try again, or use Render with Gemini.');
        }
        // 4xx — a real request error; surface the detail.
        const errText = await res.text();
        throw new Error(`Image gen failed (${res.status}): ${errText}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return { loading, imageUrls, error, generate };
}
