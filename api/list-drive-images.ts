/**
 * list-drive-images.ts
 *
 * Lists all generated images from the Google Drive folder.
 * Called by the Image Library on load to populate the gallery.
 *
 * Returns files ordered newest first, with metadata stored as
 * appProperties (provider, aspectRatio, resolution).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getGoogleAccessToken } from './_google-auth';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) return res.status(500).json({ error: 'GOOGLE_DRIVE_FOLDER_ID not configured' });

  try {
    const accessToken = await getGoogleAccessToken();

    // Query Drive for all image files in the folder, newest first
    const query  = `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`;
    const fields  = 'files(id,name,createdTime,mimeType,appProperties)';
    const url     = `https://www.googleapis.com/drive/v3/files` +
                    `?q=${encodeURIComponent(query)}` +
                    `&fields=${encodeURIComponent(fields)}` +
                    `&orderBy=createdTime+desc` +
                    `&pageSize=500`;

    const driveRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!driveRes.ok) {
      const err = await driveRes.text();
      return res.status(500).json({ error: `Drive API failed (${driveRes.status}): ${err}` });
    }

    const data = await driveRes.json() as { files: DriveFile[] };
    const files = (data.files || []).map(f => ({
      id:           f.id,
      filename:     f.name,
      created_at:   f.createdTime,
      provider:     f.appProperties?.provider    || 'chatgpt',
      aspect_ratio: f.appProperties?.aspectRatio || '16:9',
      resolution:   f.appProperties?.resolution  || '1K',
      // lh3.googleusercontent.com serves Drive files as direct images
      public_url:   `https://lh3.googleusercontent.com/d/${f.id}`,
    }));

    return res.status(200).json({ files });

  } catch (error) {
    console.error('[list-drive-images] error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
