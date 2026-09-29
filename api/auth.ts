/**
 * auth.ts — Sign in with Google (+ Google Drive), approval, and library sharing.
 *
 *   GET  ?action=google-start     → redirects to Google's sign-in screen
 *   GET  ?action=google-callback  → Google sends the browser back here (via /api/google-callback)
 *   GET  ?action=me               → who am I? { user, drive_connected } or { user: null }
 *   POST ?action=logout           → sign out (clears the cookie)
 *   GET  ?action=users            → approved app users (for the "Share with…" picker)
 *   GET  ?action=shares           → { sharing_with, shared_with_me }
 *   POST ?action=share / unshare  → { viewer_id } — let someone see my library / stop
 *   GET  ?action=item-viewers     → &kind=image|video&file_id=… who can see this one item
 *   POST ?action=item-share / item-unshare → { kind, file_id, viewer_id } — share ONE item
 *
 * ONE button does everything: the Google screen asks for the user's name/email
 * AND permission to create files in their Drive (only files this app makes).
 *
 * APPROVAL:
 *   - emails on AUTO_APPROVE_DOMAINS (default optinetsolutions.com) → approved
 *   - emails on AUTO_APPROVE_EMAILS (pre-approved outside people) → approved
 *   - everyone else → 'pending' until an admin sets status = 'approved' in
 *     Supabase → Table editor → profiles
 *
 * ENV: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, SESSION_SECRET,
 *      AUTO_APPROVE_DOMAINS (optional, comma-separated), ADMIN_EMAILS (optional),
 *      AUTO_APPROVE_EMAILS (optional — specific outside people let in without waiting)
 */
import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  AuthError, sb, currentProfile, requireUser, setSessionCookie, clearSessionCookie,
  readCookie, publicProfile, updateProfile, type Profile,
} from './_session.js';
import { DRIVE_SCOPE, googleClient, ensureFolder } from './_user-drive.js';
import { itemViewers, shareItem } from './_item-shares.js';

const STATE_COOKIE = 'pg_oauth_state';

function origin(req: VercelRequest): string {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  return `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
}
const callbackUrl = (req: VercelRequest) => `${origin(req)}/api/google-callback`;

function listEnv(name: string, fallback = ''): string[] {
  return (process.env[name] || fallback).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

// ── Sign-in ───────────────────────────────────────────────────────────────

/**
 * Does this email get in without waiting for an admin?
 * Admins, company domains (AUTO_APPROVE_DOMAINS) and specific pre-approved
 * people (AUTO_APPROVE_EMAILS). Case never matters (Lena@… = lena@…).
 */
export function approvalFor(rawEmail: string): { isAdmin: boolean; preApproved: boolean } {
  const email = rawEmail.trim().toLowerCase();
  const domain = email.split('@')[1] || '';
  const isAdmin = listEnv('ADMIN_EMAILS').includes(email);
  const preApproved = isAdmin
    || listEnv('AUTO_APPROVE_DOMAINS', 'optinetsolutions.com').includes(domain)
    || listEnv('AUTO_APPROVE_EMAILS').includes(email);
  return { isAdmin, preApproved };
}

function googleStart(req: VercelRequest, res: VercelResponse) {
  const { id } = googleClient();
  const state = crypto.randomBytes(16).toString('hex');
  const secure = origin(req).startsWith('https') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: id,
    redirect_uri: callbackUrl(req),
    response_type: 'code',
    scope: `openid email profile ${DRIVE_SCOPE}`,
    access_type: 'offline',          // → refresh token, so Drive keeps working without re-signing in
    prompt: 'consent select_account',// always return a refresh token + let them pick the account
    include_granted_scopes: 'true',
    state,
  });
  res.setHeader('Location', url);
  res.status(302).end();
}

async function googleCallback(req: VercelRequest, res: VercelResponse) {
  const back = (q: string) => { res.setHeader('Location', `/${q}`); res.status(302).end(); };
  try {
    const state = String(req.query.state || '');
    if (!state || state !== readCookie(req, STATE_COOKIE)) return back('?auth=error:' + encodeURIComponent('Sign-in expired — please try again.'));
    if (req.query.error) return back('?auth=error:' + encodeURIComponent(req.query.error === 'access_denied' ? 'Sign-in was cancelled.' : String(req.query.error)));

    const { id, secret } = googleClient();
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: String(req.query.code || ''),
        redirect_uri: callbackUrl(req), client_id: id, client_secret: secret,
      }),
    });
    const t = await tokenRes.json() as {
      access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; scope?: string; error?: string;
    };
    if (!tokenRes.ok || !t.id_token) throw new AuthError(502, `Google sign-in failed (${t.error || tokenRes.status})`);

    // The id_token came straight from Google over TLS, so reading its claims is safe here.
    const claims = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString('utf8')) as {
      sub: string; email: string; email_verified?: boolean; name?: string; picture?: string;
    };
    if (!claims.email_verified) throw new AuthError(403, 'Your Google email is not verified.');
    const email = claims.email.toLowerCase();
    const driveGranted = (t.scope || '').includes(DRIVE_SCOPE);

    const existing = (await sb(`profiles?google_sub=eq.${encodeURIComponent(claims.sub)}&select=*`) as Profile[])[0];
    const driveFields: Partial<Profile> = driveGranted && t.access_token ? {
      drive_access_token: t.access_token,
      drive_token_expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
      ...(t.refresh_token ? { drive_refresh_token: t.refresh_token } : {}),
    } : {};

    const { isAdmin, preApproved } = approvalFor(email);

    let profile: Profile;
    if (existing) {
      // Someone added to the pre-approved list AFTER they first signed in
      // gets let in on their next sign-in. A 'blocked' person stays blocked.
      const promote = existing.status === 'pending' && preApproved;
      await updateProfile(existing.id, {
        email, name: claims.name || existing.name, avatar_url: claims.picture || existing.avatar_url,
        last_seen_at: new Date().toISOString(), ...driveFields, ...(promote ? { status: 'approved' } : {}),
      });
      profile = { ...existing, ...driveFields, ...(promote ? { status: 'approved' as const } : {}) };
    } else {
      const approved = preApproved;
      profile = (await sb('profiles', {
        method: 'POST',
        body: JSON.stringify({
          google_sub: claims.sub, email, name: claims.name || null, avatar_url: claims.picture || null,
          status: approved ? 'approved' : 'pending', is_admin: isAdmin, last_seen_at: new Date().toISOString(), ...driveFields,
        }),
      }) as Profile[])[0];
    }

    // Create "My Drive / Prompt Generator / Images + Videos" right away, so the
    // folder is there the moment they look — not only after the first save.
    // Best effort: a hiccup here must never block signing in.
    if (driveGranted && profile.status === 'approved') {
      try { await ensureFolder(profile, 'images'); await ensureFolder(profile, 'videos'); }
      catch (e) { console.warn('[auth] could not pre-create Drive folders (will retry on first save):', e); }
    }

    setSessionCookie(req, res, profile.id);
    return back(driveGranted ? '?auth=signed-in' : '?auth=no-drive');
  } catch (err) {
    console.error('[auth:google-callback]', err);
    return back('?auth=error:' + encodeURIComponent(err instanceof Error ? err.message : 'Sign-in failed'));
  }
}

async function me(req: VercelRequest) {
  const p = await currentProfile(req);
  if (!p) return { user: null };
  // Refresh "last seen" at most every 10 minutes.
  if (!p.last_seen_at || Date.now() - Date.parse(p.last_seen_at) > 10 * 60_000) {
    updateProfile(p.id, { last_seen_at: new Date().toISOString() }).catch(() => undefined);
  }
  // Signed in before the folders existed → create them now (once, best effort).
  if (p.status === 'approved' && p.drive_refresh_token && (!p.drive_images_folder_id || !p.drive_videos_folder_id)) {
    try { await ensureFolder(p, 'images'); await ensureFolder(p, 'videos'); }
    catch (e) { console.warn('[auth:me] could not create Drive folders yet:', e); }
  }
  return { user: publicProfile(p), drive_connected: !!p.drive_refresh_token };
}

// ── Sharing ───────────────────────────────────────────────────────────────

const PERSON = 'id,email,name,avatar_url';

async function users(req: VercelRequest) {
  const p = await requireUser(req);
  const rows = await sb(`profiles?status=eq.approved&select=${PERSON}&order=name.asc`) as Array<{ id: string }>;
  return { users: rows.filter(u => u.id !== p.id) };
}

async function shares(req: VercelRequest) {
  const p = await requireUser(req);
  const out = await sb(`library_shares?owner_id=eq.${p.id}&select=viewer:profiles!library_shares_viewer_id_fkey(${PERSON})`) as Array<{ viewer: unknown }>;
  const inn = await sb(`library_shares?viewer_id=eq.${p.id}&select=owner:profiles!library_shares_owner_id_fkey(${PERSON})`) as Array<{ owner: unknown }>;
  return { sharing_with: out.map(r => r.viewer), shared_with_me: inn.map(r => r.owner) };
}

async function share(req: VercelRequest, body: Record<string, unknown>, add: boolean) {
  const p = await requireUser(req);
  const viewer = String(body.viewer_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(viewer) || viewer === p.id) throw new AuthError(400, 'Pick someone to share with');
  if (add) {
    const target = (await sb(`profiles?id=eq.${viewer}&status=eq.approved&select=id`) as unknown[])[0];
    if (!target) throw new AuthError(404, 'That person is not an approved user of the app');
    await sb('library_shares?on_conflict=owner_id,viewer_id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ owner_id: p.id, viewer_id: viewer }),
    });
  } else {
    await sb(`library_shares?owner_id=eq.${p.id}&viewer_id=eq.${viewer}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  }
  return { success: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action || '');
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  try {
    if (req.method === 'GET' && action === 'google-start') return googleStart(req, res);
    if (req.method === 'GET' && action === 'google-callback') return await googleCallback(req, res);
    if (req.method === 'GET' && action === 'me') return res.status(200).json(await me(req));
    if (req.method === 'POST' && action === 'logout') { clearSessionCookie(req, res); return res.status(200).json({ success: true }); }
    if (req.method === 'GET' && action === 'users') return res.status(200).json(await users(req));
    if (req.method === 'GET' && action === 'shares') return res.status(200).json(await shares(req));
    if (req.method === 'POST' && action === 'share') return res.status(200).json(await share(req, body, true));
    if (req.method === 'POST' && action === 'unshare') return res.status(200).json(await share(req, body, false));
    if (req.method === 'GET' && action === 'item-viewers') return res.status(200).json(await itemViewers(await requireUser(req), req.query.kind, req.query.file_id));
    if (req.method === 'POST' && action === 'item-share') return res.status(200).json(await shareItem(await requireUser(req), body, true));
    if (req.method === 'POST' && action === 'item-unshare') return res.status(200).json(await shareItem(await requireUser(req), body, false));
    return res.status(404).json({ error: `Unknown action "${action}"` });
  } catch (err) {
    const code = err instanceof AuthError ? err.status : 500;
    console.error(`[auth:${action}]`, err);
    return res.status(code).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
