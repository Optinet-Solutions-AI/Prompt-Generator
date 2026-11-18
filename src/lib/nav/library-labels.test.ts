import { describe, it, expect } from 'vitest';
import { libraryHeading, withOwnerName } from './library-labels';
import type { Person } from '@/lib/auth-api';

const U = '11111111-0000-4000-8000-000000000001';

// The page heading names what is on screen, in the sidebar's and the picker's words.
describe('libraryHeading', () => {
  it('says "My images" / "My videos" for my own library, like the sidebar', () => {
    expect(libraryHeading('images', { kind: 'mine' })).toBe('My images');
    expect(libraryHeading('videos', { kind: 'mine' })).toBe('My videos');
  });
  it('says "Team archive images" / "Team archive videos" for the team archive', () => {
    expect(libraryHeading('images', { kind: 'archive' })).toBe('Team archive images');
    expect(libraryHeading('videos', { kind: 'archive' })).toBe('Team archive videos');
  });
  it('says "Individual items" for things shared one by one', () => {
    expect(libraryHeading('images', { kind: 'items' })).toBe('Individual items');
    expect(libraryHeading('videos', { kind: 'items' })).toBe('Individual items');
  });
  it("uses the colleague's name for their shared library", () => {
    expect(libraryHeading('images', { kind: 'shared', ownerId: U, name: 'Lena' })).toBe("Lena's images");
    expect(libraryHeading('videos', { kind: 'shared', ownerId: U, name: 'Lena' })).toBe("Lena's videos");
  });
  it('falls back to "Shared images" / "Shared videos" while the name is unknown', () => {
    expect(libraryHeading('images', { kind: 'shared', ownerId: U, name: '' })).toBe('Shared images');
    expect(libraryHeading('videos', { kind: 'shared', ownerId: U, name: '' })).toBe('Shared videos');
  });
});

// The address only carries a person's id; the name comes from the people lists.
describe('withOwnerName', () => {
  const lena: Person = { id: U, name: 'Lena Novak', email: 'lena@example.com', avatar_url: null };
  it("fills in the colleague's first name from the people who shared with me", () => {
    expect(withOwnerName({ kind: 'shared', ownerId: U, name: '' }, { sharedWithMe: [lena], everyone: [] }))
      .toEqual({ kind: 'shared', ownerId: U, name: 'Lena' });
  });
  it('also finds the person in the admin "Everyone" list', () => {
    expect(withOwnerName({ kind: 'shared', ownerId: U, name: '' }, { sharedWithMe: [], everyone: [lena] }))
      .toEqual({ kind: 'shared', ownerId: U, name: 'Lena' });
  });
  it('leaves the source as it is when the person is not in either list', () => {
    expect(withOwnerName({ kind: 'shared', ownerId: U, name: '' }, { sharedWithMe: [], everyone: [] }))
      .toEqual({ kind: 'shared', ownerId: U, name: '' });
  });
  it('leaves other sources alone', () => {
    expect(withOwnerName({ kind: 'archive' }, { sharedWithMe: [lena], everyone: [] })).toEqual({ kind: 'archive' });
  });
});
