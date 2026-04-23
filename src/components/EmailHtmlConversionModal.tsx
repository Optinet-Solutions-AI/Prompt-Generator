import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Download, Eye, Mail, Loader2, Copy, Check, Sparkles, Image as ImageIcon, LayoutTemplate } from 'lucide-react';
import { BRAND_STANDARDS } from '@/lib/brand-standards';
import {
  buildEmailHtml,
  buildEmailText,
  EMPTY_EMAIL_FORM,
  type EmailFormData,
  type EmailTemplateVariant,
  type StaticBrandConfig,
} from '@/lib/build-email-html';

const ALL_BRANDS = Object.keys(BRAND_STANDARDS);

interface EmailHtmlConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  brand?: string;
}

/* ────────────────────────────────────────────────────────────────────────
   toBase64DataUri — embeds the hero image as a data URI so the HTML
   file is fully self-contained. Same strategy as HtmlConversionModal
   but duplicated here to keep the two flows fully independent.
──────────────────────────────────────────────────────────────────────── */
async function toBase64DataUri(url: string): Promise<string | null> {
  if (url.startsWith('data:')) return url;

  const canvasResult = await canvasDraw(url, false);
  if (canvasResult) return canvasResult;

  const directFetch = await fetchToDataUri(url);
  if (directFetch) return directFetch;

  const corsResult = await canvasDraw(url, true);
  if (corsResult) return corsResult;

  const proxyFetch = await fetchToDataUri(`/api/image-proxy?url=${encodeURIComponent(url)}`);
  if (proxyFetch) return proxyFetch;

  return null;
}

async function fetchToDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size < 100) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result && result.length > 100 ? result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function canvasDraw(url: string, useCors: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    if (useCors) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        const dataUri = canvas.toDataURL('image/png');
        resolve(dataUri && dataUri.length > 100 ? dataUri : null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 8000);
    img.src = url;
  });
}

/* ────────────────────────────────────────────────────────────────────────
   Modal
──────────────────────────────────────────────────────────────────────── */
export function EmailHtmlConversionModal({ isOpen, onClose, imageUrl, brand }: EmailHtmlConversionModalProps) {
  const [formData, setFormData] = useState<EmailFormData>(EMPTY_EMAIL_FORM);
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string>(brand || '');
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  // AI copy generation
  const [brief, setBrief] = useState('');
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);

  useEffect(() => { setSelectedBrand(brand || ''); }, [brand]);
  const effectiveBrand = selectedBrand || undefined;

  const [imgDims, setImgDims] = useState<{ w: number; h: number }>({ w: 1200, h: 628 });
  useEffect(() => {
    if (!imageUrl) return;
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > 0 && h > 0) setImgDims({ w, h });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const handleField = (field: keyof EmailFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerateWithAI = async () => {
    setAIError(null);
    if (!brief.trim()) {
      setAIError('Describe what the email is about first.');
      return;
    }
    setIsAIGenerating(true);
    try {
      const res = await fetch('/api/generate-email-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: brief.trim(),
          brand: effectiveBrand || '',
          imageUrl,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setAIError(err.error || `Request failed (${res.status})`);
        return;
      }
      const data = await res.json();
      setFormData(prev => ({
        ...prev,
        headline:          data.headline          || prev.headline,
        introText:         data.introText         || prev.introText,
        bodyText:          data.bodyText          || prev.bodyText,
        linkText:          data.linkText          || prev.linkText,
        footerAttribution: data.footerAttribution || prev.footerAttribution,
      }));
    } catch {
      setAIError('Could not reach the AI service. Try again.');
    } finally {
      setIsAIGenerating(false);
    }
  };

  const handleGenerate = async () => {
    setError(null);
    if (!formData.headline.trim() && !formData.bodyText.trim()) {
      setError('Add at least a headline or body text.');
      return;
    }
    setIsGenerating(true);
    try {
      const imageSrc = await toBase64DataUri(imageUrl);
      if (!imageSrc) {
        setError('Could not embed the hero image. Try downloading it locally and re-opening.');
        return;
      }
      const html = buildEmailHtml({
        imageSrc,
        brand: effectiveBrand,
        formData,
        imgWidth: imgDims.w,
        imgHeight: imgDims.h,
      });
      const text = buildEmailText(formData, effectiveBrand);
      setGeneratedHtml(html);
      setGeneratedText(text);
    } catch {
      setError('Failed to build email HTML. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = (kind: 'html' | 'text') => {
    const content = kind === 'html' ? generatedHtml : generatedText;
    if (!content) return;
    const mime = kind === 'html' ? 'text/html' : 'text/plain';
    const ext  = kind === 'html' ? 'html' : 'txt';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${effectiveBrand ? effectiveBrand.toLowerCase() : 'email'}-campaign.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async (kind: 'html' | 'text') => {
    const content = kind === 'html' ? generatedHtml : generatedText;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      if (kind === 'html') { setCopiedHtml(true); setTimeout(() => setCopiedHtml(false), 1500); }
      else { setCopiedText(true); setTimeout(() => setCopiedText(false), 1500); }
    } catch {
      setError('Copy failed — your browser blocked clipboard access.');
    }
  };

  const handlePreview = () => {
    if (!generatedHtml) return;
    const blob = new Blob([generatedHtml], { type: 'text/html' });
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
    setFormData(EMPTY_EMAIL_FORM);
    setGeneratedHtml(null);
    setGeneratedText(null);
    setSelectedBrand(brand || '');
    setError(null);
    setBrief('');
    setAIError(null);
    onClose();
  };

  const dimLabel = `${imgDims.w}x${imgDims.h}`;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5 border-b border-border shrink-0">
          <Mail className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight">Convert to Email HTML</h2>
            <p className="text-[11px] text-muted-foreground truncate">
              {effectiveBrand || 'Generic'} · Hero {dimLabel} · HTML + Plain-text
            </p>
          </div>
        </div>

        {!generatedHtml ? (
          /* ── FORM ── */
          <div className="overflow-y-auto flex-1 min-h-0">
            <div className="p-4 space-y-3.5">

              {/* Hero preview */}
              <div className="w-full rounded-lg overflow-hidden border border-border bg-muted/30">
                <div
                  style={{
                    width: '100%',
                    aspectRatio: `${imgDims.w} / ${imgDims.h}`,
                    backgroundImage: `url(${imageUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
              </div>

              {/* AI copy generation */}
              <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Generate with AI</p>
                </div>
                <Textarea
                  placeholder="Describe the email — e.g. 'Welcome bonus: 100 free spins, no deposit, ends Friday' or 'Watch Party announcement for the USMNT match'…"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  className="min-h-[56px] text-sm"
                  disabled={isAIGenerating}
                />
                <Button
                  type="button"
                  onClick={handleGenerateWithAI}
                  disabled={isAIGenerating || !brief.trim()}
                  variant="outline"
                  className="w-full gap-2 h-8 text-xs"
                >
                  {isAIGenerating
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating copy…</>
                    : <><Sparkles className="w-3.5 h-3.5" /> Draft headline + intro + body</>}
                </Button>
                {aiError && (
                  <p className="text-destructive text-[11px] bg-destructive/10 rounded px-2 py-1">{aiError}</p>
                )}
              </div>

              {/* Brand selector */}
              {!brand && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Brand</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_BRANDS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setSelectedBrand(b)}
                        className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                          selectedBrand === b
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Copy block */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Email Copy</p>
                <div>
                  <Label htmlFor="headline" className="text-[11px] mb-0.5 block">Headline</Label>
                  <Input
                    id="headline"
                    placeholder="e.g. Atlanta Insiders – Your Source for Soccer Info"
                    value={formData.headline}
                    onChange={(e) => handleField('headline', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="introText" className="text-[11px] mb-0.5 block">
                    Intro paragraph
                    <span className="ml-1 text-muted-foreground font-normal">(use {'{link}'} to place link inline)</span>
                  </Label>
                  <Textarea
                    id="introText"
                    placeholder="Atlanta Insiders is your source for soccer information… If you have not yet joined, please visit {link} for more information."
                    value={formData.introText}
                    onChange={(e) => handleField('introText', e.target.value)}
                    className="min-h-[60px] text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <Label htmlFor="linkText" className="text-[11px] mb-0.5 block">Inline link text</Label>
                    <Input
                      id="linkText"
                      placeholder="this page"
                      value={formData.linkText}
                      onChange={(e) => handleField('linkText', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="linkUrl" className="text-[11px] mb-0.5 block">Inline link URL</Label>
                    <Input
                      id="linkUrl"
                      placeholder="https://example.com/join"
                      value={formData.linkUrl}
                      onChange={(e) => handleField('linkUrl', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="bodyText" className="text-[11px] mb-0.5 block">Body paragraph</Label>
                  <Textarea
                    id="bodyText"
                    placeholder="Registration is FREE! And, for clarification…"
                    value={formData.bodyText}
                    onChange={(e) => handleField('bodyText', e.target.value)}
                    className="min-h-[90px] text-sm"
                  />
                </div>
              </div>

              {/* Secondary logo + wordmark */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Logo block <span className="text-muted-foreground font-normal normal-case">(optional — auto-uses brand name if wordmark blank)</span>
                </p>
                <div>
                  <Label htmlFor="secondaryLogoUrl" className="text-[11px] mb-0.5 block">Secondary logo image URL</Label>
                  <Input
                    id="secondaryLogoUrl"
                    placeholder="https://example.com/logo.png"
                    value={formData.secondaryLogoUrl}
                    onChange={(e) => handleField('secondaryLogoUrl', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="brandWordmark" className="text-[11px] mb-0.5 block">
                    Brand wordmark text
                    {effectiveBrand && !formData.brandWordmark.trim() && (
                      <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                        (default: {effectiveBrand.toUpperCase()})
                      </span>
                    )}
                  </Label>
                  <Input
                    id="brandWordmark"
                    placeholder={effectiveBrand ? effectiveBrand.toUpperCase() : 'e.g. GEORGIA SOCCER'}
                    value={formData.brandWordmark}
                    onChange={(e) => handleField('brandWordmark', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              {/* Social row */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Social links <span className="text-muted-foreground font-normal normal-case">(leave blank to omit)</span>
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <Input placeholder="Facebook URL"  value={formData.facebookUrl}  onChange={(e) => handleField('facebookUrl', e.target.value)}  className="h-8 text-sm" />
                  <Input placeholder="Twitter URL"   value={formData.twitterUrl}   onChange={(e) => handleField('twitterUrl', e.target.value)}   className="h-8 text-sm" />
                  <Input placeholder="Instagram URL" value={formData.instagramUrl} onChange={(e) => handleField('instagramUrl', e.target.value)} className="h-8 text-sm" />
                  <Input placeholder="Website URL"   value={formData.websiteUrl}   onChange={(e) => handleField('websiteUrl', e.target.value)}   className="h-8 text-sm" />
                </div>
              </div>

              {/* Footer */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Footer</p>
                <div>
                  <Label htmlFor="footerAttribution" className="text-[11px] mb-0.5 block">
                    Attribution line
                    {effectiveBrand && !formData.footerAttribution.trim() && (
                      <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                        (default: "This email was sent on behalf of {effectiveBrand}.")
                      </span>
                    )}
                  </Label>
                  <Input
                    id="footerAttribution"
                    placeholder={effectiveBrand ? `This email was sent on behalf of ${effectiveBrand}.` : 'This email was sent on behalf of …'}
                    value={formData.footerAttribution}
                    onChange={(e) => handleField('footerAttribution', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="unsubscribeUrl" className="text-[11px] mb-0.5 block">Unsubscribe URL</Label>
                  <Input
                    id="unsubscribeUrl"
                    placeholder="https://example.com/unsubscribe"
                    value={formData.unsubscribeUrl}
                    onChange={(e) => handleField('unsubscribeUrl', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              {error && (
                <p className="text-destructive text-xs bg-destructive/10 rounded px-2.5 py-1.5">{error}</p>
              )}
            </div>

            {/* Sticky generate */}
            <div className="sticky bottom-0 px-4 pb-4 pt-2 bg-background/95 backdrop-blur-sm border-t border-border">
              <Button onClick={handleGenerate} className="w-full gradient-primary gap-2 h-9" disabled={isGenerating}>
                {isGenerating
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Embedding image…</>
                  : <><Mail className="w-3.5 h-3.5" /> Generate Email HTML + Text</>}
              </Button>
            </div>
          </div>
        ) : (
          /* ── SUCCESS ── */
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-4 space-y-3">
              <div className="text-center">
                <p className="text-foreground font-semibold text-sm">Email Campaign Ready</p>
                <p className="text-[11px] text-muted-foreground">
                  {effectiveBrand || 'Generic'} · HTML + Plain-text · {dimLabel} hero
                </p>
              </div>

              {/* HTML preview iframe */}
              <div className="rounded-lg overflow-hidden border border-border bg-white">
                <iframe
                  title="Email HTML preview"
                  srcDoc={generatedHtml}
                  sandbox=""
                  style={{ width: '100%', height: 480, border: 0, display: 'block' }}
                />
              </div>

              {/* Plain-text preview */}
              <details className="rounded-lg border border-border">
                <summary className="px-3 py-2 text-xs font-semibold cursor-pointer select-none">
                  Plain-text version
                </summary>
                <pre className="p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words bg-muted/30 max-h-60 overflow-y-auto">
{generatedText}
                </pre>
              </details>
            </div>

            <div className="sticky bottom-0 px-4 pb-4 pt-2 bg-background/95 backdrop-blur-sm border-t border-border space-y-2">
              <div className="flex gap-2">
                <Button onClick={() => handleDownload('html')} className="flex-1 gradient-primary gap-2 h-9">
                  <Download className="w-3.5 h-3.5" /> Download HTML
                </Button>
                <Button onClick={() => handleDownload('text')} variant="outline" className="flex-1 gap-2 h-9">
                  <Download className="w-3.5 h-3.5" /> Download .txt
                </Button>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleCopy('html')} variant="outline" className="flex-1 gap-1.5 h-8 text-xs">
                  {copiedHtml ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedHtml ? 'Copied' : 'Copy HTML'}
                </Button>
                <Button onClick={() => handleCopy('text')} variant="outline" className="flex-1 gap-1.5 h-8 text-xs">
                  {copiedText ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedText ? 'Copied' : 'Copy Text'}
                </Button>
                <Button onClick={handlePreview} variant="outline" className="flex-1 gap-1.5 h-8 text-xs">
                  <Eye className="w-3 h-3" /> Full Preview
                </Button>
              </div>
              <Button variant="outline" onClick={() => setGeneratedHtml(null)} className="w-full h-8 text-xs">
                Edit
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
