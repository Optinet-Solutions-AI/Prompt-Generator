import { Copy, Heart, Eye, EyeOff, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  refineModel: AssistantProvider;
}

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
  fields, token, task, description, pickedConcept, allConcepts, usage, refineModel,
}: Props) {
  const { toast } = useToast();

  const [currentFields, setCurrentFields] = useState(fields);
  const [chatTurns, setChatTurns] = useState<ChatTurnWithImage[]>([]);
  const [allImageUrls, setAllImageUrls] = useState<string[]>([]);
  const [lastImageProvider, setLastImageProvider] = useState<ImageProvider>('chatgpt');
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showPromptDetails, setShowPromptDetails] = useState(false);

  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  function currentSignature(): string {
    return JSON.stringify({ fields: currentFields, images: allImageUrls });
  }
  const liked = savedSignature !== null && savedSignature === currentSignature();

  function copyAll() {
    navigator.clipboard.writeText(currentFields.positive_prompt);
    toast({ title: 'Copied prompt to clipboard' });
  }

  async function onFirstGenerate(provider: ImageProvider) {
    if (imageBusy) return;
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
          content: `Here's the ${provider === 'chatgpt' ? 'ChatGPT' : 'Gemini'} take. Tell me what to change.`,
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

  async function onRegenerate(refined: GeneratedFields): Promise<string | null> {
    try {
      const url = await callImageGen({
        positivePrompt: refined.positive_prompt,
        brand: currentFields.brand,
        provider: lastImageProvider,
        token,
      });
      setAllImageUrls(prev => [...prev, url]);
      return url;
    } catch (e) {
      setImageError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  function onFieldsRefined(refined: GeneratedFields) {
    setCurrentFields({ ...refined, brand: currentFields.brand });
  }

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
      setSavedSignature(currentSignature());
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  const chatStarted = chatTurns.length > 0;

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold">Your prompt is ready</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Based on "{pickedConcept.title}". Render below, then refine in chat.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyAll} className="gap-2">
            <Copy className="h-4 w-4" /> Copy prompt
          </Button>
          <Button variant="outline" size="sm" onClick={onLike} disabled={liked} className="gap-2">
            <Heart className={`h-4 w-4 ${liked ? 'fill-current text-primary' : ''}`} />
            {liked ? 'Saved' : savedSignature ? 'Save update' : 'Save'}
          </Button>
        </div>
      </div>

      {!chatStarted && (
        <Card className="shadow-md mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" />
              Render the image
            </CardTitle>
            <CardDescription>
              Pick an engine to start. You can re-roll or refine in the chat afterwards.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 flex-wrap">
              <Button onClick={() => onFirstGenerate('chatgpt')} disabled={imageBusy} size="lg">
                {imageBusy && lastImageProvider === 'chatgpt' ? 'Rendering…' : 'Render with ChatGPT 🎨'}
              </Button>
              <Button onClick={() => onFirstGenerate('gemini')} disabled={imageBusy} variant="secondary" size="lg">
                {imageBusy && lastImageProvider === 'gemini' ? 'Rendering…' : 'Render with Gemini 🎨'}
              </Button>
            </div>
            {imageError && <p className="text-sm text-destructive mt-3">{imageError}</p>}
          </CardContent>
        </Card>
      )}

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

      {saveError && <p className="text-sm text-destructive mt-3">{saveError}</p>}

      {/* Power-user: full structured prompt, collapsed by default */}
      <div className="mt-6 flex justify-center">
        <button
          onClick={() => setShowPromptDetails(s => !s)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
        >
          {showPromptDetails ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showPromptDetails ? 'Hide prompt details' : 'View prompt details'}
        </button>
      </div>

      {showPromptDetails && (
        <Card className="mt-3">
          <CardContent className="pt-6 space-y-4 text-sm">
            <PromptField label="Positive prompt"  value={currentFields.positive_prompt} />
            <PromptField label="Negative prompt"  value={currentFields.negative_prompt} />
            <PromptField label="Subject"          value={currentFields.subject} />
            <PromptField label="Lighting"         value={currentFields.lighting} />
            <PromptField label="Mood"             value={currentFields.mood} />
            <PromptField label="Background"       value={currentFields.background} />
            <PromptField label="Primary object"   value={currentFields.primary_object} />
            <PromptField label="Format layout"    value={currentFields.format_layout} />
          </CardContent>
        </Card>
      )}

      <ImageLightbox
        src={lightboxSrc}
        alt="Generated image — full view"
        onClose={() => setLightboxSrc(null)}
      />
    </section>
  );
}

function PromptField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">{label}</div>
      <p className="text-foreground/80 leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}
