/**
 * video.ts — every server-side step of the UGC Video feature, in one route.
 *
 * Pick the step with ?action=…
 *   POST ?action=submit   → send the prompt to Higgsfield, returns { request_id }
 *   GET  ?action=status   → &id=<request_id>, returns { status, video_url? }
 *   POST ?action=save     → download the finished video, upload it to the
 *                           VIDEO Drive folder, returns { file }
 *   GET  ?action=list     → every video in the Drive folder (+ liked flag)
 *   POST ?action=like     → add a video to favorites (Supabase `liked_videos`)
 *   POST ?action=unlike   → remove it from favorites
 *
 * WHY SUBMIT + STATUS INSTEAD OF ONE CALL:
 * Higgsfield renders take minutes. Holding one request open that long risks
 * the function timeout, so the browser polls `status` every few seconds instead.
 *
 * ENV VARS (see .env.local):
 *   HF_API_KEY_ID, HF_API_KEY_SECRET   — Higgsfield console → API keys
 *   HF_VIDEO_MODEL_T2V                  — text-to-video endpoint path
 *   HF_VIDEO_MODEL_I2V                  — image-to-video endpoint path
 *   GOOGLE_DRIVE_VIDEO_FOLDER_ID        — the NEW Drive folder for videos
 *   CLOUD_RUN_* + SUPABASE_*            — same Google/Supabase creds as images
 *
 * Self-contained (no local imports), matching the other Drive routes.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Downloading + re-uploading a video to Drive can take a while.
export const config = { maxDuration: 300 };

const HF_BASE = 'https://api.higgsfield.ai';
// Defaults are the Seedance endpoints from Higgsfield's quick-start. The I2V
// path is a best guess until checked against the model page in the console —
// override either one with an env var without touching code.
const T2V_MODEL = process.env.HF_VIDEO_MODEL_T2V || 'bytedance/seedance-2.0/text-to-video';
const I2V_MODEL = process.env.HF_VIDEO_MODEL_I2V || 'bytedance/seedance-2.0/image-to-video';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ── Higgsfield helpers ────────────────────────────────────────────────────

function hfAuthHeader(): string {
  // The Higgsfield console hands out ONE combined "id:secret" string.
  // (Older keys came as two parts — still accepted via HF_API_KEY_ID + HF_API_KEY_SECRET.)
  const { HF_API_KEY, HF_API_KEY_ID, HF_API_KEY_SECRET } = process.env;
  const key = HF_API_KEY || (HF_API_KEY_ID && HF_API_KEY_SECRET ? `${HF_API_KEY_ID}:${HF_API_KEY_SECRET}` : '');
  if (!key || key.startsWith('your_')) {
    throw new HttpError(503, 'Higgsfield API key is not configured yet (HF_API_KEY).');
  }
  return `Key ${key}`;
}

async function hfFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${HF_BASE}/${path.replace(/^\//, '')}`, {
    ...init,
    headers: { Authorization: hfAuthHeader(), 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, `Higgsfield ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/** Upload the optional start image to Higgsfield storage, return its public URL. */
async function uploadStartImage(dataUrl: string): Promise<string> {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new HttpError(400, 'startImage must be a base64 data URL');
  const [, contentType, b64] = m;
  const signed = await hfFetch('files/generate-upload-url', {
    method: 'POST',
    body: JSON.stringify({ content_type: contentType }),
  }) as { upload_url: string; upload_headers?: Record<string, string>; public_url: string };
  // The signed PUT must NOT carry our API key.
  const put = await fetch(signed.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, ...(signed.upload_headers || {}) },
    body: Buffer.from(b64, 'base64'),
  });
  if (!put.ok) throw new HttpError(502, `Start image upload failed (${put.status})`);
  return signed.public_url;
}

// ── Google Drive helpers ──────────────────────────────────────────────────

async function getGoogleAccessToken(): Promise<string> {
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
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new HttpError(502, 'No Google access_token returned');
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
    video_url: `https://drive.google.com/uc?export=download&id=${f.id}`,
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

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function submit(body: Record<string, unknown>) {
  const prompt = String(body.prompt || '').trim();
  if (!prompt) throw new HttpError(400, 'prompt is required');

  const payload: Record<string, unknown> = {
    prompt,
    aspect_ratio: String(body.aspectRatio || '9:16'),
    duration: Number(body.duration) || 5,
    resolution: '720p',
    generate_audio: body.audio !== false,
  };

  let model = T2V_MODEL;
  if (typeof body.startImage === 'string' && body.startImage) {
    payload.image_url = await uploadStartImage(body.startImage);
    model = I2V_MODEL;
  }

  const data = await hfFetch(model, { method: 'POST', body: JSON.stringify(payload) }) as { request_id?: string };
  if (!data.request_id) throw new HttpError(502, 'Higgsfield did not return a request_id');
  return { request_id: data.request_id, model };
}

async function status(id: string) {
  if (!/^[\w-]+$/.test(id)) throw new HttpError(400, 'invalid id');
  const data = await hfFetch(`requests/${id}/status`) as {
    status?: string; video?: { url?: string }; error?: string;
  };
  return { status: data.status || 'unknown', video_url: data.video?.url || null, error: data.error || null };
}

async function save(body: Record<string, unknown>) {
  const url = String(body.video_url || '');
  if (!/^https:\/\//.test(url)) throw new HttpError(400, 'video_url must be an https URL');
  const brand = String(body.brand || '').trim();

  const vid = await fetch(url);
  if (!vid.ok) throw new HttpError(502, `Could not download the video (${vid.status})`);
  const mimeType = vid.headers.get('content-type')?.split(';')[0] || 'video/mp4';
  const buffer = Buffer.from(await vid.arrayBuffer());

  const slug = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
  const filename = `${slug ? slug + '-' : ''}ugc-${Date.now()}.${mimeType.split('/')[1] || 'mp4'}`;
  const accessToken = await getGoogleAccessToken();
  const id = await uploadVideoToDrive({
    buffer, mimeType, filename, brand, accessToken,
    prompt: String(body.prompt || ''),
    aspectRatio: String(body.aspectRatio || ''),
    duration: String(body.duration || ''),
  });
  return {
    file: mapVideo({
      id, name: filename, createdTime: new Date().toISOString(), mimeType,
      description: String(body.prompt || ''),
      appProperties: { brand, aspectRatio: String(body.aspectRatio || ''), duration: String(body.duration || '') },
    }, new Set()),
  };
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action || '');
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  try {
    if (req.method === 'GET' && action === 'status') return res.status(200).json(await status(String(req.query.id || '')));
    if (req.method === 'GET' && action === 'list') return res.status(200).json(await list());
    if (req.method === 'POST' && action === 'submit') return res.status(200).json(await submit(body));
    if (req.method === 'POST' && action === 'save') return res.status(200).json(await save(body));
    if (req.method === 'POST' && action === 'like') return res.status(200).json(await like(body));
    if (req.method === 'POST' && action === 'unlike') return res.status(200).json(await unlike(body));
    return res.status(404).json({ error: `Unknown action "${action}" for ${req.method}` });
  } catch (err) {
    const code = err instanceof HttpError ? err.status : 500;
    console.error(`[video:${action}]`, err);
    return res.status(code).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
