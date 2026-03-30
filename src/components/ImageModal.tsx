import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Download, FileCode, Loader2, Wand2, Bot, Gem, Heart, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { HtmlConversionModal } from './HtmlConversionModal';
import { FavoriteHeart } from './FavoriteHeart';

export interface GalleryImage {
  displayUrl: string;
  editUrl: string;
  provider: 'chatgpt' | 'gemini';
  imageId: string;
  // Optional fields for variation images
  isVariation?: boolean;
  variationMode?: 'subtle' | 'strong';
  variationIndex?: number;
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
  onImageUpdated?: (newDisplayUrl: string, newEditUrl: string) => void;
  // Gallery mode
  allImages?: GalleryImage[];
  initialIndex?: number;
  likedImages?: Set<string>;
  resolution?: string;
  brand?: string;
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

  // Extra variation images appended to gallery strip
  const [localVariations, setLocalVariations] = useState<GalleryImage[]>([]);
  // Index in galleryImages where the current batch of variations starts
  const [varGalleryStartIdx, setVarGalleryStartIdx] = useState(-1);

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
    if (e.key === 'Escape') { onClose(); return; }
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

  const handleEditImage = async () => {
    if (!editInstructions.trim()) return;
    setIsEditing(true); setEditError(null);
    try {
      const res = await fetch('/api/edit-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: current.editUrl, editInstructions: editInstructions.trim(), resolution }),
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
        onImageUpdated?.(newDisplay, newEdit);
        setActiveIdx(i => i);
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
    // Variations always sit right after the original images — fixed position
    const startIdx = allImages!.length;
    variationIntervalRef.current = setInterval(() => setVariationElapsed(p => p + 1), 1000);
    try {
      const resp = await fetch('/api/generate-variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: srcUrl,
          mode: variationType,
          guidance: variationInstructions.trim(),
          count: 2,
          resolution,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to generate variations');
      }
      const data = await resp.json();
      const urls: string[] = (data.variations ?? [])
        .map((v: { imageUrl?: string }) => v.imageUrl)
        .filter(Boolean);
      if (urls.length === 0) throw new Error('No variations were generated. Please try again.');

      // Build gallery objects for each variation
      const newVarImages: GalleryImage[] = urls.map((url, i) => ({
        displayUrl: url,
        editUrl: url,
        provider: current.provider,
        imageId: `var-${activeIdx}-${Date.now()}-${i}`,
        isVariation: true,
        variationMode: variationType,
        variationIndex: i + 1,
      }));

      setGeneratedVariations(urls);
      // Replace (not append) so re-generating always shows fresh variations at same positions
      setLocalVariations(newVarImages);
      setVarGalleryStartIdx(startIdx);
      // Navigate to first variation in gallery strip
      setActiveIdx(startIdx);
    } catch (err) {
      setVariationError(err instanceof Error ? err.message : 'Failed to generate variations');
    } finally {
      setIsGeneratingVariations(false);
      if (variationIntervalRef.current) { clearInterval(variationIntervalRef.current); variationIntervalRef.current = null; }
    }
  };

  const handleClose = () => {
    // Save variations to parent before closing so they survive the next open
    onVariationsChange?.(localVariations);
    setEditInstructions(''); setEditError(null);
    setVariationError(null); setVariationInstructions('');
    updatedUrlsRef.current.clear();
    onClose();
  };

  if (!isOpen) return null;

  // Human-readable description of what the AI changes for each mode
  const variationModeDescription = {
    subtle: 'Kept: subject, pose, composition. Changed: lighting warmth, color temperature, atmospheric mood.',
    strong: 'Kept: main subject & outfit. Changed: background environment, lighting color, overall palette & mood.',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
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
                  ? `Variation ${current.variationIndex} · ${current.variationMode === 'subtle' ? 'Subtle' : 'Strong'}`
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
                  {current.variationMode === 'subtle' ? 'Lighting & colors adjusted' : 'Background & palette reimagined'}
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
              <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
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

            {/* Variations panel — single compact row */}
            {showVariationsPanel && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  {/* Subtle / Strong toggle */}
                  <div className="flex items-center gap-0.5 bg-background rounded-md p-0.5 border border-border text-xs shrink-0">
                    <button
                      type="button"
                      onClick={() => setVariationType('subtle')}
                      title="Subtle — adjust lighting & colors only, keep composition identical"
                      className={`px-2.5 py-1 rounded font-medium transition-all ${variationType === 'subtle' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >Subtle</button>
                    <button
                      type="button"
                      onClick={() => setVariationType('strong')}
                      title="Strong — reimagine background & palette, keep subject & outfit"
                      className={`px-2.5 py-1 rounded font-medium transition-all ${variationType === 'strong' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >Strong</button>
                  </div>
                  {/* Inline guidance input */}
                  <input
                    type="text"
                    placeholder="Optional guidance… e.g. 'Make it night time'"
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
                      : <><Shuffle className="w-3 h-3" />{localVariations.length > 0 ? 'Regenerate' : 'Generate'}</>}
                  </button>
                </div>
                {variationError && <p className="text-destructive text-[11px] mt-1.5">{variationError}</p>}
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
                      {/* Badge — provider or variation index */}
                      <span className={`absolute bottom-1 left-1 text-[9px] rounded px-1 py-0.5 leading-none ${
                        img.isVariation ? 'bg-primary/80 text-white' : 'bg-black/60 text-white'
                      }`}>
                        {img.isVariation
                          ? `V${img.variationIndex}`
                          : img.provider === 'chatgpt' ? 'GPT' : 'GEM'}
                      </span>
                      {/* Variation mode badge (top-right) */}
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
                  <div className="flex gap-2">
                    <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                      <span className="bg-sky-500/80 text-white rounded px-1 py-0.5 text-[8px] leading-none font-semibold">SUB</span>
                      Lighting &amp; colors adjusted
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                      <span className="bg-violet-500/80 text-white rounded px-1 py-0.5 text-[8px] leading-none font-semibold">STR</span>
                      Background &amp; palette reimagined
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </div>{/* end inner stretch wrapper */}
      </div>{/* end outer centering wrapper */}

      <HtmlConversionModal isOpen={showHtmlModal} onClose={() => setShowHtmlModal(false)} imageUrl={current.editUrl} />
    </>
  );
}
