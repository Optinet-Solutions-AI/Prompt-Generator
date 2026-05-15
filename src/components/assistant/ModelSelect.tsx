import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AssistantProvider } from '@/lib/assistant-types';

const OPTIONS: { value: AssistantProvider; label: string; disabled?: boolean }[] = [
  { value: 'gemini', label: 'Gemini (Flash → Pro)' },
  { value: 'openai', label: 'OpenAI (4o-mini → 4o)' },
  { value: 'claude', label: 'Claude (coming soon)', disabled: true },
];

interface Props {
  value: AssistantProvider;
  onChange: (v: AssistantProvider) => void;
}

export function ModelSelect({ value, onChange }: Props) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AssistantProvider)}>
      <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
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
