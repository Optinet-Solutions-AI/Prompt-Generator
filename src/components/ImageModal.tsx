import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Download, FileCode, Loader2, Wand2, Bot, Gem } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { HtmlConversionModal } from './HtmlConversionModal';
import { FavoriteHeart } from './FavoriteHeart';

export interface GalleryImage {
  displayUrl: string;
  editUrl: string;
  provider: 'chatgpt' | 'gemini';
  imageId: string;
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
}: ImageModalProps) {
  const isGallery = allImages && allImages.length > 0;
  const showStrip = isGallery && allImages.length > 1;

  const [activeIdx, setActiveIdx] = useState(initialIndex);
  const [editInstructions, setEditInstructions] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showHtmlModal, setShowHtmlModal] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const updatedUrlsRef = useRef<Map<string, { displayUrl: string; editUrl: string }>>(new Map());

  useEffect(() => { if (isOpen) setActiveIdx(initialIndex); }, [isOpen, initialIndex]);

  const current: GalleryImage = isGallery
    ? { ...allImages[activeIdx], ...(updatedUrlsRef.current.get(allImages[activeIdx].imageId) ?? {}) }
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
    if (e.key === 'ArrowRight') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, allImages.length - 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
  }, [onClose, showStrip, allImages?.length]);

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
        setEditInstructions('');
        onImageUpdated?.(newDisplay, newEdit);
        setActiveIdx(i => i);
      } else throw new Error('No image URL returned');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to edit image');
    } finally { setIsEditing(false); }
  };

  const handleClose = () => {
    setEditInstructions(''); setEditError(null);
    updatedUrlsRef.current.clear(); onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — extends beyond viewport edges to cover absolutely everything */}
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
        <div className="flex gap-4 items-stretch pointer-events-none" style={{ maxHeight: '88vh', width: 'min(calc(100vw - 32px), 1160px)' }}>

        {/* ── Main modal ── */}
        <div
          className="pointer-events-auto bg-card rounded-2xl border border-border/60 shadow-2xl flex flex-col overflow-hidden flex-1 min-w-0"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
            <div className="flex items-center gap-2">
              {current.provider === 'chatgpt'
                ? <Bot className="w-4 h-4 text-muted-foreground" />
                : <Gem className="w-4 h-4 text-muted-foreground" />}
              <span className="font-semibold text-sm">
                Generated Image ({current.provider === 'chatgpt' ? 'ChatGPT' : 'Gemini'})
              </span>
              {showStrip && (
                <span className="text-xs text-muted-foreground ml-1">
                  {activeIdx + 1} / {allImages.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {current.imageId && onToggleFavorite && (
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

          {/* Image */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/20 min-h-0">
            <img
              key={current.displayUrl}
              src={current.displayUrl}
              alt="Generated image"
              className="max-w-full max-h-full object-contain rounded-lg"
              style={{ maxHeight: 'min(50vh, 480px)' }}
            />
          </div>

          {/* Edit + actions */}
          <div className="shrink-0 p-4 space-y-3 border-t border-border/40">
            <Textarea
              placeholder="Enter editing instructions (e.g., 'Make the character face forward', 'Zoom in on the subject')"
              value={editInstructions}
              onChange={e => setEditInstructions(e.target.value)}
              className="min-h-[80px] resize-none"
              disabled={isEditing}
            />
            {editError && <p className="text-destructive text-sm">{editError}</p>}
            <div className="flex items-center gap-2 justify-end">
              <Button
                onClick={handleEditImage}
                disabled={isEditing || !editInstructions.trim()}
                variant="outline"
                className="gap-2 flex-1"
              >
                {isEditing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /><span className="tabular-nums">{elapsedTime}s</span></>
                  : <><Wand2 className="w-4 h-4" />Apply Edit & Regenerate</>}
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setShowHtmlModal(true)} disabled={isEditing}>
                <FileCode className="w-4 h-4" />
                Convert to HTML
              </Button>
              <Button className="gap-2 gradient-primary" onClick={handleDownload} disabled={isEditing}>
                <Download className="w-4 h-4" />
                Download Image
              </Button>
            </div>
          </div>
        </div>

        {/* ── Right-side thumbnail strip — 3-column grid, matches modal height ── */}
        {showStrip && (
          <div
            className="pointer-events-auto flex flex-col bg-card/95 rounded-2xl border border-border/60 shadow-2xl overflow-hidden shrink-0"
            style={{ width: 440 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-border/40 text-center shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                {activeIdx + 1} / {allImages.length} images
              </span>
            </div>
            {/* 3-column scrollable grid */}
            <div className="overflow-y-auto flex-1 p-3">
              <div className="grid grid-cols-3 gap-2">
                {allImages.map((img, i) => {
                  const display = { ...img, ...(updatedUrlsRef.current.get(img.imageId) ?? {}) };
                  const isActive = activeIdx === i;
                  return (
                    <button
                      key={img.imageId}
                      onClick={() => { setActiveIdx(i); setEditInstructions(''); setEditError(null); }}
                      title={img.provider === 'chatgpt' ? 'ChatGPT' : 'Gemini'}
                      className={`relative w-full rounded-xl overflow-hidden border-2 block transition-all duration-150 ${
                        isActive
                          ? 'border-primary shadow-lg shadow-primary/40 scale-95'
                          : 'border-transparent hover:border-border/60 hover:scale-[0.97]'
                      }`}
                      style={{ aspectRatio: '1' }}
                    >
                      <img src={display.displayUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                      {/* Provider badge */}
                      <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 text-white rounded px-1 py-0.5 leading-none">
                        {img.provider === 'chatgpt' ? 'GPT' : 'GEM'}
                      </span>
                      {isActive && (
                        <span className="absolute inset-0 ring-2 ring-primary ring-inset rounded-xl pointer-events-none" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        </div>{/* end inner stretch wrapper */}
      </div>{/* end outer centering wrapper */}

      <HtmlConversionModal isOpen={showHtmlModal} onClose={() => setShowHtmlModal(false)} imageUrl={current.editUrl} />
    </>
  );
}
