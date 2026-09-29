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
 *
 * Layout: headline numbers on top → Videos / Images tabs → breakdown bars
 * (one series each, so one colour) → recent activity as a table.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { BarChart3, CheckCircle2, Clock, Download, Images, Loader2, Users, Video, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  videoApi, type ImageUsageRecent, type ImageUsageSummary, type UsagePerson, type UsageRecent, type UsageSummary,
} from '@/lib/video-api';

// ── formatting ────────────────────────────────────────────────────────────

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 3650, label: 'All time' },
];

const credits = (n: number) => (Math.round(n * 10) / 10).toLocaleString();
/** $0.039 · $1.25 · $12.40 — cents matter for images. */
const usd = (n: number) => `$${n > 0 && n < 1 ? n.toFixed(3) : n.toFixed(2)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// ── building blocks ───────────────────────────────────────────────────────

function PeriodPicker({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div className="inline-flex gap-0.5 p-1 rounded-lg bg-muted/70" role="radiogroup" aria-label="Period">
      {PERIODS.map(p => (
        <button key={p.days} type="button" role="radio" aria-checked={days === p.days} onClick={() => onChange(p.days)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${days === p.days ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** Headline number tile. */
function Kpi({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{icon}{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground leading-none">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

interface BarItem { name: string; value: number; display: string; detail: string }

/**
 * Horizontal bar list — one series, one colour. Label left, value right
 * (direct labels in text colour), thin bar on a quiet track; hover shows
 * the exact figure.
 */
function BarList({ title, items, empty = 'Nothing in this period.' }: { title: string; items: BarItem[]; empty?: string }) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const max = Math.max(1e-9, ...sorted.map(i => i.value));
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold text-foreground mb-3">{title}</p>
      {sorted.length === 0 && <p className="text-xs text-muted-foreground">{empty}</p>}
      <ul className="space-y-2.5">
        {sorted.map(i => (
          <li key={i.name} className="group relative" title={`${i.name}: ${i.detail}`}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-foreground">{i.name}</span>
              <span className="shrink-0 tabular-nums font-medium text-foreground">{i.display}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div className="h-1.5 rounded-full bg-primary transition-[width] group-hover:bg-primary/80"
                style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} />
            </div>
            <span className="pointer-events-none absolute right-0 -top-7 z-10 hidden whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] text-background shadow group-hover:block">
              {i.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const creditItems = (g: Record<string, { videos: number; credits: number }>): BarItem[] =>
  Object.entries(g).map(([name, v]) => ({ name, value: v.credits, display: `${credits(v.credits)} cr`, detail: `${credits(v.credits)} credits · ${plural(v.videos, 'video')}` }));
const usdItems = (g: Record<string, { images: number; usd: number }>): BarItem[] =>
  Object.entries(g).map(([name, v]) => ({ name, value: v.usd, display: usd(v.usd), detail: `${usd(v.usd)} · ${plural(v.images, 'image')}` }));

/** Status with icon + label — never colour alone. */
function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') return <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" />Done</span>;
  if (status === 'failed') return <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400"><XCircle className="w-3.5 h-3.5" />Failed · not counted</span>;
  return <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="w-3.5 h-3.5" />Rendering</span>;
}

function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur text-muted-foreground">
            <tr>{head.map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i === head.length - 1 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">{children}</tbody>
        </table>
        {empty && <p className="px-3 py-6 text-center text-xs text-muted-foreground bg-card">Nothing in this period.</p>}
      </div>
    </div>
  );
}

function ImageNote({ s }: { s: ImageUsageSummary }) {
  if (!s.estimated_usd && !s.unpriced) return null;
  return (
    <p className="text-[11px] text-muted-foreground">
      {s.estimated_usd > 0 && <>~ {usd(s.estimated_usd)} of this is an estimate (ChatGPT edits/variations). </>}
      {s.unpriced > 0 && <>{plural(s.unpriced, 'action')} had no price info.</>}
    </p>
  );
}

function Loading({ loading, error, children }: { loading: boolean; error: string; children: ReactNode }) {
  if (loading) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading usage…</div>;
  if (error) return <p className="text-sm text-destructive py-10 text-center">{error}</p>;
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

function TabBar() {
  return (
    <TabsList className="grid w-full grid-cols-2 sm:w-72">
      <TabsTrigger value="videos" className="gap-1.5"><Video className="w-3.5 h-3.5" />Videos</TabsTrigger>
      <TabsTrigger value="images" className="gap-1.5"><Images className="w-3.5 h-3.5" />Images</TabsTrigger>
    </TabsList>
  );
}

// ── My usage ──────────────────────────────────────────────────────────────

type MyUsage = UsageSummary & { recent: UsageRecent[]; image: ImageUsageSummary & { recent: ImageUsageRecent[] } };

export function MyUsageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useUsage<MyUsage>(open, days, videoApi.usageMine);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border text-left">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
            <div>
              <DialogTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" />My usage</DialogTitle>
              <DialogDescription className="mt-1">What your videos and images cost.</DialogDescription>
            </div>
            <PeriodPicker days={days} onChange={setDays} />
          </div>
        </DialogHeader>
        <div className="p-6 space-y-5">
          <Loading loading={loading} error={error}>
            {data && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Kpi icon={<Video className="w-3.5 h-3.5" />} label="Video credits" value={credits(data.credits)} sub="Higgsfield" />
                  <Kpi icon={<Video className="w-3.5 h-3.5" />} label="Videos" value={String(data.videos)} sub={data.failed ? `+ ${data.failed} failed` : 'made'} />
                  <Kpi icon={<Images className="w-3.5 h-3.5" />} label="Image spend" value={usd(data.image.usd)} sub="ChatGPT + Gemini" />
                  <Kpi icon={<Images className="w-3.5 h-3.5" />} label="Images" value={String(data.image.images)} sub={plural(data.image.actions, 'action')} />
                </div>

                <Tabs defaultValue="videos" className="space-y-4">
                  <TabBar />
                  <TabsContent value="videos" className="space-y-4 mt-0">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <BarList title="By model" items={creditItems(data.by_model)} />
                      <BarList title="By brand" items={creditItems(data.by_brand)} />
                    </div>
                    <Table head={['When', 'Brand', 'Model', 'Length', 'Status', 'Credits']} empty={data.recent.length === 0}>
                      {data.recent.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{when(r.created_at)}</td>
                          <td className="px-3 py-2 text-foreground">{r.brand || '—'}</td>
                          <td className="px-3 py-2 text-foreground">{r.model}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.duration ? `${r.duration}s` : '—'}</td>
                          <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                          <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.status === 'failed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                            {r.credits != null ? credits(r.credits) : '—'}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </TabsContent>

                  <TabsContent value="images" className="space-y-4 mt-0">
                    <div className="grid grid-cols-2 gap-3">
                      <Kpi icon={<Images className="w-3.5 h-3.5" />} label="ChatGPT" value={usd(data.image.by_provider.ChatGPT?.usd || 0)} sub={plural(data.image.by_provider.ChatGPT?.images || 0, 'image')} />
                      <Kpi icon={<Images className="w-3.5 h-3.5" />} label="Gemini" value={usd(data.image.by_provider.Gemini?.usd || 0)} sub={plural(data.image.by_provider.Gemini?.images || 0, 'image')} />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <BarList title="Generate · Edit · Variations" items={usdItems(data.image.by_provider_action)} />
                      <BarList title="By brand" items={usdItems(data.image.by_brand)} />
                    </div>
                    <ImageNote s={data.image} />
                    <Table head={['When', 'Engine', 'Action', 'Brand', 'Images', 'Cost']} empty={data.image.recent.length === 0}>
                      {data.image.recent.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{when(r.created_at)}</td>
                          <td className="px-3 py-2 text-foreground">{r.provider}</td>
                          <td className="px-3 py-2 text-foreground">{r.action}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.brand || '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground tabular-nums">{r.images}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground" title={r.exact ? 'Exact' : 'Estimate'}>
                            {r.usd != null ? `${r.exact ? '' : '~'}${usd(r.usd)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </Loading>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Team usage (admins) ───────────────────────────────────────────────────

type TeamUsage = UsageSummary & { people: UsagePerson[]; image: ImageUsageSummary };

export function TeamUsageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useUsage<TeamUsage>(open, days, videoApi.usageTeam);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 gap-0" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border text-left">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
            <div>
              <DialogTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-primary" />Team usage</DialogTitle>
              <DialogDescription className="mt-1">Who spent what — videos (Higgsfield credits) and images (US$). Admins only.</DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PeriodPicker days={days} onChange={setDays} />
              <Button asChild variant="outline" size="sm"><a href={videoApi.usageCsvUrl(days, 'videos')} download><Download className="w-4 h-4 mr-1" />Videos CSV</a></Button>
              <Button asChild variant="outline" size="sm"><a href={videoApi.usageCsvUrl(days, 'images')} download><Download className="w-4 h-4 mr-1" />Images CSV</a></Button>
            </div>
          </div>
        </DialogHeader>
        <div className="p-6 space-y-5">
          <Loading loading={loading} error={error}>
            {data && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Kpi icon={<Video className="w-3.5 h-3.5" />} label="Video credits" value={credits(data.credits)} sub={plural(data.videos, 'video')} />
                  <Kpi icon={<Images className="w-3.5 h-3.5" />} label="Image spend" value={usd(data.image.usd)} sub={plural(data.image.images, 'image')} />
                  <Kpi icon={<Images className="w-3.5 h-3.5" />} label="ChatGPT" value={usd(data.image.by_provider.ChatGPT?.usd || 0)} sub={plural(data.image.by_provider.ChatGPT?.images || 0, 'image')} />
                  <Kpi icon={<Images className="w-3.5 h-3.5" />} label="Gemini" value={usd(data.image.by_provider.Gemini?.usd || 0)} sub={plural(data.image.by_provider.Gemini?.images || 0, 'image')} />
                </div>

                <div>
                  <p className="text-xs font-semibold text-foreground mb-2">Per person</p>
                  <Table head={['Person', 'Videos', 'Credits', 'Images', 'ChatGPT', 'Gemini', 'Image $']} empty={data.people.length === 0}>
                    {data.people.map(u => (
                      <tr key={u.user.id}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {u.user.avatar_url
                              ? <img src={u.user.avatar_url} alt="" referrerPolicy="no-referrer" className="w-6 h-6 rounded-full shrink-0" />
                              : <span className="w-6 h-6 rounded-full bg-primary/15 shrink-0" />}
                            <div className="min-w-0">
                              <p className="text-foreground truncate">{u.user.name || u.user.email}{u.user.deleted && <span className="text-muted-foreground"> (removed)</span>}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{u.user.email}{u.last_at ? ` · last ${new Date(u.last_at).toLocaleDateString()}` : ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{u.videos}</td>
                        <td className="px-3 py-2 tabular-nums font-medium text-foreground">{credits(u.credits)}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{u.image.images}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{usd(u.image.by_provider.ChatGPT?.usd || 0)}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{usd(u.image.by_provider.Gemini?.usd || 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{usd(u.image.usd)}</td>
                      </tr>
                    ))}
                  </Table>
                </div>

                <Tabs defaultValue="videos" className="space-y-4">
                  <TabBar />
                  <TabsContent value="videos" className="mt-0">
                    <div className="grid sm:grid-cols-3 gap-3">
                      <BarList title="By model" items={creditItems(data.by_model)} />
                      <BarList title="By brand" items={creditItems(data.by_brand)} />
                      <BarList title="Paid by Higgsfield account" items={creditItems(data.by_higgsfield_account)} />
                    </div>
                  </TabsContent>
                  <TabsContent value="images" className="space-y-3 mt-0">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <BarList title="Generate · Edit · Variations" items={usdItems(data.image.by_provider_action)} />
                      <BarList title="By brand" items={usdItems(data.image.by_brand)} />
                    </div>
                    <ImageNote s={data.image} />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </Loading>
        </div>
      </DialogContent>
    </Dialog>
  );
}
