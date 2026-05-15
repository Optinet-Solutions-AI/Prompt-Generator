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
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Match the main app's body shape:
          prompt: args.positivePrompt,
          provider: args.provider,
          aspectRatio: '16:9',
          backend: 'cloud-run',
          resolution: '1K',
          brand: args.brand,
          // Assistant opt-in fields (new):
          source: 'assistant',
          test_user_id: token,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Image gen failed (${res.status}): ${errText}`);
      }
      const data = await res.json();
      const url: string | undefined = data.imageUrl ?? data.url ?? data.public_url;
      if (url) {
        setImageUrls(prev => [...prev, url]);
      } else {
        throw new Error('No image URL returned');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return { loading, imageUrls, error, generate };
}
