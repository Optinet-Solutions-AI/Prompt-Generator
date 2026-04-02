import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Download, FileCode, Images, RefreshCw, Trash2, X,
  ChevronLeft, ChevronRight, Sparkles, Wand2, Bot, Cpu, Loader2, Plus, Save, Heart, Shuffle, Expand,
  AlertTriangle, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { HtmlConversionModal } from '@/components/HtmlConversionModal';

// ── Types ──────────────────────────────────────────────────────────────────────

interface GeneratedImage {
  id: string;
  created_at: string;
  filename: string;
  provider: string;
  aspect_ratio: string;
  resolution: string;
  storage_path: string;
  public_url: string;
  // Optional — only set for favorites
  brand_name?: string;
  record_id?: string;
  _isFavorite?: boolean;
}

import { BRANDS } from '@/types/prompt';
import { getImages, getAllStoredImages, batchStoreImages, deleteStoredImage, replaceStoredImage, storeImage } from '@/lib/imageStore';

// Brand colors for badges
const BRAND_BADGE: Record<string, string> = {
  FortunePlay: 'bg-amber-500 text-white',
  PlayMojo:    'bg-rose-500 text-white',
  SpinJo:      'bg-purple-500 text-white',
  Roosterbet:  'bg-red-600 text-white',
  SpinsUp:     'bg-sky-500 text-white',
  LuckyVibe:   'bg-emerald-500 text-white',
  Lucky7even:  'bg-indigo-500 text-white',
  NovaDreams:  'bg-violet-500 text-white',
  Rollero:     'bg-orange-500 text-white',
};

// ── Supabase helpers ────────────────────────────────────────────────────────────

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL      || '';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const SB_HEADERS = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
};

function fetchImages(page: number, filter: string): { data: GeneratedImage[]; hasMore: boolean } {
  return getImages(page, filter) as { data: GeneratedImage[]; hasMore: boolean };
}

// ── Background sync: copy Supabase generated_images → localStorage ─────────────
// Runs every time the library opens. Adds any Supabase rows missing from
// localStorage (deduplicates by public_url). Silent on error — never blocks UI.
async function syncFromSupabase(): Promise<number> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return 0;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/generated_images?select=*&order=created_at.desc&limit=500`,
      { headers: SB_HEADERS }
    );
    if (!res.ok) return 0;
    const rows = await res.json() as Array<{
      id: string; public_url: string; provider: string; aspect_ratio: string;
      resolution: string; filename: string; storage_path: string; created_at: string;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) return 0;

    // Build a set of all URLs already in localStorage so we don't add duplicates
    const existingUrls = new Set(getAllStoredImages().map(i => i.public_url));

    // Process oldest-first so newest ends up at the front after prepending
    let count = 0;
    for (const row of [...rows].reverse()) {
      if (!row.public_url || existingUrls.has(row.public_url)) continue;
      storeImage({
        public_url:   row.public_url,
        provider:     row.provider     || 'chatgpt',
        aspect_ratio: row.aspect_ratio || '16:9',
        resolution:   row.resolution   || '1K',
        filename:     row.filename     || `image-${row.id}.png`,
      });
      existingUrls.add(row.public_url); // prevent double-adds within the same batch
      count++;
    }
    return count;
  } catch {
    return 0; // silent fail — sync is best-effort
  }
}

async function fetchFavorites(brandFilter: string): Promise<{ data: GeneratedImage[]; hasMore: boolean }> {
  let query = `liked_images?select=*&order=created_at.desc`;
  if (brandFilter !== 'all') query += `&brand_name=eq.${encodeURIComponent(brandFilter)}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, { headers: SB_HEADERS });
  if (!res.ok) throw new Error(`Failed to load favorites (${res.status})`);
  const raw = await res.json();
  const data: GeneratedImage[] = raw
    .filter((f: any) => !!f.img_url)
    .map((f: any) => ({
      id:           f.id,
      created_at:   f.created_at,
      filename:     f.record_id || '',
      provider:     'favorite',
      aspect_ratio: '',
      resolution:   '',
      storage_path: '',
      public_url:   f.img_url,
      brand_name:   f.brand_name || '',
      record_id:    f.record_id  || '',
      _isFavorite:  true,
    }));
  return { data, hasMore: false };
}

async function unlikeImage(recordId: string, imgUrl: string): Promise<void> {
  const res = await fetch('/api/unlike-img', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record_id: recordId, img_url: imgUrl }),
  });
  if (!res.ok) throw new Error('Failed to remove favorite');
}

function deleteImage(id: string): void {
  deleteStoredImage(id);
}

function replaceImage(id: string, editedUrl: string, original: GeneratedImage): GeneratedImage {
  return replaceStoredImage(id, editedUrl, original) as GeneratedImage;
}

function insertNewImage(editedUrl: string, original: GeneratedImage): GeneratedImage {
  return storeImage({
    public_url:   editedUrl,
    provider:     'edit',
    aspect_ratio: original.aspect_ratio || 'edited',
    resolution:   original.resolution   || '',
    filename:     `edited-${Date.now()}.png`,
  }) as GeneratedImage;
}

// Blob download — works for cross-origin Supabase URLs
async function downloadImage(url: string, filename: string) {
  const res     = await fetch(url);
  const blob    = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = blobUrl;
  a.download    = filename || `image-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(blobUrl);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isStoredImage(_url: string) {
  return true; // All images in the library are stored images — always show provider badge
}

function providerLabel(p: string) {
  if (p === 'edit')    return 'Edited';
  if (p === 'gemini')  return 'Gemini';
  if (p === 'chatgpt') return 'ChatGPT';
  return p;
}

function providerColors(p: string): string {
  if (p === 'edit')    return 'bg-amber-500 text-white';
  if (p === 'gemini')  return 'bg-blue-500 text-white';
  if (p === 'chatgpt') return 'bg-emerald-500 text-white';
  return 'bg-black/50 text-white';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Delete confirm ─────────────────────────────────────────────────────────────

function DeleteConfirm({ onConfirm, onCancel, isDeleting }: {
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 rounded-2xl backdrop-blur-sm">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 mx-3 text-center shadow-2xl">
        <Trash2 className="w-8 h-8 text-destructive mx-auto mb-3" />
        <p className="text-white font-medium mb-1 text-sm">Remove image?</p>
        <p className="text-white/50 text-xs mb-4">This cannot be undone.</p>
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={isDeleting}
            className="flex-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isDeleting}
            className="flex-1 px-3 py-1.5 rounded-lg bg-destructive hover:bg-destructive/90 text-white text-xs font-medium transition-colors">
            {isDeleting ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Save Edited Modal ──────────────────────────────────────────────────────────

function SaveEditedModal({
  editedUrl,
  original,
  onReplaced,
  onSavedNew,
  onClose,
}: {
  editedUrl: string;
  original: GeneratedImage;
  onReplaced: (updated: GeneratedImage) => void;
  onSavedNew: (newImg: GeneratedImage) => void;
  onClose: () => void;
}) {
  const [isSaving,   setIsSaving]   = useState(false);
  const [saveError,  setSaveError]  = useState<string | null>(null);

  const handleReplace = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await replaceImage(original.id, editedUrl, original);
      onReplaced(updated);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
      setIsSaving(false);
    }
  };

  const handleSaveNew = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const newImg = await insertNewImage(editedUrl, original);
      onSavedNew(newImg);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={!isSaving ? onClose : undefined}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-white font-semibold text-base">Save Edited Image</h2>
            <p className="text-white/40 text-sm mt-0.5">Choose how to save your edit</p>
          </div>
          <button onClick={onClose} disabled={isSaving}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/15 text-white/50 transition-colors ml-3 mt-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Edited preview strip */}
        <div className="px-6 pb-5">
          <div className="relative rounded-xl overflow-hidden aspect-video bg-zinc-800 shadow-md">
            <img src={editedUrl} alt="Edited preview" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500 text-white shadow">
              <Wand2 className="w-2.5 h-2.5" />Edited
            </span>
          </div>
        </div>

        {/* Option buttons */}
        <div className="px-6 pb-4 grid grid-cols-2 gap-3">
          {/* Replace original */}
          <button
            onClick={handleReplace}
            disabled={isSaving}
            className="flex flex-col items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-amber-500/10 hover:border-amber-500/35 transition-all group disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center group-hover:bg-amber-500/25 transition-colors self-start">
              <RefreshCw className="w-4.5 h-4.5 text-amber-400" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <p className="text-white font-semibold text-xs leading-tight">Replace Original</p>
              <p className="text-white/40 text-[10px] mt-1 leading-relaxed">Overwrites the current image in the library</p>
            </div>
          </button>

          {/* Save as new */}
          <button
            onClick={handleSaveNew}
            disabled={isSaving}
            className="flex flex-col items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-primary/10 hover:border-primary/35 transition-all group disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center group-hover:bg-primary/25 transition-colors self-start">
              <Plus className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <p className="text-white font-semibold text-xs leading-tight">Save as New</p>
              <p className="text-white/40 text-[10px] mt-1 leading-relaxed">Keeps the original and adds a new entry</p>
            </div>
          </button>
        </div>

        {/* Error */}
        {saveError && (
          <div className="px-6 pb-3">
            <p className="text-destructive text-xs text-center bg-destructive/10 rounded-lg px-3 py-2">{saveError}</p>
          </div>
        )}

        {/* Cancel */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="w-full py-2.5 rounded-xl text-white/40 hover:text-white/60 text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        {/* Saving overlay */}
        {isSaving && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/85 backdrop-blur-sm rounded-2xl">
            <div className="flex flex-col items-center gap-3 text-white">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Saving your edit…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Lightbox ───────────────────────────────────────────────────────────────────

function Lightbox({
  image, all, onClose, onPrev, onNext, onDeleted, onImageUpdated, onNewImageAdded,
}: {
  image: GeneratedImage;
  all: GeneratedImage[];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDeleted: (id: string) => void;
  onImageUpdated: (id: string, updated: GeneratedImage) => void;
  onNewImageAdded: (img: GeneratedImage) => void;
}) {
  const idx     = all.findIndex(i => i.id === image.id);
  const hasPrev = idx > 0;
  const hasNext = idx < all.length - 1;

  const isEdited  = image.provider === 'edit';
  const showBadge = isStoredImage(image.public_url);

  // Standard lightbox state
  const [isDownloading, setIsDownloading] = useState(false);
  const [showHtmlModal,  setShowHtmlModal] = useState(false);
  const [confirmDelete,  setConfirmDelete] = useState(false);
  const [isDeleting,     setIsDeleting]    = useState(false);

  // Edit state
  const [editInstructions, setEditInstructions] = useState('');
  const [isEditing,        setIsEditing]        = useState(false);
  const [editError,        setEditError]        = useState<string | null>(null);
  const [editedImgUrl,     setEditedImgUrl]     = useState<string | null>(null);
  const [elapsedTime,      setElapsedTime]      = useState(0);
  const [showSaveModal,    setShowSaveModal]    = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Variations state
  const [showVariationsPanel, setShowVariationsPanel] = useState(false);
  const [variationType,       setVariationType]       = useState<'subtle' | 'strong'>('subtle');
  const [variationInstructions, setVariationInstructions] = useState('');
  const [isGeneratingVariations, setIsGeneratingVariations] = useState(false);
  const [variationError,      setVariationError]      = useState<string | null>(null);
  const [generatedVariations, setGeneratedVariations] = useState<string[]>([]);
  const [variationElapsed,    setVariationElapsed]    = useState(0);
  const variationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Engine selector: choose ChatGPT, Gemini, or Both
  const [selectedEngine, setSelectedEngine] = useState<'chatgpt' | 'gemini' | 'compare'>('chatgpt');

  // Variation viewer — full-screen lightbox for individual variations
  const [variationViewerUrl, setVariationViewerUrl]   = useState<string | null>(null);
  const [variationViewerIdx, setVariationViewerIdx]   = useState(-1);

  // Track which variations have been saved to library
  const [savedVariationIdxs, setSavedVariationIdxs]   = useState<Set<number>>(new Set());
  const [isSavingVariation,  setIsSavingVariation]    = useState<number | null>(null);

  // Unsaved changes dialog
  const [showUnsavedDialog,    setShowUnsavedDialog]    = useState(false);
  const [selectedVarsToSave,   setSelectedVarsToSave]   = useState<Set<number>>(new Set());
  const [saveEditedChecked,    setSaveEditedChecked]    = useState(true);
  const [isSavingUnsaved,      setIsSavingUnsaved]      = useState(false);

  // Reset edit + variation state on image change
  useEffect(() => {
    setEditInstructions('');
    setEditError(null);
    setEditedImgUrl(null);
    setElapsedTime(0);
    setShowSaveModal(false);
    setGeneratedVariations([]);
    setVariationError(null);
    setVariationInstructions('');
    setSavedVariationIdxs(new Set());
    setIsSavingVariation(null);
    setVariationViewerUrl(null);
    setVariationViewerIdx(-1);
  }, [image.id]);

  // Timer while editing
  useEffect(() => {
    if (isEditing) {
      setElapsedTime(0);
      intervalRef.current = setInterval(() => setElapsedTime(p => p + 1), 1000);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isEditing]);

  // Unsaved work helpers
  const unsavedVariations = generatedVariations.filter((_, i) => !savedVariationIdxs.has(i));
  const hasUnsavedWork    = !!editedImgUrl || unsavedVariations.length > 0;

  const handleCloseAttempt = () => {
    if (hasUnsavedWork && !showUnsavedDialog) {
      setSelectedVarsToSave(new Set(unsavedVariations.map((_, i) => i)));
      setSaveEditedChecked(true);
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  };

  const handleSaveAndClose = async () => {
    setIsSavingUnsaved(true);
    try {
      const saves: Promise<void>[] = [];

      // Save edited image as new library entry
      if (editedImgUrl && saveEditedChecked) {
        saves.push(
          insertNewImage(editedImgUrl, image)
            .then(newImg => { onNewImageAdded(newImg); })
            .catch(() => { /* non-fatal */ })
        );
      }

      // Save selected variations as new library entries (localStorage)
      for (const idx of selectedVarsToSave) {
        const url = unsavedVariations[idx];
        if (!url) continue;
        const origIdx = generatedVariations.indexOf(url);
        const vidx = origIdx < 0 ? idx : origIdx;
        saves.push(
          Promise.resolve().then(() => {
            const newImg = storeImage({
              public_url:   url,
              provider:     'variation',
              aspect_ratio: image.aspect_ratio || '',
              resolution:   image.resolution   || '1K',
              filename:     `variation-${variationType}-${vidx + 1}-${Date.now()}.png`,
            }) as GeneratedImage;
            onNewImageAdded(newImg);
            setSavedVariationIdxs(prev => new Set([...prev, vidx]));
          }).catch(() => { /* non-fatal */ })
        );
      }

      await Promise.all(saves);
    } finally {
      setIsSavingUnsaved(false);
      onClose();
    }
  };

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showHtmlModal || confirmDelete || showSaveModal || showUnsavedDialog) return;
      if (e.key === 'Escape') {
        // Close variation viewer first if open, then close main lightbox
        if (variationViewerUrl) { setVariationViewerUrl(null); setVariationViewerIdx(-1); return; }
        handleCloseAttempt();
      }
      if (variationViewerUrl) return; // Don't navigate when viewing a variation
      if (e.key === 'ArrowLeft'  && hasPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, onPrev, onNext, hasPrev, hasNext, showHtmlModal, confirmDelete, showSaveModal, showUnsavedDialog, variationViewerUrl, hasUnsavedWork]);

  const displayUrl = editedImgUrl || image.public_url;

  const handleDownload = async () => {
    setIsDownloading(true);
    try { await downloadImage(displayUrl, image.filename); }
    finally { setIsDownloading(false); }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      if (image._isFavorite) {
        await unlikeImage(image.record_id || '', image.public_url);
      } else {
        await deleteImage(image.id);
      }
      onDeleted(image.id);
      onClose();
    } catch {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleEditImage = async () => {
    const srcUrl = editedImgUrl || image.public_url;
    if (!editInstructions.trim() || !srcUrl) return;
    setIsEditing(true);
    setEditError(null);
    try {
      const res = await fetch('/api/edit-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: srcUrl, editInstructions: editInstructions.trim(), resolution: '1K' }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || e.message || 'Edit failed'); }
      const data = await res.json();
      const rd   = Array.isArray(data) ? data[0] : data;
      const url  = rd.public_url || rd.thumbnailUrl || rd.imageUrl || rd.thumbnailLink || rd.webContentLink;
      if (!url) throw new Error('No image URL returned');
      setEditedImgUrl(url);
      setEditInstructions('');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to edit image');
    } finally {
      setIsEditing(false);
    }
  };

  const handleGenerateVariations = async () => {
    const srcUrl = editedImgUrl || image.public_url;
    if (!srcUrl) return;
    setIsGeneratingVariations(true);
    setVariationError(null);
    setGeneratedVariations([]);
    setVariationElapsed(0);
    variationIntervalRef.current = setInterval(() => setVariationElapsed(p => p + 1), 1000);

    const body = JSON.stringify({
      imageUrl: srcUrl,
      mode: variationType,
      guidance: variationInstructions.trim(),
      count: 2,
      resolution: '1K',
    });

    try {
      let urls: string[] = [];

      if (selectedEngine === 'compare') {
        // Call both ChatGPT + Gemini in parallel
        const [openaiResult, imagenResult] = await Promise.allSettled([
          fetch('/api/generate-variations',        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
          fetch('/api/generate-variations-imagen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
        ]);

        const errors: string[] = [];
        const extractUrls = async (result: PromiseSettledResult<Response>, label: string): Promise<string[]> => {
          if (result.status === 'rejected') { errors.push(`${label}: ${result.reason}`); return []; }
          if (!result.value.ok) {
            const e = await result.value.json().catch(() => ({})) as { error?: string };
            errors.push(`${label}: ${e.error || result.value.status}`);
            return [];
          }
          const data = await result.value.json() as { variations?: Array<{ imageUrl?: string }> };
          return (data.variations ?? []).map((v: { imageUrl?: string }) => v.imageUrl).filter(Boolean) as string[];
        };

        const [openaiUrls, imagenUrls] = await Promise.all([
          extractUrls(openaiResult, 'ChatGPT'),
          extractUrls(imagenResult, 'Gemini'),
        ]);

        // Interleave: chatgpt[0], gemini[0], chatgpt[1], gemini[1]
        const maxLen = Math.max(openaiUrls.length, imagenUrls.length);
        for (let i = 0; i < maxLen; i++) {
          if (openaiUrls[i]) urls.push(openaiUrls[i]);
          if (imagenUrls[i]) urls.push(imagenUrls[i]);
        }

        if (urls.length === 0) throw new Error(`Both engines failed:\n${errors.join('\n')}`);
        if (errors.length > 0) setVariationError(`Note: ${errors.join('; ')}`);
      } else {
        // Single engine
        const endpoint = selectedEngine === 'gemini'
          ? '/api/generate-variations-imagen'
          : '/api/generate-variations';
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || err.message || 'Failed to generate variations');
        }
        const data = await resp.json();
        urls = (data.variations ?? [])
          .map((v: { imageUrl?: string }) => v.imageUrl)
          .filter(Boolean) as string[];
      }

      if (urls.length === 0) throw new Error('No variations were generated. Please try again.');
      setGeneratedVariations(urls);
    } catch (err) {
      setVariationError(err instanceof Error ? err.message : 'Failed to generate variations');
    } finally {
      setIsGeneratingVariations(false);
      if (variationIntervalRef.current) { clearInterval(variationIntervalRef.current); variationIntervalRef.current = null; }
    }
  };

  // Save a variation URL as a new image in the library (localStorage)
  const handleSaveVariationToLibrary = (url: string, vidx: number) => {
    setIsSavingVariation(vidx);
    try {
      const newImg = storeImage({
        public_url:   url,
        provider:     'variation',
        aspect_ratio: image.aspect_ratio || '',
        resolution:   image.resolution   || '1K',
        filename:     `variation-${variationType}-${vidx + 1}-${Date.now()}.png`,
      }) as GeneratedImage;
      onNewImageAdded(newImg);
      setSavedVariationIdxs(prev => new Set([...prev, vidx]));
    } catch {
      // silent fail — user can retry
    } finally {
      setIsSavingVariation(null);
    }
  };

  const handleReplaced = (updated: GeneratedImage) => {
    setShowSaveModal(false);
    setEditedImgUrl(null);
    setEditInstructions('');
    onImageUpdated(image.id, updated);
  };

  const handleSavedNew = (newImg: GeneratedImage) => {
    setShowSaveModal(false);
    setEditedImgUrl(null);
    setEditInstructions('');
    onNewImageAdded(newImg);
  };

  return (
    <>
      {/* Lightbox — flex-col on small, flex-row on lg+ */}
      <div className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-black/92 backdrop-blur-md">

        {/* Close button */}
        <button
          onClick={handleCloseAttempt}
          className="absolute top-3 right-3 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Image area */}
        <div
          className="relative flex-1 flex items-center justify-center p-6 lg:p-10 min-h-0 cursor-pointer"
          onClick={handleCloseAttempt}
        >
          {/* Prev arrow */}
          <button
            onClick={e => { e.stopPropagation(); onPrev(); }}
            disabled={!hasPrev}
            className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
              hasPrev ? 'bg-white/10 hover:bg-white/20 text-white' : 'opacity-0 pointer-events-none'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Main image — switches between edited and original */}
          <div className="relative max-h-full max-w-full" onClick={e => e.stopPropagation()}>
            <img
              key={displayUrl}
              src={displayUrl}
              alt={image.filename}
              className="max-h-full max-w-full object-contain rounded-xl lg:rounded-2xl shadow-2xl"
              style={{ maxHeight: 'calc(100vh - 2.5rem)', maxWidth: '100%' }}
            />
            {/* Edited badge on image */}
            {editedImgUrl && (
              <div className="absolute top-3 left-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500 text-white shadow-lg">
                  <Wand2 className="w-3 h-3" />Edited Preview
                </span>
              </div>
            )}
          </div>

          {/* Next arrow */}
          <button
            onClick={e => { e.stopPropagation(); onNext(); }}
            disabled={!hasNext}
            className={`absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
              hasNext ? 'bg-white/10 hover:bg-white/20 text-white' : 'opacity-0 pointer-events-none'
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Right panel */}
        <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 bg-zinc-900 border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col max-h-[50vh] lg:max-h-none">

          {/* Provider / Brand badge */}
          {(showBadge || image._isFavorite) && (
            <div className="px-5 pt-5 pb-4 border-b border-white/10 flex-shrink-0">
              {image._isFavorite && image.brand_name ? (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
                  BRAND_BADGE[image.brand_name] || 'bg-white/20 text-white'
                }`}>
                  <Heart className="w-3.5 h-3.5" />
                  {image.brand_name}
                </span>
              ) : showBadge ? (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
                  isEdited
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : image.provider === 'gemini'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {isEdited ? <Wand2 className="w-3.5 h-3.5" />
                    : image.provider === 'gemini' ? <Cpu className="w-3.5 h-3.5" />
                    : <Bot className="w-3.5 h-3.5" />}
                  {providerLabel(image.provider)}
                </span>
              ) : null}
            </div>
          )}

          {/* Scrollable content: metadata + edit section */}
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* Metadata */}
            <div className="p-5 flex lg:flex-col gap-4 lg:gap-4 flex-wrap border-b border-white/10">
              {image.aspect_ratio && image.aspect_ratio !== 'edited' && (
                <div className="min-w-[80px]">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Aspect Ratio</p>
                  <p className="text-white font-medium text-sm">{image.aspect_ratio}</p>
                </div>
              )}
              <div className="min-w-[80px]">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Resolution</p>
                <p className="text-white font-medium text-sm">{image.resolution}</p>
              </div>
              <div className="min-w-[120px]">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Created</p>
                <p className="text-white/80 text-xs">{formatDate(image.created_at)}</p>
              </div>
              <div className="hidden lg:block">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Filename</p>
                <p className="text-white/60 text-xs break-all font-mono">{image.filename}</p>
              </div>
            </div>

            {/* ── Edit Image section (hidden for favorites) ── */}
            {!image._isFavorite && <div className="px-5 py-5 space-y-3">
              {/* Section header */}
              <div className="flex items-center gap-2">
                <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">Edit Image</p>
              </div>

              {/* Status when edit applied */}
              {editedImgUrl && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <p className="text-emerald-400 text-xs leading-tight">Edit applied — keep editing or save</p>
                </div>
              )}

              {/* Instructions textarea */}
              <Textarea
                placeholder="Describe your edit… e.g. 'Change background to sunset', 'Make it more vibrant'"
                value={editInstructions}
                onChange={e => setEditInstructions(e.target.value)}
                className="min-h-[88px] resize-none text-xs bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/20 focus-visible:ring-0 focus-visible:ring-offset-0"
                disabled={isEditing}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleEditImage();
                  e.stopPropagation(); // prevent lightbox arrow nav while typing
                }}
              />

              {/* Error */}
              {editError && (
                <p className="text-destructive text-xs bg-destructive/10 rounded-lg px-3 py-2">{editError}</p>
              )}

              {/* Apply Edit button */}
              <button
                onClick={handleEditImage}
                disabled={isEditing || !editInstructions.trim()}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-amber-500/12 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 text-amber-400 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isEditing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Applying edit…</span>
                    <span className="tabular-nums text-amber-400/60 ml-1">({elapsedTime}s)</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    {editedImgUrl ? 'Apply Another Edit' : 'Apply Edit'}
                  </>
                )}
              </button>

              {/* Save edited image button — only when edit exists */}
              {editedImgUrl && (
                <button
                  onClick={() => setShowSaveModal(true)}
                  disabled={isEditing}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors disabled:opacity-50 shadow-md shadow-primary/20"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Edited Image
                </button>
              )}

              <p className="text-white/25 text-[10px] text-center">Ctrl+Enter to apply</p>
            </div>}

            {/* ── Variations section (hidden for favorites) ── */}
            {!image._isFavorite && (
              <div className="px-5 py-4 border-t border-white/10 space-y-3">
                {/* Section header + toggle */}
                <button
                  type="button"
                  onClick={() => setShowVariationsPanel(v => !v)}
                  className="flex items-center justify-between w-full group"
                >
                  <div className="flex items-center gap-2">
                    <Shuffle className="w-3.5 h-3.5 text-primary/70" />
                    <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">Variations</p>
                  </div>
                  <span className="text-[10px] text-white/30 group-hover:text-white/50 transition-colors">
                    {showVariationsPanel ? 'Hide ▲' : 'Show ▼'}
                  </span>
                </button>

                {showVariationsPanel && (
                  <div className="space-y-2.5">
                    {/* Subtle / Strong toggle */}
                    <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5 border border-white/10 text-xs">
                      <button
                        type="button"
                        onClick={() => setVariationType('subtle')}
                        className={`flex-1 py-1.5 rounded-md font-medium transition-all ${variationType === 'subtle' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-white/40 hover:text-white/70'}`}
                      >Subtle</button>
                      <button
                        type="button"
                        onClick={() => setVariationType('strong')}
                        className={`flex-1 py-1.5 rounded-md font-medium transition-all ${variationType === 'strong' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-white/40 hover:text-white/70'}`}
                      >Strong</button>
                    </div>
                    <p className="text-white/30 text-[10px] leading-relaxed">
                      {variationType === 'subtle'
                        ? 'Same composition & subject — slight lighting, color & mood adjustments.'
                        : 'Same subject, reimagined background, lighting, palette & atmosphere.'}
                    </p>

                    {/* Engine selector: ChatGPT / Gemini / Both */}
                    <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5 border border-white/10 text-xs">
                      <button
                        type="button"
                        onClick={() => setSelectedEngine('chatgpt')}
                        disabled={isGeneratingVariations}
                        className={`flex-1 py-1.5 rounded-md font-medium transition-all ${selectedEngine === 'chatgpt' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-white/40 hover:text-white/70'}`}
                      >ChatGPT</button>
                      <button
                        type="button"
                        onClick={() => setSelectedEngine('gemini')}
                        disabled={isGeneratingVariations}
                        className={`flex-1 py-1.5 rounded-md font-medium transition-all ${selectedEngine === 'gemini' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-white/40 hover:text-white/70'}`}
                      >Gemini</button>
                      <button
                        type="button"
                        onClick={() => setSelectedEngine('compare')}
                        disabled={isGeneratingVariations}
                        className={`flex-1 py-1.5 rounded-md font-medium transition-all ${selectedEngine === 'compare' ? 'bg-orange-500 text-white shadow-sm' : 'text-white/40 hover:text-white/70'}`}
                      >Both</button>
                    </div>
                    {selectedEngine === 'compare' && (
                      <p className="text-white/30 text-[10px] italic">Generates 4 images total (2 per engine) — takes longer</p>
                    )}

                    {/* Optional instruction */}
                    <Textarea
                      placeholder="Optional extra guidance… e.g. 'make it night time'"
                      value={variationInstructions}
                      onChange={e => setVariationInstructions(e.target.value)}
                      className="min-h-[64px] resize-none text-xs bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/20 focus-visible:ring-0 focus-visible:ring-offset-0"
                      disabled={isGeneratingVariations}
                    />

                    {variationError && (
                      <p className="text-destructive text-xs bg-destructive/10 rounded-lg px-3 py-2">{variationError}</p>
                    )}

                    {/* Variation results — click image to view, Save to add to library */}
                    {generatedVariations.length > 0 && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          {generatedVariations.map((url, i) => (
                            <div key={i} className="relative group">
                              {/* Clickable image — opens full-size viewer */}
                              <button
                                type="button"
                                onClick={() => { setVariationViewerUrl(url); setVariationViewerIdx(i); }}
                                className="relative w-full rounded-xl overflow-hidden border border-white/10 hover:border-primary/60 aspect-square bg-zinc-800 transition-all hover:scale-[0.97] cursor-zoom-in block"
                                title={`View Variation ${i + 1}`}
                              >
                                <img src={url} alt={`Variation ${i + 1}`} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/20 text-white text-xs font-semibold backdrop-blur-sm">
                                    <Expand className="w-3 h-3" />
                                    View
                                  </span>
                                </div>
                                <span className="absolute bottom-1 left-1 text-[9px] bg-primary/80 text-white rounded px-1 py-0.5 leading-none">V{i + 1}</span>
                                <span className={`absolute top-1 right-1 text-[8px] rounded px-1 py-0.5 leading-none font-semibold ${variationType === 'subtle' ? 'bg-sky-500/80 text-white' : 'bg-violet-500/80 text-white'}`}>
                                  {variationType === 'subtle' ? 'SUB' : 'STR'}
                                </span>
                              </button>
                              {/* Download — bottom right, appears on hover */}
                              <button
                                type="button"
                                onClick={async () => {
                                  try { const res = await fetch(url); const blob = await res.blob(); const a = document.createElement('a'); a.href = window.URL.createObjectURL(blob); a.download = `variation-${i + 1}-${Date.now()}.png`; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
                                  catch { window.open(url, '_blank'); }
                                }}
                                className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-all"
                                title="Download"
                              ><Download className="w-3 h-3" /></button>
                            </div>
                          ))}
                        </div>
                        {/* Save to Library row */}
                        <div className="flex gap-1.5">
                          {generatedVariations.map((url, i) => (
                            <button
                              key={i}
                              type="button"
                              disabled={savedVariationIdxs.has(i) || isSavingVariation === i}
                              onClick={() => handleSaveVariationToLibrary(url, i)}
                              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                                savedVariationIdxs.has(i)
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                                  : 'bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/40 text-white/60 hover:text-primary disabled:opacity-40'
                              }`}
                            >
                              {isSavingVariation === i
                                ? <><Loader2 className="w-2.5 h-2.5 animate-spin" />Saving…</>
                                : savedVariationIdxs.has(i)
                                  ? <><Save className="w-2.5 h-2.5" />Saved V{i + 1}</>
                                  : <><Save className="w-2.5 h-2.5" />Save V{i + 1}</>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleGenerateVariations}
                      disabled={isGeneratingVariations}
                      className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-primary/12 hover:bg-primary/20 border border-primary/20 hover:border-primary/40 text-primary text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isGeneratingVariations ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Generating…</span><span className="tabular-nums text-primary/60 ml-1">({variationElapsed}s)</span></>
                      ) : (
                        <><Shuffle className="w-3.5 h-3.5" />{generatedVariations.length > 0 ? 'Regenerate Variations' : (selectedEngine === 'compare' ? 'Generate Both' : 'Generate 2 Variations')}</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fixed bottom actions */}
          <div className="flex-shrink-0 p-5 border-t border-white/10 space-y-2">
            <button
              onClick={() => setShowHtmlModal(true)}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors"
            >
              <FileCode className="w-4 h-4" />
              Convert to HTML
            </button>

            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              {isDownloading ? 'Downloading…' : editedImgUrl ? 'Download Edited' : 'Download Image'}
            </button>

            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl text-white/40 hover:text-destructive hover:bg-destructive/10 text-sm transition-colors"
              >
                {image._isFavorite ? <Heart className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                {image._isFavorite ? 'Remove from favorites' : 'Remove from library'}
              </button>
            ) : (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 space-y-2">
                <p className="text-xs text-white/70 text-center">{image._isFavorite ? 'Remove from favorites?' : 'Remove permanently?'}</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(false)} disabled={isDeleting}
                    className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleDelete} disabled={isDeleting}
                    className="flex-1 py-1.5 rounded-lg bg-destructive hover:bg-destructive/90 text-white text-xs font-medium transition-colors">
                    {isDeleting ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            )}

            <p className="text-center text-white/25 text-xs pt-1">{idx + 1} of {all.length}</p>
          </div>
        </div>
      </div>

      {/* ── Variation Viewer — full-screen overlay for viewing individual variation images ── */}
      {variationViewerUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-sm"
          onClick={() => { setVariationViewerUrl(null); setVariationViewerIdx(-1); }}
        >
          <div
            className="relative flex flex-col items-center max-w-5xl max-h-[95vh] px-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Top bar — mode info + close */}
            <div className="flex items-center justify-between w-full mb-3">
              <div className="flex items-center gap-2">
                <Shuffle className="w-4 h-4 text-primary" />
                <span className="text-white font-semibold text-sm">
                  Variation {variationViewerIdx + 1}
                </span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  variationType === 'subtle' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                }`}>
                  {variationType === 'subtle' ? 'Subtle' : 'Strong'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Download button */}
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(variationViewerUrl);
                      const blob = await res.blob();
                      const a = document.createElement('a');
                      a.href = window.URL.createObjectURL(blob);
                      a.download = `variation-${variationViewerIdx + 1}-${Date.now()}.png`;
                      document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    } catch { window.open(variationViewerUrl, '_blank'); }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  onClick={() => { setVariationViewerUrl(null); setVariationViewerIdx(-1); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Image */}
            <img
              src={variationViewerUrl}
              alt={`Variation ${variationViewerIdx + 1}`}
              className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl"
            />

            {/* What changed info bar */}
            <div className="mt-3 w-full max-w-xl bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <p className="text-white/50 text-[10px] uppercase tracking-wider font-semibold mb-1">What the AI changed in this variation</p>
              {variationType === 'subtle' ? (
                <div className="space-y-0.5">
                  <p className="text-white/70 text-xs">✦ Lighting warmth &amp; color temperature</p>
                  <p className="text-white/70 text-xs">✦ Atmospheric mood &amp; minor environmental details</p>
                  <p className="text-white/40 text-[10px] mt-1">Kept unchanged: subject, pose, outfit, composition, background structure</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-white/70 text-xs">✦ Background environment &amp; setting</p>
                  <p className="text-white/70 text-xs">✦ Overall color palette &amp; lighting color</p>
                  <p className="text-white/70 text-xs">✦ Mood &amp; atmosphere</p>
                  <p className="text-white/40 text-[10px] mt-1">Kept unchanged: main subject, face, outfit &amp; identity</p>
                </div>
              )}
            </div>

            {/* Hint */}
            <p className="text-white/25 text-xs mt-2">Click anywhere outside or press Esc to close</p>
          </div>
        </div>
      )}

      {/* HTML Conversion Modal */}
      <HtmlConversionModal
        isOpen={showHtmlModal}
        onClose={() => setShowHtmlModal(false)}
        imageUrl={displayUrl}
      />

      {/* Save Edited Modal */}
      {showSaveModal && editedImgUrl && (
        <SaveEditedModal
          editedUrl={editedImgUrl}
          original={image}
          onReplaced={handleReplaced}
          onSavedNew={handleSavedNew}
          onClose={() => setShowSaveModal(false)}
        />
      )}

      {/* Unsaved Changes Dialog */}
      {showUnsavedDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !isSavingUnsaved && setShowUnsavedDialog(false)}
          />
          <div
            className="relative z-10 w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-base">Unsaved Changes</h2>
                  <p className="text-white/40 text-sm mt-0.5">Choose what to save to Image Library</p>
                </div>
              </div>
              <button
                onClick={() => !isSavingUnsaved && setShowUnsavedDialog(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/15 text-white/50 transition-colors ml-3 mt-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="px-6 pb-4 space-y-4 max-h-[55vh] overflow-y-auto">
              {/* Edited image */}
              {editedImgUrl && (
                <label className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveEditedChecked}
                    onChange={e => setSaveEditedChecked(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <img src={editedImgUrl} alt="Edited" className="w-14 h-14 rounded-lg object-cover border border-white/10 shrink-0" />
                    <div>
                      <p className="text-white text-sm font-medium flex items-center gap-1.5">
                        <Wand2 className="w-3.5 h-3.5 text-amber-400" />Edited Image
                      </p>
                      <p className="text-white/40 text-xs">Save as new entry in the library</p>
                    </div>
                  </div>
                </label>
              )}

              {/* Unsaved variations */}
              {unsavedVariations.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-white text-sm font-medium flex items-center gap-1.5">
                      <Shuffle className="w-3.5 h-3.5 text-primary/70" />
                      Variations ({unsavedVariations.length} unsaved)
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedVarsToSave.size === unsavedVariations.length) {
                          setSelectedVarsToSave(new Set());
                        } else {
                          setSelectedVarsToSave(new Set(unsavedVariations.map((_, i) => i)));
                        }
                      }}
                      className="text-xs text-primary hover:text-primary/80 font-medium"
                    >
                      {selectedVarsToSave.size === unsavedVariations.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {unsavedVariations.map((url, i) => (
                      <label
                        key={`unsaved-var-${i}`}
                        className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                          selectedVarsToSave.has(i)
                            ? 'border-primary shadow-md shadow-primary/20'
                            : 'border-white/10 opacity-50 hover:opacity-70'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedVarsToSave.has(i)}
                          onChange={e => {
                            const next = new Set(selectedVarsToSave);
                            if (e.target.checked) next.add(i); else next.delete(i);
                            setSelectedVarsToSave(next);
                          }}
                          className="sr-only"
                        />
                        <div className="aspect-square">
                          <img src={url} alt={`Variation ${i + 1}`} className="w-full h-full object-cover" />
                        </div>
                        {selectedVarsToSave.has(i) && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                        <div className="absolute bottom-1.5 left-1.5">
                          <span className={`text-[9px] rounded px-1 py-0.5 leading-none font-semibold ${
                            variationType === 'subtle' ? 'bg-sky-500/80 text-white' : 'bg-violet-500/80 text-white'
                          }`}>
                            V{i + 1}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="px-6 pb-6 pt-2 grid grid-cols-2 gap-3">
              <button
                onClick={onClose}
                disabled={isSavingUnsaved}
                className="py-2.5 rounded-xl text-white/60 hover:text-white border border-white/10 hover:bg-white/5 text-sm font-medium transition-colors disabled:opacity-40"
              >
                Discard & Exit
              </button>
              <button
                onClick={handleSaveAndClose}
                disabled={isSavingUnsaved || (!saveEditedChecked && selectedVarsToSave.size === 0)}
                className="py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isSavingUnsaved
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                  : <><Save className="w-3.5 h-3.5" />Save & Exit</>}
              </button>
            </div>

            {/* Saving overlay */}
            {isSavingUnsaved && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/85 backdrop-blur-sm rounded-2xl">
                <div className="flex flex-col items-center gap-3 text-white">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm font-medium">Saving to Image Library…</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Image card ─────────────────────────────────────────────────────────────────

function ImageCard({
  image, onClick, onDeleted, priority,
}: {
  image: GeneratedImage;
  onClick: () => void;
  onDeleted: (id: string) => void;
  priority?: boolean;
}) {
  const [loaded,        setLoaded]        = useState(false);
  const [errored,       setErrored]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting,    setIsDeleting]    = useState(false);
  const showBadge = isStoredImage(image.public_url);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      if (image._isFavorite) {
        await unlikeImage(image.record_id || '', image.public_url);
      } else {
        await deleteImage(image.id);
      }
      onDeleted(image.id);
    } catch {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      className="group relative overflow-hidden rounded-2xl cursor-pointer bg-zinc-100 dark:bg-zinc-800 border border-border/60 hover:border-primary/50 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 aspect-[4/3]"
      onClick={!confirmDelete ? onClick : undefined}
    >
      {/* Skeleton — solid fill so it's clearly visible while image loads */}
      {!loaded && !errored && (
        <div className="absolute inset-0 rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-zinc-200 dark:bg-zinc-700" />
          <div className="absolute inset-0 animate-pulse bg-zinc-300/60 dark:bg-zinc-600/60" />
        </div>
      )}

      {/* Broken image placeholder */}
      {errored && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/30 rounded-2xl text-muted-foreground/40">
          <Images className="w-8 h-8 mb-1" />
          <p className="text-[10px]">Failed to load</p>
        </div>
      )}

      {!errored && (
        <img
          src={image.public_url}
          alt={image.filename || 'image'}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          className={`w-full h-full object-cover rounded-2xl transition-all duration-300 group-hover:scale-[1.03] ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => { setErrored(true); setLoaded(true); }}
        />
      )}

      {/* Brand badge for favorites */}
      {loaded && image._isFavorite && !confirmDelete && (
        <div className="absolute top-2 left-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shadow-sm ${
            image.brand_name ? (BRAND_BADGE[image.brand_name] || 'bg-black/60 text-white') : 'bg-white/20 text-white backdrop-blur-sm'
          }`}>
            <Heart className="w-2.5 h-2.5 fill-current" />
            {image.brand_name || 'Favorite'}
          </span>
        </div>
      )}

      {/* Provider badge — only for non-favorite Supabase images */}
      {loaded && !image._isFavorite && showBadge && !confirmDelete && (
        <div className="absolute top-2 left-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shadow-sm ${providerColors(image.provider)}`}>
            {image.provider === 'edit' && <Wand2 className="w-2.5 h-2.5" />}
            {providerLabel(image.provider)}
          </span>
        </div>
      )}

      {/* Delete button — top right */}
      {loaded && !confirmDelete && (
        <button
          onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/40 text-white/70 hover:bg-destructive hover:text-white opacity-0 group-hover:opacity-100 transition-all duration-150 z-10"
          title="Remove image"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Hover overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-2xl">
        <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
          <div className="space-y-0.5">
            {image.aspect_ratio && image.aspect_ratio !== 'edited' && (
              <p className="text-white/80 text-[10px] font-medium">{image.aspect_ratio}</p>
            )}
            <p className="text-white/60 text-[10px]">{image.resolution}</p>
          </div>
          <button
            onClick={async e => { e.stopPropagation(); await downloadImage(image.public_url, image.filename); }}
            className="pointer-events-auto w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors"
            title="Download"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <DeleteConfirm
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}

// ── Filters ────────────────────────────────────────────────────────────────────

const FILTERS = [
  { value: 'all',       label: 'All',       icon: Images },
  { value: 'gemini',    label: 'Gemini',    icon: Cpu },
  { value: 'chatgpt',   label: 'ChatGPT',   icon: Bot },
  { value: 'edit',      label: 'Edited',    icon: Wand2 },
  { value: 'favorites', label: 'Favorites', icon: Heart },
];

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ImageLibrary({ embedded, onBack }: { embedded?: boolean; onBack?: () => void } = {}) {
  // Lazy-init from localStorage so the first render already has images (no empty-state flash)
  const [images,      setImages]      = useState<GeneratedImage[]>(() => {
    try { return getImages(0, 'all').data as GeneratedImage[]; } catch { return []; }
  });
  const [page,        setPage]        = useState(0);
  const [hasMore,     setHasMore]     = useState(true);
  const [isLoading,   setIsLoading]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [filter,      setFilter]      = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [lightbox,    setLightbox]    = useState<GeneratedImage | null>(null);

  const isFavoritesMode = filter === 'favorites';

  const load = useCallback(async (pageNum: number, activeFilter: string, activeBrand: string, reset = false) => {
    const isFavorites = activeFilter === 'favorites';
    // Only show loading spinner for async Supabase calls (favorites).
    // localStorage reads are synchronous — no spinner needed (avoids empty-state flash).
    if (isFavorites) setIsLoading(true);
    setError(null);
    try {
      const { data, hasMore: more } = isFavorites
        ? await fetchFavorites(activeBrand)
        : fetchImages(pageNum, activeFilter); // sync — no await
      setImages(prev => reset ? data : [...prev, ...data]);
      setHasMore(more);
      setPage(pageNum);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load images');
    } finally {
      if (isFavorites) setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(0, filter, brandFilter, true); }, [filter, brandFilter, load]);

  // Background sync: pull any Supabase images missing from localStorage on each open
  useEffect(() => {
    syncFromSupabase().then(count => {
      if (count > 0) {
        // New images were synced — reload the grid so they appear
        load(0, filter, brandFilter, true);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilter = (f: string) => {
    if (f === filter) return;
    setFilter(f);
    setBrandFilter('all');
    setPage(0);
    // Don't clear images here — load() with reset=true replaces them immediately
    // (sync for localStorage, spinner shown for async Favorites)
  };

  const handleBrandFilter = (b: string) => {
    if (b === brandFilter) return;
    setBrandFilter(b);
  };

  const handleDeleted = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
    if (lightbox?.id === id) setLightbox(null);
  };

  // Called after "Replace Original" — updates the image in the grid and lightbox
  const handleImageUpdated = useCallback((id: string, updated: GeneratedImage) => {
    setImages(prev => prev.map(img => img.id === id ? updated : img));
    setLightbox(updated);
  }, []);

  // Called after "Save as New" — prepends the new image to the grid
  const handleNewImageAdded = useCallback((newImg: GeneratedImage) => {
    setImages(prev => [newImg, ...prev]);
  }, []);

  const lightboxIdx = lightbox ? images.findIndex(i => i.id === lightbox.id) : -1;
  const prevImage   = () => lightboxIdx > 0 && setLightbox(images[lightboxIdx - 1]);
  const nextImage   = () => lightboxIdx < images.length - 1 && setLightbox(images[lightboxIdx + 1]);

  return (
    <div className={embedded ? '' : 'min-h-screen bg-background'}>

      {/* Top bar */}
      <div className={`${embedded ? 'sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border' : 'sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border'}`}>
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center gap-6">
          <div className="flex items-center gap-3 shrink-0">
            {embedded ? (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2" onClick={onBack}>
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            ) : (
              <Link to="/">
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Back</span>
                </Button>
              </Link>
            )}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center shadow-sm">
                <Images className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-semibold text-foreground text-sm leading-tight">Image Library</h1>
                {images.length > 0 && (
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {images.length}{hasMore ? '+' : ''} image{images.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-0.5 bg-muted/60 rounded-xl p-1">
              {FILTERS.map(f => {
                const Icon   = f.icon;
                const active = filter === f.value;
                return (
                  <button
                    key={f.value}
                    onClick={() => handleFilter(f.value)}
                    className={`flex items-center gap-1.5 px-3 xl:px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                      active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${f.value === 'edit' && active ? 'text-amber-500' : ''} ${f.value === 'favorites' && active ? 'text-rose-500 fill-rose-500' : ''}`} />
                    <span className="hidden sm:inline">{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={() => load(0, filter, brandFilter, true)} disabled={isLoading}
            className="gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading && images.length > 0 ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline text-sm">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Brand sub-filter — only shown in Favorites mode */}
      {isFavoritesMode && (
        <div className="sticky top-16 z-30 bg-background/80 backdrop-blur-md border-b border-border/50">
          <div className="max-w-[1600px] mx-auto px-6 h-11 flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-muted-foreground font-medium shrink-0 mr-1">Brand:</span>
            <button
              onClick={() => handleBrandFilter('all')}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                brandFilter === 'all' ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              All Brands
            </button>
            {BRANDS.map(b => (
              <button
                key={b}
                onClick={() => handleBrandFilter(b)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  brandFilter === b ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-[1600px] mx-auto px-6 py-8">

        {/* Error */}
        {error && (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-destructive/10 mb-4">
              <X className="w-6 h-6 text-destructive" />
            </div>
            <p className="text-foreground font-medium mb-1">Failed to load images</p>
            <p className="text-muted-foreground text-sm mb-6">{error}</p>
            <Button variant="outline" onClick={() => load(0, filter, brandFilter, true)}>Try again</Button>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && images.length === 0 && (
          <div className="text-center py-28">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl gradient-primary shadow-glow mb-6">
              <Sparkles className="w-10 h-10 text-primary-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {filter === 'all' ? 'No images yet' : `No ${providerLabel(filter).toLowerCase()} images`}
            </h2>
            <p className="text-muted-foreground mb-8">
              {filter === 'all' ? "Generate some images and they'll appear here." : 'Try a different filter.'}
            </p>
            <div className="flex gap-3 justify-center">
              {filter !== 'all' && <Button variant="outline" onClick={() => handleFilter('all')}>Show all</Button>}
              {embedded ? (
                <Button onClick={onBack}>Generate images</Button>
              ) : (
                <Link to="/"><Button>Generate images</Button></Link>
              )}
            </div>
          </div>
        )}

        {/* Skeleton */}
        {isLoading && images.length === 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-muted/60 animate-pulse aspect-[4/3]" />
            ))}
          </div>
        )}

        {/* Grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {images.map((image, i) => (
              <ImageCard
                key={image.id}
                image={image}
                onClick={() => setLightbox(image)}
                onDeleted={handleDeleted}
                priority={i < 20}
              />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && !isLoading && images.length > 0 && (
          <div className="flex justify-center mt-10">
            <Button variant="outline" size="lg" onClick={() => load(page + 1, filter, brandFilter)} className="gap-2 px-8 rounded-xl">
              Load more images
            </Button>
          </div>
        )}

        {isLoading && images.length > 0 && (
          <div className="flex justify-center mt-10">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          </div>
        )}

        {!hasMore && !isLoading && images.length > 0 && (
          <p className="text-center text-xs text-muted-foreground/50 mt-10">
            — All {images.length} images loaded —
          </p>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <Lightbox
          image={lightbox}
          all={images}
          onClose={() => setLightbox(null)}
          onPrev={prevImage}
          onNext={nextImage}
          onDeleted={handleDeleted}
          onImageUpdated={handleImageUpdated}
          onNewImageAdded={handleNewImageAdded}
        />
      )}
    </div>
  );
}
