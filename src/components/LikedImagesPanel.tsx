import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Heart, Loader2, AlertTriangle, Download, FileCode, Mail, ChevronLeft, ChevronRight, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LikedImageCard } from './LikedImageCard';
import { HtmlConversionModal } from './HtmlConversionModal';
import { EmailHtmlConversionModal } from './EmailHtmlConversionModal';
import { supabaseThumbnail } from '@/lib/imageUtils';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Shape of a row coming from Supabase liked_images table
interface LikedImageRow {
  id: string;
  record_id: string;
  img_url: string;
  brand_name: string;
  created_at: string;
}

interface LikedImagesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  brand: string;
}

export function LikedImagesPanel({ isOpen, onClose, brand }: LikedImagesPanelProps) {
  const [records, setRecords] = useState<LikedImageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [showHtmlModal, setShowHtmlModal] = useState(false);

  // Edit image state
  const [editInstructions, setEditInstructions] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editedImgUrl, setEditedImgUrl] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const hasBrand = !!brand && brand !== 'Select a brand';
  const headerLabel = hasBrand ? `FAVORITES — ${brand.toUpperCase()}` : 'FAVORITES';
  const validRecords = records.filter(r => !!r.img_url);

  const activeRecord = activeIdx !== null ? validRecords[activeIdx] : null;
  const activeImgUrl = activeRecord?.img_url;
  const activeRecordId = activeRecord?.record_id;
  const previewOpen = activeIdx !== null && !!activeImgUrl;

  const fetchLikedImages = useCallback(async () => {
    if (!hasBrand) return;
    setLoading(true);
    setError(null);
    try {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY)
        throw new Error('Missing Supabase configuration.');
      // Supabase REST API: filter by brand_name, ordered newest first
      const url = `${SUPABASE_URL}/rest/v1/liked_images?brand_name=eq.${encodeURIComponent(brand)}&order=created_at.desc`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
      });
      if (!response.ok) throw new Error(`Supabase error: ${response.status}`);
      const data: LikedImageRow[] = await response.json();
      setRecords(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load liked images');
    } finally {
      setLoading(false);
    }
  }, [brand, hasBrand]);

  useEffect(() => {
    if (isOpen && hasBrand) fetchLikedImages();
    if (isOpen && !hasBrand) { setRecords([]); setError(null); }
  }, [isOpen, hasBrand, fetchLikedImages]);

  useEffect(() => { if (!isOpen) setActiveIdx(null); }, [isOpen]);

  // Reset edit state whenever the user switches to a different image
  useEffect(() => {
    setEditInstructions('');
    setEditError(null);
    setEditedImgUrl(null);
    setElapsedTime(0);
  }, [activeIdx]);

  // Timer shown while editing is in progress
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
    if (e.key === 'Escape') {
      if (activeIdx !== null) { setActiveIdx(null); return; }
      onClose();
      return;
    }
    if (activeIdx === null) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => (i !== null && i < validRecords.length - 1 ? i + 1 : i));
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => (i !== null && i > 0 ? i - 1 : i));
    }
  }, [activeIdx, validRecords.length, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const handleDownload = async (imgUrl: string, recordId: string) => {
    try {
      const response = await fetch(imgUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = recordId || `liked-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch { window.open(imgUrl, '_blank'); }
  };

  const handleUnlike = async (recordId: string, imgUrl: string) => {
    setRecords(prev => prev.filter(r => r.record_id !== recordId));
    if (activeIdx !== null) {
      const newLen = validRecords.length - 1;
      setActiveIdx(newLen === 0 ? null : Math.min(activeIdx, newLen - 1));
    }
    try {
      await fetch('/api/unlike-img', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_id: recordId, img_url: imgUrl }),
      });
    } catch { /* non-fatal */ }
  };

  const handleDownloadAll = async () => {
    for (const record of validRecords) {
      handleDownload(record.img_url, record.record_id);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  };

  const handleEditImage = async () => {
    const srcUrl = editedImgUrl || activeImgUrl;
    if (!editInstructions.trim() || !srcUrl) return;
    setIsEditing(true); setEditError(null);
    try {
      const res = await fetch('/api/edit-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: srcUrl, editInstructions: editInstructions.trim(), resolution: '2K' }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      const data = await res.json();
      const rd = Array.isArray(data) ? data[0] : data;
      const newUrl = rd.thumbnailUrl || rd.imageUrl || rd.thumbnailLink || rd.webContentLink;
      if (!newUrl) throw new Error('No image URL returned from edit');
      setEditedImgUrl(newUrl);
      setEditInstructions('');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to edit image');
    } finally { setIsEditing(false); }
  };

  // Save the edited image back to Airtable favorites so it appears in the grid
  const handleSaveEditedToFavorites = async () => {
    if (!editedImgUrl || !brand) return;
    try {
      await fetch('/api/like-img', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_id: `edited-${Date.now()}`,
          img_url: editedImgUrl,
          brand_name: brand,
        }),
      });
      setEditedImgUrl(null);
      await fetchLikedImages(); // refresh the grid to show the new image
    } catch { /* non-fatal */ }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Dim backdrop — extends past viewport edges so no white gap */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', top: -100, left: -100, right: -100, bottom: -100,
          backgroundColor: 'rgba(0,0,0,0.75)',
          zIndex: 998,
          pointerEvents: 'none',
        }}
      />

      {/* Click-outside area to close */}
      <div className="fixed inset-0" style={{ zIndex: 997 }} onClick={onClose} aria-hidden="true" />

      {/*
        ── Layout strategy ──
        The outer container is pinned to the RIGHT side of the screen using `flex-direction: row-reverse`.
        - FAVORITES PANEL is always the first child → always stays on the RIGHT, same position, same size.
        - PREVIEW PANEL is the second child → appears to the LEFT of favorites when open.
        The container grows leftward as the preview opens — favorites never moves.
      */}
      <div
        style={{
          position: 'fixed',
          right: 16,
          top: 'max(4vh, 16px)',
          bottom: 'max(4vh, 16px)',
          display: 'flex',
          flexDirection: 'row-reverse', // favorites on right, preview grows to the left
          alignItems: 'stretch',
          gap: 16,
          zIndex: 1001,
          maxWidth: 'calc(100vw - 32px)',
          pointerEvents: 'none', // let clicks pass through gaps between panels
        }}
      >
        {/* ── FAVORITES PANEL — always rightmost, always same width/position ── */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Favorites panel"
          className="flex flex-col bg-card rounded-2xl border border-border/60 overflow-hidden"
          style={{
            width: 'min(88vw, 500px)',
            flexShrink: 0,
            pointerEvents: 'auto',
            boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/60 bg-card/95 backdrop-blur shrink-0">
            <div className="flex items-center gap-2.5">
              <Heart className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-foreground">{headerLabel}</h2>
              {validRecords.length > 0 && (
                <span className="text-xs text-muted-foreground">{validRecords.length} images</span>
              )}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Close panel">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Grid body */}
          <div className="flex-1 overflow-y-auto p-5">
            {!hasBrand && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
                <Heart className="w-16 h-16 text-muted-foreground/15 stroke-1" />
                <p className="text-base font-semibold">Select a brand to view favorites</p>
              </div>
            )}
            {hasBrand && loading && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading favorites...</p>
              </div>
            )}
            {hasBrand && error && !loading && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <AlertTriangle className="w-12 h-12 text-destructive/50" />
                <p className="text-sm font-medium">Failed to load favorites</p>
                <p className="text-xs text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" onClick={fetchLikedImages}>Retry</Button>
              </div>
            )}
            {hasBrand && !loading && !error && validRecords.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
                <Heart className="w-16 h-16 text-muted-foreground/15 stroke-1" />
                <p className="text-base font-semibold">No {brand} favorites yet</p>
                <p className="text-sm text-muted-foreground max-w-xs">Generate images and like your favorites!</p>
              </div>
            )}
            {hasBrand && !loading && !error && validRecords.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {validRecords.map((record, i) => (
                  <LikedImageCard
                    key={record.id}
                    imgUrl={record.img_url}
                    recordId={record.record_id}
                    onView={() => setActiveIdx(i)}
                    onDownload={() => handleDownload(record.img_url, record.record_id)}
                    onUnlike={() => handleUnlike(record.record_id, record.img_url)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {hasBrand && !loading && !error && validRecords.length > 0 && (
            <div className="px-4 py-3 border-t border-border/40 bg-card flex justify-between items-center shrink-0">
              <span className="text-xs text-muted-foreground">{validRecords.length} image{validRecords.length !== 1 ? 's' : ''}</span>
              <Button variant="outline" size="sm" onClick={handleDownloadAll} className="gap-2 h-8 text-xs">
                <Download className="w-3.5 h-3.5" />Download All
              </Button>
            </div>
          )}
        </div>

        {/* ── PREVIEW PANEL — appears to the LEFT of favorites, hidden on small screens ── */}
        {previewOpen && (
          <div
            className="hidden sm:flex flex-col bg-card rounded-2xl border border-border/60 overflow-hidden"
            style={{
              width: 'min(55vw, 700px)',
              flexShrink: 1,
              pointerEvents: 'auto',
              boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Preview header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Preview</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {activeIdx! + 1} / {validRecords.length}
                </span>
              </div>
              <button onClick={() => setActiveIdx(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Image */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-5 bg-muted/20 min-h-0">
              <img
                key={editedImgUrl || activeImgUrl}
                src={editedImgUrl || activeImgUrl}
                alt={activeRecordId}
                className="max-w-full max-h-full object-contain rounded-xl shadow-xl"
              />
            </div>

            {/* Edit section */}
            <div className="shrink-0 px-5 pt-4 pb-2 border-t border-border/40 space-y-2">
              {editedImgUrl && (
                <p className="text-xs text-emerald-600 font-medium">Edit applied! You can keep editing or save to favorites.</p>
              )}
              <Textarea
                placeholder="Edit instructions (e.g. 'Change the background to sunset', 'Make it more vibrant')"
                value={editInstructions}
                onChange={e => setEditInstructions(e.target.value)}
                className="min-h-[72px] resize-none text-sm"
                disabled={isEditing}
              />
              {editError && <p className="text-destructive text-xs">{editError}</p>}
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleEditImage}
                  disabled={isEditing || !editInstructions.trim()}
                  variant="outline"
                  className="gap-2 flex-1 text-xs h-8"
                >
                  {isEditing
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="tabular-nums">{elapsedTime}s</span></>
                    : <><Wand2 className="w-3.5 h-3.5" />Apply Edit & Regenerate</>}
                </Button>
                {editedImgUrl && (
                  <Button
                    onClick={handleSaveEditedToFavorites}
                    disabled={isEditing}
                    size="sm"
                    className="gap-1.5 h-8 text-xs gradient-primary"
                  >
                    <Heart className="w-3.5 h-3.5" />Save to Favorites
                  </Button>
                )}
              </div>
            </div>

            {/* Nav + actions */}
            <div className="shrink-0 px-5 py-3 border-t border-border/40 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={activeIdx === 0}
                  onClick={() => setActiveIdx(i => (i !== null && i > 0 ? i - 1 : i))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={activeIdx === validRecords.length - 1}
                  onClick={() => setActiveIdx(i => (i !== null && i < validRecords.length - 1 ? i + 1 : i))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowHtmlModal(true)}>
                  <FileCode className="w-3.5 h-3.5" />HTML
                </Button>
                <Button variant="outline" size="sm"
                  className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                  onClick={() => activeRecordId && activeImgUrl && handleUnlike(activeRecordId, activeImgUrl)}>
                  <Heart className="w-3.5 h-3.5 fill-current" />Unlike
                </Button>
                <Button size="sm" className="gap-1.5 h-8 text-xs gradient-primary"
                  onClick={() => (editedImgUrl || activeImgUrl) && activeRecordId && handleDownload(editedImgUrl || activeImgUrl!, activeRecordId)}>
                  <Download className="w-3.5 h-3.5" />Download
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── MOBILE ONLY: full-screen preview overlay when image is selected ── */}
      {previewOpen && activeImgUrl && (
        <div
          className="sm:hidden fixed inset-0 flex flex-col bg-card"
          style={{ zIndex: 1002 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50 shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Preview</span>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {activeIdx! + 1} / {validRecords.length}
              </span>
            </div>
            <button onClick={() => setActiveIdx(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/20 min-h-0">
            <img src={editedImgUrl || activeImgUrl} alt={activeRecordId} className="max-w-full max-h-full object-contain rounded-xl shadow-xl" />
          </div>
          {/* Mobile edit section */}
          <div className="shrink-0 px-4 pt-3 pb-1 border-t border-border/40 space-y-2">
            {editedImgUrl && (
              <p className="text-xs text-emerald-600 font-medium">Edit applied! Save to keep it.</p>
            )}
            <Textarea
              placeholder="Edit instructions…"
              value={editInstructions}
              onChange={e => setEditInstructions(e.target.value)}
              className="min-h-[64px] resize-none text-sm"
              disabled={isEditing}
            />
            {editError && <p className="text-destructive text-xs">{editError}</p>}
            <div className="flex gap-2">
              <Button
                onClick={handleEditImage}
                disabled={isEditing || !editInstructions.trim()}
                variant="outline"
                className="gap-1.5 flex-1 text-xs h-8"
              >
                {isEditing
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="tabular-nums">{elapsedTime}s</span></>
                  : <><Wand2 className="w-3.5 h-3.5" />Apply Edit</>}
              </Button>
              {editedImgUrl && (
                <Button onClick={handleSaveEditedToFavorites} disabled={isEditing} size="sm" className="gap-1.5 h-8 text-xs gradient-primary">
                  <Heart className="w-3.5 h-3.5" />Save
                </Button>
              )}
            </div>
          </div>
          <div className="shrink-0 px-5 py-3 border-t border-border/40 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={activeIdx === 0}
                onClick={() => setActiveIdx(i => (i !== null && i > 0 ? i - 1 : i))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={activeIdx === validRecords.length - 1}
                onClick={() => setActiveIdx(i => (i !== null && i < validRecords.length - 1 ? i + 1 : i))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm"
                className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                onClick={() => activeRecordId && activeImgUrl && handleUnlike(activeRecordId, activeImgUrl)}>
                <Heart className="w-3.5 h-3.5 fill-current" />Unlike
              </Button>
              <Button size="sm" className="gap-1.5 h-8 text-xs gradient-primary"
                onClick={() => (editedImgUrl || activeImgUrl) && activeRecordId && handleDownload(editedImgUrl || activeImgUrl!, activeRecordId)}>
                <Download className="w-3.5 h-3.5" />Download
              </Button>
            </div>
          </div>
        </div>
      )}

      {showHtmlModal && activeImgUrl && (
        <HtmlConversionModal
          isOpen={showHtmlModal}
          onClose={() => setShowHtmlModal(false)}
          imageUrl={activeImgUrl}
          brand={activeRecord?.brand_name || brand}
        />
      )}
    </>
  );
}
