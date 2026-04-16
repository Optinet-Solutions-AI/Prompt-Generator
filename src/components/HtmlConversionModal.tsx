import { useState, useMemo, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Eye, FileCode, AlignLeft, AlignRight, Loader2 } from 'lucide-react';
import {
  buildBannerHtml,
  OFFER_CONFIG,
  type OfferType,
  type TextPosition,
  type BannerFormData,
} from '@/lib/build-banner-html';

interface HtmlConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  brand?: string;
}

async function toBase64DataUri(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(url);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

export function HtmlConversionModal({ isOpen, onClose, imageUrl, brand }: HtmlConversionModalProps) {
  const [formData, setFormData] = useState<BannerFormData>({
    mainValue: '', subValue: '', crossSell: '', bonusCode: '', ctaUrl: '#', ctaText: 'Play Now',
  });
  const [offerType, setOfferType] = useState<OfferType>('freespins');
  const [textPosition, setTextPosition] = useState<TextPosition>('right');
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-detect the original image dimensions so the banner matches exactly
  const [imgDims, setImgDims] = useState<{ w: number; h: number }>({ w: 16, h: 9 });
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageUrl;
  }, [imageUrl]);

  const handleInputChange = (field: keyof BannerFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const buildParams = (imageSrc: string) => ({
    imageSrc, brand, formData, offerType, textPosition,
    imgWidth: imgDims.w, imgHeight: imgDims.h,
  });

  const previewHtml = useMemo(
    () => buildBannerHtml(buildParams(imageUrl)),
    [imageUrl, formData, offerType, textPosition, brand, imgDims],
  );

  // Use blob URL instead of srcdoc — srcdoc iframes have null origin
  // which blocks external image loads. Blob URL inherits page origin.
  const prevBlobUrl = useRef<string | null>(null);
  const previewBlobUrl = useMemo(() => {
    if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
    const blob = new Blob([previewHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    prevBlobUrl.current = url;
    return url;
  }, [previewHtml]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current); };
  }, []);

  const handleGenerate = async () => {
    setError(null);
    if (!formData.mainValue.trim()) {
      setError(`Please enter the ${OFFER_CONFIG[offerType].label.toLowerCase()}.`);
      return;
    }
    setIsGenerating(true);
    try {
      const imageSrc = await toBase64DataUri(imageUrl);
      setGeneratedHtml(buildBannerHtml(buildParams(imageSrc)));
    } catch {
      setError('Failed to embed the image. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedHtml) return;
    const blob = new Blob([generatedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${brand ? brand.toLowerCase() : 'banner'}-${offerType}-banner.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePreview = () => {
    if (!generatedHtml) return;
    const blob = new Blob([generatedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleClose = () => {
    setFormData({ mainValue: '', subValue: '', crossSell: '', bonusCode: '', ctaUrl: '#', ctaText: 'Play Now' });
    setOfferType('freespins');
    setGeneratedHtml(null);
    setTextPosition('right');
    setError(null);
    onClose();
  };

  const cfg = OFFER_CONFIG[offerType];

  // Preview: iframe renders at 900px wide, scaled down to fit ~440px container
  const previewW = 900;
  const previewH = Math.round(previewW * imgDims.h / imgDims.w);
  const scaleFactor = 440 / previewW; // 0.489
  const scaledH = Math.round(previewH * scaleFactor);
  // Cap at 260px so tall images don't push form off screen
  const containerH = Math.min(scaledH, 260);

  const OFFER_CARDS: Record<OfferType, { icon: string; example: string }> = {
    freespins: { icon: '🎰', example: 'e.g. 20, 50, 100' },
    bonus:     { icon: '💰', example: 'e.g. 400% up to $4k' },
    nodeposit: { icon: '🎁', example: 'e.g. $5, €10' },
    freebet:   { icon: '🎲', example: 'e.g. $50 free bet' },
  };

  // Dimension label for display
  const dimLabel = `${imgDims.w}×${imgDims.h}`;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-border">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileCode className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight">Convert to HTML Banner</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {brand || 'Generic'} · {dimLabel}
            </p>
          </div>
        </div>

        {!generatedHtml ? (
          <div className="overflow-y-auto max-h-[75vh]">

            {/* Live preview at the top — full width, shows the actual banner */}
            <div className="px-5 pt-4 pb-3">
              <div className="w-full overflow-hidden rounded-lg bg-black"
                style={{ height: `${Math.min(Math.round((previewH / previewW) * 100), 60)}vw`, maxHeight: '240px' }}>
                <iframe src={previewBlobUrl} title="Banner preview"
                  style={{
                    width: `${previewW}px`, height: `${previewH}px`,
                    transform: `scale(${460 / previewW})`,
                    transformOrigin: 'top left',
                    border: 'none', pointerEvents: 'none',
                  }} />
              </div>
            </div>

            {/* Form */}
            <div className="px-5 pb-5 space-y-4">

              {/* Text position */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Text Position</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['left', 'right'] as TextPosition[]).map((pos) => (
                    <button key={pos} type="button" onClick={() => setTextPosition(pos)}
                      className={`flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-all ${
                        textPosition === pos
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}>
                      {pos === 'left' ? <AlignLeft className="w-3.5 h-3.5" /> : <AlignRight className="w-3.5 h-3.5" />}
                      Text {pos === 'left' ? 'Left' : 'Right'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Offer type */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Offer Type</p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(OFFER_CONFIG) as OfferType[]).map((type) => (
                    <button key={type} type="button" onClick={() => setOfferType(type)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all ${
                        offerType === type
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}>
                      <span className="text-lg leading-none">{OFFER_CARDS[type].icon}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold leading-tight">{OFFER_CONFIG[type].typeLabel}</p>
                        <p className="text-[10px] opacity-60 truncate">{OFFER_CARDS[type].example}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Offer details */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Offer Details</p>
                <div className={`grid gap-2 ${cfg.showSubValue ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div className="space-y-1">
                    <Label htmlFor="mainValue" className="text-xs">
                      {cfg.label} <span className="text-destructive">*</span>
                    </Label>
                    <Input id="mainValue" placeholder={cfg.mainPlaceholder} value={formData.mainValue}
                      onChange={(e) => handleInputChange('mainValue', e.target.value)} className="h-9" />
                  </div>
                  {cfg.showSubValue && (
                    <div className="space-y-1">
                      <Label htmlFor="subValue" className="text-xs">Up to Amount</Label>
                      <Input id="subValue" placeholder="e.g. $4,000" value={formData.subValue}
                        onChange={(e) => handleInputChange('subValue', e.target.value)} className="h-9" />
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="crossSell" className="text-xs">
                    Cross-sell <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input id="crossSell" placeholder="e.g. + 500% Bonus" value={formData.crossSell}
                    onChange={(e) => handleInputChange('crossSell', e.target.value)} className="h-9" />
                </div>
              </div>

              {/* Button & Code */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Button & Code</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="ctaText" className="text-xs">Button Text</Label>
                    <Input id="ctaText" placeholder="Play Now" value={formData.ctaText}
                      onChange={(e) => handleInputChange('ctaText', e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="bonusCode" className="text-xs">Bonus Code</Label>
                    <Input id="bonusCode" placeholder="e.g. WELCOME100" value={formData.bonusCode}
                      onChange={(e) => handleInputChange('bonusCode', e.target.value)} className="h-9" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ctaUrl" className="text-xs">Destination URL</Label>
                  <Input id="ctaUrl" placeholder="https://your-casino.com/register"
                    value={formData.ctaUrl === '#' ? '' : formData.ctaUrl}
                    onChange={(e) => handleInputChange('ctaUrl', e.target.value || '#')} className="h-9" />
                </div>
              </div>

              {error && (
                <p className="text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
              )}

              {/* Generate button */}
              <Button onClick={handleGenerate} className="w-full gradient-primary gap-2 h-10" disabled={isGenerating}>
                {isGenerating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Embedding image…</>
                ) : (
                  <><FileCode className="w-4 h-4" /> Generate HTML</>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Success screen */}
            <div className="px-5 py-4">
              <div className="w-full overflow-hidden rounded-lg bg-black mb-3"
                style={{ maxHeight: '280px' }}>
                <iframe src={previewBlobUrl} title="Final banner preview"
                  style={{
                    width: `${previewW}px`, height: `${previewH}px`,
                    transform: `scale(${460 / previewW})`,
                    transformOrigin: 'top left',
                    border: 'none', pointerEvents: 'none',
                  }} />
              </div>
              <p className="text-center text-foreground font-semibold text-sm mb-0.5">HTML Banner Ready</p>
              <p className="text-center text-xs text-muted-foreground">
                {cfg.typeLabel} · {dimLabel} · Text {textPosition} · {brand || 'Generic'}
              </p>
            </div>
            <div className="px-5 pb-4 border-t border-border pt-3 space-y-2">
              <Button onClick={handleDownload} className="w-full gradient-primary gap-2 h-10">
                <Download className="w-4 h-4" /> Download HTML
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setGeneratedHtml(null)} className="flex-1 gap-2 h-9">Edit</Button>
                <Button variant="outline" onClick={handlePreview} className="flex-1 gap-2 h-9">
                  <Eye className="w-4 h-4" /> Full Preview
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
