/**
 * auth-api.ts — browser client for api/auth.ts (Sign in with Google, sharing).
 * The sign-in itself is a cookie the server sets, so these calls need no token.
 */

export interface AppUser {
  id: string;
  /** null for some username + password accounts */
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  status: 'pending' | 'approved' | 'blocked';
  is_admin: boolean;
  /** set for username + password accounts */
  username?: string | null;
  /** signs in with Google → "Reconnect Google Drive" goes through Google sign-in */
  has_google?: boolean;
  /** has a password → can change it from the menu */
  has_password?: boolean;
}

/** Another app user, as shown in the share picker / "shared with me". */
export interface Person {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
}

/** One row of the admin "Manage accounts" list. */
export interface Account {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  status: 'pending' | 'approved' | 'blocked';
  is_admin: boolean;
  has_google: boolean;
  has_password: boolean;
  must_change_password: boolean;
  locked: boolean;
  drive_connected: boolean;
  last_seen_at: string | null;
}

/** What a username + password sign-in returns. */
export type PasswordLoginResult =
  | { success: true }
  | { must_change_password: true; change_token: string; name: string | null };

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
  /** Full-page redirect to Google to ONLY connect Drive to the signed-in (username + password) account. */
  connectDrive: () => { window.location.href = '/api/auth?action=google-start&link=drive'; },
  signOut: () => call('logout', {}),
  // Username + password
  passwordLogin: (username: string, password: string) => call<PasswordLoginResult>('password-login', { username, password }),
  /** First sign-in: pass the change_token from passwordLogin. Later, from the menu: pass the current password. */
  changePassword: (args: { change_token: string; new_password: string } | { current_password: string; new_password: string }) =>
    call<{ success: true }>('change-password', args),
  // Admins: Manage accounts
  adminUsers: () => call<{ users: Account[] }>('admin-users'),
  adminCreateUser: (args: { username: string; name: string; email?: string }) =>
    call<{ user: Account; temp_password: string }>('admin-create-user', args),
  adminResetPassword: (id: string) => call<{ temp_password: string }>('admin-reset-password', { id }),
  users: () => call<{ users: Person[] }>('users'),
  // `everyone` comes only for admins: every person with a library, which admins may open.
  shares: () => call<{ sharing_with: Person[]; shared_with_me: Person[]; everyone?: Person[] }>('shares'),
  share: (viewerId: string) => call('share', { viewer_id: viewerId }),
  unshare: (viewerId: string) => call('unshare', { viewer_id: viewerId }),
  // Share ONE image / video (fileId = its Google Drive file id)
  itemViewers: (kind: 'image' | 'video', fileId: string) =>
    call<{ viewers: Person[] }>(`item-viewers&kind=${kind}&file_id=${encodeURIComponent(fileId)}`),
  itemShare: (kind: 'image' | 'video', fileId: string, viewerId: string) =>
    call('item-share', { kind, file_id: fileId, viewer_id: viewerId }),
  itemUnshare: (kind: 'image' | 'video', fileId: string, viewerId: string) =>
    call('item-unshare', { kind, file_id: fileId, viewer_id: viewerId }),
};

/** "Maria Santos" → "Maria"; falls back to the email's name part. */
export function firstName(p: { name: string | null; email: string | null }): string {
  return (p.name || p.email?.split('@')[0] || 'Someone').split(' ')[0];
}

/** What to show under someone's name: their email, or @username for password accounts without one. */
export function accountLabel(p: { email: string | null; username?: string | null }): string {
  return p.email || (p.username ? `@${p.username}` : '');
}
