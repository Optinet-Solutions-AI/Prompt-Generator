import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Copy, Heart } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type {
  AssistantConcept,
  AssistantProvider,
  AssistantUsage,
  GeneratedFields,
} from '@/lib/assistant-types';
import { saveAssistantPrompt } from '@/lib/assistant-storage';
import { RefineChat } from './RefineChat';
import { ImageLightbox } from './ImageLightbox';

interface Props {
  fields: GeneratedFields & { brand: string };
  token: string;
  task: string;
  description?: string;
  pickedConcept: AssistantConcept;
  allConcepts: AssistantConcept[];
  usage: AssistantUsage;
  /** The model selected in the page header — used for refine calls. */
  refineModel: AssistantProvider;
}

const FIELD_ORDER: (keyof GeneratedFields)[] = [
  'format_layout', 'primary_object', 'subject', 'lighting',
  'mood', 'background', 'positive_prompt', 'negative_prompt',
];

type ImageProvider = 'chatgpt' | 'gemini';
type ChatTurnWithImage = { role: 'user' | 'assistant'; content: string; imageUrl?: string };

async function callImageGen(args: {
  positivePrompt: string;
  brand: string;
  provider: ImageProvider;
  token: string;
}): Promise<string> {
  const res = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: args.positivePrompt,
      provider: args.provider,
      aspectRatio: '16:9',
      backend: 'cloud-run',
      resolution: '1K',
      brand: args.brand,
      source: 'assistant',
      test_user_id: args.token,
    }),
  });
  if (!res.ok) {
    throw new Error(`Image gen failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const url: string | undefined = data.imageUrl ?? data.url ?? data.public_url;
  if (!url) throw new Error('No image URL returned');
  return url;
}

export function GeneratedPromptPanel({
  fields,
  token,
  task,
  description,
  pickedConcept,
  allConcepts,
  usage,
  refineModel,
}: Props) {
  const { toast } = useToast();

  // The "live" fields — start with what generate produced; refine swaps these.
  const [currentFields, setCurrentFields] = useState(fields);

  // Seed turns for the chat — the initial AI greeting + first image. Once
  // RefineChat mounts it manages its own thread state from this seed.
  const [chatTurns, setChatTurns] = useState<ChatTurnWithImage[]>([]);
  // All image URLs ever generated (initial + every refine). Tracked here so
  // Save can include the full image set regardless of chat-internal state.
  const [allImageUrls, setAllImageUrls] = useState<string[]>([]);
  const [lastImageProvider, setLastImageProvider] = useState<ImageProvider>('chatgpt');
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function copyAll() {
    navigator.clipboard.writeText(currentFields.positive_prompt);
    toast({ title: 'Copied positive prompt' });
  }

  // First image generation — kicks off the chat.
  async function onFirstGenerate(provider: ImageProvider) {
    setImageError(null);
    setImageBusy(true);
    setLastImageProvider(provider);
    try {
      const url = await callImageGen({
        positivePrompt: currentFields.positive_prompt,
        brand: currentFields.brand,
        provider,
        token,
      });
      setChatTurns(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Here is your ${provider === 'chatgpt' ? 'ChatGPT' : 'Gemini'} take on "${task}". Tell me what you would change.`,
        },
        { role: 'assistant', content: '', imageUrl: url },
      ]);
      setAllImageUrls(prev => [...prev, url]);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : String(e));
    } finally {
      setImageBusy(false);
    }
  }

  // Called by RefineChat after a successful refine — regenerate with the same provider.
  async function onRegenerate(refined: GeneratedFields): Promise<string | null> {
    try {
      return await callImageGen({
        positivePrompt: refined.positive_prompt,
        brand: currentFields.brand,
        provider: lastImageProvider,
        token,
      });
    } catch (e) {
      setImageError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  // Synced from RefineChat each time fields are refined.
  function onFieldsRefined(refined: GeneratedFields) {
    setCurrentFields({ ...refined, brand: currentFields.brand });
  }

  // Pull image URLs out of the chat history for the Save row.
  const allImageUrls = chatTurns
    .map(t => t.imageUrl)
    .filter((u): u is string => Boolean(u));

  async function onLike() {
    setSaveError(null);
    try {
      await saveAssistantPrompt({
        test_user_id: token,
        brand: currentFields.brand,
        task,
        description,
        provider: usage.provider,
        model: usage.model,
        all_concepts: allConcepts,
        picked_concept: pickedConcept,
        generated_fields: currentFields,
        usage: {
          input_tokens: usage.input_tokens,
          cached_input_tokens: usage.cached_input_tokens,
          output_tokens: usage.output_tokens,
        },
        image_drive_ids: allImageUrls,
        liked: true,
      });
      setLiked(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  const chatStarted = chatTurns.length > 0;

  return (
    <section className="mt-8 rounded-lg border p-6 bg-card">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Generated prompt ({currentFields.brand})</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyAll}>
            <Copy className="h-4 w-4 mr-1" />Copy positive prompt
          </Button>
          <Button variant="outline" size="sm" onClick={onLike} disabled={liked}>
            <Heart className={`h-4 w-4 mr-1 ${liked ? 'fill-current' : ''}`} />
            {liked ? 'Saved' : 'Save'}
          </Button>
        </div>
      </header>

      <Accordion type="multiple" defaultValue={['positive_prompt']}>
        {FIELD_ORDER.map(key => (
          <AccordionItem key={key} value={key}>
            <AccordionTrigger className="capitalize">{key.replace(/_/g, ' ')}</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{currentFields[key]}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <div className="mt-6 flex gap-2">
        <Button onClick={() => onFirstGenerate('chatgpt')} disabled={imageBusy}>
          {imageBusy && lastImageProvider === 'chatgpt' ? 'Generating…' : 'ChatGPT 🎨'}
        </Button>
        <Button variant="secondary" onClick={() => onFirstGenerate('gemini')} disabled={imageBusy}>
          {imageBusy && lastImageProvider === 'gemini' ? 'Generating…' : 'Gemini 🎨'}
        </Button>
      </div>

      {imageError && <p className="text-sm text-destructive mt-2">{imageError}</p>}

      {chatStarted && (
        <RefineChat
          token={token}
          brand={currentFields.brand}
          model={refineModel}
          fields={currentFields}
          initialTurns={chatTurns}
          onRegenerate={onRegenerate}
          onFieldsRefined={onFieldsRefined}
          onImageClick={setLightboxSrc}
        />
      )}

      {saveError && <p className="text-sm text-destructive mt-2">{saveError}</p>}

      <ImageLightbox
        src={lightboxSrc}
        alt="Generated image — full view"
        onClose={() => setLightboxSrc(null)}
      />
    </section>
  );
}
