import { useState, useRef, useEffect } from 'react';
import { Sparkles, ChevronDown, Check } from 'lucide-react';
import type { AssistantProvider } from '@/lib/assistant-types';

const OPTIONS: { value: AssistantProvider; label: string; sub: string; disabled?: boolean }[] = [
  { value: 'gemini', label: 'Gemini',  sub: 'Flash for ideas · Flash for prompt',     },
  { value: 'openai', label: 'OpenAI',  sub: '4o-mini for ideas · 4o for prompt',      },
  { value: 'claude', label: 'Claude',  sub: 'Coming soon', disabled: true             },
];

interface Props {
  value: AssistantProvider;
  onChange: (v: AssistantProvider) => void;
}

export function ModelSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = OPTIONS.find(o => o.value === value);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      window.addEventListener('mousedown', onClick);
      window.addEventListener('keydown', onKey);
    }
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="ax-btn-ghost"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Sparkles className="h-4 w-4" />
        {current?.label ?? 'Model'}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-2 w-[280px] rounded-xl border border-[var(--ax-card-edge)] bg-[var(--ax-bg)] shadow-2xl backdrop-blur-md z-30 overflow-hidden ax-fade-up"
          style={{ animationDuration: '180ms' }}
        >
          {OPTIONS.map(o => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value}
                disabled={o.disabled}
                onClick={() => {
                  if (o.disabled) return;
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`
                  w-full text-left px-4 py-3 flex items-start gap-3 transition-colors
                  ${o.disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-[rgba(212,178,106,0.08)] cursor-pointer'}
                  ${isSelected ? 'bg-[rgba(0,191,255,0.06)]' : ''}
                `}
              >
                <Check
                  className={`h-4 w-4 mt-0.5 shrink-0 transition-opacity ${
                    isSelected ? 'opacity-100 text-[var(--ax-cyan)]' : 'opacity-0'
                  }`}
                />
                <div>
                  <div className="text-sm font-medium text-[var(--ax-ink)]">{o.label}</div>
                  <div className="text-[11px] text-[var(--ax-ink-fade)] tracking-wide mt-0.5">{o.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
