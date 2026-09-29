/**
 * VideoGenerator — the "Video" tab: brand → UGC style → settings → Generate.
 *
 * Mirrors the image flow, with video-specific settings:
 *  - no subject-position slider (the creator moves in a video)
 *  - aspect ratio defaults to vertical 9:16 (UGC is watched on phones)
 *  - duration, audio on/off, and an optional starting image
 */
import { useRef, type ReactNode } from 'react';
import { BadgeCheck, CheckCircle2, Circle, Clapperboard, Coins, Heart, ImagePlus, Link2, Loader2, LogOut, Pencil, RotateCcw, Sparkles, Trash2, Video, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/FormField';
import { BRANDS } from '@/types/prompt';
import { UGC_STYLES, VIDEO_ASPECT_RATIOS, VIDEO_DURATIONS, VIDEO_MODELS, speechFit } from '@/lib/ugc-video';
import { findIndustry } from '@/lib/ugc-industries';
import { CustomBusinessPanel } from './CustomBusinessPanel';
import { videoApi } from '@/lib/video-api';
import type { useVideoGenerator } from '@/hooks/useVideoGenerator';

type VideoState = ReturnType<typeof useVideoGenerator>;

const MAX_START_IMAGE_BYTES = 3 * 1024 * 1024; // keeps the request under Vercel's 4.5 MB body limit

/** Small segmented control used for ratio + duration. */
function Pills<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={[
            'px-3 py-2 rounded-lg border text-left transition-all',
            value === o.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40',
          ].join(' ')}
        >
          <div className="text-sm font-medium">{o.label}</div>
          {o.hint && <div className="text-[11px] text-muted-foreground">{o.hint}</div>}
        </button>
      ))}
    </div>
  );
}

/** Numbered section heading — guides the user through the form top to bottom. */
function Step({ n, title, hint, right }: { n: number; title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 pt-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground leading-6">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

/**
 * The TEAM Higgsfield connection — one account every user renders with.
 * Everyone sees its status; only admins get Connect / Disconnect.
 */
function ConnectionCard({ state }: { state: VideoState }) {
  const { connection, connect, disconnectHf } = state;
  if (connection.loading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />Checking Higgsfield connection…
      </div>
    );
  }
  if (connection.connected) {
    return (
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5">
        <BadgeCheck className="w-5 h-5 text-primary shrink-0" />
        <div className="text-sm min-w-0">
          <p className="font-medium text-foreground">Higgsfield connected · team account</p>
          <p className="text-xs text-muted-foreground truncate">
            {connection.canManage && connection.email ? `${connection.email} · ` : ''}videos use the team's Higgsfield plan credits
          </p>
        </div>
        {connection.canManage && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={disconnectHf}>
            <LogOut className="w-4 h-4 mr-1" />Disconnect
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-dashed border-primary/40 bg-primary/5">
      <Link2 className="w-5 h-5 text-primary shrink-0" />
      <div className="text-sm min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {connection.canManage ? 'Connect the team Higgsfield account' : 'Video generation is not set up yet'}
        </p>
        <p className="text-xs text-muted-foreground">
          {connection.canManage
            ? 'One-time sign-in. Everyone in the app will make videos with this account.'
            : 'An admin needs to connect the team Higgsfield account. Please let them know.'}
        </p>
        {connection.error && <p className="text-xs text-destructive mt-1">{connection.error}</p>}
      </div>
      {connection.canManage && (
        <Button onClick={connect} className="gradient-primary"><Link2 className="w-4 h-4 mr-1" />Connect Higgsfield</Button>
      )}
    </div>
  );
}

export function VideoGenerator({ state, onOpenLibrary }: { state: VideoState; onOpenLibrary: () => void }) {
  const { form, setField, applyStyle, setMode, applyIndustryStyle, writeScript, writing, prompt, promptEdited, editPrompt, rebuildPrompt, connection, cost,
    appState, statusText, elapsed, error, result, generate, cancel, backToEdit, clear, markLiked } = state;
  const fileInput = useRef<HTMLInputElement>(null);

  const onPickImage = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_START_IMAGE_BYTES) { toast.error('Start image must be under 3 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setField('startImage', String(reader.result));
    reader.readAsDataURL(file);
  };

  const toggleLike = async () => {
    const saved = result?.saved;
    if (!saved) return;
    try {
      if (saved.liked) await videoApi.unlike(saved.id); else await videoApi.like(saved);
      markLiked(!saved.liked);
      toast.success(saved.liked ? 'Removed from favorites' : 'Added to favorites');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update favorites');
    }
  };

  // ── Rendering ──────────────────────────────────────────────────────────
  if (appState === 'RENDERING') {
    return (
      <div className="flex flex-col items-center text-center py-12 gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <div>
          <p className="font-semibold text-foreground">{statusText}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {elapsed}s elapsed · videos usually take 1–5 minutes. You can leave this tab open.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={cancel}><X className="w-4 h-4 mr-1" />Stop waiting</Button>
      </div>
    );
  }

  // ── Result ─────────────────────────────────────────────────────────────
  if (appState === 'RESULT' && result) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">Your UGC video · {form.mode === 'custom' ? form.custom.name : form.brand}</h2>
        </div>
        <div className="flex justify-center bg-muted/40 rounded-xl p-3">
          <video key={result.previewUrl} src={result.previewUrl} controls autoPlay loop playsInline className="max-h-[520px] rounded-lg" />
        </div>
        <p className="text-xs text-muted-foreground">
          {result.saving
            ? (form.brandLogo || form.brandEndCard
              ? 'Adding the brand logo and saving to the Video Library…'
              : 'Saving to the Video Library…')
            : result.saveError
              ? `⚠ Not saved to Drive: ${result.saveError}`
              : result.brandError
                ? `✓ Saved to the Video Library — but the logo couldn't be added (${result.brandError}).`
                : '✓ Saved to the Video Library (Google Drive).'}
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Prompt used</summary>
          <p className="mt-2 p-3 rounded-lg bg-muted/40 whitespace-pre-wrap">{prompt}</p>
        </details>
        <div className="flex flex-wrap gap-2">
          <Button onClick={backToEdit}><Pencil className="w-4 h-4 mr-1" />Edit &amp; regenerate</Button>
          <Button variant="outline" onClick={generate}><RotateCcw className="w-4 h-4 mr-1" />Generate again</Button>
          <Button variant="outline" onClick={toggleLike} disabled={!result.saved}>
            <Heart className={`w-4 h-4 mr-1 ${result.saved?.liked ? 'fill-red-500 text-red-500' : ''}`} />
            {result.saved?.liked ? 'Favorited' : 'Favorite'}
          </Button>
          <Button variant="outline" onClick={onOpenLibrary}><Clapperboard className="w-4 h-4 mr-1" />Video Library</Button>
          <Button variant="ghost" onClick={clear}><Trash2 className="w-4 h-4 mr-1" />New video</Button>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <ConnectionCard state={state} />

      {error && (
        <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive">{error}</div>
      )}

      {/* Mode: one of our brands, or any business (e.g. a dental clinic) */}
      <Step n={1} title="Who is this video for?" hint="One of our brands, or any business — e.g. a dental clinic." />
      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted/60 border border-border">
          {([['brand', 'Our brands', 'Roosterbet, SpinJo, …'], ['custom', 'Custom business', 'Any company or niche']] as const).map(([m, label, hint]) => (
            <button key={m} type="button" onClick={() => form.mode !== m && setMode(m)}
              className={`rounded-lg px-3 py-2 text-left transition-all ${form.mode === m ? 'bg-card shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-[11px] text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      {form.mode === 'brand' ? (
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField
            type="select" label="Brand" required
            options={[...BRANDS]} value={form.brand}
            onChange={v => setField('brand', v)} placeholder="Select a brand"
          />
          <FormField
            type="select" label="UGC Style"
            options={UGC_STYLES.map(s => `${s.emoji} ${s.label}`)}
            value={(() => { const s = UGC_STYLES.find(x => x.id === form.styleId); return s ? `${s.emoji} ${s.label}` : ''; })()}
            onChange={v => { const s = UGC_STYLES.find(x => `${x.emoji} ${x.label}` === v); if (s) applyStyle(s.id); }}
            placeholder="Pick a UGC style"
          />
        </div>
      ) : (
        <>
          <CustomBusinessPanel state={state} />
          {(() => {
            // Formats written for THIS business by its website research come first (★).
            const own = new Set(form.custom.presets.map(p => p.id));
            const styles = [...form.custom.presets, ...(findIndustry(form.custom.industry)?.styles || [])];
            const label = (x: { id: string; emoji: string; label: string }) => `${own.has(x.id) ? '★ ' : ''}${x.emoji} ${x.label}`;
            return (
              <FormField
                type="select" label={`UGC Style — what works for ${findIndustry(form.custom.industry)?.label.toLowerCase() || 'this business'}`}
                options={styles.map(label)}
                value={(() => { const st = styles.find(x => x.id === form.styleId); return st ? label(st) : ''; })()}
                onChange={v => { const st = styles.find(x => label(x) === v); if (st) applyIndustryStyle(st.id); }}
                placeholder="Pick a format (fills everything below)"
              />
            );
          })()}
        </>
      )}

      {/* Structured prompt fields — pre-filled by the style, all editable */}
      <Step n={2} title="The scene"
        hint={form.mode === 'custom' ? 'Your format filled this in — edit anything, or let the AI write it for this business.' : 'Your UGC style filled this in — edit anything.'}
        right={form.mode === 'custom' ? (
          <Button type="button" variant="outline" size="sm" onClick={writeScript} disabled={writing || !form.custom.name.trim()}>
            {writing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
            {writing ? 'Writing…' : 'Write it for me'}
          </Button>
        ) : undefined} />
      <div className="grid sm:grid-cols-2 gap-4">
        <FormField type="textarea" label="Creator" rows={2} value={form.creator}
          onChange={v => setField('creator', v)} placeholder="Who is on camera?" />
        <FormField type="textarea" label="Setting" rows={2} value={form.setting}
          onChange={v => setField('setting', v)} placeholder="Where are they?" />
        <FormField type="textarea" label="Action" rows={2} value={form.action}
          onChange={v => setField('action', v)} placeholder="What happens in the clip?" />
        <FormField type="textarea" label="Camera" rows={2} value={form.camera}
          onChange={v => setField('camera', v)} placeholder="How is it filmed?" />
      </div>

      {/* Step 3 — the words: spoken line (timed) + on-screen hook */}
      <Step n={3} title="What they say & the on-screen hook" hint="Short beats long: a 5-second clip fits about 8 spoken words." />
      {form.audio ? (() => {
        const fit = speechFit(form.dialogue, form.duration);
        return (
          <div className="space-y-1.5">
            <FormField type="text" label="What they say (optional)" value={form.dialogue} maxLength={200}
              onChange={v => setField('dialogue', v)} placeholder='e.g. "No way… I actually won!"' />
            {fit.words > 0 && (
              fit.fits ? (
                <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />~{fit.seconds}s of speech ({fit.words} words) — fits in {form.duration} seconds
                </p>
              ) : (
                <p className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                  <span>⚠ {fit.words} words (~{fit.seconds}s) is too long for {form.duration} seconds — it may get cut off. Keep it to {fit.maxWords} words</span>
                  {form.duration < 10 && (
                    <button type="button" className="rounded-md border border-amber-400 px-2 py-0.5 font-medium hover:bg-amber-50 dark:hover:bg-amber-950"
                      onClick={() => setField('duration', 10)}>Use 10 seconds</button>
                  )}
                </p>
              )
            )}
          </div>
        );
      })() : (
        <p className="text-xs text-muted-foreground">Audio is off (step 4), so nobody speaks.</p>
      )}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="video-hook">On-screen hook <span className="text-muted-foreground font-normal">(first 3 seconds)</span></Label>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={form.hookOn} onCheckedChange={v => setField('hookOn', v)} aria-label="Show on-screen hook" />{form.hookOn ? 'On' : 'Off'}
          </span>
        </div>
        <Input id="video-hook" value={form.hook} maxLength={70} disabled={!form.hookOn} onChange={e => setField('hook', e.target.value)}
          placeholder={form.mode === 'custom' ? "e.g. POV: Malta's dental clinic with its own lab" : 'e.g. POV: you finally hit the jackpot'} />
        <p className="text-[11px] text-muted-foreground">Big caption at the top, stamped in a clean font — tells viewers instantly what this is about. No emoji.</p>
      </div>

      <Step n={4} title="Look & length" hint="Model, shape, length, sound and branding." />

      <div className="space-y-2">
        <Label>Video Model</Label>
        <Pills
          options={VIDEO_MODELS.map(m => ({ value: m.id, label: m.label, hint: m.hint }))}
          value={form.model} onChange={v => setField('model', v)}
        />
      </div>

      <div className="space-y-2">
        <Label>Aspect Ratio</Label>
        <Pills
          options={VIDEO_ASPECT_RATIOS.map(r => ({ value: r.value, label: `${r.label} ${r.value}`, hint: r.hint }))}
          value={form.aspectRatio} onChange={v => setField('aspectRatio', v)}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Duration</Label>
          <Pills options={VIDEO_DURATIONS.map(d => ({ value: d, label: `${d} seconds` }))}
            value={form.duration} onChange={v => setField('duration', v)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="video-audio">Audio</Label>
          <div className="flex items-center gap-3 h-[52px]">
            <Switch id="video-audio" checked={form.audio} onCheckedChange={v => setField('audio', v)} />
            <span className="text-sm text-muted-foreground">{form.audio ? 'Voice + ambient sound' : 'Silent clip'}</span>
          </div>
        </div>
      </div>

      {/* Optional starting frame → image-to-video */}
      <div className="space-y-2">
        <Label className="block">Start from an image (optional)</Label>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={e => { onPickImage(e.target.files?.[0]); e.target.value = ''; }} />
        {form.startImage ? (
          <div className="flex items-center gap-3">
            <img src={form.startImage} alt="Start frame" className="h-20 rounded-lg border border-border object-cover" />
            <Button variant="ghost" size="sm" onClick={() => setField('startImage', '')}><X className="w-4 h-4 mr-1" />Remove</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <ImagePlus className="w-4 h-4 mr-1" />Upload start frame
          </Button>
        )}
        <p className="text-xs text-muted-foreground">The video will animate from this image instead of starting from scratch.</p>
      </div>

      {/* Real brand stamped on the saved video (AI can't draw logos reliably) */}
      <div className="space-y-2">
        <Label>Branding</Label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer">
            <Switch checked={form.brandLogo} onCheckedChange={v => setField('brandLogo', v)} className="mt-0.5" />
            <span className="text-sm">
              <span className="font-medium text-foreground block">Logo in corner</span>
              <span className="text-xs text-muted-foreground">The brand's real logo, top-left, whole clip</span>
            </span>
          </label>
          <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer">
            <Switch checked={form.brandEndCard} onCheckedChange={v => setField('brandEndCard', v)} className="mt-0.5" />
            <span className="text-sm">
              <span className="font-medium text-foreground block">End card</span>
              <span className="text-xs text-muted-foreground">1.5s brand screen at the end</span>
            </span>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {form.mode === 'brand'
            ? "The creator's phone screen also shows the brand's mascot and colours."
            : `Uses ${form.custom.logo ? 'your logo' : `"${form.custom.name || 'the business name'}" in a clean font`} and your colours${form.custom.tagline ? `, with "${form.custom.tagline}" on the end card` : ''}.`}
        </p>
      </div>

      {/* Final prompt — auto-built, editable */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Video Prompt</Label>
          {promptEdited && (
            <button type="button" onClick={rebuildPrompt} className="text-xs text-primary hover:underline">
              Rebuild from fields
            </button>
          )}
        </div>
        <Textarea rows={5} value={prompt} onChange={e => editPrompt(e.target.value)}
          placeholder="Pick a UGC style above — the prompt builds itself." />
      </div>

      {/* Ready-check — what's done, what's missing */}
      {(() => {
        const who = form.mode === 'custom' ? !!form.custom.name.trim() : !!form.brand;
        const scene = !!(form.creator.trim() && form.action.trim());
        const fit = speechFit(form.dialogue, form.duration);
        const words = !form.audio || !form.dialogue.trim() || fit.fits;
        const obvious = !form.hookOn || !!form.hook.trim();
        const items: Array<[boolean, string]> = [
          [who, form.mode === 'custom' ? 'Business chosen' : 'Brand chosen'],
          [scene, 'Scene filled in'],
          [words, form.audio && form.dialogue.trim() ? `Spoken line fits ${form.duration}s` : 'No spoken line (optional)'],
          [obvious, form.hookOn ? 'On-screen hook written' : 'Hook switched off'],
          [connection.connected, 'Higgsfield connected'],
        ];
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
            {items.map(([ok, text]) => (
              <span key={text} className={`inline-flex items-center gap-1 ${ok ? 'text-foreground' : 'text-amber-700 dark:text-amber-400'}`}>
                {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Circle className="w-3.5 h-3.5" />}{text}
              </span>
            ))}
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button onClick={generate} disabled={!(form.mode === 'custom' ? form.custom.name.trim() : form.brand) || !connection.connected} className="gradient-primary">
          <Sparkles className="w-4 h-4 mr-1" />Generate Video
        </Button>
        {connection.connected && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Coins className="w-3.5 h-3.5" />
            {cost.loading ? 'Checking cost…' : cost.credits != null ? `${cost.credits} credits` : 'Cost unavailable'}
          </span>
        )}
        <Button variant="outline" onClick={clear}><Trash2 className="w-4 h-4 mr-1" />Clear Form</Button>
        <Button variant="outline" className="ml-auto" onClick={onOpenLibrary}>
          <Clapperboard className="w-4 h-4 mr-1" />Video Library
        </Button>
      </div>
    </div>
  );
}
