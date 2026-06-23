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
import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ShieldCheck, Wand2, AlertCircle, Copy, Check, Download,
  ChevronUp, ChevronDown, X, Plus, SlidersHorizontal, Images, Upload, Sparkles, Loader2, Eye, LayoutTemplate, Eraser, Monitor, Smartphone, Save, Trash2, Pencil, GripVertical,
} from 'lucide-react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BRAND_NAMES, getBrandStyle, styleFromColor } from '@/lib/brand-standards';
import { lintDeliverability, autoFix } from '@/lib/deliverability';
import { buildBrandedEmail } from '@/lib/build-branded-email';
import {
  newBlock, moveBlock, removeBlock, updateBlock, defaultEmailDoc,
  type EmailDoc, type EmailBlock, type BlockType, type BlockStyle,
} from '@/lib/email-model';
import { EMAIL_TEMPLATES, buildTemplateDoc } from '@/lib/email-templates';
import { getAllStoredImages, batchStoreImages } from '@/lib/imageStore';

const FLOW = ['Template', 'Build', 'Variations', 'Check', 'Export'];

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

// Custom templates persisted in localStorage.
interface CustomTemplate { id: string; name: string; doc: EmailDoc }
const CUSTOM_KEY = 'pg_email_custom_templates';
function loadCustom(): CustomTemplate[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]') as CustomTemplate[]; } catch { return []; }
}
function saveCustom(list: CustomTemplate[]): void {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch { /* full/blocked */ }
}

// Scaled, non-interactive thumbnail of a rendered email (600px design scaled to fit a card).
function Thumb({ html, w = 270, h = 300 }: { html: string; w?: number; h?: number }) {
  const scale = w / 600;
  return (
    <div className="overflow-hidden bg-white border-b border-border" style={{ width: w, height: h }}>
      <iframe srcDoc={html} sandbox="" scrolling="no" tabIndex={-1} title="Template preview"
        style={{ width: 600, height: h / scale, border: 0, transformOrigin: 'top left', transform: `scale(${scale})`, pointerEvents: 'none' }} />
    </div>
  );
}

// Color control: a swatch picker (easy) + a text box (for hex / keyword / rgb codes).
function ColorField({ value, onChange, placeholder }: { value?: string; onChange: (v: string | undefined) => void; placeholder?: string }) {
  const hex = value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : '#ffffff';
  return (
    <div className="flex items-center gap-1.5">
      <input type="color" value={hex} onChange={e => onChange(e.target.value)} title="Pick a color" aria-label="Pick a color" className="h-7 w-8 shrink-0 rounded border border-border bg-background p-0.5 cursor-pointer" />
      <Input value={value || ''} onChange={e => onChange(e.target.value || undefined)} placeholder={placeholder} className="h-7 text-xs flex-1 min-w-0" />
    </div>
  );
}

// ── Variation helpers (text-only edits applied back to the doc by id) ────────
interface EditField { id: string; type: string; text?: string; offer?: string; code?: string; label?: string; attribution?: string; legal?: string }

function editableBlocks(doc: EmailDoc): EditField[] {
  const out: EditField[] = [];
  for (const b of doc.blocks) {
    if (b.type === 'heading' || b.type === 'paragraph') out.push({ id: b.id, type: b.type, text: b.text });
    else if (b.type === 'bonus') out.push({ id: b.id, type: b.type, offer: b.offer, code: b.code });
    else if (b.type === 'cta') out.push({ id: b.id, type: b.type, label: b.label });
    // Footer attribution + legal are real copy and must travel with translate/clean/variations.
    else if (b.type === 'footer') out.push({ id: b.id, type: b.type, attribution: b.attribution, legal: b.legal });
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
      if (b.type === 'footer') return { ...b, attribution: e.attribution ?? b.attribution, legal: e.legal ?? b.legal };
      return b;
    }),
  };
}

interface DraftFields { subject: string; preheader: string; headline: string; intro: string; bonusOffer: string; bonusCode: string; body: string; ctaLabel: string }

/** Map an AI-drafted email onto the doc's blocks (heading, two paragraphs, bonus, cta) + meta. */
function applyDraft(doc: EmailDoc, d: DraftFields): EmailDoc {
  let paraSeen = 0;
  const blocks = doc.blocks.map(b => {
    if (b.type === 'heading') return { ...b, text: d.headline || b.text };
    if (b.type === 'paragraph') { const v = paraSeen++ === 0 ? d.intro : d.body; return { ...b, text: v || b.text }; }
    if (b.type === 'bonus') return { ...b, offer: d.bonusOffer || b.offer, code: d.bonusCode || b.code };
    if (b.type === 'cta') return { ...b, label: d.ctaLabel || b.label };
    return b;
  });
  return { ...doc, blocks, meta: { ...doc.meta, subject: d.subject || doc.meta.subject, preheader: d.preheader || doc.meta.preheader } };
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
  const [cleaning, setCleaning] = useState(false);
  const [chkCleaning, setChkCleaning] = useState(false);
  const [brief, setBrief] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
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
    subject: string;   // reworded subject line
    preheader: string; // reworded preheader
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
  const [varPanelOpen, setVarPanelOpen] = useState(false); // inline variations panel beside the preview
  const [copiedVar, setCopiedVar] = useState<number | null>(null);

  // View tab + standalone Content Checker (paste any subject/body or HTML)
  const [tab, setTab] = useState<'templates' | 'builder' | 'checker'>('templates');
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>(() => loadCustom());
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [chkBrand, setChkBrand] = useState('');
  const [chkLocale, setChkLocale] = useState('en');
  const [chkSubject, setChkSubject] = useState('');
  const [chkBody, setChkBody] = useState('');
  const [chkCopied, setChkCopied] = useState<'subject' | 'body' | null>(null);
  // Plain-text variations for the Content Checker
  interface ChkVar { label: string; notes: string; subject: string; body: string; report: ReturnType<typeof lintDeliverability> }
  const [chkVariations, setChkVariations] = useState<ChkVar[]>([]);
  const [chkVarLoading, setChkVarLoading] = useState(false);
  const [chkVarError, setChkVarError] = useState<string | null>(null);
  const [chkVarCount, setChkVarCount] = useState(3);
  const [chkVarCopied, setChkVarCopied] = useState<number | null>(null);

  const brand = doc.meta.brand;

  // ── Mutations ─────────────────────────────────────────────────────────────
  const patchMeta = (patch: Partial<EmailDoc['meta']>) => { setDoc(d => ({ ...d, meta: { ...d.meta, ...patch } })); setDirty(true); };
  const patchBlock = (id: string, patch: Partial<EmailBlock>) => { setDoc(d => ({ ...d, blocks: updateBlock(d.blocks, id, patch) })); setDirty(true); };
  const patchStyle = (id: string, key: keyof BlockStyle, value: BlockStyle[keyof BlockStyle]) => {
    setDoc(d => ({ ...d, blocks: d.blocks.map(b => b.id === id ? { ...b, style: { ...b.style, [key]: value } } : b) }));
    setDirty(true);
  };
  const move = (id: string, dir: -1 | 1) => setDoc(d => ({ ...d, blocks: moveBlock(d.blocks, id, dir) }));
  // Drag-and-drop reorder
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const reorderBlocks = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setDoc(d => {
      const arr = d.blocks.slice();
      const [m] = arr.splice(from, 1);
      arr.splice(to, 0, m);
      return { ...d, blocks: arr };
    });
    setDirty(true);
  };
  const remove = (id: string) => { setDoc(d => ({ ...d, blocks: removeBlock(d.blocks, id) })); setDirty(true); };
  const addBlock = (type: BlockType) => { setDoc(d => ({ ...d, blocks: [...d.blocks, newBlock(type, genId())] })); setDirty(true); };

  const selectBrand = (b: string) => {
    const nb = brand === b ? '' : b;
    if (!dirty && activeTemplate) {
      const t = EMAIL_TEMPLATES.find(x => x.id === activeTemplate);
      if (t) { setDoc(buildTemplateDoc(t, nb, genId)); return; }
    }
    setDoc(d => ({ ...d, meta: { ...d.meta, brand: nb, themeColor: undefined } }));
  };
  const loadTemplate = (id: string) => {
    const t = EMAIL_TEMPLATES.find(x => x.id === id);
    if (!t) return;
    setDoc(buildTemplateDoc(t, brand, genId));
    setActiveTemplate(id);
    setDirty(false);
  };

  // Draft a full email from a one-line idea (subject, preheader, heading, body, bonus, CTA).
  const draftEmail = async () => {
    if (!brief.trim()) { setDraftError('Describe the email idea first.'); return; }
    setDrafting(true); setDraftError(null);
    try {
      const res = await fetch('/api/draft-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: brief.trim(), brand, locale: doc.meta.locale }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({} as { error?: string }));
        setDraftError(e.error || `Request failed (${res.status})`);
        return;
      }
      const d = await res.json() as DraftFields;
      setDoc(cur => applyDraft(cur, d));
      setDirty(true);
      setActiveTemplate('');
    } catch {
      setDraftError('Could not reach the AI service. Try again.');
    } finally {
      setDrafting(false);
    }
  };

  // Template gallery → builder
  const chooseTemplate = (id: string) => { loadTemplate(id); setTab('builder'); };
  const startBlank = () => { setDoc(defaultEmailDoc(brand, genId)); setActiveTemplate(''); setDirty(true); setTab('builder'); };
  const useCustom = (id: string) => {
    const ct = customTemplates.find(c => c.id === id);
    if (!ct) return;
    setDoc(JSON.parse(JSON.stringify(ct.doc)) as EmailDoc);
    setActiveTemplate(''); setDirty(true); setTab('builder');
  };
  const deleteCustom = (id: string) => {
    const next = customTemplates.filter(c => c.id !== id);
    setCustomTemplates(next); saveCustom(next);
  };
  const saveAsTemplate = () => {
    const name = window.prompt('Name this template:', doc.meta.subject || 'My template');
    if (!name) return;
    const next = [...customTemplates, { id: `ct-${genId()}`, name, doc: JSON.parse(JSON.stringify(doc)) as EmailDoc }];
    setCustomTemplates(next); saveCustom(next);
  };

  // Build a full EmailDoc from a generated variation (so each can be SAVED/kept,
  // not just the one you "Use"). This is how all generated HTML is retained.
  const docFromVariation = (v: VariationResult): EmailDoc => ({
    ...applyEdits(doc, v.edits),
    meta: { ...doc.meta, subject: v.subject || doc.meta.subject, preheader: v.preheader || doc.meta.preheader },
  });
  // Track which variations have been saved (for a "Saved ✓" affordance).
  const [savedVarIdx, setSavedVarIdx] = useState<number[]>([]);
  const saveVariation = (v: VariationResult, i: number) => {
    const name = `${doc.meta.subject || 'Email'} — ${v.label}`;
    const next = [...customTemplates, { id: `ct-${genId()}`, name, doc: JSON.parse(JSON.stringify(docFromVariation(v))) as EmailDoc }];
    setCustomTemplates(next); saveCustom(next);
    setSavedVarIdx(p => p.includes(i) ? p : [...p, i]);
  };
  const saveAllVariations = () => {
    const items = variations.map(v => ({ id: `ct-${genId()}`, name: `${doc.meta.subject || 'Email'} — ${v.label}`, doc: JSON.parse(JSON.stringify(docFromVariation(v))) as EmailDoc }));
    const next = [...customTemplates, ...items];
    setCustomTemplates(next); saveCustom(next);
    setSavedVarIdx(variations.map((_, i) => i));
  };

  // Rendered previews for the gallery
  const templatePreviews = useMemo(
    () => EMAIL_TEMPLATES.map(t => ({ t, html: buildBrandedEmail(buildTemplateDoc(t, brand, genId), getBrandStyle(brand)).html })),
    [brand],
  );
  const customPreviews = useMemo(
    () => customTemplates.map(ct => ({ ct, html: buildBrandedEmail(ct.doc, getBrandStyle(ct.doc.meta.brand)).html })),
    [customTemplates],
  );

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
  // Upload a header logo (for custom brands / overrides) — stored as a data URI.
  const uploadLogo = (blockId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (reader.result) patchBlock(blockId, { logoUrl: reader.result as string } as Partial<EmailBlock>); };
    reader.readAsDataURL(file); e.target.value = '';
  };

  // ── Preview + checker ───────────────────────────────────────────────────
  // Resolved palette: a custom signature colour overrides the brand palette.
  const style = useMemo(
    () => (doc.meta.themeColor ? styleFromColor(doc.meta.themeColor) : getBrandStyle(brand)),
    [doc.meta.themeColor, brand],
  );
  const html = useMemo(() => buildBrandedEmail(doc, style).html, [doc, style]);
  const report = useMemo(() => {
    const parts: string[] = [];
    if (doc.meta.preheader) parts.push(doc.meta.preheader); // preheader is checked too
    for (const b of doc.blocks) {
      if (b.type === 'heading' || b.type === 'paragraph') parts.push(b.text);
      else if (b.type === 'bonus') parts.push(b.offer);
      else if (b.type === 'cta') parts.push(b.label);
    }
    const body = parts.filter(Boolean).join('\n');
    if (!doc.meta.subject.trim() && !body.trim()) return null;
    return lintDeliverability(doc.meta.subject, body, { ignore: brand ? [brand] : [], locale: doc.meta.locale });
  }, [doc, brand]);

  // Mechanical fallback (used offline / if the AI clean is unavailable).
  const mechanicalClean = () => {
    const fix = (s: string) => autoFix(s, { ignore: brand ? [brand] : [], locale: doc.meta.locale });
    setDoc(d => ({
      ...d,
      meta: { ...d.meta, subject: fix(d.meta.subject), preheader: fix(d.meta.preheader) },
      blocks: d.blocks.map(b => {
        if (b.type === 'heading' || b.type === 'paragraph') return { ...b, text: fix(b.text) };
        if (b.type === 'bonus') return { ...b, offer: fix(b.offer) };
        if (b.type === 'cta') return { ...b, label: fix(b.label) };
        return b;
      }),
    }));
    setDirty(true);
  };
  // AI clean: rewrites to remove ALL flagged issues (incl. repetition); falls back to mechanical.
  // Whatever comes back, we ALSO run the deterministic locale-aware autoFix as a
  // guaranteed final pass — so flagged terms (incl. German/Norwegian/Italian like
  // "angebot") are removed even if the AI prompt misses them.
  const handleSanitize = async () => {
    setCleaning(true);
    const fix = (s: string) => autoFix(s, { ignore: brand ? [brand] : [], locale: doc.meta.locale });
    // The exact flagged spam terms + safer alternatives, so the AI fixes the right words in any language.
    const terms = (report?.findings ?? [])
      .filter(f => f.type === 'spam_word')
      .map(f => ({ from: f.match, to: f.suggestion?.match(/"([^"]+)"/)?.[1] || '' }))
      .filter(t => t.to);
    try {
      const res = await fetch('/api/clean-email-copy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: doc.meta.subject, preheader: doc.meta.preheader, brand, locale: doc.meta.locale, blocks: editableBlocks(doc), terms }),
      });
      if (res.ok) {
        const data = await res.json() as { subject?: string; preheader?: string; blocks?: EditField[] };
        setDoc(d => {
          const withBlocks = applyEdits(d, (data.blocks || []) as EditField[]);
          return {
            ...withBlocks,
            meta: { ...withBlocks.meta, subject: fix(data.subject || d.meta.subject), preheader: fix(data.preheader || d.meta.preheader) },
            blocks: withBlocks.blocks.map(b => {
              if (b.type === 'heading' || b.type === 'paragraph') return { ...b, text: fix(b.text) };
              if (b.type === 'bonus') return { ...b, offer: fix(b.offer) };
              if (b.type === 'cta') return { ...b, label: fix(b.label) };
              return b;
            }),
          };
        });
        setDirty(true);
      } else {
        mechanicalClean();
      }
    } catch {
      mechanicalClean();
    } finally {
      setCleaning(false);
    }
  };

  // Translate the CURRENT email (any template) into doc.meta.locale, in place —
  // so you don't have to re-draft from scratch to get another language.
  const translateEmail = async () => {
    setTranslateError(null); setTranslating(true);
    try {
      const res = await fetch('/api/translate-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: doc.meta.subject, preheader: doc.meta.preheader, brand, locale: doc.meta.locale, blocks: editableBlocks(doc) }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({} as { error?: string }));
        setTranslateError(e.error || `Request failed (${res.status})`);
        return;
      }
      const data = await res.json() as { subject?: string; preheader?: string; blocks?: EditField[] };
      setDoc(d => {
        const withBlocks = applyEdits(d, (data.blocks || []) as EditField[]);
        return { ...withBlocks, meta: { ...withBlocks.meta, subject: data.subject || d.meta.subject, preheader: data.preheader || d.meta.preheader } };
      });
      setDirty(true);
    } catch {
      setTranslateError('Could not reach the AI service. Try again.');
    } finally {
      setTranslating(false);
    }
  };

  // default template loaded once; re-sync to brand handled in selectBrand
  useEffect(() => { /* doc seeded in useState initializer */ }, []);

  // ── AI variations: reword the text blocks N ways, re-score each ───────────
  const generateVariations = async () => {
    setVarError(null); setVarLoading(true); setVariations([]);
    try {
      const res = await fetch('/api/generate-email-variations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: doc.meta.subject, preheader: doc.meta.preheader, brand, locale: doc.meta.locale, blocks: editableBlocks(doc), count: varCount }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({} as { error?: string }));
        setVarError(e.error || `Request failed (${res.status})`);
        return;
      }
      const data = await res.json() as { variations: { label: string; notes: string; subject?: string; preheader?: string; blocks: EditField[] }[] };
      const results: VariationResult[] = (data.variations || []).map(v => {
        const subject = v.subject || doc.meta.subject;
        const preheader = v.preheader || doc.meta.preheader;
        const applied: EmailDoc = { ...applyEdits(doc, v.blocks), meta: { ...doc.meta, subject, preheader } };
        const built = buildBrandedEmail(applied, style);
        const parts: string[] = [];
        if (preheader) parts.push(preheader);
        for (const b of applied.blocks) {
          if (b.type === 'heading' || b.type === 'paragraph') parts.push(b.text);
          else if (b.type === 'bonus') parts.push(b.offer);
          else if (b.type === 'cta') parts.push(b.label);
        }
        const report = lintDeliverability(subject, parts.filter(Boolean).join('\n'), { ignore: brand ? [brand] : [], locale: doc.meta.locale });
        const fields = [
          ...(subject ? [{ label: 'Subject', value: subject }] : []),
          ...(preheader ? [{ label: 'Preheader', value: preheader }] : []),
          ...(v.blocks || []).map(e => {
            if (e.type === 'heading') return { label: 'Heading', value: e.text || '' };
            if (e.type === 'paragraph') return { label: 'Text', value: e.text || '' };
            if (e.type === 'bonus') return { label: 'Bonus', value: [e.offer, e.code ? `(code ${e.code})` : ''].filter(Boolean).join(' ') };
            if (e.type === 'cta') return { label: 'CTA', value: e.label || '' };
            return { label: e.type, value: '' };
          }),
        ].filter(f => f.value);
        return { label: v.label, notes: v.notes, subject, preheader, edits: v.blocks, report, text: built.text, html: built.html, fields };
      });
      setVariations(results);
      setExpandedVar(results.length ? 0 : null);
      setSavedVarIdx([]); // fresh batch — reset saved markers
      if (results.length) setVarPanelOpen(true); // reveal the inline variations panel
    } catch {
      setVarError('Could not reach the AI service. Try again.');
    } finally {
      setVarLoading(false);
    }
  };

  const useVariation = (v: VariationResult) => {
    setDoc(d => ({ ...applyEdits(d, v.edits), meta: { ...d.meta, subject: v.subject || d.meta.subject, preheader: v.preheader || d.meta.preheader } }));
    setDirty(true); setActiveTemplate('');
  };
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
    return lintDeliverability(subj, body, { ignore: chkBrand ? [chkBrand] : [], locale: chkLocale });
  }, [chkSubject, chkBody, chkBrand, chkLocale]);
  const chkSanitize = async () => {
    setChkCleaning(true);
    const ig = chkBrand ? [chkBrand] : [];
    const fallback = () => { setChkSubject(s => autoFix(s, { ignore: ig, locale: chkLocale })); setChkBody(s => autoFix(s, { ignore: ig, locale: chkLocale })); };
    try {
      const blocks = [
        { id: 'subject', type: 'heading', text: chkSubject },
        { id: 'body', type: 'paragraph', text: stripHtml(chkBody) },
      ].filter(x => x.text.trim());
      const res = await fetch('/api/clean-email-copy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: chkSubject, brand: chkBrand, locale: chkLocale, blocks }),
      });
      if (res.ok) {
        const data = await res.json() as { subject?: string; blocks?: { id: string; text?: string }[] };
        const byId = new Map((data.blocks || []).map(e => [e.id, e.text || '']));
        setChkSubject(data.subject || byId.get('subject') || chkSubject);
        setChkBody(byId.get('body') ?? stripHtml(chkBody));
      } else {
        fallback();
      }
    } catch {
      fallback();
    } finally {
      setChkCleaning(false);
    }
  };
  const chkCopy = async (kind: 'subject' | 'body') => {
    try { await navigator.clipboard.writeText(kind === 'subject' ? chkSubject : chkBody); setChkCopied(kind); setTimeout(() => setChkCopied(null), 1500); } catch { /* blocked */ }
  };

  // Plain-text variations: rewrite the pasted subject + body N ways, re-score each.
  const generateChkVariations = async () => {
    setChkVarError(null); setChkVarLoading(true); setChkVariations([]);
    const bodyText = stripHtml(chkBody);
    if (!chkSubject.trim() && !bodyText.trim()) { setChkVarError('Add a subject or body first.'); setChkVarLoading(false); return; }
    try {
      const blocks = [
        { id: 'subject', type: 'heading', text: chkSubject },
        { id: 'body', type: 'paragraph', text: bodyText },
      ].filter(x => x.text.trim());
      const res = await fetch('/api/generate-email-variations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: chkSubject, brand: chkBrand, locale: chkLocale, blocks, count: chkVarCount }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({} as { error?: string }));
        setChkVarError(e.error || `Request failed (${res.status})`);
        return;
      }
      const data = await res.json() as { variations: { label: string; notes: string; blocks: { id: string; text?: string }[] }[] };
      const results: ChkVar[] = (data.variations || []).map(v => {
        const byId = new Map((v.blocks || []).map(e => [e.id, e.text || '']));
        const subject = byId.get('subject') ?? chkSubject;
        const body = byId.get('body') ?? bodyText;
        const report = lintDeliverability(subject, body, { ignore: chkBrand ? [chkBrand] : [], locale: chkLocale });
        return { label: v.label, notes: v.notes, subject, body, report };
      });
      setChkVariations(results);
    } catch {
      setChkVarError('Could not reach the AI service. Try again.');
    } finally {
      setChkVarLoading(false);
    }
  };
  const chkCopyVar = async (i: number, v: ChkVar) => {
    const txt = `${v.subject ? `Subject: ${v.subject}\n\n` : ''}${v.body}`;
    try { await navigator.clipboard.writeText(txt); setChkVarCopied(i); setTimeout(() => setChkVarCopied(null), 1500); } catch { /* blocked */ }
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
        <div className="space-y-1.5">
          <Label className="text-[11px] mb-0.5 block">Header style</Label>
          <select value={b.mode ?? 'banner'} onChange={e => patchBlock(b.id, { mode: e.target.value as 'banner' | 'logo' | 'text' } as Partial<EmailBlock>)} className="h-8 text-sm w-full rounded-md border border-border bg-background px-2">
            <option value="banner">Composite band (brand header image)</option>
            <option value="logo">Logo only</option>
            <option value="text">Brand name (text)</option>
          </select>
          {b.mode === 'text' && (
            <div>
              <Label className="text-[11px] mb-0.5 block">Header text (brand name)</Label>
              <Input value={brand} onChange={e => patchMeta({ brand: e.target.value })} placeholder="e.g. Galaxy Bets" className="h-8 text-sm" />
            </div>
          )}
          {b.mode !== 'text' && (
            <>
              <Label className="text-[11px] mb-0.5 block">Logo {b.logoUrl ? '' : '(optional override)'}</Label>
              {b.logoUrl && (
                <div className="flex items-center gap-2">
                  <img src={b.logoUrl} alt="" className="h-9 max-w-[140px] object-contain rounded border border-border bg-white p-0.5" />
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive" onClick={() => patchBlock(b.id, { logoUrl: '' } as Partial<EmailBlock>)}><X className="w-3 h-3" /> Remove logo</Button>
                </div>
              )}
              <div className="flex gap-1.5">
                <Input value={b.logoUrl || ''} onChange={e => patchBlock(b.id, { logoUrl: e.target.value } as Partial<EmailBlock>)} placeholder="Paste a logo URL…" className="h-8 text-sm" />
                <label className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border bg-background text-xs cursor-pointer hover:bg-muted shrink-0"><Upload className="w-3.5 h-3.5" /> Upload<input type="file" accept="image/*" className="hidden" onChange={e => uploadLogo(b.id, e)} /></label>
              </div>
            </>
          )}
          <p className="text-[10px] text-muted-foreground">Open <span className="font-medium">Style</span> to set size (width), position (align) &amp; background.</p>
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
              {b.url ? (
                <div className="flex items-center gap-2">
                  <img src={b.url} alt="" className="h-12 w-20 object-cover rounded border border-border" />
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive" onClick={() => patchBlock(b.id, { url: '' } as Partial<EmailBlock>)}><X className="w-3 h-3" /> Remove image</Button>
                </div>
              ) : null}
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
        <div><Label className="text-[10px] mb-0.5 block">Text color</Label><ColorField value={st.color} onChange={v => patchStyle(b.id, 'color', v)} placeholder="#172b4d" /></div>
        {((b.type === 'hero' && b.mode !== 'url') || b.type === 'header' || b.type === 'bonus') && <div><Label className="text-[10px] mb-0.5 block">Background</Label><ColorField value={st.background} onChange={v => patchStyle(b.id, 'background', v)} placeholder="white / #0b1b2b" /></div>}
        <div><Label className="text-[10px] mb-0.5 block">Space above (px)</Label><Input type="number" value={num(st.spaceTop)} onChange={e => patchStyle(b.id, 'spaceTop', e.target.value ? Number(e.target.value) : undefined)} className="h-7 text-xs" /></div>
        <div><Label className="text-[10px] mb-0.5 block">Space below (px)</Label><Input type="number" value={num(st.spaceBottom)} onChange={e => patchStyle(b.id, 'spaceBottom', e.target.value ? Number(e.target.value) : undefined)} className="h-7 text-xs" /></div>
        {(b.type === 'hero' || b.type === 'header') && <div><Label className="text-[10px] mb-0.5 block">Width (px)</Label><Input type="number" value={num(st.width)} onChange={e => patchStyle(b.id, 'width', e.target.value ? Number(e.target.value) : undefined)} className="h-7 text-xs" /></div>}
        {(b.type === 'hero' || b.type === 'cta' || b.type === 'header') && <div><Label className="text-[10px] mb-0.5 block">Corner radius (px)</Label><Input type="number" value={num(st.radius)} onChange={e => patchStyle(b.id, 'radius', e.target.value ? Number(e.target.value) : undefined)} className="h-7 text-xs" /></div>}
        {b.type === 'cta' && <div className="flex items-end gap-1.5"><button type="button" onClick={() => patchStyle(b.id, 'fullWidth', !st.fullWidth)} className={`px-2 py-1 rounded border text-[11px] ${st.fullWidth ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>Full width</button></div>}
        {b.type === 'bonus' && (() => {
          // Resolve current side: explicit ruleSide wins; fall back to legacy hideRule.
          const side = st.ruleSide ?? (st.hideRule ? 'none' : 'left');
          return (
            <div className="col-span-2 flex items-center gap-1.5"><span className="text-[11px] text-muted-foreground">Accent rule:</span>
              {(['none', 'left', 'right'] as const).map(opt => (
                <button key={opt} type="button" onClick={() => patchStyle(b.id, 'ruleSide', opt)} className={`px-2 py-0.5 rounded border text-[11px] capitalize ${side === opt ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}`}>{opt}</button>
              ))}
            </div>
          );
        })()}
      </div>
    );
  };

  // Shared live-preview pane — rendered on BOTH the Builder and AI Tools tabs so
  // drafting / variations show their result without switching tabs.
  const previewPane = (
    <div className="lg:sticky lg:top-5 self-start space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Small>Live preview</Small>
          <div className="flex gap-0.5 p-0.5 rounded-md bg-muted border border-border">
            <button type="button" onClick={() => setDevice('desktop')} title="Desktop" className={`p-1 rounded transition-colors ${device === 'desktop' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}><Monitor className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => setDevice('mobile')} title="Mobile" className={`p-1 rounded transition-colors ${device === 'mobile' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}><Smartphone className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted border border-border">
            {/* Light / Dark clear any custom colour; Custom reveals a colour picker. */}
            <button type="button" onClick={() => patchMeta({ dark: false, bgColor: undefined })} title="Light background" className={`px-1.5 py-1 rounded text-[11px] transition-colors ${!doc.meta.dark && !doc.meta.bgColor ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Light</button>
            <button type="button" onClick={() => patchMeta({ dark: true, bgColor: undefined })} title="Dark background" className={`px-1.5 py-1 rounded text-[11px] transition-colors ${doc.meta.dark && !doc.meta.bgColor ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Dark</button>
            <button type="button" onClick={() => patchMeta({ bgColor: doc.meta.bgColor || '#f4ede2' })} title="Custom background colour" className={`px-1.5 py-1 rounded text-[11px] transition-colors ${doc.meta.bgColor ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Custom</button>
            {doc.meta.bgColor && (
              <input type="color" value={doc.meta.bgColor} onChange={e => patchMeta({ bgColor: e.target.value })} title="Pick background colour" className="w-6 h-6 rounded border border-border bg-transparent cursor-pointer p-0" />
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {/* Toggle the inline variations panel (shown beside the preview) */}
          <Button type="button" variant={varPanelOpen ? 'default' : 'outline'} size="sm" className="h-7 gap-1 text-xs" onClick={() => setVarPanelOpen(o => !o)} title="Show the variations panel">
            <Sparkles className="w-3 h-3" /> {variations.length ? `Variations (${variations.length})` : 'Variations'}
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => previewVar(html)}><Eye className="w-3 h-3" /> Full preview</Button>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={saveAsTemplate}><Save className="w-3 h-3" /> Save</Button>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={copyHtml}>{copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy</Button>
          <Button type="button" size="sm" className="h-7 gap-1 text-xs" onClick={downloadHtml}><Download className="w-3 h-3" /> Download</Button>
        </div>
      </div>
      {varError && <p className="text-destructive text-[11px] bg-destructive/10 rounded px-2 py-1">{varError}</p>}
      <div className="rounded-xl border border-border bg-muted/40 p-3 flex justify-center overflow-auto" style={{ height: 'calc(100vh - 10rem)' }}>
        <div className="bg-white rounded-lg shadow-md overflow-hidden h-full" style={{ width: device === 'mobile' ? 390 : '100%', maxWidth: device === 'mobile' ? 390 : 680, transition: 'width .2s ease' }}>
          <iframe title="Email preview" srcDoc={html} sandbox="" style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
        </div>
      </div>
    </div>
  );

  // Variation card used inside the inline panel (Original + each generated variation).
  const varCard = (
    opts: { thumb: string; title: string; badge?: ReactNode; note?: string; rows: { label: string; value: string }[]; actions: ReactNode; highlight?: boolean },
  ) => (
    <div className={`rounded-lg border bg-background overflow-hidden flex flex-col ${opts.highlight ? 'border-2 border-primary/40' : 'border-border'}`}>
      <Thumb html={opts.thumb} w={330} h={170} />
      <div className="p-2.5 space-y-1.5 flex-1 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold truncate">{opts.title}</p>
          {opts.badge}
        </div>
        {opts.note && <p className="text-[10px] text-muted-foreground leading-snug">{opts.note}</p>}
        <div className="space-y-0.5 flex-1">
          {opts.rows.map((r, j) => (
            <p key={j} className="text-[11px] leading-snug"><span className="text-muted-foreground font-medium">{r.label}: </span>{r.value}</p>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">{opts.actions}</div>
      </div>
    </div>
  );

  // Inline variations panel — sits to the RIGHT of the live preview (no popup).
  // Pick how many, Generate, then keep/use any of them (plus the original).
  const variationsPanel = (
    <div className="lg:sticky lg:top-5 self-start rounded-xl border border-border bg-card flex flex-col" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
      <div className="flex items-center justify-between gap-2 p-3 border-b border-border">
        <span className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="w-4 h-4 text-primary" /> Variations{variations.length > 0 && <span className="text-xs font-normal text-muted-foreground">(orig + {variations.length})</span>}</span>
        <button type="button" onClick={() => setVarPanelOpen(false)} title="Close" className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-3 border-b border-border flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-muted-foreground">How many:</span>
        <Input type="number" min={1} max={10} value={varCount} onChange={e => setVarCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} className="h-7 w-14 text-xs" />
        <span className="text-[10px] text-muted-foreground">max 10</span>
        <Button type="button" size="sm" className="h-7 gap-1 text-xs ml-auto" onClick={generateVariations} disabled={varLoading}>
          {varLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} {varLoading ? 'Generating…' : variations.length ? 'Regenerate' : 'Generate'}
        </Button>
        {variations.length > 0 && <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={saveAllVariations} title="Save every variation to your templates"><Save className="w-3 h-3" /> Save all</Button>}
      </div>
      {varError && <p className="text-destructive text-[11px] bg-destructive/10 rounded m-3 px-2 py-1">{varError}</p>}
      <div className="p-3 space-y-3 overflow-y-auto">
        {variations.length === 0 && !varLoading && (
          <p className="text-xs text-muted-foreground text-center py-8">Choose how many, then <strong>Generate</strong> — reworded versions appear here next to your email.</p>
        )}
        {variations.length > 0 && varCard({
          thumb: html,
          title: 'Original',
          highlight: true,
          badge: <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 bg-primary/15 text-primary">Current</span>,
          note: 'Your email as it is now.',
          rows: [
            ...(doc.meta.subject ? [{ label: 'Subject', value: doc.meta.subject }] : []),
            ...(doc.meta.preheader ? [{ label: 'Preheader', value: doc.meta.preheader }] : []),
          ],
          actions: (<>
            <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1" onClick={() => previewVar(html)}><Eye className="w-3 h-3" /> Preview</Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1" onClick={saveAsTemplate}><Save className="w-3 h-3" /> Save</Button>
          </>),
        })}
        {variations.map((v, i) => {
          const saved = savedVarIdx.includes(i);
          return (
            <div key={i}>{varCard({
              thumb: v.html,
              title: v.label,
              badge: <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${levelBadge(v.report.level)}`}>{v.report.level === 'clean' ? 'Clean' : v.report.level === 'caution' ? 'Caution' : 'High risk'}{v.report.score > 0 && ` · ${v.report.score}`}</span>,
              note: v.notes,
              rows: v.fields,
              actions: (<>
                <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1" onClick={() => copyVarText(i, v.text)}>{copiedVar === i ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1" onClick={() => previewVar(v.html)}><Eye className="w-3 h-3" /> Preview</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1" onClick={() => saveVariation(v, i)} disabled={saved}>{saved ? <><Check className="w-3 h-3" /> Saved</> : <><Save className="w-3 h-3" /> Save</>}</Button>
                <Button type="button" size="sm" className="h-7 text-[11px] px-2 ml-auto" onClick={() => useVariation(v)}>Use</Button>
              </>),
            })}</div>
          );
        })}
      </div>
    </div>
  );

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
          <button type="button" onClick={() => setTab('templates')} className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'templates' ? 'bg-card shadow-sm text-foreground border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
            <LayoutTemplate className="w-3.5 h-3.5" /> Templates
          </button>
          <button type="button" onClick={() => setTab('builder')} className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'builder' ? 'bg-card shadow-sm text-foreground border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
            <Pencil className="w-3.5 h-3.5" /> Builder
          </button>
          <button type="button" onClick={() => setTab('checker')} className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'checker' ? 'bg-card shadow-sm text-foreground border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
            <ShieldCheck className="w-3.5 h-3.5" /> Content Checker
          </button>
        </div>

        {tab === 'templates' && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Small>Brand <span className="font-normal normal-case">— preview templates for this brand</span></Small>
              <div className="flex flex-wrap gap-1.5">
                {BRAND_NAMES.map(bn => (
                  <button key={bn} type="button" onClick={() => selectBrand(bn)} className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${brand === bn ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{bn}</button>
                ))}
              </div>
            </div>

            <div>
              <Small>Brand templates <span className="font-normal normal-case">— pick one to edit</span></Small>
              <div className="flex flex-wrap gap-3 mt-2">
                {templatePreviews.map(({ t, html }) => (
                  <div key={t.id} className="rounded-lg border border-border bg-card overflow-hidden flex flex-col shadow-sm" style={{ width: 270 }}>
                    <Thumb html={html} />
                    <div className="p-2.5 space-y-1.5 flex-1 flex flex-col">
                      <p className="text-sm font-semibold leading-tight">{t.name}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug flex-1">{t.description}</p>
                      <Button type="button" size="sm" className="w-full h-7 text-xs gap-1" onClick={() => chooseTemplate(t.id)}><Pencil className="w-3 h-3" /> Use &amp; edit</Button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={startBlank} className="rounded-lg border-2 border-dashed border-border hover:border-primary text-muted-foreground hover:text-foreground flex flex-col items-center justify-center gap-2 transition-colors" style={{ width: 270 }}>
                  <Plus className="w-6 h-6" />
                  <span className="text-sm font-medium">Start blank</span>
                  <span className="text-[11px]">Build a custom email from scratch</span>
                </button>
              </div>
            </div>

            {customPreviews.length > 0 && (
              <div>
                <Small>Your custom templates</Small>
                <div className="flex flex-wrap gap-3 mt-2">
                  {customPreviews.map(({ ct, html }) => (
                    <div key={ct.id} className="rounded-lg border border-border bg-card overflow-hidden flex flex-col shadow-sm" style={{ width: 270 }}>
                      <Thumb html={html} />
                      <div className="p-2.5 space-y-1.5">
                        <p className="text-sm font-semibold leading-tight truncate">{ct.name}</p>
                        <div className="flex gap-1.5">
                          <Button type="button" size="sm" className="flex-1 h-7 text-xs gap-1" onClick={() => useCustom(ct.id)}><Pencil className="w-3 h-3" /> Edit</Button>
                          <Button type="button" size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => deleteCustom(ct.id)} title="Delete"><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'builder' && (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
            {/* LEFT: free-form sections — open any, in any order. Nothing is forced. */}
            <div className="lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:pr-1">
              <Accordion type="multiple" defaultValue={['blocks']} className="space-y-2">

                {/* Optional AI assist — collapsed by default; ignore it and build by hand if you prefer */}
                <AccordionItem value="ai" className="border border-primary/30 rounded-lg bg-primary/5 px-3">
                  <AccordionTrigger className="py-2.5 hover:no-underline">
                    <span className="flex items-center gap-2 text-left min-w-0">
                      <span className="inline-flex w-7 h-7 rounded-md bg-primary/15 items-center justify-center shrink-0"><Sparkles className="w-4 h-4 text-primary" /></span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold">Write with AI <span className="font-normal text-muted-foreground">— optional</span></span>
                        <span className="block text-[10px] text-muted-foreground font-normal leading-snug">Describe an idea and let AI draft the whole email — or just build it yourself below.</span>
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Language:</span>
                    <select value={doc.meta.locale} onChange={e => patchMeta({ locale: e.target.value })} className="h-7 text-xs rounded-md border border-border bg-background px-2 flex-1">
                      <option value="en">English</option>
                      <option value="de">German</option>
                      <option value="no">Norwegian</option>
                      <option value="it">Italian</option>
                    </select>
                  </div>
                  <Textarea value={brief} onChange={e => setBrief(e.target.value)} placeholder="e.g. Welcome offer: extra value up to USD 200, no deposit, ends Friday" className="min-h-[56px] text-sm" />
                  <Button type="button" onClick={draftEmail} disabled={drafting || !brief.trim()} className="w-full h-8 gap-1.5 text-xs">
                    {drafting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Drafting…</> : <><Sparkles className="w-3.5 h-3.5" /> Draft the email</>}
                  </Button>
                  {draftError && <p className="text-destructive text-[11px] bg-destructive/10 rounded px-2 py-1">{draftError}</p>}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="brand" className="border border-border rounded-lg bg-card px-3">
                  <AccordionTrigger className="py-2.5 hover:no-underline"><span className="flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="w-3.5 h-3.5 text-primary" /> Brand &amp; subject</span></AccordionTrigger>
                  <AccordionContent className="pb-3 space-y-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {BRAND_NAMES.map(b => (
                        <button key={b} type="button" onClick={() => selectBrand(b)} className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${brand === b ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{b}</button>
                      ))}
                    </div>
                    <div><Label className="text-[11px] mb-0.5 block">Brand name <span className="font-normal normal-case text-muted-foreground">(type any — for a custom brand)</span></Label>
                      <Input value={brand} onChange={e => patchMeta({ brand: e.target.value })} placeholder="e.g. My New Brand" className="h-8 text-sm" /></div>
                    <div><Label className="text-[11px] mb-0.5 block">Brand color <span className="font-normal normal-case text-muted-foreground">(signature colour — themes the whole email)</span></Label>
                      <ColorField value={doc.meta.themeColor} onChange={v => patchMeta({ themeColor: v })} placeholder="e.g. #E11D2A or orange" /></div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div><Label className="text-[11px] mb-0.5 block">Subject line</Label><Input value={doc.meta.subject} onChange={e => patchMeta({ subject: e.target.value })} className="h-8 text-sm" /></div>
                      <div><Label className="text-[11px] mb-0.5 block">Preheader</Label><Input value={doc.meta.preheader} onChange={e => patchMeta({ preheader: e.target.value })} className="h-8 text-sm" /></div>
                    </div>
                    {/* Language: available for ANY template (not only AI drafting). Pick a
                        language, then "Translate" rewrites the current email in place. */}
                    <div>
                      <Label className="text-[11px] mb-0.5 block">Language</Label>
                      <div className="flex items-center gap-1.5">
                        <select value={doc.meta.locale} onChange={e => patchMeta({ locale: e.target.value })} className="h-8 text-sm rounded-md border border-border bg-background px-2 flex-1">
                          <option value="en">English</option>
                          <option value="de">German</option>
                          <option value="no">Norwegian</option>
                          <option value="it">Italian</option>
                        </select>
                        <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs whitespace-nowrap" onClick={translateEmail} disabled={translating} title="Translate this email's copy into the selected language">
                          {translating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Translating…</> : <><Sparkles className="w-3.5 h-3.5" /> Translate</>}
                        </Button>
                      </div>
                      {translateError && <p className="text-destructive text-[11px] bg-destructive/10 rounded px-2 py-1 mt-1">{translateError}</p>}
                    </div>
                    <button type="button" onClick={() => setTab('templates')} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"><LayoutTemplate className="w-3 h-3" /> Change template</button>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="blocks" className="border border-border rounded-lg bg-card px-3">
                  <AccordionTrigger className="py-2.5 hover:no-underline"><span className="flex items-center gap-1.5 text-xs font-semibold"><LayoutTemplate className="w-3.5 h-3.5 text-primary" /> Email blocks <span className="text-[10px] font-normal text-muted-foreground">({doc.blocks.length})</span></span></AccordionTrigger>
                  <AccordionContent className="pb-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add:</span>
                      {ADDABLE.map(a => (
                        <button key={a.type} type="button" onClick={() => addBlock(a.type)} className="px-2 py-0.5 rounded border border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary">{a.label}</button>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {doc.blocks.map((b, i) => (
                        <div
                          key={b.id}
                          onDragOver={(e) => { e.preventDefault(); }}
                          onDrop={() => { if (dragIdx !== null) reorderBlocks(dragIdx, i); setDragIdx(null); }}
                          className={`rounded-lg border bg-background p-2.5 transition-shadow ${dragIdx === i ? 'opacity-40' : ''} ${dragIdx !== null && dragIdx !== i ? 'border-dashed border-primary/50' : 'border-border'}`}
                        >
                          {/* The whole top bar is the drag handle — a big grab area, so the block
                              can be picked up anywhere across it (not just the tiny grip icon). */}
                          <div
                            draggable
                            onDragStart={() => setDragIdx(i)}
                            onDragEnd={() => setDragIdx(null)}
                            title="Drag to reorder"
                            className="flex items-center justify-between gap-2 mb-1.5 cursor-grab active:cursor-grabbing select-none"
                          >
                            <span className="flex items-center gap-1 min-w-0">
                              <span className="text-muted-foreground"><GripVertical className="w-3.5 h-3.5" /></span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">{TYPE_LABEL[b.type]}</span>
                            </span>
                            {/* Action buttons: stop drag from starting so clicks/taps register cleanly. */}
                            <div className="flex items-center gap-1" draggable={false} onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}>
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
                  </AccordionContent>
                </AccordionItem>

                {report && (
                  <AccordionItem value="check" className="border border-border rounded-lg bg-card px-3">
                    <AccordionTrigger className="py-2.5 hover:no-underline">
                      <span className="flex items-center gap-1.5 text-xs font-semibold">
                        <ShieldCheck className={`w-3.5 h-3.5 ${report.level === 'clean' ? 'text-emerald-600' : report.level === 'caution' ? 'text-amber-500' : 'text-destructive'}`} /> Deliverability
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${levelBadge(report.level)}`}>{report.level === 'clean' ? 'Clean' : report.level === 'caution' ? 'Caution' : 'High risk'}{report.score > 0 && ` · ${report.score}`}</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3 space-y-2">
                      <div className="flex justify-end"><Button type="button" onClick={handleSanitize} disabled={cleaning} variant="ghost" size="sm" className="h-6 gap-1 text-[11px] px-2">{cleaning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} {cleaning ? 'Cleaning…' : 'Clean up'}</Button></div>
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
                    </AccordionContent>
                  </AccordionItem>
                )}

              </Accordion>
            </div>

            {/* RIGHT: live preview + inline variations panel (fills the space beside it) */}
            <div className="flex flex-col xl:flex-row gap-4 min-w-0">
              <div className="flex-1 min-w-0">{previewPane}</div>
              {varPanelOpen && <div className="xl:w-[400px] shrink-0">{variationsPanel}</div>}
            </div>
          </div>
        </>
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

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Language:</span>
              <select value={chkLocale} onChange={e => setChkLocale(e.target.value)} className="h-7 text-xs rounded-md border border-border bg-background px-2">
                <option value="en">English</option>
                <option value="de">German</option>
                <option value="no">Norwegian</option>
                <option value="it">Italian</option>
              </select>
            </div>

            <div><Label className="text-[11px] mb-0.5 block">Subject line</Label><Input value={chkSubject} onChange={e => setChkSubject(e.target.value)} placeholder="e.g. A quick note about your account" className="h-9 text-sm" /></div>
            <div><Label className="text-[11px] mb-0.5 block">Email body or HTML</Label><Textarea value={chkBody} onChange={e => setChkBody(e.target.value)} placeholder="Paste your copy here. You can paste full HTML too — it's checked on the visible text." className="min-h-[220px] text-sm font-mono" /></div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={chkSanitize} className="gap-1.5 h-8 text-xs" disabled={chkCleaning || (!chkSubject && !chkBody)}>{chkCleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} {chkCleaning ? 'Cleaning…' : 'Clean up copy'}</Button>
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

            {/* Plain-text variations */}
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-primary" /><Small>Generate variations <span className="font-normal normal-case">— plain text</span></Small></div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Count:</span>
                  <Input type="number" min={1} max={10} value={chkVarCount} onChange={e => setChkVarCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} className="h-7 w-16 text-xs" />
                  <span className="text-[10px] text-muted-foreground">max 10</span>
                </div>
              </div>
              <Button type="button" onClick={generateChkVariations} disabled={chkVarLoading || (!chkSubject && !chkBody)} variant="outline" className="w-full h-8 gap-1.5 text-xs">
                {chkVarLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Rewording…</> : <><Sparkles className="w-3.5 h-3.5" /> Reword as plain text with AI</>}
              </Button>
              {chkVarError && <p className="text-destructive text-[11px] bg-destructive/10 rounded px-2 py-1">{chkVarError}</p>}
              {chkVariations.length > 0 && (
                <ul className="space-y-2">
                  {chkVariations.map((v, i) => (
                    <li key={i} className="rounded-md border border-border bg-background p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{v.label}</p>
                          {v.notes && <p className="text-[10px] text-muted-foreground truncate">{v.notes}</p>}
                        </div>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${levelBadge(v.report.level)}`}>{v.report.level === 'clean' ? 'Clean' : v.report.level === 'caution' ? 'Caution' : 'High risk'}{v.report.score > 0 && ` · ${v.report.score}`}</span>
                      </div>
                      {v.subject && <p className="text-[11px]"><span className="text-muted-foreground font-medium">Subject: </span>{v.subject}</p>}
                      {v.body && <p className="text-[11px] whitespace-pre-wrap leading-snug text-foreground/80">{v.body}</p>}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <Button type="button" size="sm" variant="outline" className="h-6 text-[11px] px-2 gap-1" onClick={() => chkCopyVar(i, v)}>{chkVarCopied === i ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy</Button>
                        <Button type="button" size="sm" className="h-6 text-[11px] px-2 ml-auto" onClick={() => { setChkSubject(v.subject); setChkBody(v.body); }}>Use</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Generated-variations showcase — original + all variations; mobile responsive */}
      {varModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-2 sm:p-4 overflow-y-auto" onClick={() => setVarModalOpen(false)}>
          <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-5xl my-3 sm:my-6" onClick={e => e.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4 border-b border-border sticky top-0 bg-card rounded-t-xl z-10">
              <span className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="w-4 h-4 text-primary" /> Variations <span className="text-xs font-normal text-muted-foreground">(original + {variations.length})</span></span>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-[11px] text-muted-foreground">Count:</span>
                <Input type="number" min={1} max={10} value={varCount} onChange={e => setVarCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} className="h-7 w-14 text-xs" />
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={generateVariations} disabled={varLoading}>{varLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} {varLoading ? 'Generating…' : 'Regenerate'}</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={saveAllVariations} title="Save every variation to your templates"><Save className="w-3 h-3" /> Save all</Button>
                <button type="button" onClick={() => setVarModalOpen(false)} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Original (current email) — shown alongside so you can compare */}
              <div className="rounded-lg border-2 border-primary/40 bg-background overflow-hidden flex flex-col">
                <Thumb html={html} w={260} h={190} />
                <div className="p-2.5 space-y-1.5 flex-1 flex flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold truncate">Original</p>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 bg-primary/15 text-primary">Current</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">Your email as it is now.</p>
                  <div className="space-y-0.5 flex-1">
                    {doc.meta.subject && <p className="text-[11px] leading-snug"><span className="text-muted-foreground font-medium">Subject: </span>{doc.meta.subject}</p>}
                    {doc.meta.preheader && <p className="text-[11px] leading-snug"><span className="text-muted-foreground font-medium">Preheader: </span>{doc.meta.preheader}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1" onClick={() => previewVar(html)}><Eye className="w-3 h-3" /> Preview</Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1" onClick={saveAsTemplate}><Save className="w-3 h-3" /> Save</Button>
                  </div>
                </div>
              </div>
              {variations.map((v, i) => {
                const saved = savedVarIdx.includes(i);
                return (
                <div key={i} className="rounded-lg border border-border bg-background overflow-hidden flex flex-col">
                  <Thumb html={v.html} w={260} h={190} />
                  <div className="p-2.5 space-y-1.5 flex-1 flex flex-col">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold truncate">{v.label}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${levelBadge(v.report.level)}`}>{v.report.level === 'clean' ? 'Clean' : v.report.level === 'caution' ? 'Caution' : 'High risk'}{v.report.score > 0 && ` · ${v.report.score}`}</span>
                    </div>
                    {v.notes && <p className="text-[10px] text-muted-foreground leading-snug">{v.notes}</p>}
                    <div className="space-y-0.5 flex-1">
                      {v.fields.map((f, j) => (
                        <p key={j} className="text-[11px] leading-snug"><span className="text-muted-foreground font-medium">{f.label}: </span>{f.value}</p>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1" onClick={() => copyVarText(i, v.text)}>{copiedVar === i ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy</Button>
                      <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1" onClick={() => previewVar(v.html)}><Eye className="w-3 h-3" /> Preview</Button>
                      <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1" onClick={() => saveVariation(v, i)} disabled={saved}>{saved ? <><Check className="w-3 h-3" /> Saved</> : <><Save className="w-3 h-3" /> Save</>}</Button>
                      <Button type="button" size="sm" className="h-7 text-[11px] px-2 ml-auto" onClick={() => { useVariation(v); setVarModalOpen(false); }}>Use</Button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            <div className="px-3 sm:px-4 pb-3 sm:pb-4 text-[11px] text-muted-foreground">Tip: <strong>Save</strong> keeps a variation in your Templates so you can use them all later; <strong>Use</strong> loads one into the builder now.</div>
          </div>
        </div>
      )}
    </div>
  );
}
