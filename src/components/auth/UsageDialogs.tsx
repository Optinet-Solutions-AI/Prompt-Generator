/**
 * UsageDialogs — what each person's work costs.
 *
 *   MyUsageDialog   — everyone: my videos (Higgsfield credits) + images (US$)
 *   TeamUsageDialog — admins: everyone's usage, per person, + CSV downloads
 *
 * VIDEOS: Higgsfield's own credit quote per render, recorded at Generate.
 *         Failed renders are shown but not counted.
 * IMAGES: US$ from the tokens OpenAI (ChatGPT) / Google (Gemini) reported,
 *         split into Generate / Edit / Variations. OpenAI edits/variations are
 *         marked "estimated" (see api/_image-usage.ts).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { BarChart3, Download, Images, Loader2, Users, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  videoApi, type ImageUsageRecent, type ImageUsageSummary, type UsagePerson, type UsageRecent, type UsageSummary,
} from '@/lib/video-api';

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 3650, label: 'All time' },
];

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString();
/** $0.039 · $1.25 · $12.40 — cents matter for images. */
const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;

function PeriodPicker({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-muted/60 w-fit">
      {PERIODS.map(p => (
        <button key={p.days} type="button" onClick={() => onChange(p.days)}
          className={`px-3 py-1 rounded-md text-xs font-medium ${days === p.days ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Bars for a breakdown. `value` picks the number, `label` formats it. */
function Breakdown<T>({ title, groups, value, label }: {
  title: string; groups: Record<string, T>; value: (g: T) => number; label: (g: T) => string;
}) {
  const entries = Object.entries(groups).sort((a, b) => value(b[1]) - value(a[1]));
  const max = Math.max(1e-9, ...entries.map(([, g]) => value(g)));
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-foreground mb-1.5">{title}</p>
      <div className="space-y-1.5">
        {entries.map(([name, g]) => (
          <div key={name} className="text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-foreground">{name}</span>
              <span className="text-muted-foreground text-right">{label(g)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted mt-0.5">
              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(value(g) / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const creditBars = { value: (g: { credits: number }) => g.credits, label: (g: { credits: number; videos: number }) => `${fmt(g.credits)} credits · ${g.videos} video${g.videos === 1 ? '' : 's'}` };
const usdBars = { value: (g: { usd: number }) => g.usd, label: (g: { usd: number; images: number }) => `${usd(g.usd)} · ${g.images} image${g.images === 1 ? '' : 's'}` };

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">{icon}{title}</p>
      {children}
    </div>
  );
}

function ImageNotes({ s }: { s: ImageUsageSummary }) {
  if (!s.estimated_usd && !s.unpriced) return null;
  return (
    <p className="text-[11px] text-muted-foreground">
      {s.estimated_usd > 0 && <>{usd(s.estimated_usd)} of this is estimated (ChatGPT edits/variations). </>}
      {s.unpriced > 0 && <>{s.unpriced} action{s.unpriced === 1 ? '' : 's'} had no price info.</>}
    </p>
  );
}

function Loading({ loading, error, children }: { loading: boolean; error: string; children: ReactNode }) {
  if (loading) return <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading usage…</div>;
  if (error) return <p className="text-sm text-destructive py-6 text-center">{error}</p>;
  return <>{children}</>;
}

function useUsage<T>(open: boolean, days: number, load: (d: number) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setLoading(true); setError('');
    load(days).then(setData).catch(e => setError(e instanceof Error ? e.message : 'Could not load usage')).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, days]);
  return { data, loading, error };
}

const STATUS_LABEL: Record<string, string> = { completed: 'Done', submitted: 'Rendering / not finished', failed: 'Failed · not counted' };

type MyUsage = UsageSummary & { recent: UsageRecent[]; image: ImageUsageSummary & { recent: ImageUsageRecent[] } };

export function MyUsageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useUsage<MyUsage>(open, days, videoApi.usageMine);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" />My usage</DialogTitle>
          <DialogDescription>What your videos and images cost.</DialogDescription>
        </DialogHeader>
        <PeriodPicker days={days} onChange={setDays} />
        <Loading loading={loading} error={error}>
          {data && (
            <div className="space-y-4">
              <Section icon={<Video className="w-4 h-4 text-primary" />} title="Videos · Higgsfield credits">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Credits used" value={fmt(data.credits)} />
                  <Stat label="Videos" value={String(data.videos)} hint={data.failed ? `+ ${data.failed} failed (not counted)` : undefined} />
                </div>
                <Breakdown title="By model" groups={data.by_model} {...creditBars} />
                <Breakdown title="By brand" groups={data.by_brand} {...creditBars} />
                {data.recent.length > 0 && (
                  <div className="divide-y divide-border">
                    {data.recent.slice(0, 8).map((r, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 text-xs">
                        <span className="min-w-0">
                          <span className="text-foreground">{r.brand || '—'} · {r.model}{r.duration ? ` · ${r.duration}s` : ''}</span>
                          <span className="block text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {STATUS_LABEL[r.status] || r.status}</span>
                        </span>
                        <span className={`shrink-0 ml-2 ${r.status === 'failed' ? 'line-through text-muted-foreground' : 'text-foreground font-medium'}`}>
                          {r.credits != null ? `${fmt(r.credits)} cr` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section icon={<Images className="w-4 h-4 text-primary" />} title="Images · US$ (ChatGPT & Gemini)">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Spent" value={usd(data.image.usd)} />
                  <Stat label="Images" value={String(data.image.images)} hint={`${data.image.actions} action${data.image.actions === 1 ? '' : 's'}`} />
                </div>
                <Breakdown title="ChatGPT vs Gemini" groups={data.image.by_provider} {...usdBars} />
                <Breakdown title="Generate · Edit · Variations" groups={data.image.by_provider_action} {...usdBars} />
                <Breakdown title="By brand" groups={data.image.by_brand} {...usdBars} />
                <ImageNotes s={data.image} />
                {data.image.recent.length > 0 && (
                  <div className="divide-y divide-border">
                    {data.image.recent.slice(0, 8).map((r, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 text-xs">
                        <span className="min-w-0">
                          <span className="text-foreground">{r.provider} · {r.action}{r.images > 1 ? ` ×${r.images}` : ''}{r.brand ? ` · ${r.brand}` : ''}</span>
                          <span className="block text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {r.model}</span>
                        </span>
                        <span className="shrink-0 ml-2 text-foreground font-medium">
                          {r.usd != null ? `${r.exact ? '' : '~'}${usd(r.usd)}` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          )}
        </Loading>
      </DialogContent>
    </Dialog>
  );
}

type TeamUsage = UsageSummary & { people: UsagePerson[]; image: ImageUsageSummary };

export function TeamUsageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useUsage<TeamUsage>(open, days, videoApi.usageTeam);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-primary" />Team usage</DialogTitle>
          <DialogDescription>Who spent what — videos (Higgsfield credits) and images (US$). Admins only.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker days={days} onChange={setDays} />
          <div className="ml-auto flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={videoApi.usageCsvUrl(days, 'videos')} download><Download className="w-4 h-4 mr-1" />Videos CSV</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={videoApi.usageCsvUrl(days, 'images')} download><Download className="w-4 h-4 mr-1" />Images CSV</a>
            </Button>
          </div>
        </div>
        <Loading loading={loading} error={error}>
          {data && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Video credits" value={fmt(data.credits)} hint={`${data.videos} video${data.videos === 1 ? '' : 's'}`} />
                <Stat label="Image spend" value={usd(data.image.usd)} hint={`${data.image.images} image${data.image.images === 1 ? '' : 's'}`} />
                <Stat label="ChatGPT" value={usd(data.image.by_provider.ChatGPT?.usd || 0)} />
                <Stat label="Gemini" value={usd(data.image.by_provider.Gemini?.usd || 0)} />
              </div>

              <div>
                <p className="text-xs font-semibold text-foreground mb-1.5">Per person</p>
                {data.people.length === 0 && <p className="text-xs text-muted-foreground">No activity in this period.</p>}
                <div className="divide-y divide-border rounded-xl border border-border">
                  {data.people.map(u => (
                    <div key={u.user.id} className="flex items-center gap-3 px-3 py-2">
                      {u.user.avatar_url
                        ? <img src={u.user.avatar_url} alt="" referrerPolicy="no-referrer" className="w-7 h-7 rounded-full" />
                        : <span className="w-7 h-7 rounded-full bg-primary/15" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate">
                          {u.user.name || u.user.email}
                          {u.user.name && <span className="text-muted-foreground font-normal"> · {u.user.email}</span>}
                          {u.user.deleted && <span className="text-[11px] text-muted-foreground"> (account removed)</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {[
                            ...Object.entries(u.by_model).map(([m, g]) => `${m}: ${g.videos}`),
                            ...Object.entries(u.image.by_provider_action).map(([k, g]) => `${k}: ${g.images}`),
                          ].join(' · ') || '—'}
                          {u.last_at ? ` · last ${new Date(u.last_at).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground">{fmt(u.credits)} cr</p>
                        <p className="text-[11px] text-muted-foreground">{usd(u.image.usd)} images</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Section icon={<Video className="w-4 h-4 text-primary" />} title="Videos · Higgsfield credits">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Breakdown title="By model" groups={data.by_model} {...creditBars} />
                  <Breakdown title="By brand" groups={data.by_brand} {...creditBars} />
                </div>
                <Breakdown title="Paid by Higgsfield account" groups={data.by_higgsfield_account} {...creditBars} />
              </Section>

              <Section icon={<Images className="w-4 h-4 text-primary" />} title="Images · US$">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Breakdown title="Generate · Edit · Variations" groups={data.image.by_provider_action} {...usdBars} />
                  <Breakdown title="By brand" groups={data.image.by_brand} {...usdBars} />
                </div>
                <ImageNotes s={data.image} />
              </Section>
            </div>
          )}
        </Loading>
      </DialogContent>
    </Dialog>
  );
}
