import { useState } from 'react';
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
import { Download, Eye, FileCode, AlignLeft, AlignRight } from 'lucide-react';
import { getBrandStyle } from '@/lib/brand-standards';

interface HtmlConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  brand?: string;
}

interface BannerFormData {
  welcomeBonus: string;
  bonusPercentage: string;
  bonusCode: string;
  ctaUrl: string;
  ctaText: string;
}

type TextPosition = 'left' | 'right';

export function HtmlConversionModal({ isOpen, onClose, imageUrl, brand }: HtmlConversionModalProps) {
  const [formData, setFormData] = useState<BannerFormData>({
    welcomeBonus: '',
    bonusPercentage: '',
    bonusCode: '',
    ctaUrl: '#',
  });
  const [textPosition, setTextPosition] = useState<TextPosition>('right');
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (field: keyof BannerFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const buildHtml = (): string => {
    const style = getBrandStyle(brand);

    // 'right' → image left, text right  → flex-row
    // 'left'  → text left, image right → flex-row-reverse
    const flexDirection = textPosition === 'right' ? 'row' : 'row-reverse';

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
      background: #111;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: ${style.fontFamily};
    }

    .banner {
      display: flex;
      flex-direction: ${flexDirection};
      width: 100%;
      max-width: 900px;
      overflow: hidden;
      border-radius: 14px;
      box-shadow: 0 8px 48px rgba(0,0,0,0.6);
    }

    /* On mobile, always stack vertically */
    @media (max-width: 600px) {
      .banner { flex-direction: column; }
    }

    /* ── Image panel ── */
    .banner__image {
      flex: 1;
      min-height: 320px;
      overflow: hidden;
    }

    .banner__image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    /* ── Text panel ── */
    .banner__text {
      flex: 1;
      background: ${style.panelBg};
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      padding: 44px 40px;
      gap: 18px;
    }

    .banner__headline {
      font-family: ${style.fontFamily};
      font-size: clamp(32px, 4vw, 52px);
      font-weight: 900;
      color: ${style.headlineColor};
      line-height: 1.05;
      letter-spacing: -0.01em;
      text-transform: uppercase;
    }

    .banner__subtext {
      font-family: ${style.fontFamily};
      font-size: 13px;
      font-weight: 600;
      color: ${style.bodyColor};
      letter-spacing: 0.18em;
      text-transform: uppercase;
      opacity: 0.8;
    }

    .banner__bonus {
      font-family: ${style.fontFamily};
      font-size: clamp(22px, 2.5vw, 32px);
      font-weight: 700;
      color: ${style.accentColor};
      letter-spacing: -0.01em;
    }

    /* ── CTA Button ── */
    .banner__cta {
      display: inline-block;
      background: ${style.buttonBg};
      color: ${style.buttonText};
      font-family: ${style.fontFamily};
      font-size: 16px;
      font-weight: 800;
      text-decoration: none;
      padding: 15px 38px;
      border-radius: 50px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      box-shadow: 0 4px 24px ${style.buttonShadow};
      transition: opacity 0.15s ease, transform 0.15s ease;
      cursor: pointer;
      margin-top: 6px;
    }

    .banner__cta:hover {
      opacity: 0.88;
      transform: translateY(-1px);
    }

    .banner__code {
      font-family: ${style.fontFamily};
      font-size: 11px;
      font-weight: 500;
      color: ${style.bodyColor};
      letter-spacing: 0.12em;
      text-transform: uppercase;
      opacity: 0.5;
    }
  </style>
</head>
<body>
  <div class="banner">

    <!-- Image panel -->
    <div class="banner__image">
      <img src="${imageUrl}" alt="${brand || 'Casino'} promotional banner" />
    </div>

    <!-- Text / CTA panel -->
    <div class="banner__text">
      <h2 class="banner__headline">${formData.welcomeBonus ? `${formData.welcomeBonus} Free Spins` : 'Free Spins'}</h2>
      <p class="banner__subtext">No Deposit Needed</p>
      ${formData.bonusPercentage ? `<p class="banner__bonus">+${formData.bonusPercentage}% Bonus</p>` : ''}
      <a href="${formData.ctaUrl || '#'}" class="banner__cta">Join Now</a>
      ${formData.bonusCode ? `<p class="banner__code">Bonus Code: ${formData.bonusCode}</p>` : ''}
    </div>

  </div>
</body>
</html>`;
  };

  const handleGenerate = () => {
    setError(null);
    if (!formData.welcomeBonus.trim()) {
      setError('Please enter the number of free spins.');
      return;
    }
    setGeneratedHtml(buildHtml());
  };

  const handleDownload = () => {
    if (!generatedHtml) return;
    const blob = new Blob([generatedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${brand ? brand.toLowerCase() : 'banner'}-email.html`;
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
    setFormData({ welcomeBonus: '', bonusPercentage: '', bonusCode: '', ctaUrl: '#' });
    setGeneratedHtml(null);
    setTextPosition('right');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
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
            <div className="space-y-4 py-4">

              {/* Text Position toggle */}
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

              <div className="space-y-2">
                <Label htmlFor="welcomeBonus">Free Spins *</Label>
                <Input
                  id="welcomeBonus"
                  placeholder="e.g. 20"
                  value={formData.welcomeBonus}
                  onChange={(e) => handleInputChange('welcomeBonus', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bonusPercentage">Bonus Percentage</Label>
                <Input
                  id="bonusPercentage"
                  placeholder="e.g. 100"
                  value={formData.bonusPercentage}
                  onChange={(e) => handleInputChange('bonusPercentage', e.target.value)}
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

              <div className="space-y-2">
                <Label htmlFor="ctaUrl">CTA Link URL</Label>
                <Input
                  id="ctaUrl"
                  placeholder="https://your-casino.com/register"
                  value={formData.ctaUrl === '#' ? '' : formData.ctaUrl}
                  onChange={(e) => handleInputChange('ctaUrl', e.target.value || '#')}
                />
              </div>
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} className="gradient-primary gap-2">
                <FileCode className="w-4 h-4" />
                Generate HTML
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <FileCode className="w-8 h-8 text-primary" />
              </div>
              <p className="text-foreground font-medium mb-1">HTML Banner Ready</p>
              <p className="text-sm text-muted-foreground">
                Text on {textPosition} · {brand || 'Generic'} brand styles applied
              </p>
            </div>

            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setGeneratedHtml(null)} className="gap-2">
                Edit
              </Button>
              <Button variant="outline" onClick={handlePreview} className="gap-2">
                <Eye className="w-4 h-4" />
                Preview
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
