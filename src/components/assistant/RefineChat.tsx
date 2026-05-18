import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { requestRefine } from '@/lib/assistant-client';
import { recordLlmCall } from '@/lib/cost-store';
import type {
  AssistantProvider,
  ChatTurn,
  GeneratedFields,
} from '@/lib/assistant-types';

type TurnWithImage = ChatTurn & { imageUrl?: string };

interface Props {
  token: string;
  brand: string;
  model: AssistantProvider;
  /** Current structured fields — updated each time the user refines. */
  fields: GeneratedFields;
  /** Initial AI turn so the chat opens with context (the first generated image). */
  initialTurns: TurnWithImage[];
  /** Called by the chat to actually generate an image with the (possibly refined) fields. Returns the new image URL. */
  onRegenerate: (fields: GeneratedFields) => Promise<string | null>;
  /** Notified when fields are refined so the parent can sync state (e.g. for Save). */
  onFieldsRefined: (fields: GeneratedFields) => void;
  /** Open the lightbox at the given image URL. */
  onImageClick: (url: string) => void;
}

export function RefineChat({
  token,
  brand,
  model,
  fields,
  initialTurns,
  onRegenerate,
  onFieldsRefined,
  onImageClick,
}: Props) {
  const [turns, setTurns] = useState<TurnWithImage[]>(initialTurns);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the chat scrolled to the most recent turn.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  async function onSend() {
    const userMessage = input.trim();
    if (!userMessage || busy) return;

    setError(null);
    setBusy(true);

    // Optimistically add the user's turn to the chat.
    const newUserTurn: TurnWithImage = { role: 'user', content: userMessage };
    const historyForApi: ChatTurn[] = turns.map(t => ({ role: t.role, content: t.content }));
    setTurns(prev => [...prev, newUserTurn]);
    setInput('');

    try {
      const refineResult = await requestRefine({
        token,
        brand,
        currentFields: fields,
        chatHistory: historyForApi,
        userMessage,
        model,
      });
      recordLlmCall(token, 'refine', refineResult.usage);

      // Push the AI's text reply into the chat.
      const assistantTurn: TurnWithImage = { role: 'assistant', content: refineResult.message };
      setTurns(prev => [...prev, assistantTurn]);

      // Sync refined fields back to the parent (so Save uses the latest version).
      onFieldsRefined(refineResult.refinedFields);

      // Now regenerate the image using the refined positive_prompt.
      const newImageUrl = await onRegenerate(refineResult.refinedFields);

      if (newImageUrl) {
        setTurns(prev => [
          ...prev,
          { role: 'assistant', content: '', imageUrl: newImageUrl },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <section className="mt-6 rounded-lg border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">Refine this image</h3>
        <span className="ml-auto text-xs text-muted-foreground">Type a change. AI rewrites the prompt and regenerates.</span>
      </header>

      <div ref={scrollRef} className="max-h-[480px] overflow-y-auto px-4 py-4 space-y-3">
        {turns.map((t, i) => {
          if (t.imageUrl) {
            return (
              <div key={i} className="flex">
                <img
                  src={t.imageUrl}
                  alt={`refined v${i}`}
                  className="max-w-full cursor-zoom-in rounded border transition hover:brightness-95"
                  onClick={() => onImageClick(t.imageUrl!)}
                />
              </div>
            );
          }
          return (
            <div
              key={i}
              className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  t.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                {t.content}
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Thinking…
            </div>
          </div>
        )}
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>

      <div className="flex items-end gap-2 border-t px-4 py-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder='e.g. "I don’t want it like that — put him on a beach at sunset, shrink the rockets"'
          rows={2}
          className="resize-none"
          disabled={busy}
        />
        <Button onClick={onSend} disabled={busy || !input.trim()} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
