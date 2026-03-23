import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import type { ReferenceOption, ReferencePromptData } from '@/types/prompt';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const CATEGORIES = ['Casino - Promotions', 'Sports- Promotions'];

interface CreateBlendedPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand: string;
  // All references for the current brand (already filtered by parent)
  references: ReferenceOption[];
  // Looks up the Airtable record ID for a given prompt name + brand
  getRecordId: (promptName: string, brand: string) => string;
  // Called after a successful save so the parent can refresh its dropdown
  onSaved: () => void;
}

// Labels shown in the result preview, matching the field names from the API
const RESULT_FIELD_LABELS: Array<{ key: keyof ReferencePromptData; label: string }> = [
  { key: 'format_layout',   label: 'Format Layout' },
  { key: 'primary_object',  label: 'Primary Object' },
  { key: 'subject',         label: 'Subject' },
  { key: 'lighting',        label: 'Lighting' },
  { key: 'mood',            label: 'Mood' },
  { key: 'background',      label: 'Background' },
  { key: 'positive_prompt', label: 'Positive Prompt' },
  { key: 'negative_prompt', label: 'Negative Prompt' },
];

export function CreateBlendedPromptDialog({
  open,
  onOpenChange,
  brand,
  references,
  getRecordId,
  onSaved,
}: CreateBlendedPromptDialogProps) {
  // 'select' = step 1 (checkbox list), 'result' = step 2 (preview + save)
  const [step, setStep] = useState<'select' | 'result'>('select');

  // Which reference prompt_names the user has checked
  const [selectedNames, setSelectedNames] = useState<string[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedData, setGeneratedData] = useState<ReferencePromptData | null>(null);

  // Name and category the user sets before saving the new reference
  const [promptName, setPromptName] = useState('');
  const [promptCategory, setPromptCategory] = useState('Casino - Promotions');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset everything when the dialog closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStep('select');
      setSelectedNames([]);
      setGeneratedData(null);
      setPromptName('');
      setPromptCategory('Casino - Promotions');
      setError('');
    }
    onOpenChange(nextOpen);
  };

  // Toggle a single checkbox
  const toggleReference = (id: string) => {
    setSelectedNames(prev =>
      prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id],
    );
  };

  // Step 1 → call n8n to blend selected references into a new prompt
  const handleGenerate = async () => {
    if (selectedNames.length < 2) return;

    setIsGenerating(true);
    setError('');

    try {
      // Fetch each reference's positive_prompt one at a time (sequential, not parallel).
      // Parallel calls can hit Airtable's rate limit when many references are selected.
      const fetchedReferences: { name: string; positive_prompt: string }[] = [];
      for (const name of selectedNames) {
        const recordId = getRecordId(name, brand);
        if (!recordId) {
          throw new Error(`Could not find record ID for "${name}". Try refreshing the page.`);
        }
        const res = await fetch('/api/get-prompt-by-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recordId }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`Failed to load "${name}": ${errData.details || res.status}`);
        }
        const data = await res.json();
        fetchedReferences.push({
          name,
          positive_prompt: data.positive_prompt ?? '',
        });
      }

      // Send the positive_prompts directly to n8n — no Airtable lookup needed there
      const response = await fetch('/api/create-blended-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, references: fetchedReferences }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || `Server error ${response.status}`);
      }

      const result = await response.json();

      // n8n may return an array — extract the first element
      const data = Array.isArray(result) ? result[0] : result;

      // n8n returns the full set of fields directly
      setGeneratedData({
        format_layout:   data.format_layout   ?? '',
        primary_object:  data.primary_object  ?? '',
        subject:         data.subject         ?? '',
        lighting:        data.lighting        ?? '',
        mood:            data.mood            ?? '',
        background:      data.background      ?? '',
        positive_prompt: data.positive_prompt ?? '',
        negative_prompt: data.negative_prompt ?? '',
      });

      setStep('result');
    } catch (err) {
      console.error('Error generating blended prompt:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Step 2 → save the generated data to Airtable as a new reference
  const handleSave = async () => {
    if (!promptName.trim()) {
      setError('Please enter a name for the new reference.');
      return;
    }
    if (!generatedData) return;

    setIsSaving(true);
    setError('');

    try {
      const response = await fetch('/api/save-as-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:          generatedData.positive_prompt
                            ? `${promptName.trim()} — ${generatedData.positive_prompt.slice(0, 100).trim()}`
                            : promptName.trim(),
          brand_name:     brand,
          prompt_category: promptCategory,
          ...generatedData,
        }),
      });

      if (!response.ok) throw new Error('Failed to save reference');

      toast.success('New reference saved successfully');
      onSaved();          // Refresh the parent dropdown
      handleOpenChange(false); // Close and reset
    } catch (err) {
      console.error('Error saving blended prompt:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const canGenerate = selectedNames.length >= 2;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">

        {/* ── STEP 1: Reference selection ── */}
        {step === 'select' && (
          <>
            <DialogHeader>
              <DialogTitle>Create New Prompt from References</DialogTitle>
              <p className="text-sm text-muted-foreground pt-1">
                Select 2 or more references for <span className="font-medium text-foreground">{brand}</span> — GPT will blend them into a completely new unique prompt.
              </p>
            </DialogHeader>

            {/* Scrollable checkbox list */}
            <div className="flex-1 overflow-y-auto min-h-0 border rounded-md divide-y divide-border">
              {references.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  No references found for this brand.
                </p>
              ) : (
                references.map(ref => (
                  <label
                    key={ref.id}
                    className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    <Checkbox
                      checked={selectedNames.includes(ref.id)}
                      onCheckedChange={() => toggleReference(ref.id)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">{ref.label}</p>
                      {ref.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {ref.description}
                        </p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter className="flex items-center justify-between gap-2 pt-2">
              <span className="text-xs text-muted-foreground">
                {selectedNames.length} selected{selectedNames.length < 2 ? ' (need at least 2)' : ''}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isGenerating}>
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate || isGenerating}
                  className="gap-2"
                >
                  {isGenerating
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</>
                    : <><Sparkles className="h-4 w-4" />Generate</>
                  }
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {/* ── STEP 2: Result preview + save ── */}
        {step === 'result' && generatedData && (
          <>
            <DialogHeader>
              <DialogTitle>New Prompt Generated</DialogTitle>
              <p className="text-sm text-muted-foreground pt-1">
                Review the result below, then give it a name and save it as a new reference.
              </p>
            </DialogHeader>

            {/* Scrollable generated fields */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">
              {RESULT_FIELD_LABELS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
                  <Textarea
                    value={generatedData[key]}
                    readOnly
                    className="text-sm bg-muted/30 border-border/50 min-h-[50px] resize-none"
                  />
                </div>
              ))}

              {/* Name + Category inputs */}
              <div className="space-y-3 pt-1 border-t border-border">
                <div className="space-y-1">
                  <Label htmlFor="blended-prompt-name" className="text-xs font-medium">
                    Name for this reference <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="blended-prompt-name"
                    value={promptName}
                    onChange={e => { setPromptName(e.target.value); setError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    placeholder="e.g. Neon Dragon Vault"
                    disabled={isSaving}
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Category</Label>
                  <Select value={promptCategory} onValueChange={setPromptCategory} disabled={isSaving}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => { setStep('select'); setError(''); }}
                disabled={isSaving}
              >
                Back
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !promptName.trim()} className="gap-2">
                {isSaving
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</>
                  : 'Save Reference'
                }
              </Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
