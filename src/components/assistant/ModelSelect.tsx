import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AssistantProvider } from '@/lib/assistant-types';

const OPTIONS: { value: AssistantProvider; label: string; disabled?: boolean }[] = [
  { value: 'gemini', label: 'Gemini (Flash)' },
  { value: 'openai', label: 'OpenAI (gpt-4o)' },
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
