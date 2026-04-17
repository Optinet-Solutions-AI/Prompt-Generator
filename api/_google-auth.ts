/**
 * _google-auth.ts
 *
 * Gets a Google OAuth2 access_token using the stored refresh token.
 * Used to call Google APIs (Drive, etc.) from Vercel API routes.
 */
export async function getGoogleAccessToken(): Promise<string> {
  const refreshToken  = process.env.CLOUD_RUN_REFRESH_TOKEN;
  const clientId      = process.env.CLOUD_RUN_CLIENT_ID;
  const clientSecret  = process.env.CLOUD_RUN_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      'Missing env vars: CLOUD_RUN_REFRESH_TOKEN, CLOUD_RUN_CLIENT_ID, CLOUD_RUN_CLIENT_SECRET'
    );
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
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

  const data = await response.json();
  if (data.access_token) return data.access_token;
  throw new Error('No access_token returned from Google token endpoint');
}

/**
 * Uploads an image buffer to a Google Drive folder.
 * Stores provider/aspectRatio/resolution as appProperties so we can read
 * them back when listing images.
 *
 * Returns the Drive file ID.
 */
export async function uploadImageToDrive(params: {
  imageBuffer: Buffer;
  mimeType:    string;
  filename:    string;
  folderId:    string;
  provider:    string;
  aspectRatio: string;
  resolution:  string;
  accessToken: string;
}): Promise<string> {
  const { imageBuffer, mimeType, filename, folderId, provider, aspectRatio, resolution, accessToken } = params;

  const metadata = {
    name:          filename,
    parents:       [folderId],
    appProperties: { provider, aspectRatio, resolution },
  };

  const boundary    = 'drive_upload_boundary_xyz';
  const metaJson    = JSON.stringify(metadata);

  // Build multipart body: metadata part + binary image part
  const partHeaders =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metaJson}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;

  const closing = `\r\n--${boundary}--`;

  const body = Buffer.concat([
    Buffer.from(partHeaders, 'utf-8'),
    imageBuffer,
    Buffer.from(closing, 'utf-8'),
  ]);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Drive upload failed (${uploadRes.status}): ${err}`);
  }

  const file = await uploadRes.json() as { id: string };
  return file.id;
}
