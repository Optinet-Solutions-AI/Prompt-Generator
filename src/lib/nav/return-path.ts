// Remembers where to send the person after they sign in, safely.

export const RETURN_PATH_KEY = 'pg_returnTo';

// Only plain in-app paths are allowed. Returns null for anything else.
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  if (!raw.startsWith('/')) return null;                    // must be a path, not a full address
  // Browsers silently drop tab/newline characters in addresses, so '/<tab>/evil.com' would
  // become '//evil.com'. Reject control characters and backslashes outright.
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code < 0x20 || code === 0x7f || raw[i] === '\\') return null;
  }
  if (raw.startsWith('//')) return null;                    // would point to another site
  if (raw === '/') return null;                             // nothing to restore
  if (raw === '/api' || raw.startsWith('/api/') || raw.startsWith('/api?')) return null;
  return raw;
}

export function rememberReturnPath(path: string): void {
  try { sessionStorage.setItem(RETURN_PATH_KEY, path); } catch { /* storage blocked: skip */ }
}

// Reads the saved path, removes it, and returns it only if it is safe.
export function takeReturnPath(): string | null {
  try {
    const raw = sessionStorage.getItem(RETURN_PATH_KEY);
    sessionStorage.removeItem(RETURN_PATH_KEY);
    return safeReturnPath(raw);
  } catch {
    return null;
  }
}
