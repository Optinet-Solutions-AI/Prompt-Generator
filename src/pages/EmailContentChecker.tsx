/**
 * EmailContentChecker.tsx — dedicated "Email Content Checker" page.
 *
 * Content-first (not banner-first): paste an email subject + body (or HTML),
 * get an instant deliverability score, see exactly which spam/hype/currency
 * triggers were found, clean up the mechanical ones, and copy the result.
 *
 * Mirrors the "Checker" emphasis of the Content Studio reference tool. Reuses
 * the same pure linter as the email modal (src/lib/deliverability.ts) so the
 * scoring is identical everywhere.
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Wand2, AlertCircle, Copy, Check, Eraser, LayoutTemplate, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BRAND_STANDARDS } from '@/lib/brand-standards';
import { lintDeliverability, sanitizeContent } from '@/lib/deliverability';
import { buildEmailHtml } from '@/lib/build-email-html';
import { EMAIL_TEMPLATES, resolveTemplateForm, templateCheckerCopy, type EmailTemplate } from '@/lib/email-templates';

const ALL_BRANDS = Object.keys(BRAND_STANDARDS);

/** Strip HTML tags so pasted HTML is scored on its visible text, not its markup. */
function stripHtml(input: string): string {
  if (!input.includes('<')) return input;
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function EmailContentChecker() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [brand, setBrand] = useState<string>('');
  const [copied, setCopied] = useState<'subject' | 'body' | null>(null);

  // Same linter the email modal uses. The body is tag-stripped first so pasted
  // HTML is checked on its readable words. The brand name is exempted.
  const report = useMemo(() => {
    const subj = subject.trim();
    const bod = stripHtml(body);
    if (!subj && !bod) return null;
    return lintDeliverability(subj, bod, { ignore: brand ? [brand] : [] });
  }, [subject, body, brand]);

  const handleSanitize = () => {
    setSubject(prev => sanitizeContent(prev));
    setBody(prev => sanitizeContent(prev));
  };

  const handleClear = () => { setSubject(''); setBody(''); };

  const handleCopy = async (kind: 'subject' | 'body') => {
    try {
      await navigator.clipboard.writeText(kind === 'subject' ? subject : body);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard blocked — ignore */ }
  };

  const levelBadge = (lvl: string) =>
    lvl === 'clean'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
      : lvl === 'caution'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
        : 'bg-destructive/15 text-destructive';

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg gradient-primary">
              <ShieldCheck className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">Email Content Checker</h1>
              <p className="text-xs text-muted-foreground">
                Paste your email copy or HTML — get an instant deliverability score and fix spam triggers before you send.
              </p>
            </div>
          </div>
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Home
            </Button>
          </Link>
        </div>

        {/* Brand (optional) — exempts the brand name from the checks */}
        <div className="space-y-1.5 mb-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Brand <span className="font-normal normal-case">(optional — so the brand name isn't flagged)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_BRANDS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBrand(prev => (prev === b ? '' : b))}
                className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                  brand === b
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Subject */}
        <div className="mb-3">
          <Label htmlFor="subject" className="text-[11px] mb-0.5 block">Subject line</Label>
          <Input
            id="subject"
            placeholder="e.g. A quick note about your account"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        {/* Body / HTML */}
        <div className="mb-3">
          <Label htmlFor="body" className="text-[11px] mb-0.5 block">
            Email body or HTML
          </Label>
          <Textarea
            id="body"
            placeholder="Paste your email copy here. You can paste full HTML too — it's checked on the visible text."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[200px] text-sm font-mono"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button type="button" onClick={handleSanitize} className="gap-1.5 h-8 text-xs" disabled={!subject && !body}>
            <Wand2 className="w-3.5 h-3.5" /> Clean up copy
          </Button>
          <Button type="button" variant="outline" onClick={() => handleCopy('subject')} className="gap-1.5 h-8 text-xs" disabled={!subject}>
            {copied === 'subject' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy subject
          </Button>
          <Button type="button" variant="outline" onClick={() => handleCopy('body')} className="gap-1.5 h-8 text-xs" disabled={!body}>
            {copied === 'body' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy body
          </Button>
          <Button type="button" variant="ghost" onClick={handleClear} className="gap-1.5 h-8 text-xs ml-auto" disabled={!subject && !body}>
            <Eraser className="w-3.5 h-3.5" /> Clear
          </Button>
        </div>

        {/* Deliverability report */}
        {!report ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Start typing or paste content above — your deliverability score appears here.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className={`w-4 h-4 ${
                report.level === 'clean' ? 'text-emerald-600'
                : report.level === 'caution' ? 'text-amber-500' : 'text-destructive'
              }`} />
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Deliverability</p>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${levelBadge(report.level)}`}>
                {report.level === 'clean' ? 'Clean'
                  : report.level === 'caution' ? 'Caution' : 'High risk'}
                {report.score > 0 && ` · risk ${report.score}`}
              </span>
            </div>

            {report.findings.length === 0 ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                No spam triggers detected — this copy should deliver well.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-72 overflow-y-auto">
                {report.findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs leading-snug">
                    <AlertCircle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                      f.severity === 'high' ? 'text-destructive'
                      : f.severity === 'medium' ? 'text-amber-500' : 'text-muted-foreground'
                    }`} />
                    <span className="text-muted-foreground">
                      {f.message}{f.suggestion ? ` ${f.suggestion}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
              "Clean up copy" fixes mechanical triggers automatically (currency symbols → codes, removes exclamation marks).
              Spam words are left for you to reword using the suggestions above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
