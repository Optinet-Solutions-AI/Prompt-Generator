import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal localStorage mock so this runs in the default Node env (no browser).
const store: Map<string, string> = new Map();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
});

import { peekImages, setImageStoreOwner, setImageLibraryView, getImages } from './imageStore';

const img = (url: string) => ({
  id: url, created_at: '2026-11-17T00:00:00Z', filename: `${url}.png`, provider: 'gemini',
  aspect_ratio: '16:9', resolution: '1K', storage_path: '', public_url: url,
});
const put = (key: string, urls: string[]) => store.set(key, JSON.stringify(urls.map(img)));

describe('peekImages', () => {
  beforeEach(() => {
    store.clear();
    setImageStoreOwner('me');
  });

  it('returns the first n images from my own shelf', () => {
    put('pg_generated_images:u:me', ['a', 'b', 'c', 'd']);
    expect(peekImages({ kind: 'mine' }, 2).map(i => i.public_url)).toEqual(['a', 'b']);
  });

  it("reads a colleague's shelf without switching what the Image Library shows", () => {
    put('pg_generated_images:u:me', ['mine1']);
    put('pg_generated_images:shared:meny', ['m1', 'm2', 'm3', 'm4']);
    expect(peekImages({ kind: 'shared', ownerId: 'meny' }, 3).map(i => i.public_url)).toEqual(['m1', 'm2', 'm3']);
    // The library view is still mine.
    expect(getImages(0, 'all').data.map(i => i.public_url)).toEqual(['mine1']);
  });

  it('reads my shelf even while the library is pointed at someone else', () => {
    put('pg_generated_images:u:me', ['mine1']);
    setImageLibraryView({ kind: 'archive' });
    expect(peekImages({ kind: 'mine' }, 5).map(i => i.public_url)).toEqual(['mine1']);
  });

  it('gives an empty list for a shelf that was never cached or is corrupt', () => {
    expect(peekImages({ kind: 'shared', ownerId: 'nobody' }, 3)).toEqual([]);
    store.set('pg_generated_images:u:me', '{not json');
    expect(peekImages({ kind: 'mine' }, 3)).toEqual([]);
  });

  it('skips cached entries with no picture address', () => {
    store.set('pg_generated_images:u:me', JSON.stringify([img(''), img('a')]));
    expect(peekImages({ kind: 'mine' }, 3).map(i => i.public_url)).toEqual(['a']);
  });
});
