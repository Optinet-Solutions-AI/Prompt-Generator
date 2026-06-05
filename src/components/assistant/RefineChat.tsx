import { useState, useRef, useEffect } from 'react';
import { Send, RotateCw, Sparkles, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  task: string;
  description?: string;
  initialTurns: { role: 'user' | 'assistant'; content: string; imageUrl?: string }[];
  onRegenerate: (fields: GeneratedFields) => Promise<string | null>;
  onFieldsRefined: (fields: GeneratedFields) => void;
  onImageClick: (url: string) => void;
}

export function RefineChat({
  token, brand, model, fields, task, description, initialTurns, onRegenerate, onFieldsRefined, onImageClick,
}: Props) {
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

    const userTurn: TurnKind = { kind: 'text', role: 'user', content: userMessage };
    const historyForApi: ChatTurn[] = turns
      .filter((t): t is Extract<TurnKind, { kind: 'text' }> => t.kind === 'text')
      .map(t => ({ role: t.role, content: t.content }));
    setTurns(prev => [...prev, userTurn]);
    setInput('');

    try {
      const refineResult = await requestRefine({
        token, brand, currentFields: fields, chatHistory: historyForApi, userMessage, model,
      });

      if (refineResult.action === 'clarify') {
        setTurns(prev => [
          ...prev,
          { kind: 'options', role: 'assistant', message: refineResult.message, options: refineResult.options },
        ]);
        return;
      }

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

  function onPickOption(option: RefineOption) {
    void sendMessage(`${option.label}: ${option.description}`);
  }

  async function onRegenSame() {
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
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <Card className="shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="w-4 h-4 text-primary" />
          Refine in chat
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onRegenSame} disabled={busy} className="gap-2">
          <RotateCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          Re-roll
        </Button>
      </CardHeader>

      <CardContent className="space-y-4 px-0">
        <div ref={scrollRef} className="max-h-[560px] overflow-y-auto px-6 space-y-3">
          {turns.map((t, i) => {
            if (t.kind === 'image') {
              return (
                <div key={i} className="flex">
                  <img
                    src={t.imageUrl}
                    alt={`refined v${i}`}
                    onClick={() => onImageClick(t.imageUrl)}
                    className="rounded-lg border border-border shadow-md cursor-zoom-in max-w-full transition hover:shadow-lg"
                  />
                </div>
              );
            }
            if (t.kind === 'options') {
              return (
                <div key={i} className="space-y-2">
                  <div className="bg-muted text-foreground rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%] text-sm leading-relaxed inline-flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span>{t.message}</span>
                  </div>
                  <div className="space-y-2 ml-6">
                    {t.options.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => onPickOption(opt)}
                        disabled={busy}
                        className="text-left w-full rounded-lg border bg-background hover:bg-accent hover:border-primary/30 disabled:opacity-50 px-4 py-3 transition-colors"
                      >
                        <div className="font-medium text-sm">{opt.label}</div>
                        <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{opt.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    t.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  }`}
                >
                  {t.content}
                </div>
              </div>
            );
          })}
          {busy && (
            <div className="flex">
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-muted-foreground italic">
                Thinking…
              </div>
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="border-t flex items-end gap-2 px-6 pt-4">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder='Tell me what to change. ("Smaller rockets", "make it nighttime", or just "different vibe" — I’ll ask if I’m not sure.)'
            rows={2}
            className="resize-none"
            disabled={busy}
          />
          <Button onClick={() => void sendMessage(input)} disabled={busy || !input.trim()} size="icon" aria-label="Send">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
