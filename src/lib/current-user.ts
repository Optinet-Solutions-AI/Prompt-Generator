/**
 * current-user.ts — the signed-in user's id for plain (non-React) helpers.
 * Set by <AuthProvider> (src/hooks/useAuth.tsx) on sign-in / sign-out.
 */
let currentId: string | null = null;

export function setCurrentUserId(id: string | null): void { currentId = id; }
export function getCurrentUserId(): string | null { return currentId; }

/**
 * Supabase REST filter for favorites: mine + the old team favorites from
 * before accounts (owner_id is null).
 */
export function myFavoritesFilter(): string {
  return currentId ? `&or=(owner_id.eq.${currentId},owner_id.is.null)` : '&owner_id=is.null';
}
