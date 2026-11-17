import { describe, it, expect } from 'vitest';
import { safeReturnPath } from './return-path';

describe('safeReturnPath', () => {
  it('keeps normal in-app paths', () => {
    expect(safeReturnPath('/library/images?from=items')).toBe('/library/images?from=items');
    expect(safeReturnPath('/custom')).toBe('/custom');
  });
  it('rejects anything unsafe or pointless', () => {
    for (const bad of ['/', '//evil.com', '/\\evil.com', '/\t/evil.com', '/\n/evil.com','https://evil.com', 'javascript:alert(1)', '', null, undefined, '/api/auth?action=me']) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });
});
