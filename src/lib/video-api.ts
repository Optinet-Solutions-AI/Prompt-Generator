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
  /** Recorded with the usage so the summary can show credits per brand. */
  brand?: string;
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
    mode?: 'custom';
    custom?: { industry: string; color: string; accent: string; tagline: string; logo: string };
  }) => call<{ file: LibraryVideo; branded: boolean; brand_error: string | null }>('save', { body }),

  // Saved custom businesses (team-wide)
  businesses: () => call<{ businesses: SavedBusiness[] }>('businesses'),
  saveBusiness: (b: Omit<SavedBusiness, 'created_by' | 'created_by_email' | 'updated_at'>) => call<{ business: SavedBusiness }>('business-save', { body: b }),
  deleteBusiness: (id: string) => call('business-delete', { body: { id } }),

  // Library
  /** owner: '' = mine, a profile id = a shared library, 'archive' = team archive */
  list: (owner = '') => call<{ files: LibraryVideo[] }>('list', owner ? { query: { owner } } : undefined),
  like: (v: Pick<LibraryVideo, 'id' | 'brand' | 'video_url' | 'prompt'>) =>
    call('like', { body: { file_id: v.id, brand: v.brand, video_url: v.video_url, prompt: v.prompt } }),
  unlike: (id: string) => call('unlike', { body: { file_id: id } }),

  // Higgsfield credit usage
  usageMine: (days: number) => call<UsageSummary & { days: number; recent: UsageRecent[]; image: ImageUsageSummary & { recent: ImageUsageRecent[] } }>('usage-mine', { query: { days: String(days) } }),
  usageTeam: (days: number) => call<UsageSummary & { days: number; people: UsagePerson[]; image: ImageUsageSummary }>('usage-team', { query: { days: String(days) } }),
  /** CSV download links (admins): videos (Higgsfield credits) or images (US$). */
  usageCsvUrl: (days: number, kind: 'videos' | 'images' = 'videos') =>
    `/api/video?action=usage-team&days=${days}&format=csv${kind === 'images' ? '&kind=images' : ''}`,
};

export interface SavedBusiness {
  id: string; name: string; industry: string | null; promote: string | null; color: string | null; accent: string | null;
  tagline: string | null; logo: string | null; created_by: string | null; created_by_email: string | null; updated_at: string;
}

export interface UsageGroup { videos: number; credits: number }
export interface UsageSummary {
  credits: number;
  videos: number;
  /** Failed renders — listed, not counted (Higgsfield normally returns their credits). */
  failed: number;
  by_model: Record<string, UsageGroup>;
  by_brand: Record<string, UsageGroup>;
  /** Which Higgsfield account paid (the team login at the time). */
  by_higgsfield_account: Record<string, UsageGroup>;
}
export interface UsageRecent {
  created_at: string; model: string; brand: string | null; duration: number | null; credits: number | null; status: string;
}
/** Image costs in US$ (OpenAI / Google), per provider and action. */
export interface ImageUsageGroup { images: number; usd: number }
export interface ImageUsageSummary {
  usd: number;
  images: number;
  actions: number;
  /** part of `usd` that is estimated (OpenAI edits/variations) */
  estimated_usd: number;
  /** actions whose cost couldn't be priced */
  unpriced: number;
  by_provider: Record<string, ImageUsageGroup>;
  by_action: Record<string, ImageUsageGroup>;
  by_provider_action: Record<string, ImageUsageGroup>;
  by_brand: Record<string, ImageUsageGroup>;
}
export interface ImageUsageRecent {
  created_at: string; provider: string; action: string; model: string; images: number; brand: string | null; usd: number | null; exact: boolean;
}
export interface UsagePerson extends UsageSummary {
  image: ImageUsageSummary;
  user: { id: string; email: string; name: string | null; avatar_url: string | null; deleted?: boolean };
  last_at: string | null;
}
