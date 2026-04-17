/**
 * list-drive-images.ts
 *
 * Lists all generated images from Google Drive.
 * Searches two folders:
 *   1. GOOGLE_DRIVE_FOLDER_ID — where ChatGPT images are saved
 *   2. Auto-discovered Gemini folder — found by looking up the parent of a
 *      known Gemini image file ID (GOOGLE_DRIVE_GEMINI_SAMPLE_FILE_ID)
 *
 * Self-contained — no local imports (Vercel API routes must be self-contained).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface DriveFile {
  id:            string;
  name:          string;
  createdTime:   string;
  mimeType:      string;
  appProperties?: {
    provider?:    string;
    aspectRatio?: string;
    resolution?:  string;
  };
}

async function getGoogleAccessToken(): Promise<string> {
  const refreshToken  = process.env.CLOUD_RUN_REFRESH_TOKEN;
  const clientId      = process.env.CLOUD_RUN_CLIENT_ID;
  const clientSecret  = process.env.CLOUD_RUN_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing env vars: CLOUD_RUN_REFRESH_TOKEN, CLOUD_RUN_CLIENT_ID, CLOUD_RUN_CLIENT_SECRET');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh Google token: ${error}`);
  }

  const data = await response.json() as { access_token?: string };
  if (data.access_token) return data.access_token;
  throw new Error('No access_token returned from Google token endpoint');
}

/** List all image files in a Drive folder. Returns empty array on failure. */
async function listFilesInFolder(folderId: string, accessToken: string): Promise<DriveFile[]> {
  const query  = `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`;
  const fields = 'files(id,name,createdTime,mimeType,appProperties)';
  const url    = `https://www.googleapis.com/drive/v3/files` +
                 `?q=${encodeURIComponent(query)}` +
                 `&fields=${encodeURIComponent(fields)}` +
                 `&orderBy=createdTime+desc` +
                 `&pageSize=500`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    console.error(`[list-drive-images] folder ${folderId} failed:`, res.status, await res.text());
    return [];
  }
  const data = await res.json() as { files: DriveFile[] };
  return data.files || [];
}

/** Get the parent folder ID of a known file — used to discover the Gemini folder. */
async function getParentFolderId(fileId: string, accessToken: string): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const data = await res.json() as { parents?: string[] };
  return data.parents?.[0] ?? null;
}

function mapFile(f: DriveFile, defaultProvider: string) {
  return {
    id:           f.id,
    filename:     f.name,
    created_at:   f.createdTime,
    provider:     f.appProperties?.provider    || defaultProvider,
    aspect_ratio: f.appProperties?.aspectRatio || '16:9',
    resolution:   f.appProperties?.resolution  || '1K',
    public_url:   `https://lh3.googleusercontent.com/d/${f.id}`,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const chatgptFolderId    = process.env.GOOGLE_DRIVE_FOLDER_ID;
  // A known Gemini image file ID used to auto-discover the Gemini folder
  const geminiSampleFileId = process.env.GOOGLE_DRIVE_GEMINI_SAMPLE_FILE_ID || '1w28G_akdjVs-GRN0heLiJ5Y-qc3-S4wN';

  if (!chatgptFolderId) {
    return res.status(500).json({ error: 'GOOGLE_DRIVE_FOLDER_ID not configured' });
  }

  try {
    const accessToken = await getGoogleAccessToken();

    // ── 1. List ChatGPT images from our main folder ──────────────────────
    const chatgptFiles = await listFilesInFolder(chatgptFolderId, accessToken);

    // ── 2. Discover Gemini folder from known sample file, then list it ───
    let geminiFiles: DriveFile[] = [];
    const geminiFolderId = await getParentFolderId(geminiSampleFileId, accessToken);
    if (geminiFolderId && geminiFolderId !== chatgptFolderId) {
      geminiFiles = await listFilesInFolder(geminiFolderId, accessToken);
      console.log(`[list-drive-images] Gemini folder: ${geminiFolderId}, files: ${geminiFiles.length}`);
    }

    // ── 3. Merge, deduplicate by file ID, sort newest first ─────────────
    const seen  = new Set<string>();
    const files = [...chatgptFiles, ...geminiFiles]
      .filter(f => { if (seen.has(f.id)) return false; seen.add(f.id); return true; })
      .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())
      .map(f => {
        // Determine provider: prefer appProperties, fall back to filename prefix
        const provider = f.appProperties?.provider ||
          (f.name.startsWith('gemini-') ? 'gemini' : 'chatgpt');
        return mapFile(f, provider);
      });

    return res.status(200).json({ files, gemini_folder: geminiFolderId });

  } catch (error) {
    console.error('[list-drive-images] error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
