import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Download, FileCode, Loader2, Wand2, ChevronLeft, ChevronRight, Bot, Gem } from 'lucide-react';
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
}: ImageModalProps) {
  const isGallery = allImages && allImages.length > 0;
  const [activeIdx, setActiveIdx] = useState(initialIndex);
  const [editInstructions, setEditInstructions] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showHtmlModal, setShowHtmlModal] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Track updated URLs per imageId for gallery mode
  const updatedUrlsRef = useRef<Map<string, { displayUrl: string; editUrl: string }>>(new Map());

  // Sync initialIndex when modal opens
  useEffect(() => {
    if (isOpen) setActiveIdx(initialIndex);
  }, [isOpen, initialIndex]);

  // Resolve current image data
  const current: GalleryImage = isGallery
    ? { ...allImages[activeIdx], ...(updatedUrlsRef.current.get(allImages[activeIdx].imageId) || {}) }
    : {
        displayUrl: displayUrl || '',
        editUrl: editUrl || '',
        provider: provider || 'gemini',
        imageId: imageId || '',
      };

  const currentLiked = isGallery
    ? likedImages?.has(current.imageId) ?? false
    : liked ?? false;

  // Elapsed time counter for editing
  useEffect(() => {
    if (isEditing) {
      setElapsedTime(0);
      intervalRef.current = setInterval(() => setElapsedTime(p => p + 1), 1000);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isEditing]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isGallery) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, allImages.length - 1));
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    }
  }, [isGallery, allImages?.length]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const handleDownload = async () => {
    try {
      const response = await fetch(current.displayUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `generated-image-${current.provider}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch { window.open(current.displayUrl, '_blank'); }
  };

  const handleEditImage = async () => {
    if (!editInstructions.trim()) return;
    setIsEditing(true);
    setEditError(null);
    try {
      const response = await fetch('/api/edit-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: current.editUrl, editInstructions: editInstructions.trim(), provider: current.provider }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to edit image');
      }
      const data = await response.json();
      const rd = Array.isArray(data) ? data[0] : data;
      const newDisplayUrl = rd.thumbnailUrl || rd.imageUrl || rd.thumbnailLink || rd.webContentLink;
      const newEditUrl = rd.viewUrl || rd.webViewLink || rd.imageUrl || (rd.fileId ? `https://drive.google.com/file/d/${rd.fileId}/view?usp=drivesdk` : null);
      if (newDisplayUrl && newEditUrl) {
        if (isGallery) {
          updatedUrlsRef.current.set(current.imageId, { displayUrl: newDisplayUrl, editUrl: newEditUrl });
        }
        setEditInstructions('');
        onImageUpdated?.(newDisplayUrl, newEditUrl);
        // Force re-render
        setActiveIdx(i => i);
      } else {
        throw new Error('No image URL returned');
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to edit image');
    } finally {
      setIsEditing(false);
    }
  };

  const handleClose = () => {
    setEditInstructions('');
    setEditError(null);
    updatedUrlsRef.current.clear();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm animate-fade-in"
        style={{ zIndex: 1000 }}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal container */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: 1001 }}
        onClick={handleClose}
      >
        <div
          className="relative bg-card rounded-2xl border border-border/60 shadow-2xl overflow-hidden flex animate-scale-in"
          style={{
            width: isGallery && allImages.length > 1 ? 'min(95vw, 1100px)' : 'min(92vw, 780px)',
            maxHeight: '92vh',
            boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Thumbnail strip (gallery mode only) ── */}
          {isGallery && allImages.length > 1 && (
            <div className="w-[110px] shrink-0 flex flex-col border-r border-border/40 bg-muted/10">
              {/* Strip header */}
              <div className="px-3 py-3 border-b border-border/30">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                  {allImages.length} images
                </p>
              </div>
              {/* Thumbnails */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {allImages.map((img, i) => {
                  const isActive = activeIdx === i;
                  const displayImg = { ...img, ...(updatedUrlsRef.current.get(img.imageId) || {}) };
                  return (
                    <button
                      key={img.imageId}
                      onClick={() => { setActiveIdx(i); setEditInstructions(''); setEditError(null); }}
                      className={`w-full aspect-square rounded-xl overflow-hidden border-2 block transition-all duration-150 ${
                        isActive
                          ? 'border-primary shadow-md shadow-primary/30 scale-[0.96]'
                          : 'border-transparent hover:border-border/60 hover:scale-[0.97]'
                      }`}
                    >
                      <img src={displayImg.displayUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Main content ── */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50 bg-card/80 backdrop-blur shrink-0">
              <div className="flex items-center gap-2.5">
                {current.provider === 'chatgpt'
                  ? <Bot className="w-4 h-4 text-muted-foreground" />
                  : <Gem className="w-4 h-4 text-muted-foreground" />
                }
                <span className="font-semibold text-sm">
                  {current.provider === 'chatgpt' ? 'ChatGPT' : 'Gemini'}
                </span>
                {isGallery && allImages.length > 1 && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {activeIdx + 1} / {allImages.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Favorite heart */}
                {current.imageId && onToggleFavorite && (
                  <FavoriteHeart
                    imageId={current.imageId}
                    liked={currentLiked}
                    onToggle={onToggleFavorite}
                    className="relative static opacity-100"
                  />
                )}
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors ml-1"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Image */}
            <div className="flex-1 overflow-auto bg-muted/20 flex items-center justify-center p-4 min-h-0 relative">
              {/* Prev/Next arrows */}
              {isGallery && allImages.length > 1 && (
                <>
                  <button
                    onClick={() => setActiveIdx(i => Math.max(i - 1, 0))}
                    disabled={activeIdx === 0}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button
                    onClick={() => setActiveIdx(i => Math.min(i + 1, allImages.length - 1))}
                    disabled={activeIdx === allImages.length - 1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                </>
              )}
              <img
                key={current.displayUrl}
                src={current.displayUrl}
                alt="Generated image"
                className="max-w-full max-h-full object-contain rounded-xl shadow-lg"
                style={{ maxHeight: 'min(52vh, 500px)' }}
              />
            </div>

            {/* Edit + actions */}
            <div className="shrink-0 border-t border-border/50 p-4 space-y-3 bg-card/60">
              <Textarea
                placeholder="Edit instructions — e.g. 'Make the character face forward', 'Zoom in on the subject'"
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                className="min-h-[64px] resize-none text-sm bg-muted/30 border-border/50"
                disabled={isEditing}
              />
              {editError && <p className="text-destructive text-xs">{editError}</p>}
              <div className="flex items-center justify-between gap-2">
                <Button
                  onClick={handleEditImage}
                  disabled={isEditing || !editInstructions.trim()}
                  variant="outline"
                  size="sm"
                  className="gap-2 flex-1"
                >
                  {isEditing ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="tabular-nums">{elapsedTime}s</span></>
                  ) : (
                    <><Wand2 className="w-3.5 h-3.5" />Apply Edit</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowHtmlModal(true)}
                  disabled={isEditing}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  HTML
                </Button>
                <Button
                  size="sm"
                  className="gap-2 gradient-primary"
                  onClick={handleDownload}
                  disabled={isEditing}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* HTML Conversion Modal */}
      <HtmlConversionModal
        isOpen={showHtmlModal}
        onClose={() => setShowHtmlModal(false)}
        imageUrl={current.editUrl}
      />
    </>
  );
}
