import { describe, it, expect } from 'vitest';
import { sourceFromSearch, searchForSource, libraryPath, filterPeople } from './library-address';

const U = '11111111-0000-4000-8000-000000000001';

describe('sourceFromSearch', () => {
  it('defaults to my library for empty or invalid values', () => {
    expect(sourceFromSearch('')).toEqual({ kind: 'mine' });
    expect(sourceFromSearch('?from=')).toEqual({ kind: 'mine' });
    expect(sourceFromSearch('?from=not-a-uuid')).toEqual({ kind: 'mine' });
    expect(sourceFromSearch('?from=------------------------------------')).toEqual({ kind: 'mine' });
  });
  it('reads items, archive and a person id', () => {
    expect(sourceFromSearch('?from=items')).toEqual({ kind: 'items' });
    expect(sourceFromSearch('?from=archive')).toEqual({ kind: 'archive' });
    expect(sourceFromSearch(`?from=${U}`)).toEqual({ kind: 'shared', ownerId: U, name: '' });
  });
});

describe('searchForSource', () => {
  it('round-trips with sourceFromSearch', () => {
    for (const x of ['', '?from=items', '?from=archive', `?from=${U}`]) {
      expect(searchForSource(sourceFromSearch(x))).toBe(x);
    }
  });
});

describe('libraryPath', () => {
  it('builds the address', () => {
    expect(libraryPath('videos', { kind: 'shared', ownerId: U, name: 'Meny' })).toBe(`/library/videos?from=${U}`);
    expect(libraryPath('images', { kind: 'mine' })).toBe('/library/images');
  });
});

describe('filterPeople', () => {
  const meny = { name: 'Meny Maman', email: 'meny@x.com' };
  const elena = { name: 'Elena', email: 'elena@x.com' };
  const people = [meny, elena];
  it('filters by name or email, case-insensitive', () => {
    expect(filterPeople(people, 'MENY')).toEqual([meny]);
    expect(filterPeople(people, 'elena@')).toEqual([elena]);
    expect(filterPeople(people, '')).toEqual(people);
    expect(filterPeople(people, 'zzz')).toEqual([]);
  });
});
