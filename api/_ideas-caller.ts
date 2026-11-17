import type { VercelRequest } from '@vercel/node';
import { validateToken } from './_assistant-token.js';
import { AuthError, requireUser } from './_session.js';
import { BRAND_PALETTES } from './_brand-rules.js';

/**
 * Who is asking for ideas, and so who pays (daily cap + cost log).
 *
 * - The old tester link sends a `token`: it stays billed to that token, and a
 *   wrong token is refused (401) — even if the browser is also signed in.
 * - The main tool sends no token: the signed-in, approved person pays, by
 *   their profile id. Signed out → 401, waiting/blocked → 403 (from requireUser).
 */
export interface IdeasCaller {
  who: string;
  kind: 'tester' | 'user';
}

export async function resolveIdeasCaller(req: VercelRequest, token: string | undefined): Promise<IdeasCaller> {
  if (token) {
    const tester = validateToken(token);
    if (!tester) throw new AuthError(401, 'Invalid token');
    return { who: tester.test_user_id, kind: 'tester' };
  }
  const me = await requireUser(req);
  return { who: me.id, kind: 'user' };
}

/** One of our 10 brands (exact name). The server can't import src/, so the brand rules are the list. */
export function isKnownBrand(brand: string): boolean {
  return Object.prototype.hasOwnProperty.call(BRAND_PALETTES, brand);
}
