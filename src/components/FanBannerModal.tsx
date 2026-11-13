import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, AlignLeft, AlignRight, Download, ImageDown, Loader2 } from 'lucide-react';
import { triggerBlobDownload } from '@/lib/imageDownload';
import {
  FAN_BANNER_BRAND_NAMES, canonicalFanBannerBrandName, fanBannerFilename, getFanBannerBrand,
} from '@/lib/fan-banner/brands';
import type { FanBannerTexts, FanSide } from '@/lib/fan-banner/layout';
import { canvasToPngBlob, drawFanBanner, loadBrandFonts, loadLogo, loadPicture } from '@/lib/fan-banner/render';

/**
 * Fan Banner (PNG) — turns a library image into a finished 1200×600 email
 * banner in the brand's look (logo, fonts, colours, button), saved as a PNG
 * with 40px see-through rounded corners.
 *
 * The preview IS the file: the same drawing code paints the on-screen canvas
 * and the downloaded PNG, so what you see is exactly what you get.
 */

interface FanBannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  brand?: string;
}

const START_TEXTS: FanBannerTexts = {
  headline: '', offer: '', line1: '', line2: '',
  button: 'PLAY NOW', codeLabel: 'Bonus Code:', code: '',
};

// The email team flagged file weight; above this we show a heads-up.
const HEAVY_FILE_BYTES = 1024 * 1024;

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.round(bytes / 1024)} KB`;
}

const FIELDS: Array<{ key: keyof FanBannerTexts; label: string; placeholder: string; required?: boolean }> = [
  { key: 'headline', label: 'Big number', placeholder: '250%  ·  50  ·  $5', required: true },
  { key: 'offer', label: 'Offer word', placeholder: 'BONUS  ·  FREE SPINS' },
  { key: 'line1', label: 'Coloured line', placeholder: '+100 FREE SPINS' },
  { key: 'line2', label: 'Second coloured line', placeholder: 'Optional, e.g. UP TO $4000' },
  { key: 'button', label: 'Button text', placeholder: 'Empty = no button' },
  { key: 'code', label: 'Bonus code', placeholder: 'Optional, e.g. WIN250' },
  { key: 'codeLabel', label: 'Text before the code', placeholder: 'Bonus Code:' },
];

export function FanBannerModal({ isOpen, onClose, imageUrl, brand }: FanBannerModalProps) {
  const [brandName, setBrandName] = useState(() => canonicalFanBannerBrandName(brand));
  useEffect(() => { setBrandName(canonicalFanBannerBrandName(brand)); }, [brand]);
  const [texts, setTexts] = useState<FanBannerTexts>(START_TEXTS);
  const [side, setSide] = useState<FanSide>('right');

  const [picture, setPicture] = useState<HTMLImageElement | null>(null);
  const [pictureState, setPictureState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [logoMissing, setLogoMissing] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawSeq = useRef(0);

  // Load the picture once per image while the window is open.
  useEffect(() => {
    if (!isOpen || !imageUrl) return;
    let cancelled = false;
    setPictureState('loading');
    setPicture(null);
    loadPicture(imageUrl)
      .then((img) => { if (!cancelled) { setPicture(img); setPictureState('ready'); } })
      .catch((err) => {
        console.error('[FanBanner] picture failed to load:', err);
        if (!cancelled) setPictureState('error');
      });
    return () => { cancelled = true; };
  }, [isOpen, imageUrl]);

  /** Paints the banner onto the preview canvas and returns it as a PNG file. */
  const drawToCanvas = useCallback(async (): Promise<Blob | null> => {
    const style = getFanBannerBrand(brandName);
    const canvas = canvasRef.current;
    if (!style || !canvas) return null;
    await loadBrandFonts(style, Object.values(texts).join(' '));
    const logo = await loadLogo(style.logo).catch(() => null);
    setLogoMissing(!logo);
    drawFanBanner(canvas, { brand: style, texts, side, picture, logo });
    return canvasToPngBlob(canvas);
  }, [brandName, texts, side, picture]);

  // Redraw the preview after every change (short delay so typing stays smooth).
  useEffect(() => {
    if (!isOpen || !brandName || pictureState === 'loading') return;
    const seq = ++drawSeq.current;
    setIsDrawing(true);
    const timer = setTimeout(async () => {
      try {
        const blob = await drawToCanvas();
        if (seq !== drawSeq.current) return;
        setFileSize(blob ? blob.size : null);
        setDrawError(null);
      } catch (err) {
        console.error('[FanBanner] drawing failed:', err);
        if (seq === drawSeq.current) setDrawError(err instanceof Error ? err.message : 'Could not draw the banner.');
      } finally {
        if (seq === drawSeq.current) setIsDrawing(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [isOpen, brandName, pictureState, drawToCanvas]);

  const handleField = (key: keyof FanBannerTexts, value: string) => {
    setTexts((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
  };

  const handleDownload = async () => {
    setFormError(null);
    if (!brandName) { setFormError('Pick a brand first.'); return; }
    if (!texts.headline.trim()) { setFormError('Type the big number first (for example 250% or 50).'); return; }
    if (pictureState !== 'ready') { setFormError('The picture has not loaded, so there is nothing to put behind the text yet.'); return; }
    setIsDownloading(true);
    try {
      // Draw once more right now so the file matches the screen exactly.
      const blob = await drawToCanvas();
      if (!blob) throw new Error('Could not create the PNG file.');
      setFileSize(blob.size);
      triggerBlobDownload(blob, fanBannerFilename(brandName, texts.headline, texts.offer));
    } catch (err) {
      console.error('[FanBanner] download failed:', err);
      setFormError(err instanceof Error ? err.message : 'Could not create the PNG file.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClose = () => {
    setTexts(START_TEXTS);
    setSide('right');
    setFormError(null);
    setDrawError(null);
    setFileSize(null);
    setBrandName(canonicalFanBannerBrandName(brand));
    onClose();
  };

  const showCanvas = !!brandName && pictureState !== 'loading';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5 border-b border-border shrink-0">
          <ImageDown className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <DialogTitle className="text-sm font-semibold leading-tight">Fan Banner (PNG)</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground truncate">
              {brandName || 'Pick a brand'} · 1200 × 600 · 40 px rounded corners · for email
            </DialogDescription>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="p-4 space-y-3.5">
            {/* Preview — a checkerboard shows through the see-through corners */}
            <div
              className="relative w-full rounded-lg overflow-hidden border border-border"
              style={{
                aspectRatio: '2 / 1',
                background: 'repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%) 50% / 16px 16px',
              }}
            >
              <canvas
                ref={canvasRef}
                width={1200}
                height={600}
                className={`absolute inset-0 w-full h-full ${showCanvas ? '' : 'invisible'}`}
                aria-label="Banner preview"
              />
              {!showCanvas && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground bg-muted/60">
                  {pictureState === 'loading'
                    ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading the picture…</span>
                    : 'Pick a brand below to see the banner'}
                </div>
              )}
            </div>

            {/* File facts + warnings */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>PNG · 1200 × 600</span>
              {fileSize !== null && <span>{formatSize(fileSize)}</span>}
              {isDrawing && <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> updating…</span>}
              {fileSize !== null && fileSize > HEAVY_FILE_BYTES && (
                <span className="text-amber-600">Over 1 MB — may load slowly in some email apps</span>
              )}
            </div>
            {pictureState === 'error' && (
              <p className="flex items-start gap-1.5 text-xs text-destructive bg-destructive/10 rounded px-2.5 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                The picture couldn't be loaded, so the preview shows a plain background. Close this window and try again.
              </p>
            )}
            {logoMissing && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2.5 py-1.5">The brand logo couldn't be loaded, so it's missing from the banner.</p>
            )}
            {drawError && (
              <p className="text-xs text-destructive bg-destructive/10 rounded px-2.5 py-1.5">{drawError}</p>
            )}

            {/* Brand */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Brand</p>
              <div className="flex flex-wrap gap-1.5">
                {FAN_BANNER_BRAND_NAMES.map((b) => (
                  <button key={b} type="button" onClick={() => setBrandName(b)}
                    className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                      brandName === b ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                    }`}>
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Text side */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Text side</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(['right', 'left'] as FanSide[]).map((pos) => (
                  <button key={pos} type="button" onClick={() => setSide(pos)}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                      side === pos ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                    }`}>
                    {pos === 'left' ? <AlignLeft className="w-3 h-3" /> : <AlignRight className="w-3 h-3" />}
                    Text {pos === 'left' ? 'left' : 'right'}
                  </button>
                ))}
              </div>
            </div>

            {/* Words on the banner */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Words on the banner</p>
              <p className="text-[11px] text-muted-foreground">Type them in any language. Empty lines are left out.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-1.5">
                {FIELDS.map(({ key, label, placeholder, required }) => (
                  <div key={key}>
                    <Label htmlFor={`fan-${key}`} className="text-[11px] mb-0.5 block">
                      {label} {required && <span className="text-destructive">*</span>}
                    </Label>
                    <Input id={`fan-${key}`} value={texts[key]} placeholder={placeholder}
                      onChange={(e) => handleField(key, e.target.value)} className="h-8 text-sm" />
                  </div>
                ))}
              </div>
            </div>

            {formError && (
              <p className="text-destructive text-xs bg-destructive/10 rounded px-2.5 py-1.5">{formError}</p>
            )}
          </div>

          {/* Sticky download button */}
          <div className="sticky bottom-0 px-4 pb-4 pt-2 bg-background/95 backdrop-blur-sm border-t border-border">
            <Button onClick={handleDownload} className="w-full gradient-primary gap-2 h-9" disabled={isDownloading}>
              {isDownloading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating PNG…</>
                : <><Download className="w-3.5 h-3.5" /> Download PNG</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
