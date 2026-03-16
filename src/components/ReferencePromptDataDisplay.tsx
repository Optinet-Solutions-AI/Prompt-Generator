import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react';

import type { ReferencePromptData } from '@/types/prompt';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';

interface ReferencePromptDataDisplayProps {
  data: ReferencePromptData | null;
  isLoading: boolean;
  disabled?: boolean;
  brand?: string;
  category?: string;
  onChange?: (field: keyof ReferencePromptData, value: string) => void;
  onSaved?: () => void;
}

// Fields that have a regenerate icon next to their label.
// Subject/lighting/mood/background regenerate their own descriptions.
// positive_prompt regenerates the full prompt using all current field values.
const REGENERABLE_FIELDS = ['subject', 'lighting', 'mood', 'background', 'positive_prompt'] as const;
type RegenerableField = typeof REGENERABLE_FIELDS[number];

const FIELD_LABELS: Record<keyof ReferencePromptData, string> = {
  format_layout: 'Format Layout',
  primary_object: 'Primary Object',
  subject: 'Subject',
  lighting: 'Lighting',
  mood: 'Mood',
  background: 'Background',
  positive_prompt: 'Positive Prompt',
  negative_prompt: 'Negative Prompt',
};

export function ReferencePromptDataDisplay({ data, isLoading, disabled, brand, category, onChange, onSaved }: ReferencePromptDataDisplayProps) {
  const [open, setOpen] = useState(false);
  const [regeneratingField, setRegeneratingField] = useState<RegenerableField | null>(null);
  const [isRegeneratingAll, setIsRegeneratingAll] = useState(false);

  // Temperature controls how creative/random the GPT output is.
  // 0 = very predictable, 1 = default balanced, 2 = very creative/random.
  const [temperature, setTemperature] = useState(1.0);

  // Per-field instruction text — user types what they want GPT to focus on when regenerating that field
  const [fieldInstructions, setFieldInstructions] = useState<Partial<Record<RegenerableField, string>>>({});

  // Global direction — applies to ALL fields during Regenerate All (and single-field regeneration)
  const [globalInstruction, setGlobalInstruction] = useState('');

  // Regenerate a single field (called by the icon button next to the label)
  const handleRegenerate = async (field: RegenerableField) => {
    if (!data || !onChange) return;

    setRegeneratingField(field);

    try {
      const response = await fetch('/api/regenerate-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field,
          brand,
          category,
          temperature,
          instruction:        fieldInstructions[field] || '',
          globalInstruction:  globalInstruction.trim(),
          format_layout:   data.format_layout,
          primary_object:  data.primary_object,
          subject:         data.subject,
          lighting:        data.lighting,
          mood:            data.mood,
          background:      data.background,
          positive_prompt: data.positive_prompt,
        }),
      });

      if (!response.ok) throw new Error('Failed to regenerate field');

      const result = await response.json();
      if (result.value) {
        onChange(field, result.value);
      }
    } catch (error) {
      console.error('Error regenerating field:', error);
    } finally {
      setRegeneratingField(null);
    }
  };

  // Regenerate all fields — fires 4 parallel calls for descriptions, then 1 final call
  // to rebuild positive_prompt using the fresh description values.
  const handleRegenerateAll = async () => {
    if (!data || !onChange) return;

    setIsRegeneratingAll(true);

    try {
      const makeCall = (field: RegenerableField) =>
        fetch('/api/regenerate-reference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field,
            brand,
            category,
            temperature,
            instruction:        fieldInstructions[field] || '',
            globalInstruction:  globalInstruction.trim(),
            format_layout:   data.format_layout,
            primary_object:  data.primary_object,
            subject:         data.subject,
            lighting:        data.lighting,
            mood:            data.mood,
            background:      data.background,
            positive_prompt: data.positive_prompt,
          }),
        }).then(r => r.ok ? r.json() : null);

      // Step 1: Fire all four description fields in parallel
      const [subjectResult, lightingResult, moodResult, backgroundResult] = await Promise.all([
        makeCall('subject'),
        makeCall('lighting'),
        makeCall('mood'),
        makeCall('background'),
      ]);

      // Apply the new description values
      if (subjectResult?.value)    onChange('subject',    subjectResult.value);
      if (lightingResult?.value)   onChange('lighting',   lightingResult.value);
      if (moodResult?.value)       onChange('mood',       moodResult.value);
      if (backgroundResult?.value) onChange('background', backgroundResult.value);

      // Step 2: Regenerate positive_prompt using the freshly updated field values
      // so the final prompt reflects all the new descriptions above.
      const positivePromptResult = await fetch('/api/regenerate-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: 'positive_prompt',
          brand,
          category,
          temperature,
          instruction:        fieldInstructions['positive_prompt'] || '',
          globalInstruction:  globalInstruction.trim(),
          format_layout:   data.format_layout,
          primary_object:  data.primary_object,
          subject:         subjectResult?.value    ?? data.subject,
          lighting:        lightingResult?.value   ?? data.lighting,
          mood:            moodResult?.value       ?? data.mood,
          background:      backgroundResult?.value ?? data.background,
          positive_prompt: data.positive_prompt,
        }),
      }).then(r => r.ok ? r.json() : null);

      if (positivePromptResult?.value) onChange('positive_prompt', positivePromptResult.value);
    } catch (error) {
      console.error('Error regenerating all:', error);
    } finally {
      setIsRegeneratingAll(false);
    }
  };

  useEffect(() => {
    // While loading a new reference, keep the section closed so stale data doesn't flash.
    if (isLoading) setOpen(false);
  }, [isLoading]);

  const fieldKeys = useMemo(
    () => Object.keys(FIELD_LABELS) as Array<keyof ReferencePromptData>,
    [],
  );

  const anyBusy = !!regeneratingField || isRegeneratingAll || !!disabled;

  const shouldRender = isLoading || !!data;
  if (!shouldRender) return null;

  return (
    <div className="space-y-4 mt-6 pt-6 border-t border-border">
      <Collapsible open={open} onOpenChange={setOpen} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Reference Prompt Data
          </h4>

          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isLoading}
              className="gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </>
              ) : (
                <>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
                  {open ? 'Hide' : 'Show'}
                </>
              )}
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          {data ? (
            <div className="grid gap-4">
              {/* Top action bar */}
              {onChange && (
                <div className="space-y-3">
                  {/* Global direction — applies to all fields during Regenerate All */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Overall direction for all fields (optional)
                    </label>
                    <input
                      type="text"
                      value={globalInstruction}
                      onChange={e => setGlobalInstruction(e.target.value)}
                      placeholder="e.g. 'Christmas themed', 'Dark neon cyberpunk', 'Wild West style'..."
                      disabled={anyBusy}
                      className="w-full text-xs px-2 py-1.5 rounded-md border border-border/50 bg-muted/20 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={anyBusy}
                    onClick={handleRegenerateAll}
                    className="h-7 px-3 text-xs gap-1.5"
                  >
                    {isRegeneratingAll
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <RefreshCw className="h-3 w-3" />
                    }
                    Regenerate All
                  </Button>

                  {/* Temperature slider — controls GPT creativity for regeneration */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Creativity</Label>
                      <span className="text-xs font-mono text-muted-foreground">{temperature.toFixed(1)}</span>
                    </div>
                    <Slider
                      min={0}
                      max={2}
                      step={0.1}
                      value={[temperature]}
                      onValueChange={([val]) => setTemperature(val)}
                      disabled={anyBusy}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground/60">
                      <span>Predictable</span>
                      <span>Creative</span>
                    </div>
                  </div>
                </div>
              )}

              {fieldKeys.map((key) => {
                const value = data[key] ?? '';
                const isRegenerableField = (REGENERABLE_FIELDS as readonly string[]).includes(key);
                const isThisFieldRegenerating = regeneratingField === key;
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        {FIELD_LABELS[key] || key}
                      </Label>
                      {isRegenerableField && onChange && (
                        <button
                          type="button"
                          disabled={anyBusy}
                          onClick={() => handleRegenerate(key as RegenerableField)}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                          title={`Regenerate ${FIELD_LABELS[key]}`}
                        >
                          {isThisFieldRegenerating
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <RefreshCw className="h-3 w-3" />
                          }
                        </button>
                      )}
                    </div>
                    {/* Optional instruction input — only for regeneratable fields */}
                    {isRegenerableField && onChange && (
                      <input
                        type="text"
                        value={fieldInstructions[key as RegenerableField] || ''}
                        onChange={(e) => setFieldInstructions(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={key === 'background'
                          ? "Instruction — e.g. 'dark casino floor matching the subject', 'outdoor stadium at night'"
                          : `Instruction (optional) — e.g. describe what you want for ${FIELD_LABELS[key].toLowerCase()}`
                        }
                        disabled={!!disabled || anyBusy}
                        className="w-full text-xs px-2 py-1.5 rounded-md border border-border/50 bg-muted/20 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    )}
                    <Textarea
                      value={value}
                      onChange={(e) => onChange?.(key, e.target.value)}
                      readOnly={!onChange || !!disabled}
                      disabled={!!disabled || isThisFieldRegenerating || isRegeneratingAll}
                      className="text-sm bg-muted/30 border-border/50 min-h-[60px]"
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>

    </div>
  );
}
