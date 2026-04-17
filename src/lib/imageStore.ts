/**
 * imageStore.ts
 *
 * localStorage-based store for generated images (ChatGPT, Gemini, edits, variations).
 * Only the GDrive URL + metadata is stored — no actual image files.
 * Supabase is used ONLY for favorites (liked_images table), not here.
 */

const STORAGE_KEY = 'pg_generated_images';
const MAX_IMAGES  = 500; // Prevent localStorage overflow (~500 × ~250 bytes ≈ 125 KB)

export interface StoredImage {
  id:           string;
  created_at:   string;
  filename:     string;
  provider:     string;  // 'chatgpt' | 'gemini' | 'edit' | 'variation'
  aspect_ratio: string;
  resolution:   string;
  storage_path: string;
  public_url:   string;
}

function loadAll(): StoredImage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredImage[]) : [];
  } catch {
    return [];
  }
}

function saveAll(images: StoredImage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
  } catch (e) {
    console.warn('[imageStore] localStorage write failed (may be full):', e);
  }
}

/** Add a new image to the front of the list. Returns the new record. */
export function storeImage(params: {
  public_url:   string;
  provider:     string;
  aspect_ratio: string;
  resolution:   string;
  filename:     string;
}): StoredImage {
  const newImg: StoredImage = {
    id:           `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    created_at:   new Date().toISOString(),
    storage_path: '',
    ...params,
  };
  const updated = [newImg, ...loadAll()].slice(0, MAX_IMAGES);
  saveAll(updated);
  return newImg;
}

/** Read a page of images, optionally filtered by provider. */
export function getImages(
  page: number,
  filter: string,
  pageSize = 40
): { data: StoredImage[]; hasMore: boolean } {
  const all      = loadAll();
  const filtered = filter === 'all' ? all : all.filter(i => i.provider === filter);
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

/** Overwrite an existing image's URL in-place (for "Replace Original" edits). */
export function replaceStoredImage(
  id: string,
  editedUrl: string,
  original: StoredImage
): StoredImage {
  const images = loadAll();
  const idx    = images.findIndex(i => i.id === id);
  const updated: StoredImage = {
    ...original,
    public_url: editedUrl,
    provider:   'edit',
    filename:   `edited-${Date.now()}.png`,
  };
  if (idx !== -1) {
    images[idx] = updated;
  } else {
    images.unshift(updated); // Fallback: prepend if not found
  }
  saveAll(images);
  return updated;
}
