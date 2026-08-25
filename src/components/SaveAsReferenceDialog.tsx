import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { BRANDS } from "@/types/prompt";
import { FormField } from "./FormField";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// The eight fields a reference row is made of, shown/saved in this order.
const REF_FIELD_KEYS = [
  'format_layout', 'primary_object', 'subject', 'lighting',
  'mood', 'background', 'positive_prompt', 'negative_prompt',
] as const;

// Human-readable labels for the eight dissected fields, shown in the same
// order as REF_FIELD_KEYS.
const REF_FIELD_LABELS: Record<typeof REF_FIELD_KEYS[number], string> = {
  format_layout: 'Format layout',
  primary_object: 'Primary object',
  subject: 'Subject',
  lighting: 'Lighting',
  mood: 'Mood',
  background: 'Background',
  positive_prompt: 'Positive prompt',
  negative_prompt: 'Negative prompt',
};

interface SaveAsReferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The prompt currently on screen, when there is one. Absent on the form
   *  screen, where nothing has been generated yet — the dialog then offers
   *  paste mode only. */
  generated?: {
    brand: string;
    category: string;
    fields: Record<typeof REF_FIELD_KEYS[number], string>;
  } | null;
  /** Called after a successful save so the caller can refresh its list. */
  onSaved: () => void;
}

// Save as New Reference dialog — reachable from the 💾 toolbar button on the
// results screen (with `generated` set, "From this prompt" is the default
// mode) and from the "Paste a finished prompt" entry point on the form
// screen (no `generated`, paste is the only mode). Two modes either way:
// "From this prompt" (saves the prompt already on screen) and "Paste a
// finished prompt" (paste something written elsewhere, e.g. in ChatGPT, and
// let /api/dissect-prompt split it into the eight fields, which are then
// editable before saving).
export function SaveAsReferenceDialog({ open, onOpenChange, generated, onSaved }: SaveAsReferenceDialogProps) {
  const [refTitle, setRefTitle] = useState('');
  const [isRefSaving, setIsRefSaving] = useState(false);
  const [refSaveError, setRefSaveError] = useState('');

  // Paste mode: save a prompt written elsewhere (e.g. in ChatGPT) as a
  // reference. The eight fields are extracted by /api/dissect-prompt and then
  // shown editable — a wrong field saved here is reused as if it were true,
  // so the user confirms before it lands.
  const [refMode, setRefMode] = useState<'generated' | 'paste'>(generated ? 'generated' : 'paste');
  const [pastedPrompt, setPastedPrompt] = useState('');
  const [pasteBrand, setPasteBrand] = useState<string>(generated?.brand || '');
  const [isDissecting, setIsDissecting] = useState(false);
  const [dissected, setDissected] = useState<Record<string, string> | null>(null);
  // What `dissected` was extracted FROM — the exact pasted text (trimmed, same
  // as what gets sent to the API) and brand at the moment Dissect last
  // succeeded. Used to detect when the user has since changed either one
  // without re-dissecting, so a save can't attach fields from an old prompt
  // to a title the user typed for a different one. See `dissectionStale`
  // below — we deliberately do NOT clear `dissected` on every keystroke,
  // because that would throw away hand-edited fields for a one-letter typo fix.
  const [dissectedFrom, setDissectedFrom] = useState<{ prompt: string; brand: string } | null>(null);

  // Reset ALL Save-as-Reference state whenever the dialog opens, not just the
  // title/error. Abandoning a paste-mode dissection (e.g. via Cancel) must not
  // leave it armed behind a Save button that the Title field's Enter-to-save
  // can trigger on the next open — that would silently save stale, wrong-brand
  // dissected fields as if they belonged to this prompt.
  useEffect(() => {
    if (!open) return;
    setRefTitle('');
    setRefSaveError('');
    // No "From this prompt" to offer when nothing has been generated yet
    // (the form-screen entry point) — paste is the only mode available then.
    setRefMode(generated ? 'generated' : 'paste');
    setPastedPrompt('');
    setDissected(null);
    setDissectedFrom(null);
    setPasteBrand(generated?.brand || '');
    // Only re-run when the dialog transitions open — not on every `generated`
    // prop change while it's already open (e.g. the prompt being edited
    // underneath), which would wipe out paste-mode progress mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDissect = async () => {
    if (!pastedPrompt.trim()) { setRefSaveError('Paste a prompt first.'); return; }
    if (!pasteBrand) { setRefSaveError('Pick a brand.'); return; }
    setIsDissecting(true);
    setRefSaveError('');
    try {
      const response = await fetch('/api/dissect-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Trimmed here so the text the model reads is exactly the text
        // `dissectedFrom` records below — otherwise adding a trailing newline
        // would read as a change and mark a fresh dissection stale.
        body: JSON.stringify({ prompt: pastedPrompt.trim(), brand: pasteBrand }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Dissect failed (${response.status}): ${detail}`);
      }
      const data = await response.json();
      setDissected(data.fields);
      // Record exactly what these fields came from, trimmed the same way the
      // request body was, so a later comparison in `dissectionStale` lines up.
      setDissectedFrom({ prompt: pastedPrompt.trim(), brand: pasteBrand });
    } catch (e) {
      // Leave pastedPrompt intact so it can be retried without re-pasting.
      // Note: on failure, `dissected`/`dissectedFrom` are untouched — if the
      // text hasn't changed since the last successful dissect, the old fields
      // are still an accurate match for it and saving them is still correct.
      setRefSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsDissecting(false);
    }
  };

  // Derived, not stored: true when the fields on screen were extracted from a
  // DIFFERENT pasted prompt or brand than what's currently in the boxes above.
  // This happens if the user edits the "Prompt text" box (or changes the
  // brand) after a successful Dissect but before clicking Dissect again —
  // saving in that state would attach the OLD text's fields to a title meant
  // for the NEW text. We deliberately don't clear `dissected` when the text
  // changes (that would destroy hand-edited fields for a trivial typo fix);
  // instead we detect the mismatch and disable Save until the user re-runs
  // Dissect. If the text is unchanged and a re-dissect fails, `dissectedFrom`
  // still matches, so this correctly leaves Save enabled — the fields still
  // describe the text on screen.
  const dissectionStale = !!dissected && !!dissectedFrom &&
    (pastedPrompt.trim() !== dissectedFrom.prompt || pasteBrand !== dissectedFrom.brand);

  const handleSaveAsRef = async () => {
    if (!refTitle.trim()) { setRefSaveError('Please enter a title.'); return; }
    // Brand drives the mandatory colour and style rules baked into every
    // saved field, so a missing brand blocks the save here directly — not
    // only transitively via the Dissect-requires-brand check above. A wrong
    // brand is worse than a wrong value in any other field.
    if (refMode === 'paste' && !pasteBrand) { setRefSaveError('Pick a brand before saving.'); return; }
    if (refMode === 'paste' && !dissected) { setRefSaveError('Dissect the prompt first.'); return; }
    // These two guards live HERE and not only on the Save button, because the
    // Title box saves on Enter too — and a disabled button does not stop a
    // keypress. Without them: paste prompt A, Dissect, replace the text with
    // prompt B, type a title, press Enter — and A's eight fields get saved
    // under B's title, silently. Every way of reaching a save has to pass the
    // same checks, so they belong in the function, not on one button.
    if (isDissecting) { setRefSaveError('Still dissecting — wait for it to finish.'); return; }
    if (refMode === 'paste' && dissectionStale) {
      setRefSaveError('The pasted text or brand changed since you dissected. Click Dissect again before saving.');
      return;
    }
    if (refMode === 'generated' && !generated) return;
    setIsRefSaving(true);
    setRefSaveError('');
    try {
      // Paste mode sends the (possibly edited) dissected fields and no
      // category — a pasted prompt has none, so the handler stores null.
      const body = refMode === 'paste'
        ? {
            title:           refTitle.trim(),
            brand_name:      pasteBrand,
            prompt_category: null,
            ...Object.fromEntries(REF_FIELD_KEYS.map(k => [k, dissected![k] || ''])),
          }
        : {
            title:           refTitle.trim(),
            brand_name:      generated!.brand,
            prompt_category: generated!.category,
            format_layout:   generated!.fields.format_layout,
            primary_object:  generated!.fields.primary_object,
            subject:         generated!.fields.subject,
            lighting:        generated!.fields.lighting,
            mood:            generated!.fields.mood,
            background:      generated!.fields.background,
            positive_prompt: generated!.fields.positive_prompt,
            negative_prompt: generated!.fields.negative_prompt,
          };

      const response = await fetch('/api/save-as-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        // Match handleDissect's approach: read the body so a real reason
        // (bad brand name, Supabase error, etc.) reaches the user instead of
        // a fixed, undiagnosable message.
        const detail = await response.text();
        throw new Error(`Failed to save reference (${response.status}): ${detail}`);
      }
      onOpenChange(false);
      onSaved();
      toast.success('Saved as new reference');
    } catch (err) {
      console.error('Error saving reference:', err);
      // Fall back to a generic message only if the error truly has nothing
      // useful to show (e.g. some non-Error throw with no text).
      setRefSaveError(err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsRefSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* max-h-[90vh] + flex flex-col caps the dialog to the viewport and lets
          the body below scroll instead of overflowing top and bottom — this
          repo's DialogContent has no height cap of its own (see dialog.tsx),
          and this repo's Textarea grows to fit its full content (autoResize),
          so without this a long pasted prompt used to push the Save button
          (and even the Title field) off-screen with no way to scroll to it.
          Same pattern as CreateBlendedPromptDialog. */}
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Save as New Reference</DialogTitle>
        </DialogHeader>

        {/* Everything that can grow tall lives in this one scrolling box.
            DialogHeader and DialogFooter stay OUTSIDE it, so Cancel/Save
            (and the title above) are always on screen no matter how long
            the pasted prompt is or how far the user has scrolled. */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          {/* Mode switch — only offered when there's a generated prompt on
              screen to save "as is". On the form screen (generated is
              null/absent) there's nothing to offer here, so paste is the
              only mode and showing a dead button would be worse than none. */}
          {generated && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={refMode === 'generated' ? "default" : "outline"}
                size="sm"
                onClick={() => { setRefMode('generated'); setRefSaveError(''); }}
                className={refMode === 'generated' ? "gradient-primary" : ""}
                disabled={isRefSaving || isDissecting}
              >
                From this prompt
              </Button>
              <Button
                type="button"
                variant={refMode === 'paste' ? "default" : "outline"}
                size="sm"
                onClick={() => { setRefMode('paste'); setRefSaveError(''); }}
                className={refMode === 'paste' ? "gradient-primary" : ""}
                disabled={isRefSaving || isDissecting}
              >
                Paste a finished prompt
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ref-title">Title</Label>
            <Input
              id="ref-title"
              placeholder="e.g. Neon Warrior"
              value={refTitle}
              onChange={(e) => { setRefTitle(e.target.value); setRefSaveError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveAsRef()}
              disabled={isRefSaving}
              autoFocus
            />
          </div>

          {/* Paste mode: textarea + brand picker + Dissect button, then the
              eight extracted fields shown editable once dissection succeeds. */}
          {refMode === 'paste' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="paste-prompt">Prompt text</Label>
                <Textarea
                  id="paste-prompt"
                  placeholder="Paste the full prompt you want to save…"
                  value={pastedPrompt}
                  onChange={(e) => { setPastedPrompt(e.target.value); setRefSaveError(''); }}
                  rows={8}
                  // Without this the box ignores `rows` and grows to fit the
                  // whole pasted prompt (this component's default behaviour) —
                  // autoResize={false} makes it a fixed-height box that
                  // scrolls internally instead, which is what makes the
                  // max-h-[90vh] fix above actually work.
                  autoResize={false}
                  disabled={isDissecting || isRefSaving}
                />
              </div>

              <FormField
                type="select"
                label="Brand"
                required
                options={[...BRANDS]}
                value={pasteBrand}
                onChange={setPasteBrand}
                placeholder="Select a brand"
                disabled={isDissecting || isRefSaving}
              />

              <Button
                type="button"
                variant="outline"
                onClick={handleDissect}
                disabled={isDissecting || !pastedPrompt.trim()}
              >
                {isDissecting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Dissecting…</> : 'Dissect'}
              </Button>

              {/* Shown when the text or brand above no longer matches what the
                  fields below were extracted from (edited after Dissect ran).
                  Save is disabled in this state — see dissectionStale — so this
                  message is what tells the beginner user WHY the button went
                  dead, instead of it just looking broken. */}
              {dissectionStale && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  You changed the pasted text or brand after dissecting, so the fields below are from the old version. Click Dissect again to refresh them — Save is turned off until you do.
                </p>
              )}

              {/* Editable once dissected — a wrong field saved here is reused
                  as if it were true, so the user reviews before saving.
                  Disabled during a re-dissect too: an edit made here while a
                  new Dissect call is in flight would otherwise be silently
                  overwritten the moment that call resolves. */}
              {dissected && (
                <div className="space-y-4">
                  {REF_FIELD_KEYS.map((key) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={`dissected-${key}`}>{REF_FIELD_LABELS[key]}</Label>
                      <Textarea
                        id={`dissected-${key}`}
                        value={dissected[key] || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDissected(d => ({ ...d!, [key]: value }));
                        }}
                        rows={key === 'positive_prompt' ? 4 : 2}
                        // Same reason as the "Prompt text" box above: without
                        // this, each field ignores `rows` and grows to fit its
                        // full content instead of scrolling internally.
                        autoResize={false}
                        disabled={isRefSaving || isDissecting}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pinned outside the scroll area, right above the buttons, so it's
            visible no matter where the user has scrolled. Shown in both
            modes — one render covers a title error just as well as a paste/
            dissect/save error. Capped and scrollable: this sits OUTSIDE the
            scrolling body so it is always visible, which also means a very
            long message (a server returning a whole HTML error page, say)
            would push the footer back off screen — the exact bug this
            dialog's max-h fixes. */}
        {refSaveError && <p className="text-sm text-destructive max-h-24 overflow-y-auto">{refSaveError}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRefSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveAsRef}
            disabled={isRefSaving || isDissecting || (refMode === 'paste' && (!dissected || dissectionStale))}
          >
            {isRefSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
