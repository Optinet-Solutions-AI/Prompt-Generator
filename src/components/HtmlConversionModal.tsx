import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Eye, FileCode, AlignLeft, AlignRight, Loader2 } from 'lucide-react';
import { getBrandStyle } from '@/lib/brand-standards';

interface HtmlConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  brand?: string;
}

// The 4 offer types supported
type OfferType = 'freespins' | 'bonus' | 'nodeposit' | 'freebet';

interface BannerFormData {
  mainValue: string;    // Big number: spin count / bonus % / dollar amount
  subValue: string;     // Only for % Bonus → "Up to $4,000"
  crossSell: string;    // Optional accent line e.g. "+ 500% Bonus" or "100 Extra Spins"
  bonusCode: string;
  ctaUrl: string;
  ctaText: string;
}

type TextPosition = 'left' | 'right';

// Per-offer-type display config used in both the form labels and the HTML output
const OFFER_CONFIG: Record<OfferType, {
  label: string;
  mainPlaceholder: string;
  typeLabel: string;
  descriptor: string;
  showSubValue: boolean;
}> = {
  freespins: {
    label: 'Number of Spins',
    mainPlaceholder: 'e.g. 20',
    typeLabel: 'Free Spins',
    descriptor: 'No Deposit Bonus',
    showSubValue: false,
  },
  bonus: {
    label: 'Bonus %',
    mainPlaceholder: 'e.g. 400',
    typeLabel: 'Bonus',
    descriptor: '',          // filled from subValue below
    showSubValue: true,
  },
  nodeposit: {
    label: 'Bonus Amount',
    mainPlaceholder: 'e.g. $5',
    typeLabel: 'No Deposit',
    descriptor: 'Bonus',
    showSubValue: false,
  },
  freebet: {
    label: 'Bet Amount',
    mainPlaceholder: 'e.g. $50',
    typeLabel: 'Free Bet',
    descriptor: 'No Deposit Required',
    showSubValue: false,
  },
};

// Converts a 6-char hex colour to rgba() so we can use brand colours in the gradient.
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Fetches an image URL and returns it as a base64 data URI so the
// downloaded HTML file works everywhere — no blob URLs, no broken images.
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
  const [textPosition, setTextPosition] = useState<TextPosition>('right');
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (field: keyof BannerFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Builds the banner HTML. imageSrc can be the original URL (for live preview)
  // or a base64 data URI (for the final downloadable file).
  const buildHtml = (imageSrc: string): string => {
    const style = getBrandStyle(brand);
    const cfg = OFFER_CONFIG[offerType];
    const ctaLabel = formData.ctaText.trim() || 'Play Now';

    // Use the brand's own dark colour in the gradient so it feels on-brand
    const dark95 = hexToRgba(style.panelBg, 0.95);
    const dark70 = hexToRgba(style.panelBg, 0.70);
    const dark40 = hexToRgba(style.panelBg, 0.40);

    // Text on right → gradient flows left-to-right (image visible on left, dark on right)
    // Text on left  → gradient flows right-to-left
    const gradientDirection = textPosition === 'right' ? 'to right' : 'to left';
    const justifyContent  = textPosition === 'right' ? 'flex-end' : 'flex-start';

    // Descriptor line: for % Bonus use the subValue ("Up to $4,000"), otherwise the preset string
    const descriptor = offerType === 'bonus'
      ? (formData.subValue ? `Up to ${formData.subValue}` : 'Welcome Bonus')
      : cfg.descriptor;

    // The big headline: % Bonus appends "%" automatically
    const headline = offerType === 'bonus'
      ? `${formData.mainValue}%`
      : formData.mainValue;

    const googleFontsUrl = `https://fonts.googleapis.com/css2?family=${style.googleFont}&display=swap`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${brand || 'Casino'} Banner</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${googleFontsUrl}" rel="stylesheet" />
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #0d0d0d;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: ${style.fontFamily};
    }

    /* ── Banner wrapper ── */
    .banner {
      position: relative;
      width: 100%;
      max-width: 900px;
      overflow: hidden;
      border-radius: 10px;
      box-shadow: 0 8px 48px rgba(0,0,0,0.7);
      aspect-ratio: 16 / 7;
      min-height: 280px;
    }

    /* Layer 0 — full-bleed AI image fills the whole banner */
    .banner__bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
      z-index: 0;
    }

    /* Layer 1 — brand-coloured gradient overlay for text readability */
    .banner__gradient {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        ${gradientDirection},
        transparent 5%,
        ${dark40} 35%,
        ${dark70} 55%,
        ${dark95} 75%,
        ${dark95} 100%
      );
      z-index: 1;
    }

    /* Layer 2 — text content sits above the gradient */
    .banner__content {
      position: relative;
      z-index: 2;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: ${justifyContent};
    }

    /* Text panel — floats over the dark half of the gradient */
    .banner__text {
      display: flex;
      flex-direction: column;
      justify-content: center;
      width: 46%;
      padding: 32px 40px;
      gap: 8px;
    }

    @media (max-width: 600px) {
      .banner { aspect-ratio: auto; min-height: 320px; }
      .banner__text { width: 100%; padding: 28px 24px; background: ${dark70}; }
    }

    /* Small brand label */
    .banner__brand {
      font-size: 10px;
      font-weight: 700;
      color: ${style.accentColor};
      letter-spacing: 0.28em;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    /* Big headline number / amount */
    .banner__number {
      font-size: clamp(56px, 8.5vw, 96px);
      font-weight: 900;
      color: ${style.headlineColor};
      line-height: 0.9;
      letter-spacing: -0.03em;
      display: block;
    }

    /* Offer type label e.g. "FREE SPINS" / "BONUS" */
    .banner__type {
      font-size: clamp(16px, 2.4vw, 26px);
      font-weight: 800;
      color: ${style.headlineColor};
      text-transform: uppercase;
      letter-spacing: 0.08em;
      line-height: 1;
      display: block;
      margin-top: 6px;
    }

    /* Qualifier / descriptor text */
    .banner__descriptor {
      font-size: 11px;
      font-weight: 600;
      color: ${style.bodyColor};
      letter-spacing: 0.22em;
      text-transform: uppercase;
      opacity: 0.8;
      margin-top: 4px;
    }

    /* Optional cross-sell accent line */
    .banner__crosssell {
      font-size: clamp(12px, 1.6vw, 18px);
      font-weight: 700;
      color: ${style.accentColor};
      letter-spacing: 0.04em;
      margin-top: 2px;
    }

    /* CTA button */
    .banner__cta {
      display: block;
      width: 100%;
      background: ${style.buttonBg};
      color: ${style.buttonText};
      font-size: 13px;
      font-weight: 800;
      text-decoration: none;
      text-align: center;
      padding: 13px 20px;
      border-radius: 7px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      margin-top: 12px;
      cursor: pointer;
      box-shadow: 0 4px 18px ${style.buttonShadow};
      transition: opacity 0.15s ease;
    }
    .banner__cta:hover { opacity: 0.85; }

    /* Bonus code */
    .banner__code {
      font-size: 10px;
      font-weight: 500;
      color: ${style.bodyColor};
      letter-spacing: 0.18em;
      text-transform: uppercase;
      opacity: 0.45;
      margin-top: 4px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="banner">

    <!-- Layer 0: full-bleed AI image, base64-embedded for portability -->
    <img class="banner__bg" src="${imageSrc}" alt="${brand || 'Casino'} promotional banner" />

    <!-- Layer 1: brand-coloured gradient overlay -->
    <div class="banner__gradient"></div>

    <!-- Layer 2: offer text -->
    <div class="banner__content">
      <div class="banner__text">
        ${brand ? `<p class="banner__brand">${brand}</p>` : ''}

        <span class="banner__number">${headline}</span>
        <span class="banner__type">${cfg.typeLabel}</span>

        ${descriptor ? `<p class="banner__descriptor">${descriptor}</p>` : ''}
        ${formData.crossSell ? `<p class="banner__crosssell">${formData.crossSell}</p>` : ''}

        <a href="${formData.ctaUrl || '#'}" class="banner__cta">${ctaLabel}</a>
        ${formData.bonusCode ? `<p class="banner__code">Use code: ${formData.bonusCode}</p>` : ''}
      </div>
    </div>

  </div>
</body>
</html>`;
  };

  // Live preview — uses the raw imageUrl (no base64 conversion needed, fast).
  // Rebuilds whenever any form field or setting changes.
  const previewHtml = useMemo(() => buildHtml(imageUrl), [
    imageUrl, formData, offerType, textPosition, brand,
  ]);

  const handleGenerate = async () => {
    setError(null);
    if (!formData.mainValue.trim()) {
      setError(`Please enter the ${OFFER_CONFIG[offerType].label.toLowerCase()}.`);
      return;
    }
    setIsGenerating(true);
    try {
      const imageSrc = await toBase64DataUri(imageUrl);
      setGeneratedHtml(buildHtml(imageSrc));
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode className="w-5 h-5" />
            Convert to HTML Banner
            {brand && (
              <span className="text-xs font-normal text-muted-foreground ml-1">· {brand}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {!generatedHtml ? (
          <>
            <div className="space-y-4 py-2">

              {/* ── Text position ── */}
              <div className="space-y-2">
                <Label>Text Position</Label>
                <div className="inline-flex rounded-lg bg-muted p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setTextPosition('left')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      textPosition === 'left'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                    Text Left
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextPosition('right')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      textPosition === 'right'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <AlignRight className="w-3.5 h-3.5" />
                    Text Right
                  </button>
                </div>
              </div>

              {/* ── Offer type ── */}
              <div className="space-y-2">
                <Label>Offer Type</Label>
                <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
                  {(Object.keys(OFFER_CONFIG) as OfferType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setOfferType(type)}
                      className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                        offerType === type
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {OFFER_CONFIG[type].typeLabel}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Main value ── */}
              <div className="space-y-2">
                <Label htmlFor="mainValue">{cfg.label} *</Label>
                <Input
                  id="mainValue"
                  placeholder={cfg.mainPlaceholder}
                  value={formData.mainValue}
                  onChange={(e) => handleInputChange('mainValue', e.target.value)}
                />
              </div>

              {/* ── Sub value (% Bonus only) ── */}
              {cfg.showSubValue && (
                <div className="space-y-2">
                  <Label htmlFor="subValue">Up to Amount</Label>
                  <Input
                    id="subValue"
                    placeholder="e.g. $4,000"
                    value={formData.subValue}
                    onChange={(e) => handleInputChange('subValue', e.target.value)}
                  />
                </div>
              )}

              {/* ── Cross-sell accent line ── */}
              <div className="space-y-2">
                <Label htmlFor="crossSell">
                  Cross-sell Line{' '}
                  <span className="text-muted-foreground font-normal">(optional accent)</span>
                </Label>
                <Input
                  id="crossSell"
                  placeholder="e.g. + 500% Bonus  /  100 Extra Spins"
                  value={formData.crossSell}
                  onChange={(e) => handleInputChange('crossSell', e.target.value)}
                />
              </div>

              {/* ── Bottom row: code + button + url ── */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ctaText">Button Text</Label>
                  <Input
                    id="ctaText"
                    placeholder="Play Now"
                    value={formData.ctaText}
                    onChange={(e) => handleInputChange('ctaText', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bonusCode">Bonus Code</Label>
                  <Input
                    id="bonusCode"
                    placeholder="e.g. WELCOME100"
                    value={formData.bonusCode}
                    onChange={(e) => handleInputChange('bonusCode', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ctaUrl">CTA Link URL</Label>
                <Input
                  id="ctaUrl"
                  placeholder="https://your-casino.com/register"
                  value={formData.ctaUrl === '#' ? '' : formData.ctaUrl}
                  onChange={(e) => handleInputChange('ctaUrl', e.target.value || '#')}
                />
              </div>

              {/* ── Live preview ── */}
              <div className="space-y-2 pt-1">
                <Label className="text-muted-foreground text-xs uppercase tracking-widest">
                  Live Preview
                </Label>
                {/* Container is ~100% of dialog inner width (~420px). Banner iframe is 900px
                    wide scaled down so scale ≈ 420/900 ≈ 0.467. Height = 394 * 0.467 ≈ 184px */}
                <div
                  className="relative w-full overflow-hidden rounded-lg border border-border"
                  style={{ height: '184px' }}
                >
                  <iframe
                    srcDoc={previewHtml}
                    sandbox="allow-same-origin"
                    title="Banner preview"
                    style={{
                      width: '900px',
                      height: '394px',
                      transform: 'scale(0.467)',
                      transformOrigin: 'top left',
                      border: 'none',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              </div>

            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} className="gradient-primary gap-2" disabled={isGenerating}>
                {isGenerating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Embedding image…</>
                ) : (
                  <><FileCode className="w-4 h-4" /> Generate HTML</>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="py-4">
              {/* Mini preview of the final output */}
              <div
                className="relative w-full overflow-hidden rounded-lg border border-border mb-5"
                style={{ height: '184px' }}
              >
                <iframe
                  srcDoc={generatedHtml}
                  sandbox="allow-same-origin"
                  title="Final banner preview"
                  style={{
                    width: '900px',
                    height: '394px',
                    transform: 'scale(0.467)',
                    transformOrigin: 'top left',
                    border: 'none',
                    pointerEvents: 'none',
                  }}
                />
              </div>
              <p className="text-center text-foreground font-medium mb-1">HTML Banner Ready</p>
              <p className="text-center text-sm text-muted-foreground">
                {cfg.typeLabel} · Text {textPosition} · {brand || 'Generic'} · image embedded
              </p>
            </div>

            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setGeneratedHtml(null)} className="gap-2">
                Edit
              </Button>
              <Button variant="outline" onClick={handlePreview} className="gap-2">
                <Eye className="w-4 h-4" />
                Full Preview
              </Button>
              <Button onClick={handleDownload} className="gradient-primary gap-2">
                <Download className="w-4 h-4" />
                Download
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
