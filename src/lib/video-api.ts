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
  prompt: string;
  video_url: string;
  thumbnail_url: string;
  liked: boolean;
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
  submit: (body: { prompt: string; aspectRatio: string; duration: number; audio: boolean; startImage?: string }) =>
    call<{ request_id: string }>('submit', { body }),
  status: (id: string) =>
    call<{ status: string; video_url: string | null; error: string | null }>('status', { query: { id } }),
  save: (body: { video_url: string; brand: string; prompt: string; aspectRatio: string; duration: number }) =>
    call<{ file: LibraryVideo }>('save', { body }),
  list: () => call<{ files: LibraryVideo[] }>('list'),
  like: (v: Pick<LibraryVideo, 'id' | 'brand' | 'video_url' | 'prompt'>) =>
    call('like', { body: { file_id: v.id, brand: v.brand, video_url: v.video_url, prompt: v.prompt } }),
  unlike: (id: string) => call('unlike', { body: { file_id: id } }),
};
