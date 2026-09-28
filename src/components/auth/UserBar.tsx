/**
 * UserBar — the strip at the top right of every page:
 *   [who's online right now: avatars]  [my avatar ▾ → Drive status · Share my library · Sign out]
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, HardDrive, Loader2, LogOut, RefreshCw, Search, Share2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useOnlineUsers, type OnlineUser } from '@/hooks/useOnlineUsers';
import { authApi, type Person } from '@/lib/auth-api';

function Avatar({ src, name, size = 32, ring = false }: { src: string | null; name: string; size?: number; ring?: boolean }) {
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const cls = `rounded-full shrink-0 ${ring ? 'ring-2 ring-background' : ''}`;
  return src
    ? <img src={src} alt={name} referrerPolicy="no-referrer" className={cls} style={{ width: size, height: size }} />
    : (
      <span className={`${cls} bg-primary/15 text-primary font-semibold inline-flex items-center justify-center`}
        style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</span>
    );
}

function OnlineStack({ online, meId }: { online: OnlineUser[]; meId: string }) {
  const others = online.filter(u => u.id !== meId);
  if (others.length === 0) return null;
  const shown = others.slice(0, 5);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-muted/60" aria-label="Who's online">
          <span className="flex -space-x-2">
            {shown.map(u => <span key={u.id} title={`${u.name} · ${u.activity}`}><Avatar src={u.avatar} name={u.name} size={28} ring /></span>)}
          </span>
          {others.length > shown.length && <span className="text-xs text-muted-foreground">+{others.length - shown.length}</span>}
          <span className="hidden sm:inline text-xs text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />{others.length} online
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Using the app right now</DropdownMenuLabel>
        {others.map(u => (
          <div key={u.id} className="flex items-center gap-2 px-2 py-1.5">
            <Avatar src={u.avatar} name={u.name} size={26} />
            <div className="min-w-0">
              <p className="text-sm text-foreground truncate">{u.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{u.activity}</p>
            </div>
            <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500" />
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Share my library" — pick colleagues who may see my images and videos. */
function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [sharing, setSharing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([authApi.users(), authApi.shares()])
      .then(([u, s]) => { setPeople(u.users); setSharing(new Set(s.sharing_with.map(p => p.id))); })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Could not load people'))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? people.filter(p => `${p.name} ${p.email}`.toLowerCase().includes(q)) : people;
  }, [people, query]);

  const toggle = async (p: Person, on: boolean) => {
    setBusy(p.id);
    try {
      if (on) await authApi.share(p.id); else await authApi.unshare(p.id);
      setSharing(prev => { const n = new Set(prev); if (on) n.add(p.id); else n.delete(p.id); return n; });
      toast.success(on ? `${p.name || p.email} can now see your library` : `Stopped sharing with ${p.name || p.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update sharing');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Share2 className="w-5 h-5 text-primary" />Share my library</DialogTitle>
          <DialogDescription>
            People you switch on can see, play and download your images and videos (they can't delete anything).
            They'll find it under “Shared with me” in their libraries.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or email" className="pl-9" />
        </div>
        <div className="max-h-80 overflow-y-auto -mx-1 px-1 space-y-1">
          {loading && <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" />Loading people…</div>}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {people.length === 0 ? 'No one else has signed in to the app yet.' : 'No one matches that search.'}
            </p>
          )}
          {!loading && filtered.map(p => (
            <label key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
              <Avatar src={p.avatar_url} name={p.name || p.email} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground truncate">{p.name || p.email}</span>
                <span className="block text-xs text-muted-foreground truncate">{p.email}</span>
              </span>
              {busy === p.id
                ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                : <Switch checked={sharing.has(p.id)} onCheckedChange={v => toggle(p, v)} />}
            </label>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function UserBar() {
  const { user, driveConnected, signIn, signOut } = useAuth();
  const online = useOnlineUsers(user);
  const [shareOpen, setShareOpen] = useState(false);
  if (!user) return null;
  const name = user.name || user.email;

  return (
    <div className="relative z-50 flex items-center justify-end gap-2 px-3 sm:px-5 pt-3">
      <OnlineStack online={online} meId={user.id} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="relative rounded-full hover:opacity-90" aria-label="Your account">
            <Avatar src={user.avatar_url} name={name} size={34} />
            {!driveConnected && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-background" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar src={user.avatar_url} name={name} size={36} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
          <DropdownMenuSeparator />
          {driveConnected ? (
            <>
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <HardDrive className="w-4 h-4 text-primary" />
                <span>Google Drive connected</span>
                <Check className="w-4 h-4 text-emerald-500 ml-auto" />
              </div>
              <DropdownMenuItem asChild>
                <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />Open my Google Drive
                  <span className="ml-auto text-[11px] text-muted-foreground">“Prompt Generator”</span>
                </a>
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onClick={signIn} className="text-amber-700">
              <RefreshCw className="w-4 h-4 mr-2" />Reconnect Google Drive
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setShareOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />Share my library…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" />Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}
