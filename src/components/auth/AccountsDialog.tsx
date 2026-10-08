/**
 * AccountsDialog — admins only (avatar menu → "Manage accounts").
 *
 *   • Create a username + password account. The app makes a temporary password,
 *     shown here ONCE, for the admin to pass on privately. On their first
 *     sign-in the person must choose their own.
 *   • Reset someone's password (forgotten, or locked after 5 wrong tries).
 *   • See everyone: how they sign in, whether Drive is connected, last seen.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, KeyRound, Loader2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { authApi, accountLabel, type Account } from '@/lib/auth-api';

/** "Maria Santos" → "maria.santos" (a starting suggestion; the admin can change it). */
export function suggestUsername(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
    .replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '').replace(/\.{2,}/g, '.').slice(0, 32);
}

function Badge({ children, tone = 'muted' }: { children: string; tone?: 'muted' | 'amber' | 'red' | 'primary' }) {
  const cls = {
    muted: 'bg-muted text-muted-foreground',
    amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    red: 'bg-destructive/15 text-destructive',
    primary: 'bg-primary/15 text-primary',
  }[tone];
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>{children}</span>;
}

/** The one-time temporary password, with a copy button. */
function TempPasswordNotice({ who, password, onDone }: { who: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(password); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { toast.error('Could not copy. Select the password and copy it by hand.'); }
  };
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
      <p className="text-sm font-medium text-foreground">Temporary password for {who}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 select-all rounded-md bg-background border border-border px-3 py-2 font-mono text-base tracking-wide text-foreground">{password}</code>
        <Button type="button" variant="outline" size="sm" onClick={copy} className="gap-1.5 shrink-0">
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Give it to them privately (not in a shared channel). <b>It won't be shown again.</b> When they sign in
        with it, they'll choose their own password.
      </p>
      <Button type="button" size="sm" variant="secondary" onClick={onDone}>Done</Button>
    </div>
  );
}

export function AccountsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // New-account form
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  // The temporary password to show once (after create or reset)
  const [issued, setIssued] = useState<{ who: string; password: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setLoadError('');
    authApi.adminUsers()
      .then(r => setAccounts(r.users))
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Could not load accounts'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (open) load(); else { setIssued(null); setConfirmReset(null); } }, [open, load]);

  const onName = (v: string) => { setName(v); if (!usernameEdited) setUsername(suggestUsername(v)); };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim() || creating) return;
    setCreating(true); setFormError('');
    try {
      const r = await authApi.adminCreateUser({ name, username, email: email.trim() || undefined });
      setIssued({ who: `@${r.user.username}`, password: r.temp_password });
      setName(''); setUsername(''); setUsernameEdited(false); setEmail('');
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the account');
    } finally {
      setCreating(false);
    }
  };

  const reset = async (a: Account) => {
    setResetting(a.id);
    try {
      const r = await authApi.adminResetPassword(a.id);
      setIssued({ who: `@${a.username}`, password: r.temp_password });
      setConfirmReset(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset the password');
    } finally {
      setResetting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-primary" />Manage accounts</DialogTitle>
          <DialogDescription>
            Make a username + password account for someone who doesn't sign in with Google. You'll get a temporary
            password to give them; they choose their own the first time they sign in.
          </DialogDescription>
        </DialogHeader>

        {issued ? (
          <TempPasswordNotice who={issued.who} password={issued.password} onDone={() => setIssued(null)} />
        ) : (
          <form onSubmit={create} className="rounded-xl border border-border p-4 space-y-3">
            <p className="text-sm font-medium text-foreground flex items-center gap-2"><UserPlus className="w-4 h-4 text-primary" />New account</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="acc-name">Name</Label>
                <Input id="acc-name" value={name} onChange={e => onName(e.target.value)} placeholder="Maria Santos" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acc-username">Username</Label>
                <Input id="acc-username" value={username} placeholder="maria.santos" autoComplete="off" autoCapitalize="none" spellCheck={false}
                  onChange={e => { setUsername(e.target.value); setUsernameEdited(true); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acc-email">Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input id="acc-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="maria@company.com" autoComplete="off" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Username: 3–32 letters, numbers, dots, dashes or underscores. If you add their email, they can sign in
              with either one, and “Sign in with Google” with that email opens the same account.
            </p>
            {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
            <Button type="submit" disabled={!name.trim() || !username.trim() || creating}>
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create account
            </Button>
          </form>
        )}

        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Everyone ({accounts.length})</p>
          {loading && <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" />Loading accounts…</div>}
          {!loading && loadError && (
            <div className="py-4 text-center space-y-2">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button size="sm" variant="outline" onClick={load}>Try again</Button>
            </div>
          )}
          {!loading && !loadError && accounts.map(a => (
            <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-2 rounded-lg hover:bg-muted/40">
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-sm font-medium text-foreground truncate">{a.name || accountLabel(a) || 'Unnamed'}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[a.username && `@${a.username}`, a.email].filter(Boolean).join(' · ')}
                  {a.last_seen_at ? ` · last seen ${new Date(a.last_seen_at).toLocaleDateString()}` : ' · never signed in'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {a.has_google && <Badge>Google</Badge>}
                {a.has_password && <Badge>Password</Badge>}
                {a.is_admin && <Badge tone="primary">Admin</Badge>}
                {a.must_change_password && <Badge tone="amber">Not signed in yet</Badge>}
                {a.locked && <Badge tone="red">Locked</Badge>}
                {!a.drive_connected && <Badge tone="amber">No Drive</Badge>}
                {a.status !== 'approved' && <Badge tone="red">{a.status === 'pending' ? 'Pending' : 'Blocked'}</Badge>}
              </div>
              {a.has_password && (
                confirmReset === a.id ? (
                  <span className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Their current password stops working.</span>
                    <Button size="sm" variant="destructive" className="h-7" disabled={resetting === a.id} onClick={() => reset(a)}>
                      {resetting === a.id && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}Reset
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmReset(null)}>Cancel</Button>
                  </span>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => { setIssued(null); setConfirmReset(a.id); }}>
                    <KeyRound className="w-3.5 h-3.5" />Reset password
                  </Button>
                )
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
