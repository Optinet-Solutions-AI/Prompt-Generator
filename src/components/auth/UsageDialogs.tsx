/**
 * UsageDialogs — Higgsfield credit usage.
 *
 *   MyUsageDialog   — everyone: my credits, videos, per model/brand, recent renders
 *   TeamUsageDialog — admins: everyone's usage, per person, + CSV download
 *
 * Credits are Higgsfield's own price quote for each render, recorded when
 * Generate is clicked. Failed renders are shown but not counted.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { BarChart3, Download, Loader2, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { videoApi, type UsageGroup, type UsagePerson, type UsageRecent, type UsageSummary } from '@/lib/video-api';

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 3650, label: 'All time' },
];

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

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

function Breakdown({ title, groups }: { title: string; groups: Record<string, UsageGroup> }) {
  const entries = Object.entries(groups).sort((a, b) => b[1].credits - a[1].credits);
  const max = Math.max(1, ...entries.map(([, g]) => g.credits));
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-foreground mb-1.5">{title}</p>
      <div className="space-y-1.5">
        {entries.map(([name, g]) => (
          <div key={name} className="text-xs">
            <div className="flex justify-between">
              <span className="text-foreground">{name}</span>
              <span className="text-muted-foreground">{fmt(g.credits)} credits · {g.videos} video{g.videos === 1 ? '' : 's'}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted mt-0.5">
              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(g.credits / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
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

export function MyUsageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useUsage<UsageSummary & { recent: UsageRecent[] }>(open, days, videoApi.usageMine);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" />My Higgsfield usage</DialogTitle>
          <DialogDescription>Credits your videos used from the team Higgsfield plan.</DialogDescription>
        </DialogHeader>
        <PeriodPicker days={days} onChange={setDays} />
        <Loading loading={loading} error={error}>
          {data && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Credits used" value={fmt(data.credits)} />
                <Stat label="Videos" value={String(data.videos)} hint={data.failed ? `+ ${data.failed} failed (not counted)` : undefined} />
              </div>
              <Breakdown title="By model" groups={data.by_model} />
              <Breakdown title="By brand" groups={data.by_brand} />
              <div>
                <p className="text-xs font-semibold text-foreground mb-1.5">Recent videos</p>
                {data.recent.length === 0 && <p className="text-xs text-muted-foreground">No videos in this period.</p>}
                <div className="divide-y divide-border">
                  {data.recent.map((r, i) => (
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
              </div>
            </div>
          )}
        </Loading>
      </DialogContent>
    </Dialog>
  );
}

export function TeamUsageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useUsage<UsageSummary & { people: UsagePerson[] }>(open, days, videoApi.usageTeam);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-primary" />Team Higgsfield usage</DialogTitle>
          <DialogDescription>Who used how many credits from the team Higgsfield plan. Admins only.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker days={days} onChange={setDays} />
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <a href={videoApi.usageCsvUrl(days)} download><Download className="w-4 h-4 mr-1" />Download CSV</a>
          </Button>
        </div>
        <Loading loading={loading} error={error}>
          {data && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Credits used" value={fmt(data.credits)} />
                <Stat label="Videos" value={String(data.videos)} hint={data.failed ? `+ ${data.failed} failed` : undefined} />
                <Stat label="People" value={String(data.people.length)} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground mb-1.5">Per person</p>
                {data.people.length === 0 && <p className="text-xs text-muted-foreground">No videos in this period.</p>}
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
                          {Object.entries(u.by_model).map(([m, g]) => `${m}: ${g.videos}`).join(' · ')}
                          {u.last_at ? ` · last ${new Date(u.last_at).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{fmt(u.credits)} cr</p>
                        <p className="text-[11px] text-muted-foreground">{u.videos} video{u.videos === 1 ? '' : 's'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Breakdown title="By model" groups={data.by_model} />
                <Breakdown title="By brand" groups={data.by_brand} />
              </div>
              <Breakdown title="Paid by Higgsfield account" groups={data.by_higgsfield_account} />
            </div>
          )}
        </Loading>
      </DialogContent>
    </Dialog>
  );
}
