/**
 * imageStore.ts
 *
 * localStorage-based store for generated images (ChatGPT, Gemini, edits, variations).
 * Only the GDrive URL + metadata is stored — no actual image files.
 * Supabase is used ONLY for favorites (liked_images table), not here.
 */

// The original key (before accounts). It now holds the TEAM ARCHIVE cache —
// existing browsers already have it filled, so the archive opens instantly.
const STORAGE_KEY = 'pg_generated_images';
const MAX_IMAGES  = 500; // Prevent localStorage overflow (~500 × ~250 bytes ≈ 125 KB)

// ── Whose images? ─────────────────────────────────────────────────────────
// Each signed-in person gets their own cache ("shelf") so two people sharing
// a computer never see each other's library:
//   OWN shelf   → where newly generated images are added (storeImage)
//   VIEW shelf  → what the Image Library is currently showing (mine, a
//                 colleague's shared library, or the team archive)
let ownKey = STORAGE_KEY;
let viewKey = STORAGE_KEY;

/** Called on sign-in / sign-out. Also switches the library view back to "mine". */
export function setImageStoreOwner(userId: string | null): void {
  ownKey = userId ? `${STORAGE_KEY}:u:${userId}` : STORAGE_KEY;
  viewKey = ownKey;
}

export type LibraryView = { kind: 'mine' } | { kind: 'archive' } | { kind: 'items' } | { kind: 'shared'; ownerId: string };

/** Point the Image Library's reads at another shelf. */
export function setImageLibraryView(view: LibraryView): void {
  viewKey = view.kind === 'mine' ? ownKey
    : view.kind === 'archive' ? STORAGE_KEY
    : view.kind === 'items' ? `${ownKey}:items`
    : `${STORAGE_KEY}:shared:${view.ownerId}`;
}

export interface StoredImage {
  id:           string;
  created_at:   string;
  filename:     string;
  provider:     string;  // 'chatgpt' | 'gemini' | 'edit' | 'variation'
  aspect_ratio: string;
  // Exact pixel size "1200 × 600" when known (banner wizard). Preferred over
  // aspect_ratio when cropping rounded downloads to the requested size.
  // Optional — images saved before this field was added won't have it.
  dimensions?:  string;
  resolution:   string;
  storage_path: string;
  public_url:   string;
  // Brand context — used by the Image Library to apply the per-brand shadow
  // overlay when rounded-corner downloads are requested. Optional because
  // images saved before this field was added won't have it.
  brand?:       string;
}

function loadAll(key = viewKey): StoredImage[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredImage[]) : [];
  } catch {
    return [];
  }
}

function saveAll(images: StoredImage[], key = viewKey): void {
  try {
    localStorage.setItem(key, JSON.stringify(images));
  } catch (e) {
    console.warn('[imageStore] localStorage write failed (may be full):', e);
  }
}

/** Add a new image to the front of the list. Returns the new record. */
export function storeImage(params: {
  public_url:   string;
  provider:     string;
  aspect_ratio: string;
  dimensions?:  string;
  resolution:   string;
  filename:     string;
  brand?:       string;
}): StoredImage {
  const newImg: StoredImage = {
    id:           `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    created_at:   new Date().toISOString(),
    storage_path: '',
    ...params,
  };
  // New images always go on the signed-in person's OWN shelf.
  const updated = [newImg, ...loadAll(ownKey)].slice(0, MAX_IMAGES);
  saveAll(updated, ownKey);
  return newImg;
}

/** Read a page of images, optionally filtered by provider and/or brand. */
export function getImages(
  page: number,
  filter: string,
  pageSize = 40,
  brand = 'all',
): { data: StoredImage[]; hasMore: boolean } {
  const all      = loadAll();
  const wanted   = brand.toLowerCase();
  const filtered = all.filter(i =>
    (filter === 'all' || i.provider === filter) &&
    (brand === 'all' || (i.brand || '').toLowerCase() === wanted));
  const offset   = page * pageSize;
  const data     = filtered.slice(offset, offset + pageSize);
  return { data, hasMore: data.length === pageSize };
}

/** Return ALL stored images (used for deduplication during Supabase sync). */
export function getAllStoredImages(): StoredImage[] {
  return loadAll();
}

/**
 * Batch-import images from an external source (e.g. Supabase sync).
 * Does a single localStorage read + single write — far faster than
 * calling storeImage() 500 times individually.
 *
 * newImages must already be deduplicated against localStorage by the caller.
 * They are prepended (newest first) and the list is trimmed to MAX_IMAGES.
 */
export function batchStoreImages(newImages: Omit<StoredImage, 'id' | 'created_at' | 'storage_path'>[]): number {
  if (newImages.length === 0) return 0;
  const now = Date.now();
  const toAdd: StoredImage[] = newImages.map((img, i) => ({
    id:           `img-sb-${now}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    created_at:   new Date(now - (newImages.length - i) * 1000).toISOString(), // preserve ordering
    storage_path: '',
    ...img,
  }));
  // Prepend new images then trim to max
  const merged = [...toAdd, ...loadAll()].slice(0, MAX_IMAGES);
  saveAll(merged);
  return toAdd.length;
}

/** Permanently remove an image by id. */
export function deleteStoredImage(id: string): void {
  saveAll(loadAll().filter(i => i.id !== id));
}

