// Turns "?from=..." in the address into a library source, and back.
import type { LibrarySource } from '@/components/auth/LibrarySourcePicker';

// A person id is a UUID. This is stricter than the server's check (which only
// accepts 36 hex-or-dash characters), so every id accepted here is also accepted there.
const PERSON_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sourceFromSearch(search: string): LibrarySource {
  const from = new URLSearchParams(search).get('from');
  if (from === 'items') return { kind: 'items' };
  if (from === 'archive') return { kind: 'archive' };
  if (from && PERSON_ID.test(from)) return { kind: 'shared', ownerId: from, name: '' };
  return { kind: 'mine' };
}

export function searchForSource(source: LibrarySource): string {
  switch (source.kind) {
    case 'items': return '?from=items';
    case 'archive': return '?from=archive';
    case 'shared': return `?from=${source.ownerId}`;
    default: return '';
  }
}

export function libraryPath(kind: 'images' | 'videos', source: LibrarySource): string {
  return `/library/${kind}${searchForSource(source)}`;
}

// Keeps people whose name or email contains the query (ignoring capitals).
export function filterPeople<T extends { name: string | null; email: string | null }>(people: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return people;
  return people.filter(p => (p.name ?? '').toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q));
}
