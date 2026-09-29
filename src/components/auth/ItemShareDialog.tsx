/**
 * ItemShareDialog — share ONE image or video with specific colleagues.
 * They'll find it in their library under "Shared with me → Individual items".
 * (Sharing a WHOLE library is in the account menu → "Share my library".)
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { authApi, type Person } from '@/lib/auth-api';

function Avatar({ p }: { p: Person }) {
  const name = p.name || p.email;
  return p.avatar_url
    ? <img src={p.avatar_url} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full shrink-0" />
    : <span className="w-8 h-8 rounded-full shrink-0 bg-primary/15 text-primary text-xs font-semibold inline-flex items-center justify-center">{name.slice(0, 2).toUpperCase()}</span>;
}

export function ItemShareDialog({ open, onOpenChange, kind, fileId, previewUrl, title }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: 'image' | 'video';
  /** Google Drive file id of the item */
  fileId: string;
  previewUrl?: string;
  title?: string;
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [sharing, setSharing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Load everyone + who already has this item, each time the dialog opens.
  useEffect(() => {
    if (!open || !fileId) return;
    setLoading(true);
    Promise.all([authApi.users(), authApi.itemViewers(kind, fileId)])
      .then(([u, v]) => { setPeople(u.users); setSharing(new Set(v.viewers.map(p => p.id))); })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Could not load people'))
      .finally(() => setLoading(false));
  }, [open, kind, fileId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? people.filter(p => `${p.name || ''} ${p.email}`.toLowerCase().includes(q)) : people;
  }, [people, query]);

  const toggle = async (p: Person, on: boolean) => {
    setBusy(p.id);
    try {
      if (on) await authApi.itemShare(kind, fileId, p.id);
      else await authApi.itemUnshare(kind, fileId, p.id);
      setSharing(prev => { const n = new Set(prev); if (on) n.add(p.id); else n.delete(p.id); return n; });
      toast.success(on ? `Shared this ${kind} with ${p.name || p.email}` : `Stopped sharing with ${p.name || p.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update sharing');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md z-[1300]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Share2 className="w-5 h-5 text-primary" />Share this {kind}</DialogTitle>
          <DialogDescription>
            Only this {kind} — not your whole library. People you switch on can view and download it.
            They’ll find it under “Shared with me → Individual items”.
          </DialogDescription>
        </DialogHeader>
        {previewUrl && (
          <div className="flex items-center gap-3 rounded-lg border border-border p-2">
            {kind === 'image'
              ? <img src={previewUrl} alt="" className="h-14 w-14 rounded object-cover" />
              : <video src={previewUrl} muted preload="metadata" className="h-14 w-10 rounded object-cover bg-black" />}
            <p className="text-xs text-muted-foreground truncate">{title || `This ${kind}`}</p>
          </div>
        )}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or email" className="pl-9" />
        </div>
        <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
          {loading && (
            <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />Loading people…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {people.length === 0 ? 'No one else has signed in to the app yet.' : 'No one matches that search.'}
            </p>
          )}
          {!loading && filtered.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
              <Avatar p={p} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground truncate">{p.name || p.email}</span>
                <span className="block text-xs text-muted-foreground truncate">{p.email}</span>
              </span>
              {busy === p.id
                ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                : <Switch checked={sharing.has(p.id)} onCheckedChange={v => toggle(p, v)} aria-label={`Share with ${p.name || p.email}`} />}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
