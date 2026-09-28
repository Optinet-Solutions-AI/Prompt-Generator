/**
 * AuthGate — nothing in the app shows until the person has signed in with
 * Google and been approved.
 *
 *   not signed in → "Sign in with Google" screen
 *   pending       → "waiting for approval" screen
 *   blocked       → "access turned off" screen
 *   approved      → the app, with the user bar (who's online + menu) top-right
 *
 * Company accounts are approved automatically; others are approved by an admin
 * in Supabase → profiles → status (see api/auth.ts).
 */
import { useEffect, type ReactNode } from 'react';
import { Clock, Loader2, ShieldOff, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { UserBar } from './UserBar';

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

function SignInScreen({ onSignIn, error }: { onSignIn: () => void; error: string }) {
  return (
    <Screen>
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl gradient-primary shadow-glow mb-5">
        <Sparkles className="w-7 h-7 text-primary-foreground" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">AI Prompt Generator</h1>
      <p className="text-muted-foreground mb-6">Sign in with your Google account to start creating.</p>
      <Button onClick={onSignIn} size="lg" variant="outline" className="w-full gap-3 h-12 text-base">
        <GoogleG />Sign in with Google
      </Button>
      <p className="text-xs text-muted-foreground mt-5 leading-relaxed">
        Your images and videos are saved to <b>your own Google Drive</b>, in a folder called
        “Prompt Generator”. The app can only see the files it creates — nothing else in your Drive.
      </p>
      {error && <p className="text-xs text-destructive mt-4">{error}</p>}
    </Screen>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, user, error, signIn, signOut, refresh } = useAuth();

  // Coming back from Google (/?auth=…): show the outcome once and tidy the URL.
  useEffect(() => {
    const auth = new URLSearchParams(window.location.search).get('auth');
    if (!auth) return;
    if (auth === 'no-drive') {
      toast.warning('Signed in — but Google Drive access was not allowed, so nothing can be saved. Use "Reconnect Google Drive" in your menu (top right) and tick the Drive box.');
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

  if (!user) return <SignInScreen onSignIn={signIn} error={error} />;

  if (user.status === 'pending') {
    return (
      <Screen>
        <Clock className="w-10 h-10 text-primary mx-auto mb-4" />
        <h1 className="text-xl font-bold text-foreground mb-2">Thanks, {user.name?.split(' ')[0] || 'there'}!</h1>
        <p className="text-muted-foreground mb-1">Your access is waiting for approval.</p>
        <p className="text-sm text-muted-foreground mb-6">Signed in as {user.email}. We'll let you in as soon as an admin approves your account.</p>
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
        <p className="text-muted-foreground mb-6">Your access to this app ({user.email}) has been turned off. Contact the app admin if this is a mistake.</p>
        <Button variant="ghost" onClick={signOut}>Sign out</Button>
      </Screen>
    );
  }

  return (
    <>
      <UserBar />
      {children}
    </>
  );
}
