import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  geminiDropdownModels,
  openaiDropdownModels,
  getImageModel,
  DEFAULT_GEMINI_IMAGE_MODEL,
  OPENAI_IMAGE_MODEL,
} from '@/lib/image-models';

/** localStorage key — keeps the tester's choice across reloads. */
export const GEMINI_MODEL_STORAGE_KEY = 'promptgen.geminiImageModel';
/** Same, for the ChatGPT dropdown. A separate key, so each choice is kept on its own. */
export const OPENAI_MODEL_STORAGE_KEY = 'promptgen.openaiImageModel';

/**
 * Build the dropdown text. The current model is marked "(current)" with no
 * price; the newer model shows its per-image cost, because the whole reason
 * this dropdown exists is to make that trade-off visible at the moment of
 * choosing.
 */
export function optionLabelFor(modelId: string): string {
  const m = getImageModel(modelId);
  if (!m) return modelId;
  if (m.isCurrent) return `${m.label} (current)`;
  if (m.displayPricePerImage === null) return m.label;
  return `${m.label} — $${m.displayPricePerImage.toFixed(3)} / image`;
}

/**
 * Read a saved choice, guarding against a stale or tampered value: it must be
 * a model offered in that provider's dropdown, otherwise the default is used.
 */
function loadSaved(key: string, isOpenAi: boolean, fallback: string): string {
  try {
    const saved = localStorage.getItem(key);
    const m = saved ? getImageModel(saved) : null;
    if (m && m.inDropdown && (m.transport === 'openai') === isOpenAi) return m.id;
  } catch {
    // localStorage can throw in private-browsing modes — fall through.
  }
  return fallback;
}

/** The saved Gemini choice, or the current Gemini model. */
export function loadSavedGeminiModel(): string {
  return loadSaved(GEMINI_MODEL_STORAGE_KEY, false, DEFAULT_GEMINI_IMAGE_MODEL);
}

/** The saved ChatGPT choice, or the current ChatGPT model (GPT Image 2). */
export function loadSavedOpenAiModel(): string {
  return loadSaved(OPENAI_MODEL_STORAGE_KEY, true, OPENAI_IMAGE_MODEL);
}

interface Props {
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  /** Which dropdown this is. Picks the model list and the label. Default: Gemini. */
  provider?: 'gemini' | 'chatgpt';
}

export function ImageModelSelect({ value, onChange, disabled, provider = 'gemini' }: Props) {
  const models = provider === 'chatgpt' ? openaiDropdownModels() : geminiDropdownModels();
  const label = provider === 'chatgpt' ? 'ChatGPT model' : 'Gemini model';
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        {/* The <label> above isn't programmatically linked to Radix's SelectTrigger
            (it's a button, not a native <select>), so a screen reader would only
            announce the current value, not the field name. aria-label fixes that. */}
        <SelectTrigger className="w-[240px]" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          {models.map(m => (
            <SelectItem key={m.id} value={m.id}>{optionLabelFor(m.id)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
