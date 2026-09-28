/**
 * video.ts — every server-side step of the UGC Video feature, in one route.
 *
 * Pick the step with ?action=…
 *   GET  ?action=hf-status       → is Higgsfield connected? { connected, email }
 *   POST ?action=hf-connect      → returns { url } — the Higgsfield sign-in page
 *   GET  ?action=oauth-callback  → Higgsfield sends the browser back here after sign-in
 *   POST ?action=hf-disconnect   → forget the Higgsfield login
 *   POST ?action=cost            → credits a video would cost (nothing is rendered)
 *   POST ?action=submit          → start a render, returns { request_id }
 *   GET  ?action=status          → &id=<request_id>, returns { status, video_url? }
 *   POST ?action=save            → download the finished video, stamp the brand
 *                                  (corner logo + end card), upload to the VIDEO
 *                                  Drive folder, returns { file }
 *   GET  ?action=list            → every video in the Drive folder (+ liked flag)
 *   GET  ?action=stream          → &id=<drive id>, plays a video (range slices)
 *   POST ?action=like / unlike   → favorites (Supabase `liked_videos`)
 *
 * GENERATION GOES THROUGH THE HIGGSFIELD MCP, on the connected account's PLAN
 * credits (see _higgsfield-mcp.ts for why, and for the token-renewal rules).
 *
 * WHY SUBMIT + STATUS INSTEAD OF ONE CALL:
 * Renders take minutes. Holding one request open that long risks the function
 * timeout, so the browser polls `status` every few seconds instead.
 *
 * ENV VARS:
 *   GOOGLE_DRIVE_VIDEO_FOLDER_ID  — the Drive folder for videos
 *   CLOUD_RUN_* + SUPABASE_*      — same Google/Supabase creds as images
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  HttpError, startConnect, finishConnect, disconnect, connectionStatus,
  submitVideo, videoCost, videoStatus, uploadImage, type VideoParams,
} from './_higgsfield-mcp.js';
import { brandVideo, END_CARD_SECONDS } from './_video-brand.js';

// Downloading, branding and re-uploading a video to Drive can take a while.
export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Video models the Video tab may use (Higgsfield MCP model ids). Anything else
// sent by the browser is rejected, so the page can't spend credits on a
// surprise model. Keep in sync with VIDEO_MODELS in src/lib/ugc-video.ts.
const ALLOWED_MODELS = new Set(['seedance_2_5', 'kling3_0']);
const DEFAULT_MODEL = 'seedance_2_5';

// ── Google Drive helpers ──────────────────────────────────────────────────

// Reused while valid — video playback makes many small `stream` calls in a row.
let cachedToken: { value: string; expires: number } | null = null;

async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.value;
  const { CLOUD_RUN_REFRESH_TOKEN, CLOUD_RUN_CLIENT_ID, CLOUD_RUN_CLIENT_SECRET } = process.env;
  if (!CLOUD_RUN_REFRESH_TOKEN || !CLOUD_RUN_CLIENT_ID || !CLOUD_RUN_CLIENT_SECRET) {
    throw new HttpError(503, 'Google Drive credentials (CLOUD_RUN_*) are not configured');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: CLOUD_RUN_REFRESH_TOKEN,
      client_id: CLOUD_RUN_CLIENT_ID,
      client_secret: CLOUD_RUN_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new HttpError(502, `Google token refresh failed: ${await res.text()}`);
  const data = await res.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new HttpError(502, 'No Google access_token returned');
  cachedToken = { value: data.access_token, expires: Date.now() + ((data.expires_in || 3600) - 300) * 1000 };
  return data.access_token;
}

function videoFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_VIDEO_FOLDER_ID;
  if (!id || id.startsWith('your_')) {
    throw new HttpError(503, 'GOOGLE_DRIVE_VIDEO_FOLDER_ID is not configured yet');
  }
  return id;
}

/**
 * Upload with Drive's "resumable" protocol. The simpler multipart upload is
 * meant for files ≤5 MB, and videos are usually bigger than that.
 */
async function uploadVideoToDrive(p: {
  buffer: Buffer; mimeType: string; filename: string; brand: string;
  prompt: string; aspectRatio: string; duration: string; accessToken: string;
}): Promise<string> {
  const metadata = {
    name: p.filename,
    parents: [videoFolderId()],
    // The prompt goes in `description` — appProperties are capped at 124 bytes each.
    description: p.prompt.slice(0, 4000),
    appProperties: { provider: 'higgsfield', brand: p.brand, aspectRatio: p.aspectRatio, duration: p.duration },
  };
  const start = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${p.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': p.mimeType,
      'X-Upload-Content-Length': String(p.buffer.length),
    },
    body: JSON.stringify(metadata),
  });
  const sessionUrl = start.headers.get('location');
  if (!start.ok || !sessionUrl) throw new HttpError(502, `Drive upload start failed: ${await start.text()}`);

  const put = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Type': p.mimeType, 'Content-Length': String(p.buffer.length) },
    body: p.buffer,
  });
  if (!put.ok) throw new HttpError(502, `Drive upload failed: ${await put.text()}`);
  const file = await put.json() as { id: string };

  // Anyone-with-link can view, so the <video> tag can stream it (same as images).
  await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${p.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  return file.id;
}

interface DriveVideo {
  id: string; name: string; createdTime: string; mimeType: string;
  description?: string; thumbnailLink?: string;
  appProperties?: { brand?: string; aspectRatio?: string; duration?: string };
}

/** The shape the frontend receives for every video. */
function mapVideo(f: DriveVideo, liked: Set<string>) {
  return {
    id: f.id,
    name: f.name,
    created_at: f.createdTime,
    brand: f.appProperties?.brand || '',
    aspect_ratio: f.appProperties?.aspectRatio || '',
    duration: f.appProperties?.duration || '',
    prompt: f.description || '',
    // Browsers refuse to play Drive links inside a <video> tag, so playback
    // goes through our `stream` action; the Drive link is kept for downloads.
    video_url: `/api/video?action=stream&id=${f.id}`,
    download_url: `https://drive.google.com/uc?export=download&id=${f.id}`,
    thumbnail_url: f.thumbnailLink || '',
    liked: liked.has(f.id),
  };
}

// ── Supabase favorites (`liked_videos` table) ─────────────────────────────

async function sb(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new HttpError(503, 'Supabase is not configured');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, `Supabase ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

async function likedIds(): Promise<Set<string>> {
  try {
    const rows = await sb('liked_videos?select=drive_file_id') as Array<{ drive_file_id: string }>;
    return new Set(rows.map(r => r.drive_file_id));
  } catch (err) {
    // Missing table shouldn't break the library — just show nothing as liked.
    console.warn('[video] liked_videos unavailable:', err instanceof Error ? err.message : err);
    return new Set();
  }
}

// ── Actions ───────────────────────────────────────────────────────────────

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

async function cost(body: Record<string, unknown>) {
  return { credits: await videoCost(toParams(body)) };
}

async function submit(body: Record<string, unknown>) {
  const params = toParams(body);
  if (typeof body.startImage === 'string' && body.startImage) {
    params.medias = [{ value: await uploadImage(body.startImage), role: 'start_image' }];
  }
  return { request_id: await submitVideo(params) };
}

async function status(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'invalid id');
  const s = await videoStatus(id);
  // Map Higgsfield's words onto the ones the browser already understands.
  if (s.status === 'ip_detected') {
    return { status: 'failed', video_url: null, error: 'Higgsfield flagged possible copyrighted content (a real person, character or brand) — reword the prompt.' };
  }
  return { status: s.status, video_url: s.url, error: s.error };
}

// Only download finished videos from Higgsfield's own storage — `save` must
// not become a way to make the server fetch arbitrary URLs.
function isHiggsfieldUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return url.startsWith('https://') && (h.endsWith('.cloudfront.net') || h.endsWith('higgsfield.ai'));
  } catch { return false; }
}

/** This deployment's own origin, e.g. https://prompt-generator-virid-delta.vercel.app */
function siteOrigin(req: VercelRequest): string {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  return `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
}

async function save(req: VercelRequest, body: Record<string, unknown>) {
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
  const filename = `${slug ? slug + '-' : ''}ugc-${Date.now()}.mp4`;
  const prompt = String(body.prompt || '');
  const aspectRatio = String(body.aspectRatio || '');
  const accessToken = await getGoogleAccessToken();
  const id = await uploadVideoToDrive({ buffer, mimeType: 'video/mp4', filename, brand, accessToken, prompt, aspectRatio, duration });
  return {
    branded,
    brand_error: brandError || null,
    file: mapVideo({
      id, name: filename, createdTime: new Date().toISOString(), mimeType: 'video/mp4',
      description: prompt, appProperties: { brand, aspectRatio, duration },
    }, new Set()),
  };
}

// Vercel caps a function response at ~4.5 MB, so each playback request returns
// at most one 4 MB slice. Browsers then ask for the next slice by themselves.
const STREAM_CHUNK = 4 * 1024 * 1024;
const verifiedVideoIds = new Set<string>();

/** Serve one byte-range slice of a video from the Video Drive folder. */
async function stream(req: VercelRequest, res: VercelResponse) {
  const id = String(req.query.id || '');
  if (!/^[\w-]+$/.test(id)) throw new HttpError(400, 'invalid id');
  const accessToken = await getGoogleAccessToken();

  // Only stream files that really live in the Video folder — this route must
  // not become a way to read any other file on the Drive account.
  if (!verifiedVideoIds.has(id)) {
    const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=parents,mimeType`,
      { headers: { Authorization: `Bearer ${accessToken}` } });
    const m = meta.ok ? await meta.json() as { parents?: string[]; mimeType?: string } : {};
    if (!m.parents?.includes(videoFolderId()) || !m.mimeType?.startsWith('video/')) {
      throw new HttpError(404, 'Video not found');
    }
    verifiedVideoIds.add(id);
  }

  const asked = String(req.headers.range || '').match(/bytes=(\d*)-(\d*)/);
  const start = asked?.[1] ? parseInt(asked[1], 10) : 0;
  const wantedEnd = asked?.[2] ? parseInt(asked[2], 10) : Infinity;
  const end = Math.min(wantedEnd, start + STREAM_CHUNK - 1);

  const drive = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}`, Range: `bytes=${start}-${end}` },
  });
  if (drive.status === 416) { res.status(416).end(); return; }
  if (!drive.ok) throw new HttpError(502, `Drive stream failed (${drive.status})`);

  const body = Buffer.from(await drive.arrayBuffer());
  res.setHeader('Content-Type', drive.headers.get('content-type') || 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  const range = drive.headers.get('content-range');
  if (range) res.setHeader('Content-Range', range);
  res.setHeader('Content-Length', String(body.length));
  res.status(drive.status === 206 ? 206 : 200).send(body);
}

async function list() {
  const accessToken = await getGoogleAccessToken();
  const q = `'${videoFolderId()}' in parents and trashed = false and mimeType contains 'video/'`;
  const fields = 'files(id,name,createdTime,mimeType,description,thumbnailLink,appProperties)';
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&orderBy=createdTime desc&pageSize=500`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new HttpError(502, `Drive list failed: ${await res.text()}`);
  const { files = [] } = await res.json() as { files?: DriveVideo[] };
  const liked = await likedIds();
  return { files: files.map(f => mapVideo(f, liked)) };
}

async function like(body: Record<string, unknown>) {
  const id = String(body.file_id || '');
  if (!id) throw new HttpError(400, 'file_id is required');
  await sb('liked_videos', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      drive_file_id: id,
      brand_name: body.brand || null,
      video_url: body.video_url || null,
      prompt: body.prompt || null,
    }),
  });
  return { success: true };
}

async function unlike(body: Record<string, unknown>) {
  const id = String(body.file_id || '');
  if (!id) throw new HttpError(400, 'file_id is required');
  await sb(`liked_videos?drive_file_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  return { success: true };
}

// ── Higgsfield sign-in ────────────────────────────────────────────────────

async function oauthCallback(req: VercelRequest, res: VercelResponse) {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  let result = 'connected';
  try {
    if (!code) throw new HttpError(400, String(req.query.error_description || req.query.error || 'Sign-in was cancelled'));
    await finishConnect(code, state);
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
    if (req.method === 'GET' && action === 'hf-status') return res.status(200).json(await connectionStatus());
    if (req.method === 'POST' && action === 'hf-connect') return res.status(200).json({ url: await startConnect(`${siteOrigin(req)}/api/video?action=oauth-callback`) });
    if (req.method === 'GET' && action === 'oauth-callback') return await oauthCallback(req, res);
    if (req.method === 'POST' && action === 'hf-disconnect') { await disconnect(); return res.status(200).json({ success: true }); }
    if (req.method === 'POST' && action === 'cost') return res.status(200).json(await cost(body));
    if (req.method === 'GET' && action === 'status') return res.status(200).json(await status(String(req.query.id || '')));
    if (req.method === 'GET' && action === 'stream') return await stream(req, res);
    if (req.method === 'GET' && action === 'list') return res.status(200).json(await list());
    if (req.method === 'POST' && action === 'submit') return res.status(200).json(await submit(body));
    if (req.method === 'POST' && action === 'save') return res.status(200).json(await save(req, body));
    if (req.method === 'POST' && action === 'like') return res.status(200).json(await like(body));
    if (req.method === 'POST' && action === 'unlike') return res.status(200).json(await unlike(body));
    return res.status(404).json({ error: `Unknown action "${action}" for ${req.method}` });
  } catch (err) {
    const code = err instanceof HttpError ? err.status : 500;
    console.error(`[video:${action}]`, err);
    return res.status(code).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
