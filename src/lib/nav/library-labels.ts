// Names for a library view, so the page heading and the "Showing" picker always agree.
import type { LibrarySource } from '@/components/auth/LibrarySourcePicker';
import { firstName, type Person } from '@/lib/auth-api';

/** The people whose libraries I can open: those who shared with me, and (admins only) everyone. */
export interface LibraryPeople { sharedWithMe: Person[]; everyone: Person[] }

/**
 * The library page's heading: what is on screen, in the same words as the
 * sidebar ("My images") and the picker ("Team archive", "Lena's library").
 */
export function libraryHeading(kind: 'images' | 'videos', s: LibrarySource): string {
  return s.kind === 'mine' ? `My ${kind}`
    : s.kind === 'archive' ? `Team archive ${kind}`
    : s.kind === 'items' ? 'Individual items'
    : s.name ? `${s.name}'s ${kind}` : `Shared ${kind}`;
}

/** The address only carries a person's id, so when there is no name yet, look it up in the people lists. */
export function withOwnerName(s: LibrarySource, people: LibraryPeople): LibrarySource {
  if (s.kind !== 'shared' || s.name) return s;
  const found = [...people.sharedWithMe, ...people.everyone].find(p => p.id === s.ownerId);
  return found ? { ...s, name: firstName(found) } : s;
}
