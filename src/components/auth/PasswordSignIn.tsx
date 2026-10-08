/**
 * Username + password sign-in (the alternative to "Sign in with Google").
 *
 *   <UsernameSignIn onSignedIn={refresh} />   the form on the sign-in screen; on a
 *                                             first sign-in it switches to "choose your password"
 *   <ChangePasswordDialog />                  "Change password" from the account menu
 *
 * Accounts are made by an admin (menu → Manage accounts), who gets a temporary
 * password to pass on. The server only signs someone in after they've replaced
 * it with their own (see api/_accounts.ts).
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { authApi } from '@/lib/auth-api';

const MIN_PASSWORD = 10; // same rule as the server (api/_password.ts)

/** A password box with a show/hide eye. */
function PasswordInput({ id, label, value, onChange, autoComplete, autoFocus }: {
  id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5 text-left">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete} autoFocus={autoFocus} className="pr-10" />
        <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

/**
 * New password + the same again (and the current one, when changing it from the menu).
 * changeToken = first sign-in (the temporary password was just typed, so we don't ask for it again).
 */
function NewPasswordForm({ changeToken, onDone, submitLabel }: {
  changeToken?: string; onDone: () => void; submitLabel: string;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const mismatch = again.length > 0 && next !== again;
  const ready = next.length >= MIN_PASSWORD && next === again && (changeToken || current);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError('');
    try {
      await authApi.changePassword(changeToken
        ? { change_token: changeToken, new_password: next }
        : { current_password: current, new_password: next });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {!changeToken && (
        <PasswordInput id="pw-current" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
      )}
      <div className="space-y-1">
        <PasswordInput id="pw-new" label="New password" value={next} onChange={setNext} autoComplete="new-password" autoFocus={!!changeToken} />
        <p className={`text-xs text-left ${tooShort ? 'text-destructive' : 'text-muted-foreground'}`}>
          At least {MIN_PASSWORD} characters. A short sentence is easy to remember.
        </p>
      </div>
      <div className="space-y-1">
        <PasswordInput id="pw-again" label="New password again" value={again} onChange={setAgain} autoComplete="new-password" />
        {mismatch && <p className="text-xs text-left text-destructive">The two new passwords don't match.</p>}
      </div>
      {error && <p className="text-sm text-destructive text-left" role="alert">{error}</p>}
      <Button type="submit" className="w-full h-11" disabled={!ready || busy}>
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{submitLabel}
      </Button>
    </form>
  );
}

/** The username form on the sign-in screen, plus the "choose your password" step on a first sign-in. */
export function UsernameSignIn({ onSignedIn, onUseGoogle, googleIcon }: {
  onSignedIn: () => void; onUseGoogle: () => void; googleIcon: ReactNode;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [firstTime, setFirstTime] = useState<{ token: string; name: string | null } | null>(null);

  if (firstTime) {
    return (
      <>
        <KeyRound className="w-6 h-6 text-primary mx-auto mb-2" />
        <p className="text-foreground font-semibold mb-1 text-balance">
          Welcome{firstTime.name ? `, ${firstTime.name.split(' ')[0]}` : ''}! Choose your password
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          You signed in with a temporary password. Pick your own to continue.
        </p>
        <NewPasswordForm changeToken={firstTime.token} submitLabel="Save password and continue"
          onDone={() => { toast.success('Password saved. You’re signed in.'); onSignedIn(); }} />
        <button type="button" onClick={() => { setFirstTime(null); setPassword(''); }}
          className="mt-4 text-sm text-muted-foreground hover:text-foreground">
          Back to sign-in
        </button>
      </>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || busy) return;
    setBusy(true); setError('');
    try {
      const r = await authApi.passwordLogin(username, password);
      if ('must_change_password' in r) setFirstTime({ token: r.change_token, name: r.name });
      else onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="text-muted-foreground mb-6">Sign in with the account an admin made for you.</p>
      <form onSubmit={submit} className="space-y-3 text-left">
        <div className="space-y-1.5">
          <Label htmlFor="signin-username">Username or email</Label>
          <Input id="signin-username" value={username} onChange={e => setUsername(e.target.value)}
            autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus />
        </div>
        <PasswordInput id="signin-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" className="w-full h-11" disabled={!username.trim() || !password || busy}>
          {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Sign in
        </Button>
        <p className="text-xs text-muted-foreground">No account or forgot your password? Ask an admin to set one up or reset it.</p>
      </form>
      <button type="button" onClick={onUseGoogle}
        className="mt-5 text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-2">
        {googleIcon}Sign in with Google instead
      </button>
    </>
  );
}

/** "Change password" from the account menu (username + password accounts). */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-primary" />Change password</DialogTitle>
          <DialogDescription>Your username stays the same.</DialogDescription>
        </DialogHeader>
        {open && (
          <NewPasswordForm submitLabel="Change password"
            onDone={() => { toast.success('Password changed.'); onOpenChange(false); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}
