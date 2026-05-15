import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { GeneratedFields } from '@/lib/assistant-types';

interface Props {
  fields: GeneratedFields & { brand: string };
}

const FIELD_ORDER: (keyof GeneratedFields)[] = [
  'format_layout', 'primary_object', 'subject', 'lighting',
  'mood', 'background', 'positive_prompt', 'negative_prompt',
];

export function GeneratedPromptPanel({ fields }: Props) {
  const { toast } = useToast();

  function copyAll() {
    navigator.clipboard.writeText(fields.positive_prompt);
    toast({ title: 'Copied positive prompt' });
  }

  return (
    <section className="mt-8 rounded-lg border p-6 bg-card">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Generated prompt ({fields.brand})</h2>
        <Button variant="outline" size="sm" onClick={copyAll}>
          <Copy className="h-4 w-4 mr-1" />Copy positive prompt
        </Button>
      </header>

      <Accordion type="multiple" defaultValue={['positive_prompt']}>
        {FIELD_ORDER.map(key => (
          <AccordionItem key={key} value={key}>
            <AccordionTrigger className="capitalize">{key.replace(/_/g, ' ')}</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{fields[key]}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
