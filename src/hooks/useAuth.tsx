/**
 * useAuth — who is signed in, available anywhere in the app.
 *
 *   const { user, driveConnected, signIn, signOut, refresh } = useAuth();
 *
 * <AuthProvider> (in App.tsx) asks the server once on load. The sign-in is a
 * cookie, so there's nothing to store in the browser here.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, type AppUser } from '@/lib/auth-api';
import { setImageStoreOwner } from '@/lib/imageStore';

interface AuthState {
  loading: boolean;
  user: AppUser | null;
  driveConnected: boolean;
  error: string;
  refresh: () => Promise<void>;
  signIn: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AppUser | null>(null);
  const [driveConnected, setDriveConnected] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me.user);
      setDriveConnected(!!me.drive_connected);
      // New images are cached in the browser under THIS person's name, so two
      // people sharing a computer don't see each other's library.
      setImageStoreOwner(me.user?.id || null);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check your sign-in');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signOut = useCallback(async () => {
    try { await authApi.signOut(); } finally {
      setUser(null); setDriveConnected(false); setImageStoreOwner(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ loading, user, driveConnected, error, refresh, signIn: authApi.signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
