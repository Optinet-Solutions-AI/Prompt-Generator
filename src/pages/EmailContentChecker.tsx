/**
 * EmailContentChecker.tsx — block-based Email Builder.
 *
 * Left: editable block cards (header / hero / heading / paragraph / bonus / cta /
 *       divider / wordmark / social / footer) — each with Style / move / remove,
 *       plus brand, templates, add-block, and the deliverability checker.
 * Right: live preview of the branded email (build-branded-email.ts).
 *
 * Clean logo/composite header by default (no big text); the transfer package's
 * block model + per-block styling, integrated with the spam-risk checker.
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ShieldCheck, Wand2, AlertCircle, Copy, Check, Download,
  ChevronUp, ChevronDown, X, Plus, SlidersHorizontal, Images, Upload, Sparkles, Loader2, Eye, LayoutTemplate, Eraser, Monitor, Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { BRAND_NAMES, getBrandStyle } from '@/lib/brand-standards';
import { lintDeliverability, sanitizeContent } from '@/lib/deliverability';
import { buildBrandedEmail } from '@/lib/build-branded-email';
import {
  newBlock, moveBlock, removeBlock, updateBlock,
  type EmailDoc, type EmailBlock, type BlockType, type BlockStyle,
} from '@/lib/email-model';
import { EMAIL_TEMPLATES, buildTemplateDoc } from '@/lib/email-templates';
import { getAllStoredImages, batchStoreImages } from '@/lib/imageStore';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL      || '';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const genId = () => (crypto?.randomUUID ? crypto.randomUUID() : `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

// Block types you can add, with friendly labels (header is added by default).
const ADDABLE: { type: BlockType; label: string }[] = [
  { type: 'heading', label: 'Heading' }, { type: 'paragraph', label: 'Text' },
  { type: 'bonus', label: 'Bonus' }, { type: 'cta', label: 'CTA' },
  { type: 'hero', label: 'Image' }, { type: 'divider', label: 'Divider' },
  { type: 'wordmark', label: 'Wordmark' }, { type: 'social', label: 'Social' },
  { type: 'footer', label: 'Footer' }, { type: 'header', label: 'Header' },
];
const TYPE_LABEL: Record<BlockType, string> = {
  header: 'header', hero: 'hero', heading: 'heading', paragraph: 'paragraph', bonus: 'bonus',
  cta: 'cta', divider: 'divider', wordmark: 'wordmark', social: 'social', footer: 'footer',
};

interface PickImage { id: string; url: string; brand?: string }
async function syncFromDrive(): Promise<void> {
  try {
    const res = await fetch('/api/list-drive-images');
    if (!res.ok) return;
    const data = await res.json() as { files: Array<{ id: string; public_url: string; provider: string; aspect_ratio: string; resolution: string; filename: string; brand?: string }> };
    const files = data.files;
    if (!Array.isArray(files) || !files.length) return;
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
    return (Array.isArray(raw) ? raw : []).filter((f: { img_url?: string }) => !!f.img_url)
      .map((f: { id: string; img_url: string; brand_name?: string }) => ({ id: `fav-${f.id}`, url: f.img_url, brand: f.brand_name || undefined }));
  } catch { return []; }
}

const Small = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{children}</p>
);

// ── Variation helpers (text-only edits applied back to the doc by id) ────────
interface EditField { id: string; type: string; text?: string; offer?: string; code?: string; label?: string }

function editableBlocks(doc: EmailDoc): EditField[] {
  const out: EditField[] = [];
  for (const b of doc.blocks) {
    if (b.type === 'heading' || b.type === 'paragraph') out.push({ id: b.id, type: b.type, text: b.text });
    else if (b.type === 'bonus') out.push({ id: b.id, type: b.type, offer: b.offer, code: b.code });
    else if (b.type === 'cta') out.push({ id: b.id, type: b.type, label: b.label });
  }
  return out;
}

function applyEdits(doc: EmailDoc, edits: EditField[]): EmailDoc {
  const byId = new Map(edits.map(e => [e.id, e]));
  return {
    ...doc,
    blocks: doc.blocks.map(b => {
      const e = byId.get(b.id);
      if (!e) return b;
      if (b.type === 'heading' || b.type === 'paragraph') return { ...b, text: e.text ?? b.text };
      if (b.type === 'bonus') return { ...b, offer: e.offer ?? b.offer, code: e.code ?? b.code };
      if (b.type === 'cta') return { ...b, label: e.label ?? b.label };
      return b;
    }),
  };
}

/** Strip HTML tags so pasted HTML is scored on its visible text, not its markup. */
function stripHtml(input: string): string {
  if (!input.includes('<')) return input;
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function EmailContentChecker() {
  const [doc, setDoc] = useState<EmailDoc>(() => buildTemplateDoc(EMAIL_TEMPLATES[0], '', genId));
  const [activeTemplate, setActiveTemplate] = useState(EMAIL_TEMPLATES[0].id);
  const [dirty, setDirty] = useState(false);
  const [openStyle, setOpenStyle] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Image picker (scoped to a hero block)
  const [libFor, setLibFor] = useState<string | null>(null);
  const [libImages, setLibImages] = useState<PickImage[]>([]);
  const [libLoading, setLibLoading] = useState(false);

  // AI variations
  interface VariationResult {
    label: string;
    notes: string;
    edits: EditField[];
    report: ReturnType<typeof lintDeliverability>;
    text: string; // plain-text twin (clean copy)
    html: string; // rendered email for preview
    fields: { label: string; value: string }[]; // reworded copy, for display
  }
  const [variations, setVariations] = useState<VariationResult[]>([]);
  const [varLoading, setVarLoading] = useState(false);
  const [varError, setVarError] = useState<string | null>(null);
  const [varCount, setVarCount] = useState(3);
  const [expandedVar, setExpandedVar] = useState<number | null>(null);
  const [copiedVar, setCopiedVar] = useState<number | null>(null);

  // View tab + standalone Content Checker (paste any subject/body or HTML)
  const [tab, setTab] = useState<'builder' | 'checker'>('builder');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [chkBrand, setChkBrand] = useState('');
  const [chkSubject, setChkSubject] = useState('');
  const [chkBody, setChkBody] = useState('');
  const [chkCopied, setChkCopied] = useState<'subject' | 'body' | null>(null);

  const brand = doc.meta.brand;

  // ── Mutations ─────────────────────────────────────────────────────────────
  const patchMeta = (patch: Partial<EmailDoc['meta']>) => { setDoc(d => ({ ...d, meta: { ...d.meta, ...patch } })); setDirty(true); };
  const patchBlock = (id: string, patch: Partial<EmailBlock>) => { setDoc(d => ({ ...d, blocks: updateBlock(d.blocks, id, patch) })); setDirty(true); };
  const patchStyle = (id: string, key: keyof BlockStyle, value: BlockStyle[keyof BlockStyle]) => {
    setDoc(d => ({ ...d, blocks: d.blocks.map(b => b.id === id ? { ...b, style: { ...b.style, [key]: value } } : b) }));
    setDirty(true);
  };
  const move = (id: string, dir: -1 | 1) => setDoc(d => ({ ...d, blocks: moveBlock(d.blocks, id, dir) }));
  const remove = (id: string) => { setDoc(d => ({ ...d, blocks: removeBlock(d.blocks, id) })); setDirty(true); };
  const addBlock = (type: BlockType) => { setDoc(d => ({ ...d, blocks: [...d.blocks, newBlock(type, genId())] })); setDirty(true); };

  const selectBrand = (b: string) => {
    const nb = brand === b ? '' : b;
    if (!dirty && activeTemplate) {
      const t = EMAIL_TEMPLATES.find(x => x.id === activeTemplate);
      if (t) { setDoc(buildTemplateDoc(t, nb, genId)); return; }
    }
    setDoc(d => ({ ...d, meta: { ...d.meta, brand: nb } }));
  };
  const loadTemplate = (id: string) => {
    const t = EMAIL_TEMPLATES.find(x => x.id === id);
    if (!t) return;
    setDoc(buildTemplateDoc(t, brand, genId));
    setActiveTemplate(id);
    setDirty(false);
  };

  // ── Image picker ──────────────────────────────────────────────────────────
  const openLib = useCallback(async (blockId: string) => {
    setLibFor(blockId);
    if (libImages.length) return;
    setLibLoading(true);
    await syncFromDrive();
    const stored: PickImage[] = getAllStoredImages().map(i => ({ id: i.id, url: i.public_url, brand: i.brand }));
    const favs = await fetchFavorites();
    const seen = new Set<string>();
    setLibImages([...stored, ...favs].filter(i => i.url && !seen.has(i.url) && seen.add(i.url)));
    setLibLoading(false);
  }, [libImages.length]);
  const pickImage = (url: string) => { if (libFor) patchBlock(libFor, { mode: 'url', url } as Partial<EmailBlock>); setLibFor(null); };
  const uploadFor = (blockId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (reader.result) patchBlock(blockId, { mode: 'url', url: reader.result as string } as Partial<EmailBlock>); };
    reader.readAsDataURL(file); e.target.value = '';
  };

  // ── Preview + checker ───────────────────────────────────────────────────
  const html = useMemo(() => buildBrandedEmail(doc, getBrandStyle(brand)).html, [doc, brand]);
  const report = useMemo(() => {
    const parts: string[] = [];
    for (const b of doc.blocks) {
      if (b.type === 'heading' || b.type === 'paragraph') parts.push(b.text);
      else if (b.type === 'bonus') parts.push(b.offer);
      else if (b.type === 'cta') parts.push(b.label);
    }
    const body = parts.filter(Boolean).join('\n');
    if (!doc.meta.subject.trim() && !body.trim()) return null;
    return lintDeliverability(doc.meta.subject, body, { ignore: brand ? [brand] : [] });
  }, [doc, brand]);

  const handleSanitize = () => {
    setDoc(d => ({
      ...d,
      meta: { ...d.meta, subject: sanitizeContent(d.meta.subject) },
      blocks: d.blocks.map(b => {
        if (b.type === 'heading' || b.type === 'paragraph') return { ...b, text: sanitizeContent(b.text) };
        if (b.type === 'bonus') return { ...b, offer: sanitizeContent(b.offer) };
        if (b.type === 'cta') return { ...b, label: sanitizeContent(b.label) };
        return b;
      }),
    }));
  };

  // default template loaded once; re-sync to brand handled in selectBrand
  useEffect(() => { /* doc seeded in useState initializer */ }, []);

  // ── AI variations: reword the text blocks N ways, re-score each ───────────
  const generateVariations = async () => {
    setVarError(null); setVarLoading(true); setVariations([]);
    try {
      const res = await fetch('/api/generate-email-variations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: doc.meta.subject, brand, locale: doc.meta.locale, blocks: editableBlocks(doc), count: varCount }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({} as { error?: string }));
        setVarError(e.error || `Request failed (${res.status})`);
        return;
      }
      const data = await res.json() as { variations: { label: string; notes: string; blocks: EditField[] }[] };
      const style = getBrandStyle(brand);
      const results: VariationResult[] = (data.variations || []).map(v => {
        const applied = applyEdits(doc, v.blocks);
        const built = buildBrandedEmail(applied, style);
        const parts: string[] = [];
        for (const b of applied.blocks) {
          if (b.type === 'heading' || b.type === 'paragraph') parts.push(b.text);
          else if (b.type === 'bonus') parts.push(b.offer);
          else if (b.type === 'cta') parts.push(b.label);
        }
        const report = lintDeliverability(applied.meta.subject, parts.filter(Boolean).join('\n'), { ignore: brand ? [brand] : [] });
        const fields = (v.blocks || []).map(e => {
          if (e.type === 'heading') return { label: 'Heading', value: e.text || '' };
          if (e.type === 'paragraph') return { label: 'Text', value: e.text || '' };
          if (e.type === 'bonus') return { label: 'Bonus', value: [e.offer, e.code ? `(code ${e.code})` : ''].filter(Boolean).join(' ') };
          if (e.type === 'cta') return { label: 'CTA', value: e.label || '' };
          return { label: e.type, value: '' };
        }).filter(f => f.value);
        return { label: v.label, notes: v.notes, edits: v.blocks, report, text: built.text, html: built.html, fields };
      });
      setVariations(results);
      setExpandedVar(results.length ? 0 : null);
    } catch {
      setVarError('Could not reach the AI service. Try again.');
    } finally {
      setVarLoading(false);
    }
  };

  const useVariation = (edits: EditField[]) => { setDoc(d => applyEdits(d, edits)); setDirty(true); setActiveTemplate(''); };
  const copyVarText = async (i: number, text: string) => { try { await navigator.clipboard.writeText(text); setCopiedVar(i); setTimeout(() => setCopiedVar(null), 1500); } catch { /* blocked */ } };
  const previewVar = (h: string) => {
    const blob = new Blob([h], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  // Standalone checker (paste-and-check)
  const chkReport = useMemo(() => {
    const subj = chkSubject.trim();
    const body = stripHtml(chkBody);
    if (!subj && !body) return null;
    return lintDeliverability(subj, body, { ignore: chkBrand ? [chkBrand] : [] });
  }, [chkSubject, chkBody, chkBrand]);
  const chkSanitize = () => { setChkSubject(s => sanitizeContent(s)); setChkBody(s => sanitizeContent(s)); };
  const chkCopy = async (kind: 'subject' | 'body') => {
    try { await navigator.clipboard.writeText(kind === 'subject' ? chkSubject : chkBody); setChkCopied(kind); setTimeout(() => setChkCopied(null), 1500); } catch { /* blocked */ }
  };

  const copyHtml = async () => { try { await navigator.clipboard.writeText(html); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } };
  const downloadHtml = () => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${(brand || 'email').toLowerCase()}-campaign.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };
  const levelBadge = (lvl: string) =>
    lvl === 'clean' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
    : lvl === 'caution' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
    : 'bg-destructive/15 text-destructive';

  // ── Per-block field editors ───────────────────────────────────────────────
  const renderFields = (b: EmailBlock) => {
    switch (b.type) {
      case 'header': return (
        <div>
          <Label className="text-[11px] mb-0.5 block">Logo (optional override)</Label>
          <Input value={b.logoUrl || ''} onChange={e => patchBlock(b.id, { logoUrl: e.target.value } as Partial<EmailBlock>)} placeholder="Brand composite header used by default — paste a URL to override" className="h-8 text-sm" />
          <p className="text-[10px] text-muted-foreground mt-1">Defaults to the brand's composite header image. Leave blank to use it.</p>
        </div>
      );
      case 'hero': return (
        <div className="space-y-1.5">
          <Label className="text-[11px] mb-0.5 block">Hero style</Label>
          <select value={b.mode} onChange={e => patchBlock(b.id, { mode: e.target.value as 'css' | 'url' | 'banner' } as Partial<EmailBlock>)} className="h-8 text-sm w-full rounded-md border border-border bg-background px-2">
            <option value="css">CSS (no image)</option>
            <option value="url">Image</option>
          </select>
          {b.mode === 'url' && (
            <>
              {b.url ? <img src={b.url} alt="" className="h-12 w-20 object-cover rounded border border-border" /> : null}
              <div className="flex gap-1.5">
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => openLib(b.id)}><Images className="w-3.5 h-3.5" /> Browse</Button>
                <label className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border bg-background text-xs cursor-pointer hover:bg-muted"><Upload className="w-3.5 h-3.5" /> Upload<input type="file" accept="image/*" className="hidden" onChange={e => uploadFor(b.id, e)} /></label>
              </div>
              <Input value={b.url || ''} onChange={e => patchBlock(b.id, { url: e.target.value } as Partial<EmailBlock>)} placeholder="…or paste image URL" className="h-8 text-sm" />
            </>
          )}
        </div>
      );
      case 'heading': return <div><Label className="text-[11px] mb-0.5 block">Heading</Label><Input value={b.text} onChange={e => patchBlock(b.id, { text: e.target.value } as Partial<EmailBlock>)} className="h-8 text-sm" /></div>;
      case 'paragraph': return <div><Label className="text-[11px] mb-0.5 block">Text</Label><Textarea value={b.text} onChange={e => patchBlock(b.id, { text: e.target.value } as Partial<EmailBlock>)} className="min-h-[64px] text-sm" /></div>;
      case 'bonus': return (
        <div className="grid grid-cols-2 gap-1.5">
          <div><Label className="text-[11px] mb-0.5 block">Offer line</Label><Input value={b.offer} onChange={e => patchBlock(b.id, { offer: e.target.value } as Partial<EmailBlock>)} placeholder="e.g. Extra value up to USD 500" className="h-8 text-sm" /></div>
          <div><Label className="text-[11px] mb-0.5 block">Code (optional)</Label><Input value={b.code || ''} onChange={e => patchBlock(b.id, { code: e.target.value } as Partial<EmailBlock>)} className="h-8 text-sm" /></div>
        </div>
      );
      case 'cta': return (
        <div className="grid grid-cols-2 gap-1.5">
          <div><Label className="text-[11px] mb-0.5 block">Label</Label><Input value={b.label} onChange={e => patchBlock(b.id, { label: e.target.value } as Partial<EmailBlock>)} placeholder="e.g. See the details" className="h-8 text-sm" /></div>
          <div><Label className="text-[11px] mb-0.5 block">URL</Label><Input value={b.url} onChange={e => patchBlock(b.id, { url: e.target.value } as Partial<EmailBlock>)} placeholder="https://…" className="h-8 text-sm" /></div>
        </div>
      );
      case 'social': return (
        <div className="grid grid-cols-2 gap-1.5">
          <Input value={b.facebook || ''} onChange={e => patchBlock(b.id, { facebook: e.target.value } as Partial<EmailBlock>)} placeholder="Facebook URL" className="h-8 text-sm" />
          <Input value={b.twitter || ''} onChange={e => patchBlock(b.id, { twitter: e.target.value } as Partial<EmailBlock>)} placeholder="Twitter URL" className="h-8 text-sm" />
          <Input value={b.instagram || ''} onChange={e => patchBlock(b.id, { instagram: e.target.value } as Partial<EmailBlock>)} placeholder="Instagram URL" className="h-8 text-sm" />
          <Input value={b.website || ''} onChange={e => patchBlock(b.id, { website: e.target.value } as Partial<EmailBlock>)} placeholder="Website URL" className="h-8 text-sm" />
        </div>
      );
      case 'footer': return (
        <div className="space-y-1.5">
          <Input value={b.attribution || ''} onChange={e => patchBlock(b.id, { attribution: e.target.value } as Partial<EmailBlock>)} placeholder="Attribution" className="h-8 text-sm" />
          <Input value={b.legal || ''} onChange={e => patchBlock(b.id, { legal: e.target.value } as Partial<EmailBlock>)} placeholder="Legal text" className="h-8 text-sm" />
          <Input value={b.unsubscribeUrl || ''} onChange={e => patchBlock(b.id, { unsubscribeUrl: e.target.value } as Partial<EmailBlock>)} placeholder="Unsubscribe URL" className="h-8 text-sm" />
        </div>
      );
      case 'divider': return <p className="text-[11px] text-muted-foreground">A thin divider line.</p>;
      case 'wordmark': return <p className="text-[11px] text-muted-foreground">Shows the brand name in the brand font.</p>;
      default: return null;
    }
  };

  const renderStyle = (b: EmailBlock) => {
    const st = b.style || {};
    const num = (v: number | undefined) => (v ?? '') as number | '';
    return (
      <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-2">
        <div className="col-span-2 flex items-center gap-1.5"><span className="text-[11px] text-muted-foreground">Align:</span>
          {(['left', 'center', 'right'] as const).map(a => (
            <button key={a} type="button" onClick={() => patchStyle(b.id, 'align', a)} className={`px-2 py-0.5 rounded border text-[11px] capitalize ${st.align === a ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>{a}</button>
          ))}
        </div>
        <div><Label className="text-[10px] mb-0.5 block">Font size (px)</Label><Input type="number" value={num(st.fontSize)} onChange={e => patchStyle(b.id, 'fontSize', e.target.value ? Number(e.target.value) : undefined)} className="h-7 text-xs" /></div>
        <div><Label className="text-[10px] mb-0.5 block">Text color</Label><Input value={st.color || ''} onChange={e => patchStyle(b.id, 'color', e.target.value || undefined)} placeholder="#172b4d" className="h-7 text-xs" /></div>
        {b.type === 'hero' && b.mode !== 'url' && <div><Label className="text-[10px] mb-0.5 block">Background</Label><Input value={st.background || ''} onChange={e => patchStyle(b.id, 'background', e.target.value || undefined)} placeholder="white / #0b1b2b" className="h-7 text-xs" /></div>}
        <div><Label className="text-[10px] mb-0.5 block">Space above (px)</Label><Input type="number" value={num(st.spaceTop)} onChange={e => patchStyle(b.id, 'spaceTop', e.target.value ? Number(e.target.value) : undefined)} className="h-7 text-xs" /></div>
        <div><Label className="text-[10px] mb-0.5 block">Space below (px)</Label><Input type="number" value={num(st.spaceBottom)} onChange={e => patchStyle(b.id, 'spaceBottom', e.target.value ? Number(e.target.value) : undefined)} className="h-7 text-xs" /></div>
        {b.type === 'hero' && <div><Label className="text-[10px] mb-0.5 block">Image width (px)</Label><Input type="number" value={num(st.width)} onChange={e => patchStyle(b.id, 'width', e.target.value ? Number(e.target.value) : undefined)} className="h-7 text-xs" /></div>}
        {(b.type === 'hero' || b.type === 'cta') && <div><Label className="text-[10px] mb-0.5 block">Corner radius (px)</Label><Input type="number" value={num(st.radius)} onChange={e => patchStyle(b.id, 'radius', e.target.value ? Number(e.target.value) : undefined)} className="h-7 text-xs" /></div>}
        {b.type === 'cta' && <div className="flex items-end gap-1.5"><button type="button" onClick={() => patchStyle(b.id, 'fullWidth', !st.fullWidth)} className={`px-2 py-1 rounded border text-[11px] ${st.fullWidth ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>Full width</button></div>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg gradient-primary"><ShieldCheck className="w-4 h-4 text-primary-foreground" /></div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">Email Builder</h1>
              <p className="text-xs text-muted-foreground">Brand template → arrange &amp; style blocks → check spam risk → export.</p>
            </div>
          </div>
          <Link to="/"><Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="w-3.5 h-3.5" /> Home</Button></Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted/50 border border-border mb-4 w-fit">
          <button type="button" onClick={() => setTab('builder')} className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'builder' ? 'bg-card shadow-sm text-foreground border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
            <LayoutTemplate className="w-3.5 h-3.5" /> Builder
          </button>
          <button type="button" onClick={() => setTab('checker')} className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'checker' ? 'bg-card shadow-sm text-foreground border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
            <ShieldCheck className="w-3.5 h-3.5" /> Content Checker
          </button>
        </div>

        {tab === 'builder' && (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* LEFT */}
          <div className="space-y-3 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
            <div className="space-y-1.5">
              <Small>Brand</Small>
              <div className="flex flex-wrap gap-1.5">
                {BRAND_NAMES.map(b => (
                  <button key={b} type="button" onClick={() => selectBrand(b)} className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${brand === b ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{b}</button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Small>Template <span className="font-normal normal-case">(fills the blocks)</span></Small>
              <div className="flex flex-wrap gap-1.5">
                {EMAIL_TEMPLATES.map(t => (
                  <button key={t.id} type="button" onClick={() => loadTemplate(t.id)} title={t.description} className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${activeTemplate === t.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t.name}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div><Label className="text-[11px] mb-0.5 block">Subject line</Label><Input value={doc.meta.subject} onChange={e => patchMeta({ subject: e.target.value })} className="h-8 text-sm" /></div>
              <div><Label className="text-[11px] mb-0.5 block">Preheader</Label><Input value={doc.meta.preheader} onChange={e => patchMeta({ preheader: e.target.value })} className="h-8 text-sm" /></div>
            </div>

            {/* AI variations */}
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-primary" /><Small>Generate variations</Small></div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Count:</span>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={varCount}
                    onChange={e => setVarCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
                    className="h-7 w-16 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">max 10</span>
                </div>
              </div>
              <Button type="button" onClick={generateVariations} disabled={varLoading} variant="outline" className="w-full h-8 gap-1.5 text-xs">
                {varLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Rewording the copy…</> : <><Sparkles className="w-3.5 h-3.5" /> Reword the copy with AI</>}
              </Button>
              {varError && <p className="text-destructive text-[11px] bg-destructive/10 rounded px-2 py-1">{varError}</p>}
              {variations.length > 0 && (
                <ul className="space-y-1.5">
                  {variations.map((v, i) => {
                    const open = expandedVar === i;
                    return (
                      <li key={i} className="rounded-md border border-border bg-background overflow-hidden">
                        <div className="flex items-center justify-between gap-2 p-2">
                          <button type="button" onClick={() => setExpandedVar(open ? null : i)} className="flex items-center gap-1.5 min-w-0 text-left flex-1">
                            {open ? <ChevronUp className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold truncate">{v.label}</span>
                              {v.notes && <span className="block text-[10px] text-muted-foreground truncate">{v.notes}</span>}
                            </span>
                          </button>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${levelBadge(v.report.level)}`}>{v.report.level === 'clean' ? 'Clean' : v.report.level === 'caution' ? 'Caution' : 'High risk'}{v.report.score > 0 && ` · ${v.report.score}`}</span>
                            <Button type="button" size="sm" className="h-6 text-[11px] px-2" onClick={() => useVariation(v.edits)}>Use</Button>
                          </div>
                        </div>
                        {open && (
                          <div className="border-t border-border p-2 space-y-2 bg-muted/20">
                            {/* reworded copy */}
                            <div className="space-y-1">
                              {v.fields.map((f, j) => (
                                <p key={j} className="text-[11px] leading-snug"><span className="text-muted-foreground font-medium">{f.label}: </span>{f.value}</p>
                              ))}
                            </div>
                            {/* deliverability check for this variation */}
                            {v.report.findings.length > 0 ? (
                              <ul className="space-y-1 max-h-32 overflow-y-auto border-t border-border pt-1.5">
                                {v.report.findings.map((f, j) => (
                                  <li key={j} className="flex items-start gap-1.5 text-[11px] leading-snug">
                                    <AlertCircle className={`w-3 h-3 shrink-0 mt-0.5 ${f.severity === 'high' ? 'text-destructive' : f.severity === 'medium' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                                    <span className="text-muted-foreground">{f.message}{f.suggestion ? ` ${f.suggestion}` : ''}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 border-t border-border pt-1.5">No spam triggers — clean.</p>
                            )}
                            {/* actions */}
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <Button type="button" size="sm" variant="outline" className="h-6 text-[11px] px-2 gap-1" onClick={() => copyVarText(i, v.text)}>{copiedVar === i ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy text</Button>
                              <Button type="button" size="sm" variant="outline" className="h-6 text-[11px] px-2 gap-1" onClick={() => previewVar(v.html)}><Eye className="w-3 h-3" /> Preview</Button>
                              <Button type="button" size="sm" className="h-6 text-[11px] px-2 ml-auto" onClick={() => useVariation(v.edits)}>Use this</Button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Add block */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add:</span>
              {ADDABLE.map(a => (
                <button key={a.type} type="button" onClick={() => addBlock(a.type)} className="px-2 py-0.5 rounded border border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary">{a.label}</button>
              ))}
            </div>

            {/* Block cards */}
            <div className="space-y-2">
              {doc.blocks.map((b, i) => (
                <div key={b.id} className="rounded-lg border border-border bg-card p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">{TYPE_LABEL[b.type]}</span>
                    <div className="flex items-center gap-1">
                      {b.type !== 'divider' && b.type !== 'wordmark' && (
                        <button type="button" onClick={() => setOpenStyle(openStyle === b.id ? null : b.id)} title="Style" className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] ${openStyle === b.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}><SlidersHorizontal className="w-3 h-3" /> Style</button>
                      )}
                      <button type="button" onClick={() => move(b.id, -1)} disabled={i === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground"><ChevronUp className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => move(b.id, 1)} disabled={i === doc.blocks.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground"><ChevronDown className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => remove(b.id)} title="Remove" className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  {renderFields(b)}
                  {openStyle === b.id && renderStyle(b)}
                  {/* Image picker for this hero block */}
                  {libFor === b.id && (
                    <div className="mt-2 rounded-md border border-border p-2 max-h-52 overflow-y-auto">
                      <div className="flex items-center justify-between mb-1"><span className="text-[11px] text-muted-foreground">Pick an image</span><button type="button" onClick={() => setLibFor(null)} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button></div>
                      {libLoading ? <p className="text-[11px] text-muted-foreground py-4 text-center">Loading…</p>
                        : libImages.length === 0 ? <p className="text-[11px] text-muted-foreground py-4 text-center">No images in your library yet.</p>
                        : <div className="grid grid-cols-4 gap-1.5">{libImages.slice(0, 60).map(im => (
                            <button key={im.id} type="button" onClick={() => pickImage(im.url)} className="aspect-square rounded overflow-hidden border border-border hover:border-primary"><img src={im.url} alt="" loading="lazy" className="w-full h-full object-cover" /></button>
                          ))}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Deliverability */}
            {report && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className={`w-3.5 h-3.5 ${report.level === 'clean' ? 'text-emerald-600' : report.level === 'caution' ? 'text-amber-500' : 'text-destructive'}`} />
                    <Small>Deliverability</Small>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${levelBadge(report.level)}`}>{report.level === 'clean' ? 'Clean' : report.level === 'caution' ? 'Caution' : 'High risk'}{report.score > 0 && ` · risk ${report.score}`}</span>
                  </div>
                  <Button type="button" onClick={handleSanitize} variant="ghost" size="sm" className="h-6 gap-1 text-[11px] px-2"><Wand2 className="w-3 h-3" /> Clean up</Button>
                </div>
                {report.findings.length === 0 ? (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">No spam triggers detected — this copy should deliver well.</p>
                ) : (
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
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

          {/* RIGHT */}
          <div className="lg:sticky lg:top-5 self-start space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Small>Live preview</Small>
              <div className="flex gap-1.5">
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={copyHtml}>{copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy HTML</Button>
                <Button type="button" size="sm" className="h-7 gap-1 text-xs" onClick={downloadHtml}><Download className="w-3 h-3" /> Download</Button>
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-hidden bg-white">
              <iframe title="Email preview" srcDoc={html} sandbox="" style={{ width: '100%', height: 'calc(100vh - 9rem)', border: 0, display: 'block' }} />
            </div>
          </div>
        </div>
        )}

        {tab === 'checker' && (
          <div className="max-w-3xl space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste any email subject and body — or full HTML — to check its spam / deliverability risk. Independent of the builder.
            </p>

            <div className="space-y-1.5">
              <Small>Brand <span className="font-normal normal-case">(optional — so the brand name isn't flagged)</span></Small>
              <div className="flex flex-wrap gap-1.5">
                {BRAND_NAMES.map(bn => (
                  <button key={bn} type="button" onClick={() => setChkBrand(p => p === bn ? '' : bn)} className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${chkBrand === bn ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{bn}</button>
                ))}
              </div>
            </div>

            <div><Label className="text-[11px] mb-0.5 block">Subject line</Label><Input value={chkSubject} onChange={e => setChkSubject(e.target.value)} placeholder="e.g. A quick note about your account" className="h-9 text-sm" /></div>
            <div><Label className="text-[11px] mb-0.5 block">Email body or HTML</Label><Textarea value={chkBody} onChange={e => setChkBody(e.target.value)} placeholder="Paste your copy here. You can paste full HTML too — it's checked on the visible text." className="min-h-[220px] text-sm font-mono" /></div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={chkSanitize} className="gap-1.5 h-8 text-xs" disabled={!chkSubject && !chkBody}><Wand2 className="w-3.5 h-3.5" /> Clean up copy</Button>
              <Button type="button" variant="outline" onClick={() => chkCopy('subject')} className="gap-1.5 h-8 text-xs" disabled={!chkSubject}>{chkCopied === 'subject' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy subject</Button>
              <Button type="button" variant="outline" onClick={() => chkCopy('body')} className="gap-1.5 h-8 text-xs" disabled={!chkBody}>{chkCopied === 'body' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy body</Button>
              <Button type="button" variant="ghost" onClick={() => { setChkSubject(''); setChkBody(''); }} className="gap-1.5 h-8 text-xs ml-auto" disabled={!chkSubject && !chkBody}><Eraser className="w-3.5 h-3.5" /> Clear</Button>
            </div>

            {!chkReport ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                Start typing or paste content above — your deliverability score appears here.
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-4 h-4 ${chkReport.level === 'clean' ? 'text-emerald-600' : chkReport.level === 'caution' ? 'text-amber-500' : 'text-destructive'}`} />
                  <Small>Deliverability</Small>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${levelBadge(chkReport.level)}`}>{chkReport.level === 'clean' ? 'Clean' : chkReport.level === 'caution' ? 'Caution' : 'High risk'}{chkReport.score > 0 && ` · risk ${chkReport.score}`}</span>
                </div>
                {chkReport.findings.length === 0 ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">No spam triggers detected — this copy should deliver well.</p>
                ) : (
                  <ul className="space-y-1.5 max-h-72 overflow-y-auto">
                    {chkReport.findings.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs leading-snug">
                        <AlertCircle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${f.severity === 'high' ? 'text-destructive' : f.severity === 'medium' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                        <span className="text-muted-foreground">{f.message}{f.suggestion ? ` ${f.suggestion}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                  "Clean up copy" auto-fixes mechanical triggers (currency symbols → codes, removes exclamation marks). Spam words are left for you to reword using the suggestions.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
