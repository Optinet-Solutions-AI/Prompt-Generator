export interface TokenValidation {
  test_user_id: string;
}

export function validateToken(token: string | undefined | null): TokenValidation | null {
  if (!token) return null;
  const raw = process.env.VITE_ASSISTANT_TOKENS;
  if (!raw) return null;
  const allowed = raw.split(',').map(s => s.trim()).filter(Boolean);
  return allowed.includes(token) ? { test_user_id: token } : null;
}
