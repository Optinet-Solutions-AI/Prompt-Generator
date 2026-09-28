/**
 * video-api.ts — tiny browser client for api/video.ts.
 * Every call throws an Error with the server's message so the UI can show it.
 */

export interface LibraryVideo {
  id: string;
  name: string;
  created_at: string;
  brand: string;
  aspect_ratio: string;
  duration: string;
  /** Higgsfield model id, '' if unknown (older videos). */
  model: string;
  prompt: string;
  /** Playback URL (streams through our API). */
  video_url: string;
  /** Download link (same stream route, sent as a file download). */
  download_url: string;
  thumbnail_url: string;
  liked: boolean;
  /** Whose library it's in: a profile id, or 'archive' (before accounts). */
  owner: string;
}

/** The generation settings the server needs (for both `cost` and `submit`). */
export interface VideoRequest {
  prompt: string;
  model: string;
  aspectRatio: string;
  duration: number;
  audio: boolean;
  startImage?: string;
}

async function call<T>(action: string, init?: { body?: unknown; query?: Record<string, string> }): Promise<T> {
  const qs = new URLSearchParams({ action, ...(init?.query || {}) });
  const res = await fetch(`/api/video?${qs}`, init?.body !== undefined
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) }
    : undefined);
  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* non-JSON (e.g. local 404 page) */ }
  if (!res.ok) {
    throw new Error((data.error as string) || `Video API error (${res.status}) — is the API running?`);
  }
  return data as T;
}

export const videoApi = {
  // Higgsfield connection
  hfStatus: () => call<{ connected: boolean; email: string | null; can_manage: boolean }>('hf-status'),
  hfConnect: () => call<{ url: string }>('hf-connect', { body: {} }),
  hfDisconnect: () => call('hf-disconnect', { body: {} }),

  // Generation
  cost: (body: Omit<VideoRequest, 'startImage'>) => call<{ credits: number | null }>('cost', { body }),
  submit: (body: VideoRequest) => call<{ request_id: string }>('submit', { body }),
  status: (id: string) =>
    call<{ status: string; video_url: string | null; error: string | null }>('status', { query: { id } }),
  save: (body: {
    video_url: string; brand: string; prompt: string; aspectRatio: string; duration: number;
    model: string; brandLogo: boolean; brandEndCard: boolean;
  }) => call<{ file: LibraryVideo; branded: boolean; brand_error: string | null }>('save', { body }),

  // Library
  /** owner: '' = mine, a profile id = a shared library, 'archive' = team archive */
  list: (owner = '') => call<{ files: LibraryVideo[] }>('list', owner ? { query: { owner } } : undefined),
  like: (v: Pick<LibraryVideo, 'id' | 'brand' | 'video_url' | 'prompt'>) =>
    call('like', { body: { file_id: v.id, brand: v.brand, video_url: v.video_url, prompt: v.prompt } }),
  unlike: (id: string) => call('unlike', { body: { file_id: id } }),
};
