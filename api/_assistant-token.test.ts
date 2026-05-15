import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateToken } from './_assistant-token.js';

describe('validateToken', () => {
  const ORIGINAL = process.env.VITE_ASSISTANT_TOKENS;

  beforeEach(() => {
    process.env.VITE_ASSISTANT_TOKENS = 'tester-her-x9k2,tester-john-q7p1';
  });
  afterEach(() => {
    process.env.VITE_ASSISTANT_TOKENS = ORIGINAL;
  });

  it('accepts a token in the allowlist', () => {
    expect(validateToken('tester-her-x9k2')).toEqual({ test_user_id: 'tester-her-x9k2' });
  });

  it('rejects a token not in the allowlist', () => {
    expect(validateToken('random-guess')).toBeNull();
  });

  it('rejects an empty token', () => {
    expect(validateToken('')).toBeNull();
  });

  it('rejects when env var is missing', () => {
    delete process.env.VITE_ASSISTANT_TOKENS;
    expect(validateToken('tester-her-x9k2')).toBeNull();
  });

  it('trims whitespace in the env var entries', () => {
    process.env.VITE_ASSISTANT_TOKENS = ' tester-her-x9k2 , tester-john-q7p1 ';
    expect(validateToken('tester-her-x9k2')).toEqual({ test_user_id: 'tester-her-x9k2' });
  });
});
