import { Copy, Heart, Eye, EyeOff } from 'lucide-react';
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

  const [currentFields, setCurrentFields] = useState(fields);
  const [chatTurns, setChatTurns] = useState<ChatTurnWithImage[]>([]);
  const [allImageUrls, setAllImageUrls] = useState<string[]>([]);
  const [lastImageProvider, setLastImageProvider] = useState<ImageProvider>('chatgpt');
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  // Power-user toggle for inspecting the full structured prompt the AI built.
  // Hidden by default — the non-technical tester never needs to see it.
  const [showPromptDetails, setShowPromptDetails] = useState(false);

  // Save / re-enable-after-changes signature
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
          content: `Here is the ${provider === 'chatgpt' ? 'ChatGPT' : 'Gemini'} take. Tell me what to change.`,
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
    <section className="mt-14 ax-fade-up">
      <div className="flex items-baseline justify-between mb-6 gap-4 flex-wrap">
        <div>
          <span className="ax-eyebrow">Selected · {pickedConcept.title}</span>
          <h2 className="ax-display text-3xl mt-1">
            <em>The shot.</em>
          </h2>
        </div>
        <div className="flex gap-2">
          <button onClick={copyAll} className="ax-btn-ghost">
            <Copy className="h-4 w-4" />
            Copy prompt
          </button>
          <button onClick={onLike} disabled={liked} className="ax-btn-ghost">
            <Heart className={`h-4 w-4 ${liked ? 'fill-current text-[var(--ax-gold-bright)]' : ''}`} />
            {liked ? 'Saved' : savedSignature ? 'Save update' : 'Save'}
          </button>
        </div>
      </div>

      {/* Image-gen action row — primary action, big and obvious */}
      {!chatStarted && (
        <div className="ax-card p-8 mb-6">
          <div className="flex flex-col items-start gap-4">
            <div>
              <span className="ax-eyebrow">Render</span>
              <h3 className="ax-display text-2xl mt-1 leading-tight">Which engine should compose this shot?</h3>
              <p className="text-sm text-[var(--ax-ink-dim)] mt-2 max-w-md">
                ChatGPT and Gemini have different visual sensibilities. Pick either to start — you can re-roll or refine from the chat after.
              </p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <button onClick={() => onFirstGenerate('chatgpt')} disabled={imageBusy} className="ax-btn-primary">
                {imageBusy && lastImageProvider === 'chatgpt' ? (
                  <span className="ax-thinking" style={{ color: 'inherit' }}>
                    <span className="ax-thinking-dot" /><span className="ax-thinking-dot" /><span className="ax-thinking-dot" />
                    Rendering
                  </span>
                ) : 'Render with ChatGPT'}
              </button>
              <button onClick={() => onFirstGenerate('gemini')} disabled={imageBusy} className="ax-btn-ghost" style={{ padding: '12px 22px', fontSize: 14 }}>
                {imageBusy && lastImageProvider === 'gemini' ? (
                  <span className="ax-thinking">
                    <span className="ax-thinking-dot" /><span className="ax-thinking-dot" /><span className="ax-thinking-dot" />
                    Rendering
                  </span>
                ) : 'Render with Gemini'}
              </button>
            </div>
            {imageError && <p className="text-sm text-red-400">{imageError}</p>}
          </div>
        </div>
      )}

      {/* Chat starts here once the first image has rendered */}
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

      {saveError && <p className="text-sm text-red-400 mt-3">{saveError}</p>}

      {/* Power-user: full structured prompt, collapsed by default. Most users
          never need this — kept available for debugging / inspection. */}
      <div className="mt-8 flex justify-center">
        <button
          onClick={() => setShowPromptDetails(s => !s)}
          className="text-xs text-[var(--ax-ink-fade)] hover:text-[var(--ax-ink-dim)] flex items-center gap-1.5 transition-colors"
        >
          {showPromptDetails ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showPromptDetails ? 'Hide prompt details' : 'View prompt details'}
        </button>
      </div>

      {showPromptDetails && (
        <div className="ax-card p-6 mt-4 text-sm space-y-3">
          <PromptField label="Positive prompt"  value={currentFields.positive_prompt} />
          <PromptField label="Negative prompt"  value={currentFields.negative_prompt} />
          <PromptField label="Subject"          value={currentFields.subject} />
          <PromptField label="Lighting"         value={currentFields.lighting} />
          <PromptField label="Mood"             value={currentFields.mood} />
          <PromptField label="Background"       value={currentFields.background} />
          <PromptField label="Primary object"   value={currentFields.primary_object} />
          <PromptField label="Format layout"    value={currentFields.format_layout} />
        </div>
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
      <span className="ax-label">{label}</span>
      <p className="text-[var(--ax-ink-dim)] leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}
