import { describe, it, expect } from 'vitest';
import {
  hashPassword, verifyPassword, generateTempPassword, normalizeUsername, usernameProblem, passwordProblem,
  lockMinutesLeft, afterFailedLogin, MAX_FAILED_LOGINS, LOCK_MINUTES,
} from './_password.js';

describe('password hashing', () => {
  it('stores a scrypt hash, never the password itself', async () => {
    const h = await hashPassword('correct horse battery');
    expect(h.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(h).not.toContain('correct horse');
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const h = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(await verifyPassword('correct horse batterY', h)).toBe(false);
  });

  it('salts every hash, so the same password never hashes the same twice', async () => {
    expect(await hashPassword('same password!')).not.toBe(await hashPassword('same password!'));
  });

  it('rejects missing or malformed stored hashes instead of crashing', async () => {
    for (const bad of [null, undefined, '', 'plain-text', 'scrypt$1$2']) expect(await verifyPassword('x', bad)).toBe(false);
  });
});

describe('temporary passwords', () => {
  it('look like xxxx-xxxx-xxxx with no look-alike characters, and are long enough to pass the rules', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword();
      expect(p).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
      expect(p).not.toMatch(/[01OolI]/);
      expect(passwordProblem(p)).toBe('');
    }
  });

  it('are different every time', () => {
    expect(new Set(Array.from({ length: 100 }, generateTempPassword)).size).toBe(100);
  });
});

describe('usernames', () => {
  it('ignore case and surrounding spaces', () => {
    expect(normalizeUsername('  Maria.Santos ')).toBe('maria.santos');
  });

  it('allow letters, digits, dots, dashes and underscores, 3–32 long', () => {
    expect(usernameProblem('maria.santos')).toBe('');
    expect(usernameProblem('leo_park-2')).toBe('');
    expect(usernameProblem('ab')).toMatch(/3–32/);
    expect(usernameProblem('a'.repeat(33))).toMatch(/3–32/);
    expect(usernameProblem('maria santos')).toMatch(/only use/);
    expect(usernameProblem('maria@x')).toMatch(/only use/);
  });
});

describe('new password rules', () => {
  it('need at least 10 characters and not only spaces', () => {
    expect(passwordProblem('short')).toMatch(/at least 10/);
    expect(passwordProblem(' '.repeat(12))).toMatch(/only spaces/);
    expect(passwordProblem('long enough pw')).toBe('');
  });
});

describe('locking after wrong passwords', () => {
  const now = Date.parse('2026-10-08T10:00:00Z');

  it(`counts strikes, then locks for ${LOCK_MINUTES} minutes on strike ${MAX_FAILED_LOGINS} and resets the count`, () => {
    let failed = 0;
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
      const r = afterFailedLogin(failed, now);
      expect(r).toEqual({ failed_logins: i, locked_until: null });
      failed = r.failed_logins;
    }
    const locked = afterFailedLogin(failed, now);
    expect(locked.failed_logins).toBe(0);
    expect(Date.parse(locked.locked_until!)).toBe(now + LOCK_MINUTES * 60_000);
  });

  it('reports minutes left, rounded up, and 0 once the lock has passed', () => {
    expect(lockMinutesLeft(new Date(now + 14.2 * 60_000).toISOString(), now)).toBe(15);
    expect(lockMinutesLeft(new Date(now + 1000).toISOString(), now)).toBe(1);
    expect(lockMinutesLeft(new Date(now - 1000).toISOString(), now)).toBe(0);
    expect(lockMinutesLeft(null, now)).toBe(0);
  });
});
