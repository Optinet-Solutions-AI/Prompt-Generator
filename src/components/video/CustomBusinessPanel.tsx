/**
 * CustomBusinessPanel — Video tab → "Custom business" mode.
 *
 * Advertise any business (e.g. Dr Demajo, a dental clinic in Malta): name,
 * industry (drives the UGC presets), what to promote, colours, optional logo
 * and an end-card line. Businesses can be saved and reused by the whole team.
 * The name/logo is stamped onto the video afterwards — it is never put in the
 * AI prompt (models turn names into garbled lettering).
 */
import { useEffect, useRef, useState } from 'react';
import { Globe, ImagePlus, Loader2, Save, ShieldAlert, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INDUSTRIES, findIndustry } from '@/lib/ugc-industries';
import { EMPTY_CUSTOM_BUSINESS, type CustomBusiness } from '@/lib/ugc-video';
import { videoApi, type SavedBusiness } from '@/lib/video-api';
import type { useVideoGenerator } from '@/hooks/useVideoGenerator';

type VideoState = ReturnType<typeof useVideoGenerator>;

const MAX_LOGO_BYTES = 1024 * 1024;
const NEW = '__new__';

const fromSaved = (b: SavedBusiness): CustomBusiness => ({
  id: b.id, name: b.name, industry: b.industry || 'other', promote: b.promote || '',
  color: b.color || EMPTY_CUSTOM_BUSINESS.color, accent: b.accent || EMPTY_CUSTOM_BUSINESS.accent,
  tagline: b.tagline || '', logo: b.logo || '',
  website: b.website || '', presets: b.presets || [], research: b.research || null,
});

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 cursor-pointer">
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" aria-label={label} />
      <span className="text-xs">
        <span className="block font-medium text-foreground">{label}</span>
        <span className="block text-muted-foreground uppercase">{value}</span>
      </span>
    </label>
  );
}

export function CustomBusinessPanel({ state }: { state: VideoState }) {
  const { form, setCustom, loadBusiness } = state;
  const c = form.custom;
  const [saved, setSaved] = useState<SavedBusiness[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState('');
  const [saving, setSaving] = useState(false);
  const [siteUrl, setSiteUrl] = useState('');
  const [researching, setResearching] = useState(false);
  const [researchStep, setResearchStep] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const industry = findIndustry(c.industry);

  const refresh = () => {
    setLoadingList(true);
    videoApi.businesses()
      .then(r => { setSaved(r.businesses); setListError(''); })
      .catch(e => setListError(e instanceof Error ? e.message : 'Could not load saved businesses'))
      .finally(() => setLoadingList(false));
  };
  useEffect(refresh, []);

  const pickLogo = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) { toast.error('Logo must be under 1 MB.'); return; }
    const r = new FileReader();
    r.onload = () => setCustom('logo', String(r.result));
    r.readAsDataURL(file);
  };

  /**
   * "Auto-fill from website": the server reads the site (logo, real brand
   * colours, text), researches the business with Google Search, and returns
   * a filled-in business + formats written for it. Nothing is saved yet.
   */
  const autofill = async () => {
    const url = siteUrl.trim();
    if (!url) { toast.error('Paste the business website first.'); return; }
    setResearching(true);
    const steps = ['Reading the website…', 'Finding the logo and brand colours…', 'Researching the business on Google…', 'Writing video formats for this business…'];
    let i = 0; setResearchStep(steps[0]);
    const timer = setInterval(() => { i = Math.min(i + 1, steps.length - 1); setResearchStep(steps[i]); }, 6000);
    try {
      const r = await videoApi.researchBusiness(url);
      loadBusiness({
        ...EMPTY_CUSTOM_BUSINESS,
        id: c.id && c.name.trim().toLowerCase() === r.business.name.trim().toLowerCase() ? c.id : '',
        ...r.business, presets: r.presets, research: r.research,
      });
      toast.success(`Filled in ${r.business.name} — check it, then click “Save business”.`);
      if (!r.found.site_read) toast.warning('The website could not be read directly — details come from web search only. Please double-check them.');
      if (!r.business.logo) toast.message('No logo found on the site — upload one, or the name is shown in a clean font.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not research that website');
    } finally { clearInterval(timer); setResearching(false); setResearchStep(''); }
  };

  const save = async () => {
    if (!c.name.trim()) { toast.error('Enter the business name first.'); return; }
    setSaving(true);
    try {
      const { business } = await videoApi.saveBusiness({
        id: c.id, name: c.name.trim(), industry: c.industry, promote: c.promote, color: c.color,
        accent: c.accent, tagline: c.tagline, logo: c.logo || null,
        website: c.website || null, presets: c.presets, research: c.research,
      });
      setCustom('id', business.id);
      toast.success(c.id ? 'Business updated' : 'Business saved — the whole team can reuse it');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!c.id || !window.confirm(`Delete the saved business "${c.name}"?`)) return;
    try {
      await videoApi.deleteBusiness(c.id);
      loadBusiness(EMPTY_CUSTOM_BUSINESS);
      toast.success('Deleted');
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not delete'); }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
      {/* Auto-fill: paste a website, we do the research */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground"><Sparkles className="w-4 h-4 text-primary" />New business? Auto-fill from its website</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={siteUrl} onChange={e => setSiteUrl(e.target.value)} placeholder="e.g. demajodental.org" className="pl-9"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); autofill(); } }} disabled={researching} />
          </div>
          <Button type="button" onClick={autofill} disabled={researching} className="gradient-primary shrink-0">
            {researching ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}{researching ? 'Researching…' : 'Auto-fill'}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {researching ? `${researchStep} (about 20–40 seconds)` : 'Reads the site for the logo and real brand colours, researches the business, and writes video formats made for it. You review everything before saving.'}
        </p>
      </div>

      {/* Saved businesses */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label>Saved business</Label>
          <Select value={c.id || NEW} onValueChange={v => {
            if (v === NEW) { loadBusiness(EMPTY_CUSTOM_BUSINESS); return; }
            const b = saved.find(x => x.id === v); if (b) loadBusiness(fromSaved(b));
          }}>
            <SelectTrigger><SelectValue placeholder={loadingList ? 'Loading…' : 'Pick a saved business'} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NEW}>＋ New business</SelectItem>
              {saved.map(b => (
                <SelectItem key={b.id} value={b.id}>{findIndustry(b.industry || '')?.emoji || '🏪'} {b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}{c.id ? 'Update' : 'Save business'}
        </Button>
        {c.id && <Button type="button" variant="ghost" size="icon" onClick={remove} aria-label="Delete saved business"><Trash2 className="w-4 h-4" /></Button>}
      </div>
      {listError && <p className="text-xs text-destructive">{listError}</p>}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="biz-name">Business name <span className="text-destructive">*</span></Label>
          <Input id="biz-name" value={c.name} maxLength={60} onChange={e => setCustom('name', e.target.value)} placeholder="e.g. Dr Demajo" />
          <p className="text-[11px] text-muted-foreground">Shown on the video (corner + end card), never drawn by the AI.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Industry</Label>
          <Select value={c.industry} onValueChange={v => setCustom('industry', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map(i => <SelectItem key={i.id} value={i.id}>{i.emoji} {i.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Picks UGC formats that work for this niche.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="biz-promote">What are we promoting? <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input id="biz-promote" value={c.promote} maxLength={300} onChange={e => setCustom('promote', e.target.value)}
          placeholder="e.g. Implants with an on-site lab · sedation for nervous patients" />
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <ColourField label="Main colour" value={c.color} onChange={v => setCustom('color', v)} />
        <ColourField label="Accent" value={c.accent} onChange={v => setCustom('accent', v)} />
        <div className="space-y-1">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
            onChange={e => { pickLogo(e.target.files?.[0]); e.target.value = ''; }} />
          {c.logo ? (
            <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
              <span className="flex h-9 w-20 items-center justify-center rounded bg-neutral-800 p-1">
                <img src={c.logo} alt="Logo" className="max-h-full max-w-full object-contain" />
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setCustom('logo', '')}><X className="w-4 h-4 mr-1" />Remove</Button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" className="h-[46px]" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="w-4 h-4 mr-1" />Upload logo <span className="ml-1 text-muted-foreground">(optional)</span>
            </Button>
          )}
          <p className="text-[11px] text-muted-foreground max-w-[220px]">PNG/SVG under 1 MB. No logo? We use the name in a clean font.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="biz-tagline">End-card line <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input id="biz-tagline" value={c.tagline} maxLength={80} onChange={e => setCustom('tagline', e.target.value)}
          placeholder="e.g. Book your smile consultation · demajodental.org" />
      </div>

      {c.research && (
        <details className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-foreground">
            What we found about {c.research.full_name || c.name}{c.website ? ` · ${c.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : ''}
          </summary>
          <div className="mt-2 space-y-1.5 text-muted-foreground">
            {c.research.summary && <p>{c.research.summary}</p>}
            {c.research.location && <p><b className="text-foreground">Location:</b> {c.research.location}</p>}
            {c.research.services.length > 0 && <p><b className="text-foreground">Services:</b> {c.research.services.join(' · ')}</p>}
            {c.research.selling_points.length > 0 && <p><b className="text-foreground">What they stress:</b> {c.research.selling_points.join(' · ')}</p>}
            {c.research.audience && <p><b className="text-foreground">Audience:</b> {c.research.audience}</p>}
            {c.research.social && <p><b className="text-foreground">Social media:</b> {c.research.social}</p>}
            {c.research.compliance && <p><b className="text-foreground">Ad cautions:</b> {c.research.compliance}</p>}
            {c.research.sources.length > 0 && <p className="text-[11px]">Sources: {c.research.sources.join(', ')}</p>}
          </div>
        </details>
      )}

      {industry?.healthcare && (
        <div className="flex gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Healthcare ad rules (TikTok / Meta / local codes): the people in these videos are AI actors — don’t present them as real
            patients or testimonials, avoid promising results or “pain-free”, and check before/after rules for your market.
          </p>
        </div>
      )}
    </div>
  );
}
