import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { requestRefine } from '@/lib/assistant-client';
import type {
  AssistantProvider,
  ChatTurn,
  GeneratedFields,
  RefineOption,
} from '@/lib/assistant-types';

type TurnKind =
  | { kind: 'text';    role: 'user' | 'assistant'; content: string }
  | { kind: 'image';   role: 'assistant';          imageUrl: string }
  | { kind: 'options'; role: 'assistant';          message: string; options: RefineOption[] };

interface Props {
  token: string;
  brand: string;
  model: AssistantProvider;
  fields: GeneratedFields;
  /** Initial AI turn so the chat opens with context (the first generated image). */
  initialTurns: { role: 'user' | 'assistant'; content: string; imageUrl?: string }[];
  onRegenerate: (fields: GeneratedFields) => Promise<string | null>;
  onFieldsRefined: (fields: GeneratedFields) => void;
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
  // Normalise the seed turns into the new discriminated union.
  const [turns, setTurns] = useState<TurnKind[]>(() =>
    initialTurns.map<TurnKind>(t =>
      t.imageUrl
        ? { kind: 'image', role: 'assistant', imageUrl: t.imageUrl }
        : { kind: 'text', role: t.role, content: t.content },
    ),
  );
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  async function sendMessage(rawMessage: string) {
    const userMessage = rawMessage.trim();
    if (!userMessage || busy) return;

    setError(null);
    setBusy(true);

    // Add the user's turn locally so they see it immediately.
    const userTurn: TurnKind = { kind: 'text', role: 'user', content: userMessage };
    // Build the chat history we send to the API: only text turns (the AI doesn't
    // need to see image URLs or option lists in the transcript).
    const historyForApi: ChatTurn[] = turns
      .filter((t): t is Extract<TurnKind, { kind: 'text' }> => t.kind === 'text')
      .map(t => ({ role: t.role, content: t.content }));
    setTurns(prev => [...prev, userTurn]);
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

      if (refineResult.action === 'clarify') {
        // AI is asking a multiple-choice clarifying question instead of refining.
        setTurns(prev => [
          ...prev,
          { kind: 'options', role: 'assistant', message: refineResult.message, options: refineResult.options },
        ]);
        return;
      }

      // action === 'refine'
      setTurns(prev => [
        ...prev,
        { kind: 'text', role: 'assistant', content: refineResult.message },
      ]);
      onFieldsRefined(refineResult.refinedFields);

      const newImageUrl = await onRegenerate(refineResult.refinedFields);
      if (newImageUrl) {
        setTurns(prev => [
          ...prev,
          { kind: 'image', role: 'assistant', imageUrl: newImageUrl },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSendFromInput() {
    await sendMessage(input);
  }

  function onPickOption(option: RefineOption) {
    // Treat the option as the next user message. The AI will see it as a normal
    // user reply and (usually) refine on the next round-trip.
    void sendMessage(`${option.label}: ${option.description}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void onSendFromInput();
    }
  }

  return (
    <section className="mt-6 rounded-lg border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">Refine this image</h3>
        <span className="ml-auto text-xs text-muted-foreground hidden md:inline">
          Type a change. AI will ask when it's not sure.
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              const url = await onRegenerate(fields);
              if (url) {
                setTurns(prev => [
                  ...prev,
                  { kind: 'text', role: 'assistant', content: 'Same prompt, fresh roll.' },
                  { kind: 'image', role: 'assistant', imageUrl: url },
                ]);
              }
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          title="Re-roll the same prompt"
        >
          <RotateCw className={`h-4 w-4 mr-1 ${busy ? 'animate-spin' : ''}`} />
          Regenerate
        </Button>
      </header>

      <div ref={scrollRef} className="max-h-[480px] overflow-y-auto px-4 py-4 space-y-3">
        {turns.map((t, i) => {
          if (t.kind === 'image') {
            return (
              <div key={i} className="flex">
                <img
                  src={t.imageUrl}
                  alt={`refined v${i}`}
                  className="max-w-full cursor-zoom-in rounded border transition hover:brightness-95"
                  onClick={() => onImageClick(t.imageUrl)}
                />
              </div>
            );
          }
          if (t.kind === 'options') {
            return (
              <div key={i} className="flex flex-col gap-2">
                <div className="self-start max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed">
                  {t.message}
                </div>
                <div className="flex flex-col gap-2 pl-2">
                  {t.options.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => onPickOption(opt)}
                      disabled={busy}
                      className="text-left rounded-lg border bg-background px-3 py-2 transition hover:bg-accent disabled:opacity-50"
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          // kind === 'text'
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
          placeholder='Tell me what to change ("smaller rockets", "make it nighttime"). If it could go a few ways, I’ll ask.'
          rows={2}
          className="resize-none"
          disabled={busy}
        />
        <Button onClick={onSendFromInput} disabled={busy || !input.trim()} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
