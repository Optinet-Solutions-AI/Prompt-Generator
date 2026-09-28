/**
 * google-callback.ts — the address Google sends the browser back to after
 * "Sign in with Google": /api/google-callback
 *
 * It's its own tiny route (instead of /api/auth?action=…) because Google's
 * "Authorized redirect URIs" list is safest with a plain path, no "?". All the
 * real work happens in auth.ts.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import authHandler from './auth.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  req.query = { ...req.query, action: 'google-callback' };
  return authHandler(req, res);
}
