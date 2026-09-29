/**
 * _user-drive.ts — each signed-in user's OWN Google Drive.
 *
 * Permission used: `drive.file` — the app can only see and change files IT
 * created in the user's Drive, nothing else. That's why the user never has to
 * pick or share a folder: on first use we create
 *
 *     My Drive / Prompt Generator / Images
 *                                 / Videos
 *
 * and remember the folder ids on their profile. If they delete or move a
 * folder, the next save notices and quietly recreates it.
 *
 * Sharing inside the app (library_shares) does NOT use Drive sharing: with
 * drive.file a viewer's own login can't read the owner's files, so the server
 * reads them with the OWNER's login after checking the share exists.
 *
 * Underscore file = helper, not its own Vercel route.
 */
import { AuthError, updateProfile, type Profile } from './_session.js';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_NAME = 'Prompt Generator';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export type DriveFolderKind = 'images' | 'videos';

export function googleClient() {
  // Falls back to the Google client the shared Drive setup already uses
  // (same Web client in the "Multi-Brand AI Prompt Gen" Google Cloud project).
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.CLOUD_RUN_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.CLOUD_RUN_CLIENT_SECRET;
  if (!id || !secret) throw new AuthError(503, 'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not configured');
  return { id, secret };
}

/** A working Drive access token for this user (renewed when close to expiry). */
export async function driveToken(p: Profile): Promise<string> {
  if (p.drive_access_token && p.drive_token_expires_at && Date.parse(p.drive_token_expires_at) - Date.now() > 5 * 60_000) {
    return p.drive_access_token;
  }
  if (!p.drive_refresh_token) throw new AuthError(409, 'DRIVE_NOT_CONNECTED');
  const { id, secret } = googleClient();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: p.drive_refresh_token, client_id: id, client_secret: secret }),
  });
  const data = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) {
    // invalid_grant = the user removed the app's access in their Google settings.
    if (data.error === 'invalid_grant') {
      await updateProfile(p.id, { drive_refresh_token: null, drive_access_token: null, drive_token_expires_at: null });
      throw new AuthError(409, 'DRIVE_NOT_CONNECTED');
    }
    throw new AuthError(502, `Google Drive sign-in renewal failed (${data.error || res.status})`);
  }
  const expires = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  // Google refresh tokens are reusable (unlike Higgsfield's), so parallel renewals are harmless.
  await updateProfile(p.id, { drive_access_token: data.access_token, drive_token_expires_at: expires });
  p.drive_access_token = data.access_token; p.drive_token_expires_at = expires;
  return data.access_token;
}

async function drive(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (res.status === 403) {
    const t = await res.text();
    if (t.includes('storageQuotaExceeded')) throw new AuthError(507, 'Your Google Drive is full — free up space, then try again.');
    throw new AuthError(403, `Google Drive refused the request: ${t.slice(0, 200)}`);
  }
  return res;
}

/** Is this folder still there (not trashed)? */
async function folderAlive(token: string, id: string | null): Promise<boolean> {
  if (!id) return false;
  const r = await drive(token, `files/${id}?fields=id,trashed`);
  if (!r.ok) return false;
  const f = await r.json() as { trashed?: boolean };
  return !f.trashed;
}

async function createFolder(token: string, name: string, parent?: string): Promise<string> {
  const r = await drive(token, 'files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}) }),
  });
  if (!r.ok) throw new AuthError(502, `Could not create the "${name}" folder in Google Drive (${r.status})`);
  return (await r.json() as { id: string }).id;
}

/** Folder id for this user's Images or Videos folder, creating/recreating as needed. */
export async function ensureFolder(p: Profile, kind: DriveFolderKind): Promise<string> {
  const token = await driveToken(p);
  const key = kind === 'images' ? 'drive_images_folder_id' : 'drive_videos_folder_id';
  if (await folderAlive(token, p[key])) return p[key] as string;

  let root = p.drive_root_folder_id;
  if (!(await folderAlive(token, root))) {
    root = await createFolder(token, ROOT_NAME);
    await updateProfile(p.id, { drive_root_folder_id: root });
    p.drive_root_folder_id = root;
  }
  const id = await createFolder(token, kind === 'images' ? 'Images' : 'Videos', root || undefined);
  await updateProfile(p.id, { [key]: id } as Partial<Profile>);
  p[key] = id;
  return id;
}

/** Upload a file into the user's folder (resumable — fine for any size). Returns the file id. */
export async function uploadToUserDrive(p: Profile, kind: DriveFolderKind, file: {
  buffer: Buffer; mimeType: string; name: string; description?: string; appProperties?: Record<string, string>;
}): Promise<string> {
  const folder = await ensureFolder(p, kind);
  const token = await driveToken(p);
  const start = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': file.mimeType, 'X-Upload-Content-Length': String(file.buffer.length),
    },
    body: JSON.stringify({
      name: file.name, parents: [folder],
      ...(file.description ? { description: file.description.slice(0, 4000) } : {}),
      ...(file.appProperties ? { appProperties: file.appProperties } : {}),
    }),
  });
  const session = start.headers.get('location');
  if (!start.ok || !session) {
    const t = await start.text();
    if (t.includes('storageQuotaExceeded')) throw new AuthError(507, 'Your Google Drive is full — free up space, then try again.');
    throw new AuthError(502, `Google Drive upload failed to start (${start.status})`);
  }
  const put = await fetch(session, { method: 'PUT', headers: { 'Content-Type': file.mimeType }, body: file.buffer });
  if (!put.ok) throw new AuthError(502, `Google Drive upload failed (${put.status})`);
  return (await put.json() as { id: string }).id;
}

/** "Anyone with the link can view" — images need this so Edit/Variations can fetch them by URL. */
export async function makeUserFilePublic(p: Profile, fileId: string) {
  const token = await driveToken(p);
  await drive(token, `files/${fileId}/permissions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
}

export interface UserDriveFile {
  id: string; name: string; createdTime: string; mimeType: string;
  description?: string; thumbnailLink?: string; parents?: string[];
  appProperties?: Record<string, string>;
}

/** Every file in the user's Images or Videos folder, newest first. Empty if never used. */
export async function listUserFolder(p: Profile, kind: DriveFolderKind): Promise<UserDriveFile[]> {
  const key = kind === 'images' ? 'drive_images_folder_id' : 'drive_videos_folder_id';
  if (!p[key] || !p.drive_refresh_token) return [];
  const token = await driveToken(p);
  const mime = kind === 'images' ? 'image/' : 'video/';
  const q = `'${p[key]}' in parents and trashed = false and mimeType contains '${mime}'`;
  const fields = 'nextPageToken,files(id,name,createdTime,mimeType,description,thumbnailLink,appProperties)';
  const out: UserDriveFile[] = [];
  let pageToken = '';
  do {
    const r = await drive(token, `files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&orderBy=createdTime desc&pageSize=500${pageToken ? `&pageToken=${pageToken}` : ''}`);
    if (!r.ok) throw new AuthError(502, `Could not list your Google Drive folder (${r.status})`);
    const data = await r.json() as { files?: UserDriveFile[]; nextPageToken?: string };
    out.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken && out.length < 5000);
  return out;
}

/**
 * Full metadata for specific files in this user's Images/Videos folder
 * (used for items shared one by one). Files that were deleted, trashed or
 * aren't in that folder are skipped.
 */
export async function userFilesInFolder(p: Profile, kind: DriveFolderKind, ids: string[]): Promise<UserDriveFile[]> {
  const folder = kind === 'images' ? p.drive_images_folder_id : p.drive_videos_folder_id;
  if (!folder || !p.drive_refresh_token || ids.length === 0) return [];
  const token = await driveToken(p);
  const fields = 'id,name,createdTime,mimeType,description,thumbnailLink,appProperties,parents,trashed';
  const out = await Promise.all(ids.slice(0, 200).map(async id => {
    const r = await drive(token, `files/${encodeURIComponent(id)}?fields=${fields}`);
    if (!r.ok) return null;
    const f = await r.json() as UserDriveFile & { trashed?: boolean };
    return !f.trashed && f.parents?.includes(folder) ? f : null;
  }));
  return out.filter((f): f is UserDriveFile => !!f);
}

/** File metadata, used to check a file really belongs to this user's folder. */
export async function userFileMeta(p: Profile, fileId: string): Promise<UserDriveFile | null> {
  const token = await driveToken(p);
  const r = await drive(token, `files/${fileId}?fields=id,name,mimeType,parents,trashed`);
  if (!r.ok) return null;
  const f = await r.json() as UserDriveFile & { trashed?: boolean };
  return f.trashed ? null : f;
}

/** One byte range of a file (for video playback). */
export async function fetchUserFileRange(p: Profile, fileId: string, start: number, end: number) {
  const token = await driveToken(p);
  return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}`, Range: `bytes=${start}-${end}` },
  });
}

/** Revoke the app's Drive access (sign-out "disconnect Drive"). Best effort. */
export async function revokeDrive(p: Profile) {
  const t = p.drive_refresh_token || p.drive_access_token;
  if (t) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: 'POST' }).catch(() => undefined);
}
