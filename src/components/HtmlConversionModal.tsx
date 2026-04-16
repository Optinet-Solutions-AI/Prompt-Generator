import { useState, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Eye, FileCode, AlignLeft, AlignRight, Loader2 } from 'lucide-react';
import {
  buildBannerHtml,
  OFFER_CONFIG,
  BANNER_SIZES,
  type OfferType,
  type BannerSize,
  type TextPosition,
  type BannerFormData,
} from '@/lib/build-banner-html';

interface HtmlConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  brand?: string;
}

// Fetches an image URL and returns it as a base64 data URI so the
// downloaded HTML file works everywhere.
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
    mainValue: '',
    subValue: '',
    crossSell: '',
    bonusCode: '',
    ctaUrl: '#',
    ctaText: 'Play Now',
  });
  const [offerType, setOfferType] = useState<OfferType>('freespins');
  const [bannerSize, setBannerSize] = useState<BannerSize>('wide');
  const [textPosition, setTextPosition] = useState<TextPosition>('right');
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (field: keyof BannerFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const buildParams = (imageSrc: string) => ({
    imageSrc, brand, formData, offerType, bannerSize, textPosition,
  });

  // Live preview — raw imageUrl, no base64
  const previewHtml = useMemo(
    () => buildBannerHtml(buildParams(imageUrl)),
    [imageUrl, formData, offerType, bannerSize, textPosition, brand],
  );

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
    setBannerSize('wide');
    setGeneratedHtml(null);
    setTextPosition('right');
    setError(null);
    onClose();
  };

  const cfg = OFFER_CONFIG[offerType];
  const currentSize = BANNER_SIZES[bannerSize];

  // Preview iframe dimensions
  const previewIframeW = 900;
  const previewIframeH = Math.round(previewIframeW * currentSize.h / currentSize.w);
  const sideScale = 224 / previewIframeW;
  const sideContainerH = Math.round(previewIframeH * sideScale);
  const successScale = 500 / previewIframeW;
  const successContainerH = Math.min(Math.round(previewIframeH * successScale), 400);

  const OFFER_CARDS: Record<OfferType, { icon: string; example: string }> = {
    freespins: { icon: '🎰', example: 'e.g. 20, 50, 100' },
    bonus:     { icon: '💰', example: 'e.g. 400% up to $4k' },
    nodeposit: { icon: '🎁', example: 'e.g. $5, €10' },
    freebet:   { icon: '🎲', example: 'e.g. $50 free bet' },
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2.5 px-6 pt-5 pb-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileCode className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold leading-tight">Convert to HTML Banner</h2>
            {brand && <p className="text-xs text-muted-foreground mt-0.5">{brand}</p>}
          </div>
        </div>

        {!generatedHtml ? (
          <div className="flex min-h-0">

            {/* LEFT — form */}
            <div className="flex-1 px-6 py-5 space-y-5 overflow-y-auto max-h-[80vh]">

              {/* Text position */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Text Position</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['left', 'right'] as TextPosition[]).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setTextPosition(pos)}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                        textPosition === pos
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      {pos === 'left' ? <AlignLeft className="w-3.5 h-3.5" /> : <AlignRight className="w-3.5 h-3.5" />}
                      Text {pos === 'left' ? 'Left' : 'Right'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Banner size */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Banner Size</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(BANNER_SIZES) as BannerSize[]).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setBannerSize(sz)}
                      className={`px-2 py-2 rounded-lg border text-center transition-all ${
                        bannerSize === sz
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      <p className="text-xs font-semibold leading-tight">{BANNER_SIZES[sz].label}</p>
                      <p className="text-[10px] opacity-50">{BANNER_SIZES[sz].desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Offer type */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Offer Type</p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(OFFER_CONFIG) as OfferType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setOfferType(type)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                        offerType === type
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      <span className="text-xl leading-none">{OFFER_CARDS[type].icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight">{OFFER_CONFIG[type].typeLabel}</p>
                        <p className="text-xs opacity-60 truncate">{OFFER_CARDS[type].example}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Offer details */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Offer Details</p>
                <div className={`grid gap-3 ${cfg.showSubValue ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div className="space-y-1.5">
                    <Label htmlFor="mainValue" className="text-sm">
                      {cfg.label} <span className="text-destructive">*</span>
                    </Label>
                    <Input id="mainValue" placeholder={cfg.mainPlaceholder} value={formData.mainValue}
                      onChange={(e) => handleInputChange('mainValue', e.target.value)} className="h-10" />
                  </div>
                  {cfg.showSubValue && (
                    <div className="space-y-1.5">
                      <Label htmlFor="subValue" className="text-sm">Up to Amount</Label>
                      <Input id="subValue" placeholder="e.g. $4,000" value={formData.subValue}
                        onChange={(e) => handleInputChange('subValue', e.target.value)} className="h-10" />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="crossSell" className="text-sm">
                    Cross-sell Line <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </Label>
                  <Input id="crossSell" placeholder="e.g. + 500% Bonus  or  100 Extra Spins" value={formData.crossSell}
                    onChange={(e) => handleInputChange('crossSell', e.target.value)} className="h-10" />
                </div>
              </div>

              {/* Button & Code */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Button & Code</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ctaText" className="text-sm">Button Text</Label>
                    <Input id="ctaText" placeholder="Play Now" value={formData.ctaText}
                      onChange={(e) => handleInputChange('ctaText', e.target.value)} className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bonusCode" className="text-sm">Bonus Code</Label>
                    <Input id="bonusCode" placeholder="e.g. WELCOME100" value={formData.bonusCode}
                      onChange={(e) => handleInputChange('bonusCode', e.target.value)} className="h-10" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ctaUrl" className="text-sm">Destination URL</Label>
                  <Input id="ctaUrl" placeholder="https://your-casino.com/register"
                    value={formData.ctaUrl === '#' ? '' : formData.ctaUrl}
                    onChange={(e) => handleInputChange('ctaUrl', e.target.value || '#')} className="h-10" />
                </div>
              </div>

              {error && (
                <p className="text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
              )}
            </div>

            {/* RIGHT — preview + buttons */}
            <div className="w-64 shrink-0 bg-muted/20 border-l border-border flex flex-col">
              <div className="px-4 pt-5 pb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Live Preview</p>
                <div className="w-full overflow-hidden rounded-lg bg-black"
                  style={{ height: `${sideContainerH}px` }}>
                  <iframe srcDoc={previewHtml} sandbox="allow-same-origin" title="Banner preview"
                    style={{
                      width: `${previewIframeW}px`, height: `${previewIframeH}px`,
                      transform: `scale(${sideScale})`, transformOrigin: 'top left',
                      border: 'none', pointerEvents: 'none',
                    }} />
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">Updates as you type</p>
              </div>
              <div className="mt-auto p-4 border-t border-border space-y-2">
                <Button onClick={handleGenerate} className="w-full gradient-primary gap-2" disabled={isGenerating}>
                  {isGenerating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Embedding…</>
                  ) : (
                    <><FileCode className="w-4 h-4" /> Generate HTML</>
                  )}
                </Button>
                <Button variant="outline" onClick={handleClose} className="w-full">Cancel</Button>
              </div>
            </div>

          </div>
        ) : (
          <>
            {/* Success screen */}
            <div className="px-6 py-5">
              <div className="w-full overflow-hidden rounded-lg bg-black mb-4"
                style={{ height: `${successContainerH}px` }}>
                <iframe srcDoc={previewHtml} sandbox="allow-same-origin" title="Final banner preview"
                  style={{
                    width: `${previewIframeW}px`, height: `${previewIframeH}px`,
                    transform: `scale(${successScale})`, transformOrigin: 'top left',
                    border: 'none', pointerEvents: 'none',
                  }} />
              </div>
              <p className="text-center text-foreground font-semibold mb-1">HTML Banner Ready</p>
              <p className="text-center text-xs text-muted-foreground">
                {cfg.typeLabel} · {currentSize.label} · Text {textPosition} · {brand || 'Generic'}
              </p>
            </div>
            <div className="px-6 pb-5 border-t border-border pt-4 space-y-3">
              <Button onClick={handleDownload} className="w-full gradient-primary gap-2 h-11">
                <Download className="w-4 h-4" /> Download HTML
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setGeneratedHtml(null)} className="flex-1 gap-2">Edit</Button>
                <Button variant="outline" onClick={handlePreview} className="flex-1 gap-2">
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
