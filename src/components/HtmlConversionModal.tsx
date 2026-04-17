import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Eye, FileCode, AlignLeft, AlignRight, Loader2 } from 'lucide-react';
import { getBrandStyle, BRAND_STANDARDS } from '@/lib/brand-standards';
import {
  buildBannerHtml,
  OFFER_CONFIG,
  type OfferType,
  type TextPosition,
  type BannerFormData,
} from '@/lib/build-banner-html';

const ALL_BRANDS = Object.keys(BRAND_STANDARDS);

interface HtmlConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  brand?: string;
}

/* ── Helper ────────────────────────────────────────────────────────────── */
function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ────────────────────────────────────────────────────────────────────────
   Native preview — uses CSS background-image instead of <img> tag.
   background-image loads reliably for Google Drive, OpenAI, and blob URLs
   regardless of CORS headers or referrer policies.
──────────────────────────────────────────────────────────────────────── */
function BannerPreview({
  imageUrl, brand, formData, offerType, textPosition, aspectRatio,
}: {
  imageUrl: string;
  brand?: string;
  formData: BannerFormData;
  offerType: OfferType;
  textPosition: TextPosition;
  aspectRatio: string; // e.g. "16 / 9"
}) {
  const style = getBrandStyle(brand);
  const cfg = OFFER_CONFIG[offerType];
  const headline = offerType === 'bonus' ? `${formData.mainValue}%` : formData.mainValue;
  const descriptor = offerType === 'bonus'
    ? (formData.subValue ? `Up to ${formData.subValue}` : 'Welcome Bonus')
    : cfg.descriptor;
  const ctaLabel = formData.ctaText.trim() || 'Play Now';
  const isRight = textPosition === 'right';

  // Load the brand's Google Font
  useEffect(() => {
    const fontUrl = `https://fonts.googleapis.com/css2?family=${style.googleFont}&display=swap`;
    if (!document.querySelector(`link[href="${fontUrl}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = fontUrl;
      document.head.appendChild(link);
    }
  }, [style.googleFont]);

  const gradDir = isRight ? 'to right' : 'to left';
  const gradient = `linear-gradient(${gradDir}, transparent 5%, ${hexToRgba(style.panelBg, 0.6)} 35%, ${hexToRgba(style.panelBg, 0.93)} 60%, ${hexToRgba(style.panelBg, 0.97)} 80%)`;

  return (
    <div
      className="relative w-full rounded-lg overflow-hidden"
      style={{
        fontFamily: style.fontFamily,
        aspectRatio,
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Gradient overlay */}
      <div className="absolute inset-0" style={{ background: gradient }} />

      {/* Text layer */}
      <div className={`absolute inset-0 flex items-center ${isRight ? 'justify-end' : 'justify-start'}`}>
        <div className="flex flex-col w-[46%]" style={{ padding: '6% 6%', gap: '3px' }}>
          {brand && (
            <span style={{ fontSize: 'clamp(5px, 1.2vw, 9px)', fontWeight: 700, color: style.accentColor, letterSpacing: '0.25em', textTransform: 'uppercase' as const }}>
              {brand}
            </span>
          )}
          <span style={{ fontSize: 'clamp(24px, 6vw, 48px)', fontWeight: 900, color: style.headlineColor, lineHeight: 0.9, letterSpacing: '-0.03em', display: 'block' }}>
            {headline || '\u2014'}
          </span>
          <span style={{ fontSize: 'clamp(8px, 2vw, 15px)', fontWeight: 800, color: style.headlineColor, textTransform: 'uppercase' as const, letterSpacing: '0.06em', lineHeight: 1, marginTop: 2 }}>
            {cfg.typeLabel}
          </span>
          {descriptor && (
            <span style={{ fontSize: 'clamp(4px, 1vw, 8px)', fontWeight: 600, color: style.bodyColor, letterSpacing: '0.2em', textTransform: 'uppercase' as const, opacity: 0.8, marginTop: 1 }}>
              {descriptor}
            </span>
          )}
          {formData.crossSell && (
            <span style={{ fontSize: 'clamp(6px, 1.2vw, 10px)', fontWeight: 700, color: style.accentColor, marginTop: 1 }}>
              {formData.crossSell}
            </span>
          )}
          <span className="block text-center" style={{
            background: style.buttonBg, color: style.buttonText,
            fontSize: 'clamp(5px, 1.1vw, 9px)', fontWeight: 800,
            padding: 'clamp(3px, 0.8vw, 8px) clamp(4px, 1vw, 12px)',
            borderRadius: '4px', marginTop: 'clamp(3px, 0.8vw, 8px)',
            textTransform: 'uppercase' as const, letterSpacing: '0.12em',
            boxShadow: `0 2px 10px ${style.buttonShadow}`,
          }}>
            {ctaLabel}
          </span>
          {formData.bonusCode && (
            <span style={{ fontSize: 'clamp(3px, 0.7vw, 7px)', color: style.bodyColor, opacity: 0.45, textAlign: 'center' as const, letterSpacing: '0.15em', textTransform: 'uppercase' as const, marginTop: 1 }}>
              Code: {formData.bonusCode}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   toBase64DataUri
──────────────────────────────────────────────────────────────────────── */
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

/* ────────────────────────────────────────────────────────────────────────
   Modal
──────────────────────────────────────────────────────────────────────── */
export function HtmlConversionModal({ isOpen, onClose, imageUrl, brand }: HtmlConversionModalProps) {
  const [formData, setFormData] = useState<BannerFormData>({
    mainValue: '', subValue: '', crossSell: '', bonusCode: '', ctaUrl: '#', ctaText: 'Play Now',
  });
  const [offerType, setOfferType] = useState<OfferType>('freespins');
  const [textPosition, setTextPosition] = useState<TextPosition>('right');
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When no brand prop is provided, let the user pick one
  const [selectedBrand, setSelectedBrand] = useState<string>(brand || '');
  useEffect(() => { setSelectedBrand(brand || ''); }, [brand]);
  const effectiveBrand = selectedBrand || undefined;

  // Detect original image dimensions
  const [imgDims, setImgDims] = useState<{ w: number; h: number }>({ w: 16, h: 9 });
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageUrl;
  }, [imageUrl]);

  const aspectRatio = `${imgDims.w} / ${imgDims.h}`;

  const handleInputChange = (field: keyof BannerFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerate = async () => {
    setError(null);
    if (!formData.mainValue.trim()) {
      setError(`Please enter the ${OFFER_CONFIG[offerType].label.toLowerCase()}.`);
      return;
    }
    setIsGenerating(true);
    try {
      const imageSrc = await toBase64DataUri(imageUrl);
      setGeneratedHtml(buildBannerHtml({
        imageSrc, brand: effectiveBrand, formData, offerType, textPosition,
        imgWidth: imgDims.w, imgHeight: imgDims.h,
      }));
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
    a.download = `${effectiveBrand ? effectiveBrand.toLowerCase() : 'banner'}-${offerType}-banner.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePreview = () => {
    const html = generatedHtml || buildBannerHtml({
      imageSrc: imageUrl, brand: effectiveBrand, formData, offerType, textPosition,
      imgWidth: imgDims.w, imgHeight: imgDims.h,
    });
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
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
  const dimLabel = `${imgDims.w}x${imgDims.h}`;

  const OFFER_CARDS: Record<OfferType, { icon: string; example: string }> = {
    freespins: { icon: '🎰', example: 'e.g. 20, 50, 100' },
    bonus:     { icon: '💰', example: 'e.g. 400% up to $4k' },
    nodeposit: { icon: '🎁', example: 'e.g. $5, €10' },
    freebet:   { icon: '🎲', example: 'e.g. $50 free bet' },
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5 border-b border-border shrink-0">
          <FileCode className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight">Convert to HTML Banner</h2>
            <p className="text-[11px] text-muted-foreground truncate">{effectiveBrand || 'Generic'} · {dimLabel}</p>
          </div>
        </div>

        {!generatedHtml ? (
          /* ── FORM ── */
          <div className="overflow-y-auto flex-1 min-h-0">
            <div className="p-4 space-y-3.5">

              {/* Live preview — uses CSS background-image, always loads */}
              <BannerPreview
                imageUrl={imageUrl} brand={effectiveBrand} formData={formData}
                offerType={offerType} textPosition={textPosition}
                aspectRatio={aspectRatio}
              />

              {/* Brand selector — shown when no brand is provided via props */}
              {!brand && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Brand</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_BRANDS.map((b) => (
                      <button key={b} type="button" onClick={() => setSelectedBrand(b)}
                        className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                          selectedBrand === b
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}>
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Text position */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Text Position</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['left', 'right'] as TextPosition[]).map((pos) => (
                    <button key={pos} type="button" onClick={() => setTextPosition(pos)}
                      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                        textPosition === pos
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}>
                      {pos === 'left' ? <AlignLeft className="w-3 h-3" /> : <AlignRight className="w-3 h-3" />}
                      Text {pos === 'left' ? 'Left' : 'Right'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Offer type */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Offer Type</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(OFFER_CONFIG) as OfferType[]).map((type) => (
                    <button key={type} type="button" onClick={() => setOfferType(type)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-left transition-colors ${
                        offerType === type
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}>
                      <span className="text-base leading-none">{OFFER_CARDS[type].icon}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold leading-tight">{OFFER_CONFIG[type].typeLabel}</p>
                        <p className="text-[10px] opacity-50 truncate">{OFFER_CARDS[type].example}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Offer details */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Offer Details</p>
                <div className={`grid gap-1.5 ${cfg.showSubValue ? 'grid-cols-2' : ''}`}>
                  <div>
                    <Label htmlFor="mainValue" className="text-[11px] mb-0.5 block">
                      {cfg.label} <span className="text-destructive">*</span>
                    </Label>
                    <Input id="mainValue" placeholder={cfg.mainPlaceholder} value={formData.mainValue}
                      onChange={(e) => handleInputChange('mainValue', e.target.value)} className="h-8 text-sm" />
                  </div>
                  {cfg.showSubValue && (
                    <div>
                      <Label htmlFor="subValue" className="text-[11px] mb-0.5 block">Up to Amount</Label>
                      <Input id="subValue" placeholder="e.g. $4,000" value={formData.subValue}
                        onChange={(e) => handleInputChange('subValue', e.target.value)} className="h-8 text-sm" />
                    </div>
                  )}
                </div>
                <div>
                  <Label htmlFor="crossSell" className="text-[11px] mb-0.5 block">
                    Cross-sell <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input id="crossSell" placeholder="e.g. + 500% Bonus" value={formData.crossSell}
                    onChange={(e) => handleInputChange('crossSell', e.target.value)} className="h-8 text-sm" />
                </div>
              </div>

              {/* Button & Code */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Button & Code</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <Label htmlFor="ctaText" className="text-[11px] mb-0.5 block">Button Text</Label>
                    <Input id="ctaText" placeholder="Play Now" value={formData.ctaText}
                      onChange={(e) => handleInputChange('ctaText', e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label htmlFor="bonusCode" className="text-[11px] mb-0.5 block">Bonus Code</Label>
                    <Input id="bonusCode" placeholder="WELCOME100" value={formData.bonusCode}
                      onChange={(e) => handleInputChange('bonusCode', e.target.value)} className="h-8 text-sm" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="ctaUrl" className="text-[11px] mb-0.5 block">Destination URL</Label>
                  <Input id="ctaUrl" placeholder="https://your-casino.com/register"
                    value={formData.ctaUrl === '#' ? '' : formData.ctaUrl}
                    onChange={(e) => handleInputChange('ctaUrl', e.target.value || '#')} className="h-8 text-sm" />
                </div>
              </div>

              {error && (
                <p className="text-destructive text-xs bg-destructive/10 rounded px-2.5 py-1.5">{error}</p>
              )}
            </div>

            {/* Sticky generate button */}
            <div className="sticky bottom-0 px-4 pb-4 pt-2 bg-background/95 backdrop-blur-sm border-t border-border">
              <Button onClick={handleGenerate} className="w-full gradient-primary gap-2 h-9" disabled={isGenerating}>
                {isGenerating ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Embedding image…</>
                ) : (
                  <><FileCode className="w-3.5 h-3.5" /> Generate HTML</>
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* ── SUCCESS ── */
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-4 space-y-3">
              <BannerPreview
                imageUrl={imageUrl} brand={brand} formData={formData}
                offerType={offerType} textPosition={textPosition}
                aspectRatio={aspectRatio}
              />
              <div className="text-center">
                <p className="text-foreground font-semibold text-sm">HTML Banner Ready</p>
                <p className="text-[11px] text-muted-foreground">
                  {cfg.typeLabel} · {dimLabel} · Text {textPosition} · {brand || 'Generic'}
                </p>
              </div>
            </div>
            <div className="sticky bottom-0 px-4 pb-4 pt-2 bg-background/95 backdrop-blur-sm border-t border-border space-y-2">
              <Button onClick={handleDownload} className="w-full gradient-primary gap-2 h-9">
                <Download className="w-3.5 h-3.5" /> Download HTML
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setGeneratedHtml(null)} className="flex-1 h-8 text-xs">Edit</Button>
                <Button variant="outline" onClick={handlePreview} className="flex-1 gap-1.5 h-8 text-xs">
                  <Eye className="w-3 h-3" /> Full Preview
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
