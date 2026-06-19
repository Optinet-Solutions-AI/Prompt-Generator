/**
 * EmailContentChecker.tsx — the Email Builder page.
 *
 * Two panes:
 *   • Left  — controls: brand, template, banner (library/upload/URL), content,
 *             CTA, section order + sizes, footer, and the deliverability checker.
 *   • Right — a live preview of the REAL branded email (build-email-html.ts) plus
 *             copy / download.
 *
 * Follows the app's existing email HTML; adds the transfer-package features:
 * brand templates, section reorder + sizing, a CTA block, and spam-risk checking.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ShieldCheck, Wand2, AlertCircle, Copy, Check, Download,
  Upload, Link as LinkIcon, Images, ChevronUp, ChevronDown, Eye, EyeOff, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BRAND_STANDARDS } from '@/lib/brand-standards';
import { lintDeliverability, sanitizeContent } from '@/lib/deliverability';
import {
  buildEmailHtml, EMPTY_EMAIL_FORM,
  DEFAULT_SECTION_ORDER, type EmailFormData, type EmailCta, type EmailSectionKey,
} from '@/lib/build-email-html';
import { EMAIL_TEMPLATES, resolveTemplateForm, type EmailTemplate } from '@/lib/email-templates';
import { getAllStoredImages, batchStoreImages } from '@/lib/imageStore';

const ALL_BRANDS = Object.keys(BRAND_STANDARDS);
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL      || '';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const SECTION_LABELS: Record<EmailSectionKey, string> = {
  content:  'Content (headline + text)',
  hero:     'Banner image',
  cta:      'CTA button',
  wordmark: 'Brand wordmark',
};

const BANNER_SIZES = [
  { label: 'Full', width: 0 },      // 0 → full-bleed (no cap)
  { label: 'Large', width: 520 },
  { label: 'Medium', width: 420 },
  { label: 'Small', width: 320 },
];
const CTA_FONT = { Small: 13, Medium: 15, Large: 17 } as const;
const CTA_RADIUS = { Square: 0, Rounded: 6, Pill: 24 } as const;

interface PickImage { id: string; url: string; brand?: string }

async function syncFromDrive(): Promise<void> {
  try {
    const res = await fetch('/api/list-drive-images');
    if (!res.ok) return;
    const data = await res.json() as { files: Array<{ id: string; public_url: string; provider: string; aspect_ratio: string; resolution: string; filename: string; brand?: string }> };
    const files = data.files;
    if (!Array.isArray(files) || files.length === 0) return;
    const existing = new Set(getAllStoredImages().map(i => i.public_url));
    const fresh = files.filter(f => f.public_url && !existing.has(f.public_url));
    if (fresh.length) batchStoreImages(fresh.map(f => ({
      public_url: f.public_url, provider: (f.provider || 'chatgpt').toLowerCase(),
      aspect_ratio: f.aspect_ratio || '16:9', resolution: f.resolution || '1K',
      filename: f.filename || `image-${f.id}.png`, brand: f.brand || undefined,
    })));
  } catch { /* best-effort */ }
}

async function fetchFavorites(): Promise<PickImage[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/liked_images?select=*&order=created_at.desc`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } });
    if (!res.ok) return [];
    const raw = await res.json();
    return (Array.isArray(raw) ? raw : [])
      .filter((f: { img_url?: string }) => !!f.img_url)
      .map((f: { id: string; img_url: string; brand_name?: string }) => ({ id: `fav-${f.id}`, url: f.img_url, brand: f.brand_name || undefined }));
  } catch { return []; }
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{children}</p>
);

export default function EmailContentChecker() {
  const [brand, setBrand] = useState('');
  const [subject, setSubject] = useState('');
  const [form, setForm] = useState<EmailFormData>(EMPTY_EMAIL_FORM);
  const [cta, setCta] = useState<EmailCta>({ label: '', url: '', align: 'center', fullWidth: false, radius: 6, fontSize: 15 });

  // Hero image
  const [heroUrl, setHeroUrl] = useState('');
  const [heroDims, setHeroDims] = useState<{ w: number; h: number }>({ w: 1200, h: 628 });
  const [bannerWidth, setBannerWidth] = useState(0); // 0 = full-bleed

  // Section order + visibility
  const [order, setOrder] = useState<EmailSectionKey[]>([...DEFAULT_SECTION_ORDER]);
  const [hidden, setHidden] = useState<Set<EmailSectionKey>>(new Set());

  // Library picker
  const [showLibrary, setShowLibrary] = useState(false);
  const [libImages, setLibImages] = useState<PickImage[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [pasteUrl, setPasteUrl] = useState('');

  const [activeTemplate, setActiveTemplate] = useState<string>('');
  const [copied, setCopied] = useState<'html' | null>(null);
  // Tracks whether the user has hand-edited the content. While false, switching
  // brands re-syncs the template copy (so the brand name shows correctly); once
  // they edit, we stop overwriting their work.
  const [dirty, setDirty] = useState(false);

  const field = (k: keyof EmailFormData, v: string) => { setForm(p => ({ ...p, [k]: v })); setDirty(true); };
  const setCtaField = <K extends keyof EmailCta>(k: K, v: EmailCta[K]) => { setCta(p => ({ ...p, [k]: v })); setDirty(true); };

  // ── Hero selection ──────────────────────────────────────────────────────
  const useHero = (url: string) => {
    setHeroUrl(url);
    const img = new window.Image();
    img.onload = () => { if (img.naturalWidth) setHeroDims({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = url;
  };
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (reader.result) useHero(reader.result as string); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  const openLibrary = useCallback(async () => {
    setShowLibrary(true);
    if (libImages.length) return;
    setLibLoading(true);
    await syncFromDrive();
    const stored: PickImage[] = getAllStoredImages().map(i => ({ id: i.id, url: i.public_url, brand: i.brand }));
    const favs = await fetchFavorites();
    const seen = new Set<string>();
    setLibImages([...stored, ...favs].filter(i => i.url && !seen.has(i.url) && seen.add(i.url)));
    setLibLoading(false);
  }, [libImages.length]);

  // ── Template ────────────────────────────────────────────────────────────
  const applyTemplate = useCallback((t: EmailTemplate, brandArg: string) => {
    const f = resolveTemplateForm(t, brandArg);
    setForm(f);
    setSubject(t.subject.replace(/\{brand\}/g, brandArg || 'your brand'));
    // Templates have a natural CTA — wire it from the template's link.
    setCta(p => ({ ...p, label: f.linkText || 'Learn more', url: f.linkUrl || '' }));
  }, []);
  const loadTemplate = (t: EmailTemplate) => { setActiveTemplate(t.id); applyTemplate(t, brand); setDirty(false); };

  // Start with a real example loaded so the preview is never an empty shell.
  useEffect(() => { applyTemplate(EMAIL_TEMPLATES[0], ''); setActiveTemplate(EMAIL_TEMPLATES[0].id); }, [applyTemplate]);
  // Re-sync template copy with the brand until the user hand-edits the content.
  useEffect(() => {
    if (!dirty && activeTemplate) {
      const t = EMAIL_TEMPLATES.find(x => x.id === activeTemplate);
      if (t) applyTemplate(t, brand);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand]);

  // ── Section order helpers ────────────────────────────────────────────────
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  const toggleHidden = (k: EmailSectionKey) => {
    setHidden(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  };

  // ── Build the email ───────────────────────────────────────────────────────
  const visibleOrder = useMemo(() => order.filter(k => !hidden.has(k)), [order, hidden]);
  const html = useMemo(() => buildEmailHtml({
    imageSrc: heroUrl,
    brand: brand || undefined,
    formData: form,
    imgWidth: heroDims.w,
    imgHeight: heroDims.h,
    variant: heroUrl ? 'image-hero' : 'brand-only',
    cta: cta.label && cta.url ? cta : undefined,
    heroWidth: bannerWidth || undefined,
    heroRadius: bannerWidth ? 10 : 0,
    order: visibleOrder,
  }), [heroUrl, brand, form, heroDims, cta, bannerWidth, visibleOrder]);

  // ── Deliverability ──────────────────────────────────────────────────────
  const report = useMemo(() => {
    const body = [form.headline, form.introText, form.bodyText, cta.label, form.footerAttribution].filter(Boolean).join('\n');
    if (!subject.trim() && !body.trim()) return null;
    return lintDeliverability(subject, body, { ignore: brand ? [brand] : [] });
  }, [subject, form.headline, form.introText, form.bodyText, cta.label, form.footerAttribution, brand]);

  const handleSanitize = () => {
    setSubject(s => sanitizeContent(s));
    setForm(p => ({ ...p, headline: sanitizeContent(p.headline), introText: sanitizeContent(p.introText), bodyText: sanitizeContent(p.bodyText), footerAttribution: sanitizeContent(p.footerAttribution) }));
    setCta(p => ({ ...p, label: sanitizeContent(p.label) }));
  };

  const copyHtml = async () => { try { await navigator.clipboard.writeText(html); setCopied('html'); setTimeout(() => setCopied(null), 1500); } catch { /* blocked */ } };
  const downloadHtml = () => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${(brand || 'email').toLowerCase()}-campaign.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const levelBadge = (lvl: string) =>
    lvl === 'clean' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
    : lvl === 'caution' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
    : 'bg-destructive/15 text-destructive';

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg gradient-primary">
              <ShieldCheck className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">Email Builder</h1>
              <p className="text-xs text-muted-foreground">Pick a template &amp; banner, arrange the sections, then check the content for spam risk.</p>
            </div>
          </div>
          <Link to="/"><Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="w-3.5 h-3.5" /> Home</Button></Link>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* ── LEFT: controls ── */}
          <div className="space-y-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">

            {/* Brand */}
            <div className="space-y-1.5">
              <SectionLabel>Brand</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {ALL_BRANDS.map(b => (
                  <button key={b} type="button" onClick={() => setBrand(p => p === b ? '' : b)}
                    className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${brand === b ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{b}</button>
                ))}
              </div>
            </div>

            {/* Templates */}
            <div className="space-y-1.5">
              <SectionLabel>Template <span className="font-normal normal-case">(fills the content below)</span></SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {EMAIL_TEMPLATES.map(t => (
                  <button key={t.id} type="button" onClick={() => loadTemplate(t)} title={t.description}
                    className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${activeTemplate === t.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t.name}</button>
                ))}
              </div>
            </div>

            {/* Banner */}
            <div className="space-y-1.5 rounded-lg border border-border p-2.5">
              <SectionLabel>Banner image</SectionLabel>
              {heroUrl ? (
                <div className="flex items-center gap-2">
                  <img src={heroUrl} alt="" className="h-12 w-20 object-cover rounded border border-border" />
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setHeroUrl('')}><X className="w-3 h-3" /> Remove</Button>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">No banner — a brand panel is shown instead.</p>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={openLibrary}><Images className="w-3.5 h-3.5" /> Browse library</Button>
                <label className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-border bg-background text-xs font-medium cursor-pointer hover:bg-muted transition-colors">
                  <Upload className="w-3.5 h-3.5" /> Upload
                  <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                </label>
                <div className="flex flex-1 gap-1.5">
                  <Input placeholder="…or paste image URL" value={pasteUrl} onChange={e => setPasteUrl(e.target.value)} className="h-8 text-xs" />
                  <Button type="button" size="sm" className="h-8 text-xs gap-1 shrink-0" disabled={!pasteUrl.trim()} onClick={() => { useHero(pasteUrl.trim()); setPasteUrl(''); }}><LinkIcon className="w-3 h-3" /> Use</Button>
                </div>
              </div>
              {/* Banner size */}
              {heroUrl && (
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="text-[11px] text-muted-foreground mr-1">Size:</span>
                  {BANNER_SIZES.map(s => (
                    <button key={s.label} type="button" onClick={() => setBannerWidth(s.width)}
                      className={`px-2 py-0.5 rounded border text-[11px] ${bannerWidth === s.width ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{s.label}</button>
                  ))}
                </div>
              )}
              {showLibrary && (
                <div className="rounded-md border border-border p-2 max-h-52 overflow-y-auto">
                  {libLoading ? (
                    <p className="text-[11px] text-muted-foreground py-4 text-center">Loading…</p>
                  ) : libImages.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground py-4 text-center">No images in your library yet.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {libImages.slice(0, 60).map(im => (
                        <button key={im.id} type="button" onClick={() => { useHero(im.url); if (im.brand && !brand) setBrand(im.brand); setShowLibrary(false); }}
                          className="aspect-square rounded overflow-hidden border border-border hover:border-primary">
                          <img src={im.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Subject + content */}
            <div className="space-y-2">
              <SectionLabel>Content</SectionLabel>
              <div><Label className="text-[11px] mb-0.5 block">Subject line</Label>
                <Input value={subject} onChange={e => { setSubject(e.target.value); setDirty(true); }} placeholder="e.g. A quick note about your account" className="h-8 text-sm" /></div>
              <div><Label className="text-[11px] mb-0.5 block">Headline</Label>
                <Input value={form.headline} onChange={e => field('headline', e.target.value)} className="h-8 text-sm" /></div>
              <div><Label className="text-[11px] mb-0.5 block">Intro <span className="text-muted-foreground font-normal">(use {'{link}'} to place the link)</span></Label>
                <Textarea value={form.introText} onChange={e => field('introText', e.target.value)} className="min-h-[56px] text-sm" /></div>
              <div className="grid grid-cols-2 gap-1.5">
                <div><Label className="text-[11px] mb-0.5 block">Link text</Label><Input value={form.linkText} onChange={e => field('linkText', e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-[11px] mb-0.5 block">Link URL</Label><Input value={form.linkUrl} onChange={e => field('linkUrl', e.target.value)} className="h-8 text-sm" /></div>
              </div>
              <div><Label className="text-[11px] mb-0.5 block">Body</Label>
                <Textarea value={form.bodyText} onChange={e => field('bodyText', e.target.value)} className="min-h-[80px] text-sm" /></div>
            </div>

            {/* CTA */}
            <div className="space-y-2 rounded-lg border border-border p-2.5">
              <SectionLabel>CTA button</SectionLabel>
              <div className="grid grid-cols-2 gap-1.5">
                <div><Label className="text-[11px] mb-0.5 block">Label</Label><Input value={cta.label} onChange={e => setCtaField('label', e.target.value)} placeholder="e.g. See the details" className="h-8 text-sm" /></div>
                <div><Label className="text-[11px] mb-0.5 block">URL</Label><Input value={cta.url} onChange={e => setCtaField('url', e.target.value)} placeholder="https://…" className="h-8 text-sm" /></div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <div className="flex items-center gap-1.5"><span className="text-[11px] text-muted-foreground">Align:</span>
                  {(['left', 'center', 'right'] as const).map(a => (
                    <button key={a} type="button" onClick={() => setCtaField('align', a)} className={`px-2 py-0.5 rounded border text-[11px] capitalize ${cta.align === a ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}`}>{a}</button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5"><span className="text-[11px] text-muted-foreground">Width:</span>
                  <button type="button" onClick={() => setCtaField('fullWidth', false)} className={`px-2 py-0.5 rounded border text-[11px] ${!cta.fullWidth ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}`}>Auto</button>
                  <button type="button" onClick={() => setCtaField('fullWidth', true)} className={`px-2 py-0.5 rounded border text-[11px] ${cta.fullWidth ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}`}>Full</button>
                </div>
                <div className="flex items-center gap-1.5"><span className="text-[11px] text-muted-foreground">Size:</span>
                  {(Object.keys(CTA_FONT) as (keyof typeof CTA_FONT)[]).map(s => (
                    <button key={s} type="button" onClick={() => setCtaField('fontSize', CTA_FONT[s])} className={`px-2 py-0.5 rounded border text-[11px] ${cta.fontSize === CTA_FONT[s] ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}`}>{s}</button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5"><span className="text-[11px] text-muted-foreground">Corners:</span>
                  {(Object.keys(CTA_RADIUS) as (keyof typeof CTA_RADIUS)[]).map(s => (
                    <button key={s} type="button" onClick={() => setCtaField('radius', CTA_RADIUS[s])} className={`px-2 py-0.5 rounded border text-[11px] ${cta.radius === CTA_RADIUS[s] ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}`}>{s}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section order */}
            <div className="space-y-1.5">
              <SectionLabel>Layout order <span className="font-normal normal-case">(move sections, or hide them)</span></SectionLabel>
              <ul className="space-y-1">
                {order.map((k, i) => (
                  <li key={k} className={`flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 ${hidden.has(k) ? 'opacity-50' : ''}`}>
                    <span className="text-xs font-medium">{SECTION_LABELS[k]}</span>
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => toggleHidden(k)} title={hidden.has(k) ? 'Show' : 'Hide'} className="p-1 rounded hover:bg-muted text-muted-foreground">{hidden.has(k) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground"><ChevronUp className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground"><ChevronDown className="w-3.5 h-3.5" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Footer */}
            <div className="space-y-2">
              <SectionLabel>Footer &amp; socials</SectionLabel>
              <div><Label className="text-[11px] mb-0.5 block">Attribution</Label><Input value={form.footerAttribution} onChange={e => field('footerAttribution', e.target.value)} className="h-8 text-sm" /></div>
              <div className="grid grid-cols-2 gap-1.5">
                <Input placeholder="Facebook URL" value={form.facebookUrl} onChange={e => field('facebookUrl', e.target.value)} className="h-8 text-sm" />
                <Input placeholder="Website URL" value={form.websiteUrl} onChange={e => field('websiteUrl', e.target.value)} className="h-8 text-sm" />
                <Input placeholder="Unsubscribe URL" value={form.unsubscribeUrl} onChange={e => field('unsubscribeUrl', e.target.value)} className="h-8 text-sm col-span-2" />
              </div>
            </div>

            {/* Deliverability */}
            {report && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className={`w-3.5 h-3.5 ${report.level === 'clean' ? 'text-emerald-600' : report.level === 'caution' ? 'text-amber-500' : 'text-destructive'}`} />
                    <SectionLabel>Deliverability</SectionLabel>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${levelBadge(report.level)}`}>
                      {report.level === 'clean' ? 'Clean' : report.level === 'caution' ? 'Caution' : 'High risk'}{report.score > 0 && ` · risk ${report.score}`}
                    </span>
                  </div>
                  <Button type="button" onClick={handleSanitize} variant="ghost" size="sm" className="h-6 gap-1 text-[11px] px-2"><Wand2 className="w-3 h-3" /> Clean up</Button>
                </div>
                {report.findings.length === 0 ? (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">No spam triggers detected — this copy should deliver well.</p>
                ) : (
                  <ul className="space-y-1 max-h-44 overflow-y-auto">
                    {report.findings.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug">
                        <AlertCircle className={`w-3 h-3 shrink-0 mt-0.5 ${f.severity === 'high' ? 'text-destructive' : f.severity === 'medium' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                        <span className="text-muted-foreground">{f.message}{f.suggestion ? ` ${f.suggestion}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: live preview ── */}
          <div className="lg:sticky lg:top-5 self-start space-y-2">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>Live preview</SectionLabel>
              <div className="flex gap-1.5">
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={copyHtml}>{copied === 'html' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy HTML</Button>
                <Button type="button" size="sm" className="h-7 gap-1 text-xs" onClick={downloadHtml}><Download className="w-3 h-3" /> Download</Button>
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-hidden bg-white">
              <iframe title="Email preview" srcDoc={html} sandbox="" style={{ width: '100%', height: 'calc(100vh - 9rem)', border: 0, display: 'block' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
