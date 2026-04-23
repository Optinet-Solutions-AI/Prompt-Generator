import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Download, FileCode, Mail, Loader2, Wand2, Bot, Gem, Heart, Shuffle, Save, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { HtmlConversionModal } from './HtmlConversionModal';
import { EmailHtmlConversionModal } from './EmailHtmlConversionModal';
import { FavoriteHeart } from './FavoriteHeart';

import { storeImage, deleteStoredImage } from '@/lib/imageStore';
import { extractDominantColors } from '@/utils/extractColors';

export interface GalleryImage {
  displayUrl: string;
  editUrl: string;
  provider: 'chatgpt' | 'gemini';
  imageId: string;
  // Optional fields for variation images
  isVariation?: boolean;
  variationMode?: 'subtle' | 'strong';
  variationIndex?: number;
  // Which AI engine generated this variation — 'openai' (gpt-image-1) or 'imagen' (Vertex AI)
  variationEngine?: 'openai' | 'imagen';
}

export interface SourceRecipe {
  lighting?: string;
  mood?: string;
  background?: string;
}

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Single-image mode (legacy)
  displayUrl?: string;
  editUrl?: string;
  provider?: 'chatgpt' | 'gemini';
  imageId?: string;
  liked?: boolean;
  onToggleFavorite?: (imageId: string, liked: boolean) => void;
  onImageUpdated?: (newDisplayUrl: string, newEditUrl: string, imageId?: string) => void;
  // Gallery mode
  allImages?: GalleryImage[];
  initialIndex?: number;
  likedImages?: Set<string>;
  resolution?: string;
  brand?: string;
  // Structured prompt fields from the reference that created the source image.
  // Passed to the variation endpoint so the AI knows exactly what to preserve.
  sourceRecipe?: SourceRecipe;
  // Variations generated in a previous open session — restored when modal reopens
  persistedVariations?: GalleryImage[];
  onVariationsChange?: (variations: GalleryImage[]) => void;
}

export function ImageModal({
  isOpen,
  onClose,
  displayUrl,
  editUrl,
  provider,
  imageId,
  liked,
  onToggleFavorite,
  onImageUpdated,
  allImages,
  initialIndex = 0,
  likedImages,
  resolution = '1K',
  brand,
  sourceRecipe,
  persistedVariations = [],
  onVariationsChange,
}: ImageModalProps) {
  const isGallery = allImages && allImages.length > 0;

  const [activeIdx, setActiveIdx] = useState(initialIndex);
  const [editInstructions, setEditInstructions] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showHtmlModal, setShowHtmlModal] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const updatedUrlsRef = useRef<Map<string, { displayUrl: string; editUrl: string }>>(new Map());
  const [lastEditedUrl, setLastEditedUrl] = useState<string | null>(null);

  // Variations state
  const [showVariationsPanel, setShowVariationsPanel] = useState(false);
  const [variationType, setVariationType] = useState<'subtle' | 'strong'>('subtle');
  const [variationInstructions, setVariationInstructions] = useState('');
  const [isGeneratingVariations, setIsGeneratingVariations] = useState(false);
  const [variationError, setVariationError] = useState<string | null>(null);
  const [generatedVariations, setGeneratedVariations] = useState<string[]>([]);
  const [variationElapsed, setVariationElapsed] = useState(0);
  const variationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Engine selector: choose ChatGPT, Gemini, or Compare (both in parallel)
  const [selectedEngine, setSelectedEngine] = useState<'chatgpt' | 'gemini' | 'compare'>('chatgpt');

  // Extra variation images appended to gallery strip
  const [localVariations, setLocalVariations] = useState<GalleryImage[]>([]);
  // Index in galleryImages where the current batch of variations starts
  const [varGalleryStartIdx, setVarGalleryStartIdx] = useState(-1);

  // Unsaved changes dialog state
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [selectedVarsToSave, setSelectedVarsToSave] = useState<Set<number>>(new Set());
  const [saveEditedChecked, setSaveEditedChecked] = useState(true);
  const [isSavingUnsaved, setIsSavingUnsaved] = useState(false);
  // Track which variations have already been individually confirmed saved
  const [savedVariationIds, setSavedVariationIds] = useState<Set<string>>(new Set());
  // Track localStorage IDs for auto-saved items so we can delete them if user discards
  const varStoredIdsRef  = useRef<Map<string, string>>(new Map()); // imageId → StoredImage.id
  const editStoredIdRef  = useRef<string | null>(null);

  // Ref so the open-effect can read the latest persistedVariations without adding it to deps
  const persistedVariationsRef = useRef(persistedVariations);
  persistedVariationsRef.current = persistedVariations;
  const allImagesRef = useRef(allImages);
  allImagesRef.current = allImages;

  // Combined gallery: original images + any variations generated
  const galleryImages: GalleryImage[] = isGallery ? [...allImages, ...localVariations] : [];

  // Ref to track gallery images for stale-closure avoidance in effects
  const galleryImagesRef = useRef<GalleryImage[]>(galleryImages);
  galleryImagesRef.current = galleryImages;

  const showStrip = isGallery && galleryImages.length > 1;

  // Restore state when modal opens; variations persist across open/close cycles
  useEffect(() => {
    if (isOpen) {
      setActiveIdx(initialIndex);
      const pv = persistedVariationsRef.current;
      const ai = allImagesRef.current;
      // Restore any variations from the previous session
      setLocalVariations(pv);
      setVarGalleryStartIdx(pv.length > 0 ? (ai?.length ?? 0) : -1);
      setGeneratedVariations(pv.map(v => v.displayUrl));
      setVariationError(null);
      setVariationInstructions('');
      updatedUrlsRef.current.clear();
    }
  }, [isOpen, initialIndex]);

  // Reset ONLY edit state when switching images — variation state persists for the whole modal session
  useEffect(() => {
    setLastEditedUrl(null);
    setEditInstructions('');
    setEditError(null);
  }, [activeIdx]);

  const current: GalleryImage = isGallery
    ? {
        ...(galleryImages[activeIdx] ?? { displayUrl: '', editUrl: '', provider: 'gemini', imageId: '' }),
        ...(updatedUrlsRef.current.get(galleryImages[activeIdx]?.imageId ?? '') ?? {}),
      }
    : { displayUrl: displayUrl || '', editUrl: editUrl || '', provider: provider || 'gemini', imageId: imageId || '' };

  const currentLiked = isGallery ? (likedImages?.has(current.imageId) ?? false) : (liked ?? false);

  useEffect(() => {
    if (isEditing) {
      setElapsedTime(0);
      intervalRef.current = setInterval(() => setElapsedTime(p => p + 1), 1000);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isEditing]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { handleCloseAttempt(); return; }
    if (!showStrip) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, galleryImagesRef.current.length - 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
  }, [onClose, showStrip]);

  useEffect(() => {
    if (isOpen) { document.addEventListener('keydown', handleKeyDown); return () => document.removeEventListener('keydown', handleKeyDown); }
  }, [isOpen, handleKeyDown]);

  const handleDownload = async () => {
    try {
      const res = await fetch(current.displayUrl);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `image-${current.provider}-${Date.now()}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch { window.open(current.displayUrl, '_blank'); }
  };

  // Downloads a horizontally flipped (mirrored) copy for Arabic RTL layouts
  const handleDownloadMirrored = async () => {
    try {
      const res = await fetch(current.displayUrl);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((mirroredBlob) => {
          if (!mirroredBlob) return;
          const mirrorUrl = window.URL.createObjectURL(mirroredBlob);
          const a = document.createElement('a');
          a.href = mirrorUrl;
          a.download = `image-arabic-mirrored-${Date.now()}.png`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          window.URL.revokeObjectURL(mirrorUrl);
          window.URL.revokeObjectURL(blobUrl);
        }, 'image/png');
      };
      img.src = blobUrl;
    } catch { window.open(current.displayUrl, '_blank'); }
  };

  const handleEditImage = async () => {
    if (!editInstructions.trim()) return;
    setIsEditing(true); setEditError(null);
    try {
      // Use displayUrl (direct image link) — editUrl is a Drive view page that returns HTML, not image bytes
      const srcUrl = current.displayUrl || current.editUrl;
      // Determine which engine originally generated this image so the backend
      // routes the edit back to the same engine — Gemini images must go to
      // Gemini, ChatGPT images must go to ChatGPT. Never mix engines.
      const editEngine: 'gemini' | 'chatgpt' =
        current.variationEngine === 'imagen' || current.provider === 'gemini'
          ? 'gemini'
          : 'chatgpt';

      const res = await fetch('/api/edit-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: srcUrl,
          editInstructions: editInstructions.trim(),
          resolution,
          provider: editEngine,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      const data = await res.json();
      const rd = Array.isArray(data) ? data[0] : data;
      const newDisplay = rd.thumbnailUrl || rd.imageUrl || rd.thumbnailLink || rd.webContentLink;
      const newEdit = rd.viewUrl || rd.webViewLink || rd.imageUrl || (rd.fileId ? `https://drive.google.com/file/d/${rd.fileId}/view?usp=drivesdk` : null);
      if (newDisplay && newEdit) {
        if (isGallery) updatedUrlsRef.current.set(current.imageId, { displayUrl: newDisplay, editUrl: newEdit });
        setLastEditedUrl(newDisplay);
        setEditInstructions('');
        onImageUpdated?.(newDisplay, newEdit, current.imageId);
        setActiveIdx(i => i);

        // Auto-save edited image to localStorage so it persists if user navigates away.
        // Track the ID so we can delete it if user discards via the dialog.
        try {
          const stored = storeImage({
            public_url:   newDisplay,
            provider:     'edit',
            aspect_ratio: 'edited',
            resolution:   resolution || '1K',
            filename:     `edited-${Date.now()}.png`,
          });
          editStoredIdRef.current = stored.id;
        } catch (err) { console.error('Auto-save edit failed:', err); }
      } else throw new Error('No image URL returned');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to edit image');
    } finally { setIsEditing(false); }
  };

  const handleGenerateVariations = async () => {
    const srcUrl = current.displayUrl || current.editUrl;
    if (!srcUrl) return;
    setIsGeneratingVariations(true);
    setVariationError(null);
    setGeneratedVariations([]);
    setVariationElapsed(0);
    variationIntervalRef.current = setInterval(() => setVariationElapsed(p => p + 1), 1000);

    // In Compare mode (both engines) request 2 per engine → 4 total.
    // In single-engine mode request 4 → gives a full spectrum of variation tiers.
    const variationCount = selectedEngine === 'compare' ? 2 : 4;

    // Extract the actual dominant colors from the source image so the API can
    // lock to THIS image's palette instead of the generic brand palette.
    const sourceColors = await extractDominantColors(srcUrl).catch(() => []);
    console.log('[variations] source colors extracted:', sourceColors);

    const body = JSON.stringify({
      imageUrl: srcUrl,
      mode: variationType,
      guidance: variationInstructions.trim(),
      count: variationCount,
      resolution,
      brand: brand || '',
      sourceColors,
      sourceRecipe: sourceRecipe ?? null,
    });

    try {
      let newVarImages: GalleryImage[] = [];

      // Helper to extract variation images from an API response
      const extractVariations = async (
        result: PromiseSettledResult<Response>,
        engine: 'openai' | 'imagen',
        label: string,
        errors: string[],
      ): Promise<GalleryImage[]> => {
        if (result.status === 'rejected') {
          errors.push(`${label}: ${result.reason}`);
          return [];
        }
        if (!result.value.ok) {
          const e = await result.value.json().catch(() => ({})) as { error?: string; apiErrors?: string[] };
          const detail = e.apiErrors?.length ? ` — ${e.apiErrors[0]}` : '';
          errors.push(`${label}: ${e.error || result.value.status}${detail}`);
          return [];
        }
        const data = await result.value.json() as { variations?: Array<{ imageUrl?: string }> };
        const urls = (data.variations ?? []).map(v => v.imageUrl).filter(Boolean) as string[];
        return urls.map((url, i) => ({
          displayUrl: url,
          editUrl: url,
          provider: current.provider,
          imageId: `var-${engine}-${activeIdx}-${Date.now()}-${i}`,
          isVariation: true,
          variationMode: variationType,
          variationIndex: i + 1,
          variationEngine: engine,
        }));
      };

      if (selectedEngine === 'compare') {
        // ── Compare mode: call ChatGPT + Gemini in parallel ──────────────
        const [openaiResult, imagenResult] = await Promise.allSettled([
          fetch('/api/generate-variations',        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
          fetch('/api/generate-variations-imagen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
        ]);

        const errors: string[] = [];
        const [openaiImages, imagenImages] = await Promise.all([
          extractVariations(openaiResult, 'openai', 'ChatGPT', errors),
          extractVariations(imagenResult, 'imagen', 'Gemini', errors),
        ]);

        // Interleave: chatgpt[0], gemini[0], chatgpt[1], gemini[1]
        const maxLen = Math.max(openaiImages.length, imagenImages.length);
        for (let i = 0; i < maxLen; i++) {
          if (openaiImages[i]) newVarImages.push(openaiImages[i]);
          if (imagenImages[i]) newVarImages.push(imagenImages[i]);
        }

        if (newVarImages.length === 0) {
          throw new Error(`Both engines failed:\n${errors.join('\n')}`);
        }
        if (errors.length > 0) {
          console.warn('[compare] partial failure:', errors);
          setVariationError(`Note: ${errors.join('; ')}`);
        }

      } else {
        // ── Single-engine mode: ChatGPT or Gemini ───────────────────────
        const endpoint = selectedEngine === 'gemini'
          ? '/api/generate-variations-imagen'
          : '/api/generate-variations';
        const engineTag: 'openai' | 'imagen' = selectedEngine === 'gemini' ? 'imagen' : 'openai';

        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({})) as { error?: string; message?: string };
          throw new Error(err.error || err.message || 'Failed to generate variations');
        }
        const data = await resp.json() as { variations?: Array<{ imageUrl?: string }> };
        const urls = (data.variations ?? []).map(v => v.imageUrl).filter(Boolean) as string[];
        if (urls.length === 0) throw new Error('No variations were generated. Please try again.');

        newVarImages = urls.map((url, i) => ({
          displayUrl: url,
          editUrl: url,
          provider: current.provider,
          imageId: `var-${engineTag}-${activeIdx}-${Date.now()}-${i}`,
          isVariation: true,
          variationMode: variationType,
          variationIndex: i + 1,
          variationEngine: engineTag,
        }));
      }

      setGeneratedVariations(newVarImages.map(v => v.displayUrl));

      // Keep variations of the OTHER mode type — only replace same-mode variations
      const existingOtherType = localVariations.filter(v => v.variationMode !== variationType);
      const newAll = [...existingOtherType, ...newVarImages];
      setLocalVariations(newAll);

      // Navigate to the first new variation
      const newBatchStart = allImages!.length + existingOtherType.length;
      setVarGalleryStartIdx(newBatchStart);
      setActiveIdx(newBatchStart);

      // Auto-save all new variations to localStorage so they persist if user navigates away.
      // We track the stored IDs but do NOT mark them as "savedVariationIds" — the
      // "Unsaved Changes" dialog will still show them so the user can choose what to keep.
      // Deselected items will be deleted from localStorage when the dialog closes.
      for (const variation of newVarImages) {
        try {
          const stored = storeImage({
            public_url:   variation.displayUrl,
            provider:     'variation',
            aspect_ratio: 'varied',
            resolution:   resolution || '1K',
            filename:     (() => {
              const eng  = variation.variationEngine === 'imagen' ? 'gem' : 'gpt';
              const brandSlug = (brand || '').toLowerCase().replace(/\s+/g, '');
              return `variation-${eng}-${variation.variationMode}${brandSlug ? `-${brandSlug}` : ''}-${variation.variationIndex}-${Date.now()}.png`;
            })(),
          });
          varStoredIdsRef.current.set(variation.imageId, stored.id);
        } catch (err) { console.error('Auto-save variation failed:', err); }
      }

    } catch (err) {
      setVariationError(err instanceof Error ? err.message : 'Failed to generate variations');
    } finally {
      setIsGeneratingVariations(false);
      if (variationIntervalRef.current) { clearInterval(variationIntervalRef.current); variationIntervalRef.current = null; }
    }
  };

  // Check if there are unsaved items when user tries to close
  const hasUnsavedEdit = !!lastEditedUrl;
  const unsavedVariations = localVariations.filter(v => !savedVariationIds.has(v.imageId));
  const hasUnsavedWork = hasUnsavedEdit || unsavedVariations.length > 0;

  const handleCloseAttempt = () => {
    if (hasUnsavedWork) {
      // Pre-select all unsaved variations
      setSelectedVarsToSave(new Set(unsavedVariations.map((_, i) => i)));
      setSaveEditedChecked(true);
      setShowUnsavedDialog(true);
    } else {
      doClose();
    }
  };

  const doClose = () => {
    // Save variations to parent before closing so they survive the next open
    onVariationsChange?.(localVariations);
    setEditInstructions(''); setEditError(null);
    setVariationError(null); setVariationInstructions('');
    setShowUnsavedDialog(false);
    updatedUrlsRef.current.clear();
    onClose();
  };

  // User clicked "Save & Exit" in the dialog:
  // Items that were auto-saved but NOT selected get deleted from localStorage.
  const handleSaveAndClose = () => {
    setIsSavingUnsaved(true);
    try {
      // Edit: if unchecked, delete the auto-saved copy
      if (hasUnsavedEdit && !saveEditedChecked && editStoredIdRef.current) {
        deleteStoredImage(editStoredIdRef.current);
        editStoredIdRef.current = null;
      }

      // Variations: delete any that were NOT selected in the dialog
      unsavedVariations.forEach((variation, i) => {
        if (!selectedVarsToSave.has(i)) {
          const storedId = varStoredIdsRef.current.get(variation.imageId);
          if (storedId) {
            deleteStoredImage(storedId);
            varStoredIdsRef.current.delete(variation.imageId);
          }
        }
      });
    } catch (err) {
      console.error('Failed during save cleanup:', err);
    } finally {
      setIsSavingUnsaved(false);
      doClose();
    }
  };

  // User clicked "Discard & Exit": delete ALL auto-saved unsaved items from localStorage
  const handleDiscardAndClose = () => {
    // Delete auto-saved edit
    if (editStoredIdRef.current) {
      deleteStoredImage(editStoredIdRef.current);
      editStoredIdRef.current = null;
    }
    // Delete all auto-saved variations that weren't individually confirmed
    unsavedVariations.forEach(variation => {
      const storedId = varStoredIdsRef.current.get(variation.imageId);
      if (storedId) deleteStoredImage(storedId);
    });
    varStoredIdsRef.current.clear();
    doClose();
  };

  if (!isOpen) return null;

  // Human-readable description of what the AI changes for each mode
  const variationModeDescription = {
    subtle: 'Brand colors locked. Changed: camera angle & subject pose — composition varies while palette stays identical.',
    strong: 'Brand colors locked. Changed: subject pose, background details & overall composition — bolder creative differences.',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleCloseAttempt}
        style={{
          position: 'fixed', top: -100, left: -100, right: -100, bottom: -100,
          backgroundColor: 'rgba(0,0,0,0.88)',
          zIndex: 1000,
        }}
      />

      {/* Outer: centers the whole row */}
      <div
        className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"
        style={{ zIndex: 1001 }}
      >
        {/* Inner: stretches modal + strip to the SAME height */}
        <div className="flex gap-3 items-stretch pointer-events-none" style={{ height: '90vh', width: 'min(calc(100vw - 32px), 1200px)' }}>

        {/* ── Main modal ── */}
        <div
          className="pointer-events-auto bg-card rounded-2xl border border-border/60 shadow-2xl flex flex-col overflow-hidden flex-1 min-w-0"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
            <div className="flex items-center gap-2">
              {current.isVariation ? (
                <Shuffle className="w-4 h-4 text-primary" />
              ) : current.provider === 'chatgpt' ? (
                <Bot className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Gem className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="font-semibold text-sm">
                {current.isVariation
                  ? `Variation ${current.variationIndex} · ${current.variationMode === 'subtle' ? 'Subtle' : 'Strong'}${current.variationEngine === 'imagen' ? ' · Gemini' : current.variationEngine === 'openai' ? ' · ChatGPT' : ''}`
                  : `Generated Image (${current.provider === 'chatgpt' ? 'ChatGPT' : 'Gemini'})`}
              </span>
              {showStrip && (
                <span className="text-xs text-muted-foreground ml-1">
                  {activeIdx + 1} / {galleryImages.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Show what changed badge when viewing a variation */}
              {current.isVariation && current.variationMode && (
                <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5 mr-1">
                  {current.variationMode === 'subtle' ? 'Lighting & colors adjusted' : 'Scene variation — palette, lighting & details'}
                </span>
              )}
              {current.imageId && onToggleFavorite && !current.isVariation && (
                <FavoriteHeart
                  imageId={current.imageId}
                  liked={currentLiked}
                  onToggle={onToggleFavorite}
                  className="relative static opacity-100"
                />
              )}
              <button onClick={handleCloseAttempt} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Image — flex-1 fills all remaining space; no fixed cap so it always shows fully */}
          <div className="flex-1 flex items-center justify-center p-4 bg-muted/20 min-h-0 overflow-hidden">
            <img
              key={current.displayUrl}
              src={current.displayUrl}
              alt="Generated image"
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>

          {/* Edit + actions — compact bottom panel */}
          <div className="shrink-0 px-4 pt-3 pb-3 space-y-2 border-t border-border/40">
            {lastEditedUrl && (
              <p className="text-xs text-emerald-600 font-medium">Edit applied! Save it to favorites or keep editing.</p>
            )}

            {/* Variations panel */}
            {showVariationsPanel && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 space-y-1.5">
                {/* Row 1: Subtle/Strong · guidance input · Generate button */}
                <div className="flex items-center gap-2">
                  {/* Subtle / Strong toggle */}
                  <div className="flex items-center gap-0.5 bg-background rounded-md p-0.5 border border-border text-xs shrink-0">
                    <button
                      type="button"
                      onClick={() => setVariationType('subtle')}
                      title="Subtle — brand colors locked; varies camera angle & pose only"
                      className={`px-2.5 py-1 rounded font-medium transition-all ${variationType === 'subtle' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >Subtle</button>
                    <button
                      type="button"
                      onClick={() => setVariationType('strong')}
                      title="Strong — brand colors locked; varies pose, background detail & composition"
                      className={`px-2.5 py-1 rounded font-medium transition-all ${variationType === 'strong' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >Strong</button>
                  </div>
                  {/* Inline guidance input */}
                  <input
                    type="text"
                    placeholder="Optional guidance… e.g. 'Sunny stadium'"
                    value={variationInstructions}
                    onChange={e => setVariationInstructions(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !isGeneratingVariations) handleGenerateVariations(); }}
                    className="flex-1 text-xs bg-background border border-border rounded-md px-2.5 py-1.5 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 min-w-0"
                    disabled={isGeneratingVariations}
                  />
                  {/* Generate button */}
                  <button
                    type="button"
                    onClick={handleGenerateVariations}
                    disabled={isGeneratingVariations}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {isGeneratingVariations
                      ? <><Loader2 className="w-3 h-3 animate-spin" /><span className="tabular-nums">{variationElapsed}s</span></>
                      : <><Shuffle className="w-3 h-3" />{selectedEngine === 'compare' ? 'Generate Both' : (localVariations.length > 0 ? 'Regenerate' : 'Generate')}</>}
                  </button>
                </div>

                {/* Row 2: Engine selector — ChatGPT / Gemini / Compare */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 bg-background rounded-md p-0.5 border border-border text-xs shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedEngine('chatgpt')}
                      disabled={isGeneratingVariations}
                      title="Generate variations using ChatGPT (OpenAI gpt-image-1)"
                      className={`px-2.5 py-1 rounded font-medium transition-all ${selectedEngine === 'chatgpt' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >ChatGPT</button>
                    <button
                      type="button"
                      onClick={() => setSelectedEngine('gemini')}
                      disabled={isGeneratingVariations}
                      title="Generate variations using Gemini (Vertex AI Imagen)"
                      className={`px-2.5 py-1 rounded font-medium transition-all ${selectedEngine === 'gemini' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >Gemini</button>
                    <button
                      type="button"
                      onClick={() => setSelectedEngine('compare')}
                      disabled={isGeneratingVariations}
                      title="Run both ChatGPT and Gemini in parallel and generate from both"
                      className={`px-2.5 py-1 rounded font-medium transition-all ${selectedEngine === 'compare' ? 'bg-orange-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >Both</button>
                  </div>
                  {selectedEngine === 'compare' ? (
                    <span className="text-[10px] text-muted-foreground italic">
                      Generates 4 images total (2 per engine) — takes longer
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic">
                      Generates 4 variations — each with a different level of change
                    </span>
                  )}
                </div>

                {variationError && (
                  <p className={`text-[11px] mt-0.5 ${variationError.startsWith('Note:') ? 'text-amber-600' : 'text-destructive'}`}>
                    {variationError}
                  </p>
                )}
              </div>
            )}

            <Textarea
              placeholder="Enter editing instructions (e.g., 'Make the character face forward', 'Zoom in on the subject')"
              value={editInstructions}
              onChange={e => setEditInstructions(e.target.value)}
              className="min-h-[52px] resize-none text-sm"
              disabled={isEditing}
            />
            {editError && <p className="text-destructive text-sm">{editError}</p>}
            {/* Action bar — flex-wrap so it never clips on any screen size */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Variations toggle */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowVariationsPanel(v => !v)}
                className={`gap-1.5 text-xs shrink-0 ${showVariationsPanel ? 'border-primary/50 text-primary bg-primary/5' : ''}`}
                title="Generate variations of this image"
              >
                <Shuffle className="w-3.5 h-3.5" />
                Variations
                {localVariations.length > 0 && (
                  <span className="ml-0.5 bg-primary text-primary-foreground rounded-full text-[9px] w-4 h-4 flex items-center justify-center font-bold">
                    {localVariations.length}
                  </span>
                )}
              </Button>
              {/* Spacer pushes remaining buttons to the right */}
              <div className="flex-1 min-w-0" />
              <Button
                onClick={handleEditImage}
                disabled={isEditing || !editInstructions.trim()}
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
              >
                {isEditing
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="tabular-nums">{elapsedTime}s</span></>
                  : <><Wand2 className="w-3.5 h-3.5" />Apply Edit</>}
              </Button>
              {lastEditedUrl && brand && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  disabled={isEditing}
                  onClick={async () => {
                    try {
                      await fetch('/api/like-img', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ record_id: `edited-${Date.now()}`, img_url: lastEditedUrl, brand_name: brand }),
                      });
                      setLastEditedUrl(null);
                    } catch { /* non-fatal */ }
                  }}
                >
                  <Heart className="w-3.5 h-3.5" />Save to Favorites
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setShowHtmlModal(true)} disabled={isEditing}>
                <FileCode className="w-3.5 h-3.5" />Convert to HTML
              </Button>
              <Button size="sm" className="gap-1.5 gradient-primary shrink-0" onClick={handleDownload} disabled={isEditing}>
                <Download className="w-3.5 h-3.5" />Download
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={handleDownloadMirrored} disabled={isEditing} title="Download horizontally flipped copy for Arabic (RTL) layout">
                <Download className="w-3.5 h-3.5" />Arabic (RTL)
              </Button>
            </div>
          </div>
        </div>

        {/* ── Right-side thumbnail strip — responsive width, matches modal height ── */}
        {showStrip && (
          <div
            className="pointer-events-auto flex flex-col bg-card/95 rounded-2xl border border-border/60 shadow-2xl overflow-hidden shrink-0"
            style={{ width: 'clamp(200px, 26vw, 340px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-border/40 text-center shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                {activeIdx + 1} / {galleryImages.length} images
              </span>
            </div>
            {/* 3-column scrollable grid */}
            <div className="overflow-y-auto flex-1 p-3">
              <div className="grid grid-cols-3 gap-2">
                {galleryImages.map((img, i) => {
                  const display = { ...img, ...(updatedUrlsRef.current.get(img.imageId) ?? {}) };
                  const isActive = activeIdx === i;
                  return (
                    <button
                      key={img.imageId}
                      onClick={() => { setActiveIdx(i); if (!img.isVariation) { setEditInstructions(''); setEditError(null); } }}
                      title={img.isVariation
                        ? `Variation ${img.variationIndex} (${img.variationMode === 'subtle' ? 'Subtle — lighting & colors' : 'Strong — background & palette'})`
                        : img.provider === 'chatgpt' ? 'ChatGPT' : 'Gemini'}
                      className={`relative w-full rounded-xl overflow-hidden border-2 block transition-all duration-150 ${
                        isActive
                          ? 'border-primary shadow-lg shadow-primary/40 scale-95'
                          : img.isVariation
                            ? 'border-primary/20 hover:border-primary/50 hover:scale-[0.97]'
                            : 'border-transparent hover:border-border/60 hover:scale-[0.97]'
                      }`}
                      style={{ aspectRatio: '1' }}
                    >
                      <img src={display.displayUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                      {/* Badge — provider or variation index + engine */}
                      <span className={`absolute bottom-1 left-1 text-[9px] rounded px-1 py-0.5 leading-none ${
                        img.isVariation
                          ? img.variationEngine === 'imagen'
                            ? 'bg-orange-500/85 text-white'   // Gemini = orange
                            : 'bg-primary/80 text-white'       // ChatGPT = primary (blue/purple)
                          : 'bg-black/60 text-white'
                      }`}>
                        {img.isVariation
                          ? img.variationEngine === 'imagen' ? `GEM` : `GPT`
                          : img.provider === 'chatgpt' ? 'GPT' : 'GEM'}
                      </span>
                      {/* Variation mode badge (top-right): SUB / STR */}
                      {img.isVariation && img.variationMode && (
                        <span className={`absolute top-1 right-1 text-[8px] rounded px-1 py-0.5 leading-none font-semibold ${
                          img.variationMode === 'subtle' ? 'bg-sky-500/80 text-white' : 'bg-violet-500/80 text-white'
                        }`}>
                          {img.variationMode === 'subtle' ? 'SUB' : 'STR'}
                        </span>
                      )}
                      {isActive && (
                        <span className="absolute inset-0 ring-2 ring-primary ring-inset rounded-xl pointer-events-none" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend for variation badges */}
              {localVariations.length > 0 && (
                <div className="mt-3 pt-2 border-t border-border/30 space-y-1">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">Variation legend</p>
                  {/* Mode badges */}
                  <div className="flex gap-2 flex-wrap">
                    <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                      <span className="bg-sky-500/80 text-white rounded px-1 py-0.5 text-[8px] leading-none font-semibold">SUB</span>
                      Lighting &amp; colors
                    </span>
                    <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                      <span className="bg-violet-500/80 text-white rounded px-1 py-0.5 text-[8px] leading-none font-semibold">STR</span>
                      Scene variation
                    </span>
                  </div>
                  {/* Engine badges — shown only when compare mode was used */}
                  {localVariations.some(v => v.variationEngine) && (
                    <div className="flex gap-2 flex-wrap pt-0.5">
                      <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <span className="bg-primary/80 text-white rounded px-1 py-0.5 text-[8px] leading-none">GPT</span>
                        ChatGPT
                      </span>
                      <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <span className="bg-orange-500/85 text-white rounded px-1 py-0.5 text-[8px] leading-none">GEM</span>
                        Gemini
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        </div>{/* end inner stretch wrapper */}
      </div>{/* end outer centering wrapper */}

      <HtmlConversionModal isOpen={showHtmlModal} onClose={() => setShowHtmlModal(false)} imageUrl={current.displayUrl || current.editUrl} brand={brand} />

      {/* Unsaved Changes Dialog */}
      {showUnsavedDialog && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !isSavingUnsaved && setShowUnsavedDialog(false)} />
          <div className="relative z-10 w-full max-w-md bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="font-semibold text-base">Unsaved Changes</h2>
                  <p className="text-muted-foreground text-sm mt-0.5">Choose what to save to Image Library</p>
                </div>
              </div>
              <button onClick={() => !isSavingUnsaved && setShowUnsavedDialog(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="px-6 pb-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Edited image section */}
              {hasUnsavedEdit && lastEditedUrl && (
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveEditedChecked}
                      onChange={e => setSaveEditedChecked(e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <img src={lastEditedUrl} alt="Edited" className="w-14 h-14 rounded-lg object-cover border border-border/40 shrink-0" />
                      <div>
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          <Wand2 className="w-3.5 h-3.5 text-amber-500" />Edited Image
                        </p>
                        <p className="text-xs text-muted-foreground">Save your edit to the Image Library</p>
                      </div>
                    </div>
                  </label>
                </div>
              )}

              {/* Variations section */}
              {unsavedVariations.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Shuffle className="w-3.5 h-3.5 text-primary" />
                      Variations ({unsavedVariations.length})
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
                    {unsavedVariations.map((v, i) => (
                      <label
                        key={v.imageId}
                        className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                          selectedVarsToSave.has(i)
                            ? 'border-primary shadow-md shadow-primary/20'
                            : 'border-border/40 opacity-60 hover:opacity-80'
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
                          <img src={v.displayUrl} alt={`Variation ${i + 1}`} className="w-full h-full object-cover" />
                        </div>
                        {/* Checkmark overlay */}
                        {selectedVarsToSave.has(i) && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg">
                            <Check className="w-3.5 h-3.5 text-primary-foreground" />
                          </div>
                        )}
                        {/* Badge */}
                        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
                          <span className={`text-[9px] rounded px-1 py-0.5 leading-none font-semibold ${
                            v.variationMode === 'subtle' ? 'bg-sky-500/80 text-white' : 'bg-violet-500/80 text-white'
                          }`}>
                            {v.variationMode === 'subtle' ? 'SUB' : 'STR'}
                          </span>
                          <span className={`text-[9px] rounded px-1 py-0.5 leading-none ${
                            v.variationEngine === 'imagen' ? 'bg-orange-500/85 text-white' : 'bg-primary/80 text-white'
                          }`}>
                            {v.variationEngine === 'imagen' ? 'GEM' : 'GPT'}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="px-6 pb-6 pt-2 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleDiscardAndClose}
                disabled={isSavingUnsaved}
              >
                Discard & Exit
              </Button>
              <Button
                className="flex-1 gap-1.5"
                onClick={handleSaveAndClose}
                disabled={isSavingUnsaved || (!saveEditedChecked && selectedVarsToSave.size === 0 && !hasUnsavedEdit)}
              >
                {isSavingUnsaved ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                ) : (
                  <><Save className="w-3.5 h-3.5" />Save & Exit</>
                )}
              </Button>
            </div>

            {/* Saving overlay */}
            {isSavingUnsaved && (
              <div className="absolute inset-0 flex items-center justify-center bg-card/85 backdrop-blur-sm rounded-2xl">
                <div className="flex flex-col items-center gap-3">
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
