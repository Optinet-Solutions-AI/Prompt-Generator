import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AssistantProvider } from '@/lib/assistant-types';

// Provider names only, deliberately — no model name in the label.
//
// This picks a PROVIDER, not a model: each one uses a different model per stage
// (see ASSISTANT_MODELS in api/_assistant-models.ts — Gemini currently runs
// 3.1 Pro for concepts, 3.5 Flash for generate and refine, 3.7 Flash for the
// recommendation). So any single model name here is wrong for most of the work,
// and it rots silently every time a stage is retuned. These labels had drifted
// to "Gemini (Flash)" and "OpenAI (gpt-4o)" while OpenAI actually ran gpt-5.2
// throughout — badly misleading for anyone comparing cost or quality.
const OPTIONS: { value: AssistantProvider; label: string; disabled?: boolean }[] = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude', label: 'Claude (coming soon)', disabled: true },
];

interface Props {
  value: AssistantProvider;
  onChange: (v: AssistantProvider) => void;
}

export function ModelSelect({ value, onChange }: Props) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AssistantProvider)}>
      <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {OPTIONS.map(o => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
