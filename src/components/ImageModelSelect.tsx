import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { geminiDropdownModels, getImageModel, DEFAULT_GEMINI_IMAGE_MODEL } from '@/lib/image-models';

/** localStorage key — keeps the tester's choice across reloads. */
export const GEMINI_MODEL_STORAGE_KEY = 'promptgen.geminiImageModel';

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

/** Read the saved choice, guarding against a stale or tampered value. */
export function loadSavedGeminiModel(): string {
  try {
    const saved = localStorage.getItem(GEMINI_MODEL_STORAGE_KEY);
    if (saved && getImageModel(saved)?.inDropdown) return saved;
  } catch {
    // localStorage can throw in private-browsing modes — fall through.
  }
  return DEFAULT_GEMINI_IMAGE_MODEL;
}

interface Props {
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ImageModelSelect({ value, onChange, disabled }: Props) {
  const models = geminiDropdownModels();
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">Gemini model</label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        {/* The <label> above isn't programmatically linked to Radix's SelectTrigger
            (it's a button, not a native <select>), so a screen reader would only
            announce the current value, not the field name. aria-label fixes that. */}
        <SelectTrigger className="w-[240px]" aria-label="Gemini model"><SelectValue /></SelectTrigger>
        <SelectContent>
          {models.map(m => (
            <SelectItem key={m.id} value={m.id}>{optionLabelFor(m.id)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
