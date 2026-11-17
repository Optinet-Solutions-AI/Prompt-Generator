import { describe, it, expect } from 'vitest';
import { sourceLabel } from './LibrarySourcePicker';

const U = '11111111-0000-4000-8000-000000000001';

describe('sourceLabel', () => {
  it('uses a plain fallback when a shared library has no name yet', () => {
    expect(sourceLabel({ kind: 'shared', ownerId: U, name: '' })).toBe('Shared library');
  });
  it('uses the owner name when it is known', () => {
    expect(sourceLabel({ kind: 'shared', ownerId: U, name: 'Meny' })).toBe("Meny's library");
  });
});
