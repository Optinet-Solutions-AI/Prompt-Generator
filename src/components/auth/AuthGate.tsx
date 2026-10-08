/**
 * AuthGate — nothing in the app shows until the person has signed in (with
 * Google, or with a username + password an admin made for them) and been approved.
 *
 *   not signed in → sign-in screen: "Sign in with Google" or "Sign in with a username"
 *   pending       → "waiting for approval" screen
 *   blocked       → "access turned off" screen
 *   approved      → the app, with the user bar (who's online + menu) top-right,
 *                   and a "Connect Google Drive" bar for username accounts without Drive
 *
 * Company accounts are approved automatically; others are approved by an admin
 * in Supabase → profiles → status (see api/auth.ts). Username accounts are
 * created already approved (avatar menu → Manage accounts).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Clock, HardDrive, Loader2, ShieldOff, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { authApi, accountLabel } from '@/lib/auth-api';
import { UserBar } from './UserBar';
import { UsernameSignIn } from './PasswordSignIn';

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-lg p-8 text-center">{children}</div>
    </div>
  );
}

function SignInScreen({ onSignIn, onSignedIn, error }: { onSignIn: () => void; onSignedIn: () => void; error: string }) {
  const [withUsername, setWithUsername] = useState(false);
  return (
    <Screen>
      <img src="/logo.svg" alt="AI Prompt Generator" className="mx-auto w-16 h-16 mb-5 drop-shadow-[0_10px_24px_rgba(99,102,241,0.35)]" />
      <h1 className="text-2xl font-bold text-foreground mb-2">AI Prompt Generator</h1>
      {withUsername ? (
        <UsernameSignIn onSignedIn={onSignedIn} googleIcon={<GoogleG />} onUseGoogle={() => setWithUsername(false)} />
      ) : (
        <>
          <p className="text-muted-foreground mb-6">Sign in to start creating.</p>
          <Button onClick={onSignIn} size="lg" variant="outline" className="w-full gap-3 h-12 text-base">
            <GoogleG />Sign in with Google
          </Button>
          <div className="flex items-center gap-3 my-4 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
          </div>
          <Button onClick={() => setWithUsername(true)} size="lg" variant="ghost" className="w-full gap-3 h-11 text-base">
            <UserRound className="w-5 h-5" />Sign in with a username
          </Button>
          <p className="text-xs text-muted-foreground mt-5 leading-relaxed">
            Your images and videos are saved to <b>your own Google Drive</b>, in a folder called
            “Prompt Generator”. The app can only see the files it creates — nothing else in your Drive.
          </p>
        </>
      )}
      {error && <p className="text-xs text-destructive mt-4">{error}</p>}
    </Screen>
  );
}

/** Username accounts don't come with Google Drive; until it's connected nothing can be saved. */
function ConnectDriveBar() {
  return (
    <div className="px-3 sm:px-5 pt-2">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
        <HardDrive className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-sm text-foreground flex-1 min-w-[12rem]">
          Connect your Google Drive so your images and videos can be saved.
          <span className="text-muted-foreground"> The app only sees the files it creates.</span>
        </p>
        <Button size="sm" variant="outline" className="gap-2 bg-background" onClick={authApi.connectDrive}>
          <GoogleG />Connect Google Drive
        </Button>
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, user, driveConnected, error, signIn, signOut, refresh } = useAuth();

  // Coming back from Google (/?auth=…): show the outcome once and tidy the URL.
  useEffect(() => {
    const auth = new URLSearchParams(window.location.search).get('auth');
    if (!auth) return;
    if (auth === 'no-drive') {
      toast.warning('Signed in — but Google Drive access was not allowed, so nothing can be saved. Use "Reconnect Google Drive" in your menu (top right) and tick the Drive box.');
    } else if (auth === 'drive-connected') {
      toast.success('Google Drive connected. Your images and videos will be saved there.');
    } else if (auth.startsWith('error:')) {
      toast.error(auth.slice(6));
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('auth');
    window.history.replaceState({}, '', url.pathname + url.search);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />Loading…
      </div>
    );
  }

  if (!user) return <SignInScreen onSignIn={signIn} onSignedIn={refresh} error={error} />;

  if (user.status === 'pending') {
    return (
      <Screen>
        <Clock className="w-10 h-10 text-primary mx-auto mb-4" />
        <h1 className="text-xl font-bold text-foreground mb-2">Thanks, {user.name?.split(' ')[0] || 'there'}!</h1>
        <p className="text-muted-foreground mb-1">Your access is waiting for approval.</p>
        <p className="text-sm text-muted-foreground mb-6">Signed in as {accountLabel(user)}. We'll let you in as soon as an admin approves your account.</p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={refresh}>Check again</Button>
          <Button variant="ghost" onClick={signOut}>Use a different account</Button>
        </div>
      </Screen>
    );
  }

  if (user.status === 'blocked') {
    return (
      <Screen>
        <ShieldOff className="w-10 h-10 text-destructive mx-auto mb-4" />
        <h1 className="text-xl font-bold text-foreground mb-2">Access turned off</h1>
        <p className="text-muted-foreground mb-6">Your access to this app ({accountLabel(user)}) has been turned off. Contact the app admin if this is a mistake.</p>
        <Button variant="ghost" onClick={signOut}>Sign out</Button>
      </Screen>
    );
  }

  return (
    <>
      <UserBar />
      {user.has_google === false && !driveConnected && <ConnectDriveBar />}
      {children}
    </>
  );
}
