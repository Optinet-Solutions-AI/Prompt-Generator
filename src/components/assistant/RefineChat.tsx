import { useState, useRef, useEffect } from 'react';
import { Send, RotateCw } from 'lucide-react';
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
        token,
        brand,
        currentFields: fields,
        chatHistory: historyForApi,
        userMessage,
        model,
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
          { kind: 'text', role: 'assistant', content: 'Same brief, fresh roll.' },
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
    <section className="ax-card overflow-hidden">
      {/* Header — director's slate */}
      <header className="flex items-center gap-3 border-b border-[var(--ax-line)] px-6 py-4">
        <div className="ax-reactor" style={{ width: 18, height: 18 }} aria-hidden />
        <div className="flex-1">
          <span className="ax-eyebrow" style={{ fontSize: 10 }}>The shoot</span>
          <h3 className="text-sm font-medium text-[var(--ax-ink)] mt-0.5">Refine in chat</h3>
        </div>
        <button
          onClick={onRegenSame}
          disabled={busy}
          className="ax-btn-ghost"
          title="Re-roll with the same brief"
        >
          <RotateCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          Re-roll
        </button>
      </header>

      {/* Chat body */}
      <div ref={scrollRef} className="ax-chat px-6 py-6 max-h-[640px] overflow-y-auto">
        {turns.map((t, i) => {
          if (t.kind === 'image') {
            return (
              <div
                key={i}
                className="ax-image-frame ax-fade-up self-stretch"
                onClick={() => onImageClick(t.imageUrl)}
                role="button"
                tabIndex={0}
              >
                <span className="ax-image-corner tl" aria-hidden />
                <span className="ax-image-corner tr" aria-hidden />
                <span className="ax-image-corner bl" aria-hidden />
                <span className="ax-image-corner br" aria-hidden />
                <img src={t.imageUrl} alt={`Generated frame v${i}`} />
              </div>
            );
          }
          if (t.kind === 'options') {
            return (
              <div key={i} className="ax-fade-up space-y-3">
                <div className="ax-bubble-ai">{t.message}</div>
                <div className="space-y-2 pl-3">
                  {t.options.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => onPickOption(opt)}
                      disabled={busy}
                      className="ax-option-chip"
                    >
                      <span className="ax-option-label">{opt.label}</span>
                      <span className="ax-option-desc">{opt.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          return (
            <div
              key={i}
              className={`ax-fade-up ${t.role === 'user' ? 'self-end' : 'self-start'}`}
              style={{ alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start' }}
            >
              <div className={t.role === 'user' ? 'ax-bubble-user' : 'ax-bubble-ai'}>
                {t.content}
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="self-start ax-bubble-ai">
            <span className="ax-thinking">
              <span className="ax-thinking-dot" />
              <span className="ax-thinking-dot" />
              <span className="ax-thinking-dot" />
              Composing…
            </span>
          </div>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--ax-line)] px-6 py-4 flex items-end gap-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder='Tell me what to change. "Put him on a beach", "more dramatic", "shrink the rockets"…'
          rows={2}
          className="ax-textarea"
          disabled={busy}
          style={{ minHeight: 56 }}
        />
        <button
          onClick={() => void sendMessage(input)}
          disabled={busy || !input.trim()}
          className="ax-btn-primary"
          style={{ padding: '14px 18px' }}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
