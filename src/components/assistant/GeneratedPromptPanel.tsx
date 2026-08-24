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
  PromptVersion,
} from '@/lib/assistant-types';
import { saveAssistantPrompt } from '@/lib/assistant-storage';
import { RefineChat } from './RefineChat';
import { ImageLightbox } from './ImageLightbox';
import { ImageModelSelect, loadSavedGeminiModel, GEMINI_MODEL_STORAGE_KEY } from '@/components/ImageModelSelect';
import { SizePresetSelect } from '@/components/SizePresetSelect';

interface Props {
  version: PromptVersion;
  token: string;
  task: string;
  description?: string;
  allConcepts: AssistantConcept[];
  refineModel: AssistantProvider;
  /** Report a refinement upward — the parent owns history, not this panel. */
  onNewVersion: (fields: GeneratedFields & { brand: string }, usage: AssistantUsage | null) => void;
}

type ImageProvider = 'chatgpt' | 'gemini';
type ChatTurnWithImage = { role: 'user' | 'assistant'; content: string; imageUrl?: string };
// Same 4 tiers as the main generator's resolution toggle (ResultDisplay.tsx).
type Resolution = '1K' | '2K' | '3K' | '4K';

// Exported (only) so a plain unit test can check the request body it builds
// without rendering the component — see GeneratedPromptPanel.test.ts.
export async function callImageGen(args: {
  positivePrompt: string;
  brand: string;
  provider: ImageProvider;
  token: string;
  geminiModel: string;
  bannerDimensions: string;
  aspectRatio: string;
  resolution: Resolution;
}): Promise<string> {
  const res = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: args.positivePrompt,
      provider: args.provider,
      // bannerDimensions ("1200 × 600") wins server-side when set; aspectRatio
      // is still sent as the fallback/framing hint either way (see
      // api/generate-image.ts: ratioFromString(bannerDimensions) ?? ratioFromString(aspectRatio)).
      aspectRatio: args.aspectRatio,
      bannerDimensions: args.bannerDimensions,
      backend: 'cloud-run',
      resolution: args.resolution,
      brand: args.brand,
      source: 'assistant',
      test_user_id: args.token,
      geminiModel: args.geminiModel,
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
  version, token, task, description, allConcepts, refineModel, onNewVersion,
}: Props) {
  const { toast } = useToast();

  // No local copy of `fields` — this panel used to keep its own
  // `useState(fields)` snapshot, but useState's initial value is only read on
  // first mount. Once the parent could switch versions without unmounting us
  // (see the `key={active.concept.title}` note on the caller), that snapshot
  // would go stale. Reading straight off `version.fields` means the display
  // always matches whichever version is currently selected.
  const [chatTurns, setChatTurns] = useState<ChatTurnWithImage[]>([]);
  const [allImageUrls, setAllImageUrls] = useState<string[]>([]);
  const [lastImageProvider, setLastImageProvider] = useState<ImageProvider>('chatgpt');
  const [imageBusy, setImageBusy] = useState(false);
  // Which Gemini image model to use. Restored from localStorage so the
  // choice made here matches whatever was picked on the main generator page.
  const [geminiModel, setGeminiModel] = useState<string>(loadSavedGeminiModel);

  const handleGeminiModelChange = (id: string) => {
    setGeminiModel(id);
    try {
      localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, id);
    } catch {
      // Non-fatal — the choice just won't persist.
    }
  };

  // Output size: empty bannerDimensions = "aspect ratio only" (today's behaviour,
  // unchanged unless the user picks a preset). SizePresetSelect fires onChange
  // twice per pick — once for bannerDimensions, once for the matching aspectRatio
  // token — so both fields below always stay in sync with each other.
  const [bannerDimensions, setBannerDimensions] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const handleSizeChange = (field: 'bannerDimensions' | 'aspectRatio', value: string) => {
    if (field === 'bannerDimensions') setBannerDimensions(value);
    else setAspectRatio(value);
  };

  // Resolution defaults to 1K on purpose — do not change this default.
  // The Assistant is an ideation loop (people re-roll and refine repeatedly),
  // and 1K renders in a few seconds for about $0.004. 2K measured 79 SECONDS
  // and about $0.14 per OpenAI render (2048×1024 "high" quality) — fine as an
  // occasional deliberate choice, way too slow/costly as the default for every pass.
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [imageError, setImageError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showPromptDetails, setShowPromptDetails] = useState(false);

  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  function currentSignature(): string {
    return JSON.stringify({ fields: version.fields, images: allImageUrls });
  }
  const liked = savedSignature !== null && savedSignature === currentSignature();

  function copyAll() {
    navigator.clipboard.writeText(version.fields.positive_prompt);
    toast({ title: 'Copied prompt to clipboard' });
  }

  async function onFirstGenerate(provider: ImageProvider) {
    if (imageBusy) return;
    setImageError(null);
    setImageBusy(true);
    setLastImageProvider(provider);
    try {
      const url = await callImageGen({
        positivePrompt: version.fields.positive_prompt,
        brand: version.fields.brand,
        provider,
        token,
        geminiModel,
        bannerDimensions,
        aspectRatio,
        resolution,
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
        brand: version.fields.brand,
        provider: lastImageProvider,
        token,
        geminiModel,
        bannerDimensions,
        aspectRatio,
        resolution,
      });
      setAllImageUrls(prev => [...prev, url]);
      return url;
    } catch (e) {
      setImageError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  // Refining no longer mutates this panel's own copy — it appends a new
  // version in the parent. That is what makes stepping back possible: a
  // component-local copy would go stale the moment the parent switched
  // versions without unmounting us.
  function onFieldsRefined(refined: GeneratedFields, usage: AssistantUsage | null) {
    onNewVersion({ ...refined, brand: version.fields.brand }, usage);
  }

  async function onLike() {
    setSaveError(null);
    try {
      // version.usage is AssistantUsage | null: both `generated` and `refined`
      // versions normally carry real usage from the call that produced them
      // (RefineChat forwards refineResult.usage through onFieldsRefined above).
      // It can still be null — e.g. the refine endpoint's `clarify` action
      // returns no refined fields (and no new version) at all, or a future
      // model might not report usage — so we keep this fallback rather than
      // assuming the field is always populated. We do NOT invent
      // plausible-looking token numbers here: the refine endpoint
      // (api/assistant/refine.ts) already logs its own real usage to
      // assistant_llm_calls server-side, so this copy — denormalised onto the
      // saved prompt row for convenience — is metadata, not the source of
      // truth for cost. Zeroing it is honest about "not reported here",
      // rather than fabricating a number that looks real but isn't.
      const usage = version.usage;
      await saveAssistantPrompt({
        test_user_id: token,
        brand: version.fields.brand,
        task,
        description,
        provider: usage ? usage.provider : refineModel,
        model: usage ? usage.model : '',
        all_concepts: allConcepts,
        picked_concept: version.concept,
        generated_fields: version.fields,
        usage: usage
          ? {
              input_tokens: usage.input_tokens,
              cached_input_tokens: usage.cached_input_tokens,
              output_tokens: usage.output_tokens,
            }
          : { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 },
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
            Based on "{version.concept.title}". Render below, then refine in chat.
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
            <div className="mb-3">
              <SizePresetSelect
                bannerDimensions={bannerDimensions}
                onChange={handleSizeChange}
                disabled={imageBusy}
              />
            </div>
            <div className="mb-3">
              <p className="text-center text-xs text-muted-foreground mb-2">Resolution</p>
              <div className="flex justify-center gap-2">
                {(['1K', '2K', '3K', '4K'] as const).map((r) => (
                  <Button
                    key={r}
                    type="button"
                    variant={resolution === r ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setResolution(r)}
                    disabled={imageBusy}
                    className={`min-w-[52px] ${resolution === r ? 'gradient-primary' : ''}`}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>
            <div className="mb-3">
              <ImageModelSelect
                value={geminiModel}
                onChange={handleGeminiModelChange}
                disabled={imageBusy}
              />
            </div>
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
          brand={version.fields.brand}
          model={refineModel}
          fields={version.fields}
          task={task}
          description={description}
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
            <PromptField label="Positive prompt"  value={version.fields.positive_prompt} />
            <PromptField label="Negative prompt"  value={version.fields.negative_prompt} />
            <PromptField label="Subject"          value={version.fields.subject} />
            <PromptField label="Lighting"         value={version.fields.lighting} />
            <PromptField label="Mood"             value={version.fields.mood} />
            <PromptField label="Background"       value={version.fields.background} />
            <PromptField label="Primary object"   value={version.fields.primary_object} />
            <PromptField label="Format layout"    value={version.fields.format_layout} />
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
