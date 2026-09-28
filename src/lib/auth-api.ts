/**
 * auth-api.ts — browser client for api/auth.ts (Sign in with Google, sharing).
 * The sign-in itself is a cookie the server sets, so these calls need no token.
 */

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  status: 'pending' | 'approved' | 'blocked';
  is_admin: boolean;
}

/** Another app user, as shown in the share picker / "shared with me". */
export interface Person {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

async function call<T>(action: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/auth?action=${action}`, body !== undefined
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error((data.error as string) || `Sign-in service error (${res.status})`);
  return data as T;
}

export const authApi = {
  me: () => call<{ user: AppUser | null; drive_connected?: boolean }>('me'),
  /** Full-page redirect to Google's sign-in screen (also (re)connects Drive). */
  signIn: () => { window.location.href = '/api/auth?action=google-start'; },
  signOut: () => call('logout', {}),
  users: () => call<{ users: Person[] }>('users'),
  shares: () => call<{ sharing_with: Person[]; shared_with_me: Person[] }>('shares'),
  share: (viewerId: string) => call('share', { viewer_id: viewerId }),
  unshare: (viewerId: string) => call('unshare', { viewer_id: viewerId }),
};

/** "Maria Santos" → "Maria"; falls back to the email's name part. */
export function firstName(p: { name: string | null; email: string }): string {
  return (p.name || p.email.split('@')[0]).split(' ')[0];
}
