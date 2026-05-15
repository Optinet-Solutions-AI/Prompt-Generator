import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { GeneratedFields } from '@/lib/assistant-types';
import { useAssistantImageGen } from '@/hooks/useAssistantImageGen';

interface Props {
  fields: GeneratedFields & { brand: string };
  token: string;
}

const FIELD_ORDER: (keyof GeneratedFields)[] = [
  'format_layout', 'primary_object', 'subject', 'lighting',
  'mood', 'background', 'positive_prompt', 'negative_prompt',
];

export function GeneratedPromptPanel({ fields, token }: Props) {
  const { toast } = useToast();

  function copyAll() {
    navigator.clipboard.writeText(fields.positive_prompt);
    toast({ title: 'Copied positive prompt' });
  }

  const { generate, loading: imageLoading, imageUrls, error: imageError } = useAssistantImageGen(token);

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

      <div className="mt-6 flex gap-2">
        <Button onClick={() => generate({
          positivePrompt: fields.positive_prompt,
          negativePrompt: fields.negative_prompt,
          brand: fields.brand,
          provider: 'chatgpt',
        })} disabled={imageLoading}>
          {imageLoading ? 'Generating…' : 'ChatGPT 🎨'}
        </Button>
        <Button variant="secondary" onClick={() => generate({
          positivePrompt: fields.positive_prompt,
          negativePrompt: fields.negative_prompt,
          brand: fields.brand,
          provider: 'gemini',
        })} disabled={imageLoading}>
          {imageLoading ? 'Generating…' : 'Gemini 🎨'}
        </Button>
      </div>

      {imageError && <p className="text-sm text-destructive mt-2">{imageError}</p>}

      {imageUrls.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {imageUrls.map((url, i) => (
            <img key={i} src={url} alt={`generated ${i+1}`} className="rounded border" />
          ))}
        </div>
      )}
    </section>
  );
}
