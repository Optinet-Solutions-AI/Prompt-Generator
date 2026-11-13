import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { AlertTriangle, AlignLeft, AlignRight, Download, ImageDown, Loader2, Move, RotateCcw } from 'lucide-react';
import { triggerBlobDownload } from '@/lib/imageDownload';
import {
  FAN_BANNER_BRAND_NAMES, canonicalFanBannerBrandName, fanBannerFilename, getFanBannerBrand,
} from '@/lib/fan-banner/brands';
import { FAN_W, type FanBannerTexts, type FanSide } from '@/lib/fan-banner/layout';
import { CENTERED, MAX_ZOOM, minZoom, panAfterDrag, type PictureFraming } from '@/lib/fan-banner/picture';
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
  // Where the picture sits behind the text (drag to move, slider to zoom).
  const [framing, setFraming] = useState<PictureFraming>(CENTERED);

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
  // The logo from the last full draw, so dragging can redraw instantly.
  const lastLogoRef = useRef<HTMLImageElement | null>(null);
  // Where a drag started (pointer position + framing at that moment).
  const dragRef = useRef<{ x: number; y: number; framing: PictureFraming } | null>(null);

  // Load the picture once per image while the window is open. A new picture starts centred.
  useEffect(() => {
    if (!isOpen || !imageUrl) return;
    let cancelled = false;
    setPictureState('loading');
    setPicture(null);
    setFraming(CENTERED);
    loadPicture(imageUrl)
      .then((img) => { if (!cancelled) { setPicture(img); setPictureState('ready'); } })
      .catch((err) => {
        console.error('[FanBanner] picture failed to load:', err);
        if (!cancelled) setPictureState('error');
      });
    return () => { cancelled = true; };
  }, [isOpen, imageUrl]);

  /**
   * Paints the banner onto the preview canvas and returns it as a PNG file.
   * `isCurrent` is checked after the fonts and logo load: if the user changed
   * something meanwhile, this older draw is dropped instead of painting the
   * previous brand over the newer one.
   */
  const drawToCanvas = useCallback(async (isCurrent: () => boolean = () => true): Promise<Blob | null> => {
    const style = getFanBannerBrand(brandName);
    const canvas = canvasRef.current;
    if (!style || !canvas) return null;
    await loadBrandFonts(style, Object.values(texts).join(' '));
    const logo = await loadLogo(style.logo).catch(() => null);
    if (!isCurrent()) return null;
    setLogoMissing(!logo);
    lastLogoRef.current = logo;
    drawFanBanner(canvas, { brand: style, texts, side, picture, logo, framing });
    canvas.dataset.brand = brandName; // which brand is on screen (used by browser checks)
    return canvasToPngBlob(canvas);
  }, [brandName, texts, side, picture, framing]);

  /**
   * Instant redraw while dragging or zooming (fonts and logo are already
   * loaded). The regular redraw above follows once the movement pauses and
   * also updates the file size.
   */
  const redrawNow = (next: PictureFraming) => {
    const style = getFanBannerBrand(brandName);
    const canvas = canvasRef.current;
    if (!style || !canvas) return;
    drawFanBanner(canvas, { brand: style, texts, side, picture, logo: lastLogoRef.current, framing: next });
  };

  const changeFraming = (next: PictureFraming) => {
    setFraming(next);
    redrawNow(next);
  };

  // Drag the picture with the mouse or a finger. The movement is measured from
  // where the drag started, converted from screen pixels to banner pixels.
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!picture) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, framing };
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = dragRef.current;
    if (!start || !picture) return;
    const toBanner = FAN_W / e.currentTarget.getBoundingClientRect().width;
    changeFraming(panAfterDrag(
      { w: picture.naturalWidth, h: picture.naturalHeight },
      start.framing,
      (e.clientX - start.x) * toBanner,
      (e.clientY - start.y) * toBanner,
    ));
  };
  const endDrag = () => { dragRef.current = null; };

  // Redraw the preview after every change (short delay so typing stays smooth).
  useEffect(() => {
    if (!isOpen || !brandName || pictureState === 'loading') return;
    const seq = ++drawSeq.current;
    setIsDrawing(true);
    const timer = setTimeout(async () => {
      try {
        const blob = await drawToCanvas(() => seq === drawSeq.current);
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
    setFraming(CENTERED);
    setFormError(null);
    setDrawError(null);
    setFileSize(null);
    setBrandName(canonicalFanBannerBrandName(brand));
    onClose();
  };

  const showCanvas = !!brandName && pictureState !== 'loading';
  const canMovePicture = showCanvas && !!picture;
  const isCentered = framing.zoom === CENTERED.zoom && framing.panX === CENTERED.panX && framing.panY === CENTERED.panY;
  // Lowest zoom = the whole picture fits (50% for a square picture, 100% for a 2:1 one).
  // The slider snaps to whole percents, so its floor is rounded down; the readout shows the real value.
  const exactMinZoom = picture ? minZoom({ w: picture.naturalWidth, h: picture.naturalHeight }) : 1;
  const zoomFloor = Math.floor(exactMinZoom * 100) / 100;

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
                className={`absolute inset-0 w-full h-full ${showCanvas ? '' : 'invisible'} ${canMovePicture ? 'cursor-grab active:cursor-grabbing' : ''}`}
                // touch-action none: a finger drag moves the picture instead of scrolling the window.
                style={{ touchAction: canMovePicture ? 'none' : 'auto' }}
                aria-label="Banner preview"
                title={canMovePicture ? 'Drag to move the picture' : undefined}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={endDrag}
              />
              {!showCanvas && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground bg-muted/60">
                  {pictureState === 'loading'
                    ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading the picture…</span>
                    : 'Pick a brand below to see the banner'}
                </div>
              )}
            </div>

            {/* Picture position: drag hint, zoom, reset */}
            {canMovePicture && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Move className="w-3.5 h-3.5" /> Drag the picture to choose what shows
                </span>
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <span className="text-[11px] font-medium text-muted-foreground">Zoom</span>
                  <Slider
                    min={zoomFloor} max={MAX_ZOOM} step={0.01}
                    value={[framing.zoom]}
                    onValueChange={([zoom]) => changeFraming({ ...framing, zoom })}
                    className="flex-1"
                    aria-label="Zoom the picture"
                  />
                  <span className="text-[11px] tabular-nums w-9 text-right text-muted-foreground">{Math.round(Math.max(framing.zoom, exactMinZoom) * 100)}%</span>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs gap-1"
                  onClick={() => changeFraming(CENTERED)} disabled={isCentered}>
                  <RotateCcw className="w-3 h-3" /> Reset
                </Button>
              </div>
            )}

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
