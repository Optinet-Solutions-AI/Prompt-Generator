import { describe, it, expect } from 'vitest';
import { accountLabel, firstName } from './auth-api';
import { suggestUsername } from '@/components/auth/AccountsDialog';

describe('showing username accounts (no email)', () => {
  it('labels a person by email, else @username', () => {
    expect(accountLabel({ email: 'maria@x.com', username: 'maria.s' })).toBe('maria@x.com');
    expect(accountLabel({ email: null, username: 'maria.s' })).toBe('@maria.s');
    expect(accountLabel({ email: null })).toBe('');
  });

  it('firstName never crashes when there is no email', () => {
    expect(firstName({ name: 'Maria Santos', email: null })).toBe('Maria');
    expect(firstName({ name: null, email: 'leo@x.com' })).toBe('leo');
    expect(firstName({ name: null, email: null })).toBe('Someone');
  });
});

describe('suggestUsername', () => {
  it('turns a name into a valid username', () => {
    expect(suggestUsername('Maria Santos')).toBe('maria.santos');
    expect(suggestUsername('  José  Ñúñez ')).toBe('jose.nunez');
    expect(suggestUsername("Anne-Marie O'Neil")).toBe('anne-marie.oneil');
    expect(suggestUsername('x'.repeat(40))).toHaveLength(32);
  });
});
