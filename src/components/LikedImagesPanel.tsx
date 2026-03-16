import { useState, useEffect, useCallback } from 'react';
import { X, Heart, Loader2, AlertTriangle, Download, FileCode, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LikedImageCard } from './LikedImageCard';
import { HtmlConversionModal } from './HtmlConversionModal';

const airtableConfig = {
  pat: import.meta.env.VITE_AIRTABLE_PAT as string,
  baseId: import.meta.env.VITE_AIRTABLE_BASE_ID as string,
  tableName: import.meta.env.VITE_AIRTABLE_TABLE_NAME as string,
};

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

function getField(fields: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (fields[key] && typeof fields[key] === 'string') return fields[key] as string;
  }
  return undefined;
}

function getImgUrl(record: AirtableRecord): string | undefined {
  return getField(record.fields, 'image_from_url', 'Direct Link', 'img_url', 'Image URL', 'url');
}

function getRecordId(record: AirtableRecord): string {
  return (getField(record.fields, 'record_id', 'Record_ID', 'name') || record.id);
}

interface LikedImagesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  brand: string;
}

export function LikedImagesPanel({ isOpen, onClose, brand }: LikedImagesPanelProps) {
  const [records, setRecords] = useState<AirtableRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // activeIdx: which image is shown in the floating preview (null = no preview)
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [showHtmlModal, setShowHtmlModal] = useState(false);

  const hasBrand = !!brand && brand !== 'Select a brand';
  const headerLabel = hasBrand ? `FAVORITES — ${brand.toUpperCase()}` : 'FAVORITES';
  const validRecords = records.filter(r => getImgUrl(r));

  const activeRecord = activeIdx !== null ? validRecords[activeIdx] : null;
  const activeImgUrl = activeRecord ? getImgUrl(activeRecord) : undefined;
  const activeRecordId = activeRecord ? getRecordId(activeRecord) : undefined;

  const fetchLikedImages = useCallback(async () => {
    if (!hasBrand) return;
    setLoading(true);
    setError(null);
    try {
      if (!airtableConfig.pat || !airtableConfig.baseId || !airtableConfig.tableName)
        throw new Error('Missing Airtable configuration.');
      const filterFormula = encodeURIComponent(`{brand_name}="${brand}"`);
      const url = `https://api.airtable.com/v0/${airtableConfig.baseId}/${encodeURIComponent(airtableConfig.tableName)}?filterByFormula=${filterFormula}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${airtableConfig.pat}`, 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error(`Airtable API error: ${response.status}`);
      const data = await response.json();
      setRecords(data.records || []);
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

  // Keyboard nav for the floating preview
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
    setRecords(prev => prev.filter(r => getRecordId(r) !== recordId));
    if (activeIdx !== null) {
      const newLen = validRecords.length - 1;
      setActiveIdx(newLen === 0 ? null : Math.min(activeIdx, newLen - 1));
    }
    try {
      await fetch('https://automateoptinet.app.n8n.cloud/webhook/unlike-img', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_id: recordId, img_url: imgUrl }),
      });
    } catch { /* non-fatal */ }
  };

  const handleDownloadAll = async () => {
    for (const record of validRecords) {
      const imgUrl = getImgUrl(record);
      if (imgUrl) {
        handleDownload(imgUrl, getRecordId(record));
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/*
        Z-INDEX LAYERING (so panel grid stays always interactive):
        - Dim backdrop:       z-998  pointer-events: none (visual only, blocks nothing)
        - Floating preview:   z-999  (appears in center-left area, behind the panel)
        - Favorites panel:    z-1001 (always on top — clicks always go through to the grid)
      */}

      {/* Dim backdrop — visual only, does NOT block clicks */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        style={{ zIndex: 998, pointerEvents: 'none' }}
        aria-hidden="true"
      />

      {/* Clickable area behind panel — closes panel when clicked outside */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 997 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── Floating image preview (centered, shown when an image is selected) ── */}
      {activeIdx !== null && activeImgUrl && (
        <div
          className="fixed inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 999 }}
        >
          <div
            className="pointer-events-auto bg-card rounded-2xl border border-border/60 shadow-2xl flex flex-col overflow-hidden"
            style={{ width: 'min(60vw, 680px)', maxHeight: '88vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Preview header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Preview</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {activeIdx + 1} / {validRecords.length}
                </span>
              </div>
              <button onClick={() => setActiveIdx(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Image */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-5 bg-muted/20 min-h-0">
              <img
                key={activeImgUrl}
                src={activeImgUrl}
                alt={activeRecordId}
                className="max-w-full max-h-full object-contain rounded-xl shadow-xl"
                style={{ maxHeight: 'min(56vh, 520px)' }}
              />
            </div>

            {/* Nav + actions */}
            <div className="shrink-0 px-5 py-4 border-t border-border/40 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  disabled={activeIdx === 0}
                  onClick={() => setActiveIdx(i => (i !== null && i > 0 ? i - 1 : i))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  disabled={activeIdx === validRecords.length - 1}
                  onClick={() => setActiveIdx(i => (i !== null && i < validRecords.length - 1 ? i + 1 : i))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowHtmlModal(true)}>
                  <FileCode className="w-3.5 h-3.5" />
                  HTML
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                  onClick={() => activeRecordId && activeImgUrl && handleUnlike(activeRecordId, activeImgUrl)}
                >
                  <Heart className="w-3.5 h-3.5 fill-current" />
                  Unlike
                </Button>
                <Button
                  size="sm" className="gap-1.5 h-8 text-xs gradient-primary"
                  onClick={() => activeImgUrl && activeRecordId && handleDownload(activeImgUrl, activeRecordId)}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Favorites grid panel (always on top, always interactive) ── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Favorites panel"
        className="fixed right-4 flex flex-col bg-card rounded-2xl border border-border/60 overflow-hidden
          max-sm:inset-0 max-sm:right-0 max-sm:rounded-none max-sm:w-full max-sm:h-full"
        onClick={e => e.stopPropagation()}
        style={{
          zIndex: 1001,
          top: 'max(4vh, 16px)',
          height: 'min(92vh, calc(100vh - 32px))',
          width: 'min(88vw, 680px)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-card/95 backdrop-blur shrink-0">
          <div className="flex items-center gap-3">
            <Heart className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">{headerLabel}</h2>
            {validRecords.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {validRecords.length} image{validRecords.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Close panel">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Grid body */}
        <div className="flex-1 overflow-y-auto p-5">
          {!hasBrand && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
              <Heart className="w-20 h-20 text-muted-foreground/15 stroke-1" />
              <p className="text-lg font-semibold text-foreground">Select a brand to view favorites</p>
              <p className="text-sm text-muted-foreground max-w-xs">Choose a brand from the dropdown above</p>
            </div>
          )}
          {hasBrand && loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading favorites...</p>
            </div>
          )}
          {hasBrand && error && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <AlertTriangle className="w-14 h-14 text-destructive/50" />
              <p className="text-sm font-medium">Failed to load favorites</p>
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchLikedImages}>Retry</Button>
            </div>
          )}
          {hasBrand && !loading && !error && validRecords.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
              <Heart className="w-20 h-20 text-muted-foreground/15 stroke-1" />
              <p className="text-lg font-semibold">No {brand} favorites yet</p>
              <p className="text-sm text-muted-foreground max-w-xs">Generate images and like your favorites!</p>
            </div>
          )}
          {hasBrand && !loading && !error && validRecords.length > 0 && (
            <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-2 justify-items-center">
              {validRecords.map((record, i) => {
                const imgUrl = getImgUrl(record)!;
                const recordId = getRecordId(record);
                return (
                  <LikedImageCard
                    key={record.id}
                    imgUrl={imgUrl}
                    recordId={recordId}
                    onView={() => setActiveIdx(i)}
                    onDownload={() => handleDownload(imgUrl, recordId)}
                    onUnlike={() => handleUnlike(recordId, imgUrl)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {hasBrand && !loading && !error && validRecords.length > 0 && (
          <div className="px-5 py-3 border-t border-border/40 bg-card flex justify-between items-center shrink-0">
            <span className="text-xs text-muted-foreground">{validRecords.length} image{validRecords.length !== 1 ? 's' : ''}</span>
            <Button variant="outline" size="sm" onClick={handleDownloadAll} className="gap-2 h-8 text-xs">
              <Download className="w-3.5 h-3.5" />
              Download All
            </Button>
          </div>
        )}
      </div>

      {showHtmlModal && activeImgUrl && (
        <HtmlConversionModal
          isOpen={showHtmlModal}
          onClose={() => setShowHtmlModal(false)}
          imageUrl={activeImgUrl}
        />
      )}
    </>
  );
}
