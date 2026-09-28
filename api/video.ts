/**
 * video.ts — every server-side step of the UGC Video feature, in one route.
 *
 * EVERY action needs a signed-in, approved user (see _session.ts). Videos are
 * saved to THAT user's own Google Drive (My Drive / Prompt Generator / Videos)
 * and rendered with the ONE team Higgsfield account an admin connected
 * (every user shares it — see TEAM_CONNECTION in _higgsfield-mcp.ts).
 *
 * Pick the step with ?action=…
 *   GET  ?action=hf-status       → is the TEAM Higgsfield connected? { connected, email }
 *   POST ?action=hf-connect      → (admins) returns { url } — the Higgsfield sign-in page
 *   GET  ?action=oauth-callback  → Higgsfield sends the browser back here after sign-in
 *   POST ?action=hf-disconnect   → (admins) forget the team Higgsfield login
 *   POST ?action=cost            → credits a video would cost (nothing is rendered)
 *   POST ?action=submit          → start a render, returns { request_id }
 *   GET  ?action=status          → &id=<request_id>, returns { status, video_url? }
 *   POST ?action=save            → download the finished video, stamp the brand
 *                                  (corner logo + end card), upload to MY Drive
 *   GET  ?action=list            → &owner=<profile id> (default me) | &owner=archive
 *   GET  ?action=stream          → &id=<drive id>&owner=…  plays a video (range slices)
 *   POST ?action=like / unlike   → favorites on MY videos (Supabase `liked_videos`)
 *   GET  ?action=usage-mine      → &days=30  my Higgsfield credit usage
 *   GET  ?action=usage-team      → (admins) &days=30[&format=csv]  everyone's usage
 *
 * "owner=archive" = the old shared team folder (GOOGLE_DRIVE_VIDEO_FOLDER_ID)
 * from before accounts existed — read-only for everyone signed in.
 *
 * WHY SUBMIT + STATUS INSTEAD OF ONE CALL:
 * Renders take minutes. Holding one request open that long risks the function
 * timeout, so the browser polls `status` every few seconds instead.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  HttpError, startConnect, finishConnect, disconnect, connectionStatus,
  submitVideo, videoCost, videoStatus, uploadImage, TEAM_CONNECTION as HF, type VideoParams,
} from './_higgsfield-mcp.js';
import { brandVideo, END_CARD_SECONDS } from './_video-brand.js';
import { AuthError, requireUser, libraryOwner, sb, type Profile } from './_session.js';
import { uploadToUserDrive, listUserFolder, userFileMeta, fetchUserFileRange, type UserDriveFile } from './_user-drive.js';

// Downloading, branding and re-uploading a video to Drive can take a while.
export const config = { maxDuration: 300 };

// Video models the Video tab may use (Higgsfield MCP model ids). Anything else
// sent by the browser is rejected, so the page can't spend credits on a
// surprise model. Keep in sync with VIDEO_MODELS in src/lib/ugc-video.ts.
const ALLOWED_MODELS = new Set(['seedance_2_5', 'kling3_0']);
const DEFAULT_MODEL = 'seedance_2_5';

function siteOrigin(req: VercelRequest): string {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  return `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
}

// ── Team archive (the shared folder from before accounts) ─────────────────

// Reused while valid — video playback makes many small `stream` calls in a row.
let archiveToken: { value: string; expires: number } | null = null;

async function archiveAccessToken(): Promise<string> {
  if (archiveToken && Date.now() < archiveToken.expires) return archiveToken.value;
  const { CLOUD_RUN_REFRESH_TOKEN, CLOUD_RUN_CLIENT_ID, CLOUD_RUN_CLIENT_SECRET } = process.env;
  if (!CLOUD_RUN_REFRESH_TOKEN || !CLOUD_RUN_CLIENT_ID || !CLOUD_RUN_CLIENT_SECRET) {
    throw new HttpError(503, 'Google Drive credentials (CLOUD_RUN_*) are not configured');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: CLOUD_RUN_REFRESH_TOKEN,
      client_id: CLOUD_RUN_CLIENT_ID, client_secret: CLOUD_RUN_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new HttpError(502, `Google token refresh failed: ${await res.text()}`);
  const data = await res.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new HttpError(502, 'No Google access_token returned');
  archiveToken = { value: data.access_token, expires: Date.now() + ((data.expires_in || 3600) - 300) * 1000 };
  return data.access_token;
}

const archiveFolderId = () => process.env.GOOGLE_DRIVE_VIDEO_FOLDER_ID || '';

async function listArchive(): Promise<UserDriveFile[]> {
  if (!archiveFolderId()) return [];
  const token = await archiveAccessToken();
  const q = `'${archiveFolderId()}' in parents and trashed = false and mimeType contains 'video/'`;
  const fields = 'files(id,name,createdTime,mimeType,description,thumbnailLink,appProperties)';
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&orderBy=createdTime desc&pageSize=500`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new HttpError(502, `Drive list failed: ${await res.text()}`);
  return ((await res.json()) as { files?: UserDriveFile[] }).files || [];
}

// ── Shape sent to the browser ─────────────────────────────────────────────

/** `owner` = profile id, or 'archive'. */
function mapVideo(f: UserDriveFile, owner: string, liked: Set<string>) {
  return {
    id: f.id,
    name: f.name,
    created_at: f.createdTime,
    brand: f.appProperties?.brand || '',
    aspect_ratio: f.appProperties?.aspectRatio || '',
    duration: f.appProperties?.duration || '',
    // Higgsfield model id (e.g. 'seedance_2_5'); empty for videos saved before models were recorded.
    model: f.appProperties?.model || '',
    prompt: f.description || '',
    owner,
    // Browsers refuse to play Drive links inside a <video> tag, so playback
    // goes through our `stream` action (which also checks who may watch).
    video_url: `/api/video?action=stream&id=${f.id}&owner=${owner}`,
    download_url: `/api/video?action=stream&id=${f.id}&owner=${owner}&download=1`,
    thumbnail_url: f.thumbnailLink || '',
    liked: liked.has(f.id),
  };
}

async function likedIds(ownerId: string): Promise<Set<string>> {
  try {
    const rows = await sb(`liked_videos?owner_id=eq.${ownerId}&select=drive_file_id`) as Array<{ drive_file_id: string }>;
    return new Set(rows.map(r => r.drive_file_id));
  } catch (err) {
    console.warn('[video] liked_videos unavailable:', err instanceof Error ? err.message : err);
    return new Set();
  }
}

// ── Generation ────────────────────────────────────────────────────────────

/** Turn the Video tab's settings into Higgsfield MCP parameters. */
function toParams(body: Record<string, unknown>): VideoParams {
  const prompt = String(body.prompt || '').trim();
  if (!prompt) throw new HttpError(400, 'prompt is required');
  const model = String(body.model || DEFAULT_MODEL);
  if (!ALLOWED_MODELS.has(model)) throw new HttpError(400, `Model "${model}" is not enabled for the Video tab`);
  const common = { model, prompt, aspect_ratio: String(body.aspectRatio || '9:16'), duration: Number(body.duration) || 5 };
  // Each model names its settings differently (from models_explore, 2026-09-28).
  if (model === 'kling3_0') {
    // 'pro' = higher quality (12.5 credits / 5s, 1080×1920); 'sound' instead of generate_audio.
    return { ...common, mode: 'pro', sound: body.audio !== false ? 'on' : 'off' };
  }
  return { ...common, resolution: '720p', generate_audio: body.audio !== false };
}

async function submit(p: Profile, body: Record<string, unknown>) {
  const params = toParams(body);
  const withImage = typeof body.startImage === 'string' && !!body.startImage;
  if (withImage) {
    params.medias = [{ value: await uploadImage(HF, body.startImage as string), role: 'start_image' }];
  }
  // Ask Higgsfield for the exact price of THIS render at the same time as we
  // submit it (the price check never creates a job), so usage is recorded
  // without making Generate any slower.
  const [jobId, credits] = await Promise.all([
    submitVideo(HF, params),
    videoCost(HF, params).catch(() => null),
  ]);
  await recordUsage(p, jobId, params, body, withImage, credits);
  return { request_id: jobId };
}

async function status(p: Profile, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'invalid id');
  const s = await videoStatus(HF, id);
  // Map Higgsfield's words onto the ones the browser already understands.
  const failedStatus = ['failed', 'nsfw', 'canceled', 'cancelled', 'ip_detected'].includes(s.status);
  if (s.status === 'completed' || failedStatus) await finishUsage(id, s.status === 'completed' ? 'completed' : 'failed');
  if (s.status === 'ip_detected') {
    return { status: 'failed', video_url: null, error: 'Higgsfield flagged possible copyrighted content (a real person, character or brand) — reword the prompt.' };
  }
  return { status: s.status, video_url: s.url, error: s.error };
}

// ── Usage (who spent which Higgsfield credits) ────────────────────────────
// Everyone renders on the one team account, so we keep our own record per
// person in Supabase `video_usage`. Recording must NEVER break a render, so
// every write here is best effort.

async function recordUsage(p: Profile, jobId: string, params: VideoParams, body: Record<string, unknown>, withImage: boolean, credits: number | null) {
  try {
    await sb('video_usage', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: p.id, job_id: jobId, model: params.model, duration: params.duration,
        aspect_ratio: params.aspect_ratio, brand: String(body.brand || '') || null,
        start_image: withImage, credits,
      }),
    });
  } catch (err) {
    console.error('[video:usage] could not record usage (render continues):', err);
  }
}

async function finishUsage(jobId: string, result: 'completed' | 'failed') {
  try {
    // Only the first terminal status counts (the browser polls repeatedly).
    await sb(`video_usage?job_id=eq.${encodeURIComponent(jobId)}&status=eq.submitted`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: result, finished_at: new Date().toISOString() }),
    });
  } catch (err) {
    console.error('[video:usage] could not update usage status:', err);
  }
}

export interface UsageRow {
  user_id: string; job_id: string; model: string; duration: number | null; aspect_ratio: string | null;
  brand: string | null; start_image: boolean; credits: number | string | null; status: string; created_at: string;
}

const MODEL_LABELS: Record<string, string> = { seedance_2_5: 'Seedance 2.5', kling3_0: 'Kling 3.0 Pro' };

function periodStart(daysParam: unknown): { since: string; days: number } {
  const days = Math.min(Math.max(parseInt(String(daysParam || '30'), 10) || 30, 1), 3650);
  return { since: new Date(Date.now() - days * 86400_000).toISOString(), days };
}

/**
 * Totals for a set of renders. Failed renders are listed but NOT counted:
 * Higgsfield normally returns credits for renders that fail (not yet verified
 * for every failure type).
 */
export function summarize(rows: UsageRow[]) {
  const counted = rows.filter(r => r.status !== 'failed');
  const credits = (list: UsageRow[]) => Math.round(list.reduce((t, r) => t + (Number(r.credits) || 0), 0) * 10) / 10;
  const group = (key: (r: UsageRow) => string) => {
    const out: Record<string, { videos: number; credits: number }> = {};
    for (const r of counted) {
      const k = key(r) || '—';
      out[k] = out[k] || { videos: 0, credits: 0 };
      out[k].videos++; out[k].credits = Math.round((out[k].credits + (Number(r.credits) || 0)) * 10) / 10;
    }
    return out;
  };
  return {
    credits: credits(counted),
    videos: counted.length,
    failed: rows.length - counted.length,
    by_model: group(r => MODEL_LABELS[r.model] || r.model),
    by_brand: group(r => r.brand || ''),
  };
}

async function usageRows(filter: string, since: string): Promise<UsageRow[]> {
  return await sb(`video_usage?select=*&created_at=gte.${encodeURIComponent(since)}${filter}&order=created_at.desc&limit=5000`) as UsageRow[];
}

async function usageMine(p: Profile, days: unknown) {
  const period = periodStart(days);
  const rows = await usageRows(`&user_id=eq.${p.id}`, period.since);
  return {
    days: period.days,
    ...summarize(rows),
    recent: rows.slice(0, 25).map(r => ({
      created_at: r.created_at, model: MODEL_LABELS[r.model] || r.model, brand: r.brand, duration: r.duration,
      credits: Number(r.credits) || null, status: r.status,
    })),
  };
}

async function usageTeam(req: VercelRequest, res: VercelResponse, p: Profile) {
  if (!p.is_admin) throw new HttpError(403, 'Only an admin can see the team usage summary.');
  const period = periodStart(req.query.days);
  const rows = await usageRows('', period.since);
  const people = await sb('profiles?select=id,email,name,avatar_url') as Array<{ id: string; email: string; name: string | null; avatar_url: string | null }>;
  const byId = new Map(people.map(u => [u.id, u]));

  if (req.query.format === 'csv') {
    const esc = (v: unknown) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const lines = [['date', 'name', 'email', 'model', 'brand', 'seconds', 'ratio', 'start image', 'credits', 'status'].join(',')];
    for (const r of rows) {
      const u = byId.get(r.user_id);
      lines.push([r.created_at, u?.name, u?.email, MODEL_LABELS[r.model] || r.model, r.brand, r.duration, r.aspect_ratio,
        r.start_image ? 'yes' : 'no', r.credits, r.status].map(esc).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="higgsfield-usage-last-${period.days}-days.csv"`);
    res.status(200).send(lines.join('\n'));
    return;
  }

  const perUser = [...new Set(rows.map(r => r.user_id))].map(uid => {
    const u = byId.get(uid);
    return {
      user: { id: uid, email: u?.email || '(deleted user)', name: u?.name || null, avatar_url: u?.avatar_url || null },
      ...summarize(rows.filter(r => r.user_id === uid)),
      last_at: rows.find(r => r.user_id === uid)?.created_at || null,
    };
  }).sort((a, b) => b.credits - a.credits);
  res.status(200).json({ days: period.days, ...summarize(rows), people: perUser });
}

// Only download finished videos from Higgsfield's own storage — `save` must
// not become a way to make the server fetch arbitrary URLs.
function isHiggsfieldUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return url.startsWith('https://') && (h.endsWith('.cloudfront.net') || h.endsWith('higgsfield.ai'));
  } catch { return false; }
}

async function save(req: VercelRequest, p: Profile, body: Record<string, unknown>) {
  const url = String(body.video_url || '');
  if (!isHiggsfieldUrl(url)) throw new HttpError(400, 'video_url must be a Higgsfield result URL');
  const brand = String(body.brand || '').trim();

  const vid = await fetch(url);
  if (!vid.ok) throw new HttpError(502, `Could not download the video (${vid.status})`);
  let buffer = Buffer.from(await vid.arrayBuffer());

  // Stamp the real brand (corner logo + end card) unless switched off.
  const opts = { logo: body.brandLogo !== false, endCard: body.brandEndCard !== false };
  let branded = false;
  let brandError = '';
  try {
    const out = await brandVideo(buffer, brand, opts, siteOrigin(req));
    buffer = out.buffer; branded = out.branded;
  } catch (err) {
    // Never lose the render over branding — save the plain video and say why.
    brandError = err instanceof Error ? err.message : String(err);
    console.error('[video:save] branding failed, saving unbranded:', err);
  }

  const baseSeconds = Number(body.duration) || 0;
  const duration = baseSeconds ? String(branded && opts.endCard ? baseSeconds + END_CARD_SECONDS : baseSeconds) : '';
  const slug = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
  const name = `${slug ? slug + '-' : ''}ugc-${Date.now()}.mp4`;
  const prompt = String(body.prompt || '');
  const aspectRatio = String(body.aspectRatio || '');
  const model = ALLOWED_MODELS.has(String(body.model)) ? String(body.model) : '';
  const appProperties = { provider: 'higgsfield', brand, aspectRatio, duration, model };
  const id = await uploadToUserDrive(p, 'videos', { buffer, mimeType: 'video/mp4', name, description: prompt, appProperties });
  return {
    branded,
    brand_error: brandError || null,
    file: mapVideo({ id, name, createdTime: new Date().toISOString(), mimeType: 'video/mp4', description: prompt, appProperties }, p.id, new Set()),
  };
}

// ── Library ───────────────────────────────────────────────────────────────

async function list(p: Profile, ownerParam: string) {
  if (ownerParam === 'archive') {
    return { owner: 'archive', files: (await listArchive()).map(f => mapVideo(f, 'archive', new Set())) };
  }
  const owner = await libraryOwner(p, ownerParam);
  const liked = await likedIds(owner.id);
  return { owner: owner.id, files: (await listUserFolder(owner, 'videos')).map(f => mapVideo(f, owner.id, liked)) };
}

// Vercel caps a function response at ~4.5 MB, so each playback request returns
// at most one 4 MB slice. Browsers then ask for the next slice by themselves.
const STREAM_CHUNK = 4 * 1024 * 1024;

/** Serve one byte-range slice of a video the signed-in user is allowed to watch. */
async function stream(req: VercelRequest, res: VercelResponse, p: Profile) {
  const id = String(req.query.id || '');
  if (!/^[\w-]+$/.test(id)) throw new HttpError(400, 'invalid id');
  const ownerParam = String(req.query.owner || p.id);

  const asked = String(req.headers.range || '').match(/bytes=(\d*)-(\d*)/);
  const start = asked?.[1] ? parseInt(asked[1], 10) : 0;
  const wantedEnd = asked?.[2] ? parseInt(asked[2], 10) : Infinity;
  const end = Math.min(wantedEnd, start + STREAM_CHUNK - 1);

  let drive: Response;
  let name = 'video.mp4';
  if (ownerParam === 'archive') {
    // Only files that really live in the archive folder.
    const token = await archiveAccessToken();
    const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=name,parents,mimeType`, { headers: { Authorization: `Bearer ${token}` } });
    const m = meta.ok ? await meta.json() as { name?: string; parents?: string[]; mimeType?: string } : {};
    if (!archiveFolderId() || !m.parents?.includes(archiveFolderId()) || !m.mimeType?.startsWith('video/')) throw new HttpError(404, 'Video not found');
    name = m.name || name;
    drive = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${token}`, Range: `bytes=${start}-${end}` } });
  } else {
    // Mine, or someone who shared their library with me — and only files in their Videos folder.
    const owner = await libraryOwner(p, ownerParam);
    const m = await userFileMeta(owner, id);
    if (!m || !owner.drive_videos_folder_id || !m.parents?.includes(owner.drive_videos_folder_id) || !m.mimeType.startsWith('video/')) {
      throw new HttpError(404, 'Video not found');
    }
    name = m.name || name;
    drive = await fetchUserFileRange(owner, id, start, end);
  }
  if (drive.status === 416) { res.status(416).end(); return; }
  if (!drive.ok) throw new HttpError(502, `Drive stream failed (${drive.status})`);

  const body = Buffer.from(await drive.arrayBuffer());
  res.setHeader('Content-Type', drive.headers.get('content-type') || 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
  const range = drive.headers.get('content-range');
  if (range) res.setHeader('Content-Range', range);
  res.setHeader('Content-Length', String(body.length));
  res.status(drive.status === 206 ? 206 : 200).send(body);
}

async function like(p: Profile, body: Record<string, unknown>) {
  const id = String(body.file_id || '');
  if (!id) throw new HttpError(400, 'file_id is required');
  await sb('liked_videos', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      drive_file_id: id, owner_id: p.id,
      brand_name: body.brand || null, video_url: body.video_url || null, prompt: body.prompt || null,
    }),
  });
  return { success: true };
}

async function unlike(p: Profile, body: Record<string, unknown>) {
  const id = String(body.file_id || '');
  if (!id) throw new HttpError(400, 'file_id is required');
  await sb(`liked_videos?drive_file_id=eq.${encodeURIComponent(id)}&owner_id=eq.${p.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  return { success: true };
}

// ── Higgsfield sign-in ────────────────────────────────────────────────────

async function oauthCallback(req: VercelRequest, res: VercelResponse) {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  let result = 'connected';
  try {
    if (!code) throw new HttpError(400, String(req.query.error_description || req.query.error || 'Sign-in was cancelled'));
    await finishConnect(HF, code, state);
  } catch (err) {
    result = 'error:' + (err instanceof Error ? err.message : 'sign-in failed');
    console.error('[video:oauth-callback]', err);
  }
  // Back to the app's Video tab, which reads ?hf= and shows the outcome.
  res.setHeader('Location', `/?hf=${encodeURIComponent(result)}`);
  res.status(302).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action || '');
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  try {
    const p = await requireUser(req);
    // Only admins may change the shared team connection.
    const adminOnly = () => { if (!p.is_admin) throw new HttpError(403, 'Only an admin can change the Higgsfield connection.'); };
    if (req.method === 'GET' && action === 'hf-status') return res.status(200).json({ ...(await connectionStatus(HF)), can_manage: p.is_admin });
    if (req.method === 'POST' && action === 'hf-connect') { adminOnly(); return res.status(200).json({ url: await startConnect(HF, `${siteOrigin(req)}/api/video?action=oauth-callback`) }); }
    if (req.method === 'GET' && action === 'oauth-callback') { adminOnly(); return await oauthCallback(req, res); }
    if (req.method === 'POST' && action === 'hf-disconnect') { adminOnly(); await disconnect(HF); return res.status(200).json({ success: true }); }
    if (req.method === 'POST' && action === 'cost') return res.status(200).json({ credits: await videoCost(HF, toParams(body)) });
    if (req.method === 'GET' && action === 'status') return res.status(200).json(await status(p, String(req.query.id || '')));
    if (req.method === 'GET' && action === 'stream') return await stream(req, res, p);
    if (req.method === 'GET' && action === 'list') return res.status(200).json(await list(p, String(req.query.owner || '')));
    if (req.method === 'POST' && action === 'submit') return res.status(200).json(await submit(p, body));
    if (req.method === 'POST' && action === 'save') return res.status(200).json(await save(req, p, body));
    if (req.method === 'POST' && action === 'like') return res.status(200).json(await like(p, body));
    if (req.method === 'POST' && action === 'unlike') return res.status(200).json(await unlike(p, body));
    if (req.method === 'GET' && action === 'usage-mine') return res.status(200).json(await usageMine(p, req.query.days));
    if (req.method === 'GET' && action === 'usage-team') return await usageTeam(req, res, p);
    return res.status(404).json({ error: `Unknown action "${action}" for ${req.method}` });
  } catch (err) {
    // Drive disconnected → a code the page turns into a "Reconnect Google Drive" button.
    if (err instanceof AuthError && err.message === 'DRIVE_NOT_CONNECTED') {
      return res.status(409).json({ error: 'Your Google Drive is not connected — click "Reconnect Google Drive".', code: 'DRIVE_NOT_CONNECTED' });
    }
    const code = err instanceof HttpError || err instanceof AuthError ? err.status : 500;
    console.error(`[video:${action}]`, err);
    return res.status(code).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
