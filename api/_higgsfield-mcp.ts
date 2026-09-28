/**
 * _higgsfield-mcp.ts — talk to Higgsfield through its MCP server, using the
 * Higgsfield PLAN credits of whoever clicked "Connect Higgsfield".
 *
 * WHY MCP (not the Higgsfield API):
 * The API bills a separate US-dollar balance; plan credits only work through
 * the website or the MCP. MCP signs in with a normal Higgsfield login (OAuth).
 *
 * THE LOGIN (OAuth "authorization code + PKCE", same as Claude Code uses):
 *   1. startConnect()   → registers a client with Higgsfield's login server
 *                         (Clerk) and returns the sign-in URL
 *   2. user signs in, Higgsfield redirects to /api/video?action=oauth-callback
 *   3. finishConnect()  → swaps the code for tokens, saves them in Supabase
 *
 * TOKEN RENEWAL — READ BEFORE CHANGING:
 * Access tokens last ~24h. The refresh token is SINGLE-USE: each renewal
 * returns a new one, and presenting an old one makes Higgsfield cancel the
 * whole login (measured 2026-09-28). So:
 *   - the newest refresh token is saved to Supabase immediately, and
 *   - a short lock row (`refreshing_until`) guarantees only one server
 *     instance renews at a time; the others wait and re-read.
 *
 * ONE TEAM CONNECTION: every function takes a connection key. The Video tab
 * always passes TEAM_CONNECTION, so every signed-in user renders with the one
 * Higgsfield account an admin connected (row id 'team' in
 * higgsfield_connection). Only admins may connect / disconnect it.
 *
 * Underscore file = helper, not its own Vercel route.
 */
import crypto from 'node:crypto';

const AUTH = 'https://clerk.higgsfield.ai';
const MCP_URL = 'https://mcp.higgsfield.ai/mcp';
const SCOPE = 'openid email offline_access';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// ── Supabase (service-role, server only) ──────────────────────────────────

interface ConnRow {
  id: string;
  client_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  account_email: string | null;
  refreshing_until: string | null;
  pending_state: string | null;
  pending_verifier: string | null;
  pending_client_id: string | null;
  pending_redirect: string | null;
}

async function sb(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, 'Supabase is not configured');
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation', ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    if (text.includes('higgsfield_connection') && text.includes('schema cache')) {
      throw new HttpError(503, 'Run the higgsfield_connection SQL in Supabase first (supabase/migrations/2026-09-28-higgsfield-connection.sql).');
    }
    throw new HttpError(res.status, `Supabase ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : [];
}

/** The shared Higgsfield login every user of the Video tab renders with. */
export const TEAM_CONNECTION = 'team';

const rowId = (uid: string) => {
  if (uid !== TEAM_CONNECTION && !/^[0-9a-f-]{36}$/i.test(uid)) throw new HttpError(401, 'Please sign in first.');
  return uid;
};

async function readRow(uid: string): Promise<ConnRow | null> {
  const rows = await sb(`higgsfield_connection?id=eq.${rowId(uid)}&select=*`) as ConnRow[];
  return rows[0] || null;
}

async function writeRow(uid: string, fields: Partial<ConnRow>) {
  await sb('higgsfield_connection?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: rowId(uid), ...fields, updated_at: new Date().toISOString() }),
  });
}

// ── Connect / disconnect ──────────────────────────────────────────────────

/** Step 1: returns the Higgsfield sign-in URL for the browser to open. */
export async function startConnect(uid: string, redirectUri: string): Promise<string> {
  // A fresh client per connect is cheap and keeps the redirect URI exact
  // (localhost for dev, the Vercel domain in production).
  const reg = await (await fetch(`${AUTH}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Prompt Generator — Video tab',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      redirect_uris: [redirectUri],
      scope: SCOPE,
    }),
  })).json() as { client_id?: string };
  if (!reg.client_id) throw new HttpError(502, 'Higgsfield login server refused client registration');

  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  await writeRow(uid, { pending_state: state, pending_verifier: verifier, pending_client_id: reg.client_id, pending_redirect: redirectUri });

  return `${AUTH}/oauth/authorize?` + new URLSearchParams({
    response_type: 'code', client_id: reg.client_id, redirect_uri: redirectUri, scope: SCOPE,
    code_challenge: challenge, code_challenge_method: 'S256', state, resource: MCP_URL,
  });
}

/** Step 3: exchange the returned code for tokens and save them. */
export async function finishConnect(uid: string, code: string, state: string) {
  const row = await readRow(uid);
  if (!row?.pending_state || row.pending_state !== state || !row.pending_verifier || !row.pending_client_id || !row.pending_redirect) {
    throw new HttpError(400, 'This sign-in link expired — click "Connect Higgsfield" again.');
  }
  const t = await tokenRequest({
    grant_type: 'authorization_code', code, redirect_uri: row.pending_redirect,
    client_id: row.pending_client_id, code_verifier: row.pending_verifier,
  });
  await writeRow(uid, {
    client_id: row.pending_client_id,
    access_token: t.access_token,
    refresh_token: t.refresh_token || null,
    expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
    account_email: emailFromIdToken(t.id_token),
    refreshing_until: null,
    pending_state: null, pending_verifier: null, pending_client_id: null, pending_redirect: null,
  });
}

export async function disconnect(uid: string) {
  const row = await readRow(uid);
  if (row?.refresh_token && row.client_id) {
    // Best effort — revoke so the token can't be used even if leaked.
    await fetch(`${AUTH}/oauth/token/revoke`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: row.refresh_token, client_id: row.client_id }),
    }).catch(() => undefined);
  }
  await writeRow(uid, { client_id: null, access_token: null, refresh_token: null, expires_at: null, account_email: null, refreshing_until: null });
}

export async function connectionStatus(uid: string) {
  const row = await readRow(uid);
  return { connected: !!row?.refresh_token, email: row?.account_email || null };
}

// ── Tokens ────────────────────────────────────────────────────────────────

interface TokenResponse { access_token: string; refresh_token?: string; expires_in?: number; id_token?: string }

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${AUTH}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const data = await res.json().catch(() => ({})) as TokenResponse & { error?: string };
  if (!res.ok || !data.access_token) {
    throw new HttpError(401, `Higgsfield sign-in failed (${data.error || res.status}) — click "Connect Higgsfield" again.`);
  }
  return data;
}

function emailFromIdToken(idToken?: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'));
    return payload.email || null;
  } catch { return null; }
}

/** A valid access token, renewing it (safely, one server at a time) if it's about to expire. */
async function accessToken(uid: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const row = await readRow(uid);
    if (!row?.refresh_token || !row.client_id) {
      throw new HttpError(401, 'Higgsfield is not connected yet — an admin needs to click "Connect Higgsfield" in the Video tab.');
    }
    const fresh = row.access_token && row.expires_at && Date.parse(row.expires_at) - Date.now() > 10 * 60 * 1000;
    if (fresh) return row.access_token as string;

    // Take the lock: only succeeds if nobody else holds it.
    const now = new Date().toISOString();
    const until = new Date(Date.now() + 30_000).toISOString();
    const locked = await sb(
      `higgsfield_connection?id=eq.${rowId(uid)}&refresh_token=eq.${encodeURIComponent(row.refresh_token)}` +
      `&or=(refreshing_until.is.null,refreshing_until.lt.${encodeURIComponent(now)})`,
      { method: 'PATCH', body: JSON.stringify({ refreshing_until: until }) },
    ) as ConnRow[];

    if (locked.length === 0) { await new Promise(r => setTimeout(r, 1500)); continue; } // someone else is renewing

    try {
      const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: row.refresh_token, client_id: row.client_id });
      await writeRow(uid, {
        access_token: t.access_token,
        refresh_token: t.refresh_token || row.refresh_token,
        expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
        refreshing_until: null,
      });
      return t.access_token;
    } catch (err) {
      // A rejected refresh means the login is gone — clear it so the UI asks to reconnect.
      await writeRow(uid, { access_token: null, refresh_token: null, expires_at: null, refreshing_until: null });
      throw err;
    }
  }
  throw new HttpError(503, 'Higgsfield sign-in is busy renewing — try again in a few seconds.');
}

// ── MCP calls ─────────────────────────────────────────────────────────────

/** One MCP tool call (initialize → initialized → tools/call). Returns the tool's structured result. */
export async function callTool(uid: string, name: string, args: Record<string, unknown>): Promise<{ text: string; data: Record<string, unknown> }> {
  const token = await accessToken(uid);
  let session: string | null = null;
  let id = 0;
  const rpc = async (method: string, params: unknown, notify = false) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
    };
    if (session) headers['Mcp-Session-Id'] = session;
    const res = await fetch(MCP_URL, {
      method: 'POST', headers,
      body: JSON.stringify(notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++id, method, params }),
    });
    session = res.headers.get('mcp-session-id') || session;
    if (res.status === 401) throw new HttpError(401, 'Higgsfield login expired — click "Connect Higgsfield" again.');
    const body = await res.text();
    if (notify) return null;
    if (!res.ok) throw new HttpError(502, `Higgsfield MCP ${res.status}: ${body.slice(0, 200)}`);
    // Responses come as plain JSON or as a server-sent-event stream ("data: {...}").
    const json = body.includes('data:')
      ? body.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).pop()
      : body;
    return JSON.parse(json || '{}');
  };

  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prompt-generator', version: '1.0' } });
  await rpc('notifications/initialized', {}, true);
  const out = await rpc('tools/call', { name, arguments: args });
  if (out?.error) throw new HttpError(502, `Higgsfield ${name}: ${out.error.message || 'error'}`);
  const result = out?.result || {};
  const text = (result.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n');
  if (result.isError) throw new HttpError(422, friendly(text));
  return { text, data: (result.structuredContent || {}) as Record<string, unknown> };
}

/** Turn Higgsfield's wording into something a user can act on. */
function friendly(text: string): string {
  if (/credit/i.test(text) && /(not enough|insufficient)/i.test(text)) {
    return 'Not enough Higgsfield credits on the connected account — top up credits at higgsfield.ai.';
  }
  return `Higgsfield: ${text.slice(0, 300)}`;
}

// ── Video helpers used by api/video.ts ────────────────────────────────────

export interface VideoParams {
  model: string;
  prompt: string;
  aspect_ratio: string;
  duration: number;
  // Seedance-style settings
  resolution?: string;
  generate_audio?: boolean;
  // Kling-style settings
  mode?: string;
  sound?: 'on' | 'off';
  medias?: Array<{ value: string; role: string }>;
}

/**
 * Submit one video. Higgsfield sometimes answers with a "this looks like our
 * preset X" suggestion instead of rendering; we always want the literal
 * prompt, so we decline and resubmit automatically (up to 2 times).
 */
async function generateVideoLiteral(uid: string, params: Record<string, unknown>) {
  for (let i = 0; i < 3; i++) {
    const out = await callTool(uid, 'generate_video', { params });
    const notice = out.data.notice as { type?: string; data?: { preset?: { id?: string } } } | undefined;
    if (notice?.type === 'preset_recommendation' && notice.data?.preset?.id) {
      params = { ...params, declined_preset_id: notice.data.preset.id };
      continue;
    }
    return out;
  }
  throw new HttpError(502, 'Higgsfield kept suggesting presets instead of rendering — try rewording the prompt.');
}

export async function submitVideo(uid: string, p: VideoParams): Promise<string> {
  const { text, data } = await generateVideoLiteral(uid, { ...p, use_unlim: false });
  const jobId = (data.results as Array<{ id?: string }> | undefined)?.[0]?.id;
  if (jobId) return jobId;
  throw new HttpError(502, friendly(text || 'no job id returned'));
}

/** Credits a video would cost — nothing is submitted. */
export async function videoCost(uid: string, p: VideoParams): Promise<number | null> {
  // The preset suggestion can interrupt price checks too, so decline it here as well.
  const { data } = await generateVideoLiteral(uid, { ...p, get_cost: true });
  const cost = data.cost as { credits?: number } | undefined;
  return typeof cost?.credits === 'number' ? cost.credits : null;
}

/** Current status of one job (waits up to ~8s server-side for it to finish). */
export async function videoStatus(uid: string, jobId: string): Promise<{ status: string; url: string | null; error: string | null }> {
  const { data } = await callTool(uid, 'jobs_wait', { jobs: [{ index: 0, job_id: jobId }], timeout_seconds: 8 });
  const job = (data.jobs as Array<Record<string, unknown>> | undefined)?.[0] || {};
  return {
    status: String(job.status || 'unknown'),
    url: (job.result_url as string) || null,
    error: (job.error as string) || (job.fail_reason as string) || null,
  };
}

/** Upload a start image (data URL) to Higgsfield storage; returns its media_id. */
export async function uploadImage(uid: string, dataUrl: string): Promise<string> {
  const m = dataUrl.match(/^data:(image\/(png|jpeg|webp));base64,(.+)$/);
  if (!m) throw new HttpError(400, 'Start image must be a PNG, JPEG or WebP');
  const [, contentType, ext, b64] = m;
  const { data } = await callTool(uid, 'media_upload', { filename: `start.${ext === 'jpeg' ? 'jpg' : ext}`, content_type: contentType });
  // Reply shape (2026-09-28): { uploads: [{ upload_url, media_id, method: 'PUT', content_type }] }
  const up = (data.uploads as Array<{ media_id?: string; upload_url?: string }> | undefined)?.[0] || {};
  const mediaId = up.media_id;
  if (!up.upload_url || !mediaId) throw new HttpError(502, 'Higgsfield did not return an upload URL');
  const put = await fetch(up.upload_url, {
    method: 'PUT', headers: { 'Content-Type': contentType }, body: Buffer.from(b64, 'base64'),
  });
  if (!put.ok) throw new HttpError(502, `Start image upload failed (${put.status})`);
  await callTool(uid, 'media_confirm', { type: 'image', media_id: mediaId });
  return mediaId;
}
