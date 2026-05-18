import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal localStorage + window mocks so this test runs in the default Node env
// without requiring jsdom. The cost-store only uses these three globals.
const store: Map<string, string> = new Map();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};
(globalThis as any).window = {
  dispatchEvent: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};
if (!(globalThis as any).crypto?.randomUUID) {
  (globalThis as any).crypto = { randomUUID: () => Math.random().toString(36).slice(2) + Date.now() };
}

const {
  recordLlmCall,
  recordImageGen,
  getCostEntries,
  clearCostEntries,
} = await import('./cost-store');

describe('cost-store', () => {
  const USER = 'tester-her-x9k2';

  beforeEach(() => {
    store.clear();
  });

  it('records and reads LLM calls scoped by test_user_id', () => {
    recordLlmCall(USER, 'concepts', {
      provider: 'gemini', model: 'gemini-2.5-flash',
      input_tokens: 350, cached_input_tokens: 0, output_tokens: 180,
    });

    const entries = getCostEntries(USER);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.kind).toBe('llm');
    if (entry.kind === 'llm') {
      expect(entry.step).toBe('concepts');
      expect(entry.input_tokens).toBe(350);
      expect(entry.output_tokens).toBe(180);
      expect(entry.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('appends multiple entries in order across LLM and image kinds', () => {
    recordLlmCall(USER, 'concepts', { provider: 'gemini', model: 'gemini-2.5-flash', input_tokens: 100, cached_input_tokens: 0, output_tokens: 50 });
    recordImageGen(USER, { provider: 'chatgpt', model: 'gpt-image-1', size: '1024x1024', quality: 'standard', image_count: 1 });
    recordLlmCall(USER, 'refine', { provider: 'gemini', model: 'gemini-2.5-flash', input_tokens: 200, cached_input_tokens: 0, output_tokens: 80 });

    const entries = getCostEntries(USER);
    expect(entries).toHaveLength(3);
    expect(entries[0].kind).toBe('llm');
    expect(entries[1].kind).toBe('image');
    expect(entries[2].kind).toBe('llm');
  });

  it('isolates entries by test_user_id', () => {
    recordLlmCall(USER, 'concepts', { provider: 'gemini', model: 'gemini-2.5-flash', input_tokens: 100, cached_input_tokens: 0, output_tokens: 50 });
    recordLlmCall('different-tester', 'concepts', { provider: 'openai', model: 'gpt-4o', input_tokens: 999, cached_input_tokens: 0, output_tokens: 999 });

    expect(getCostEntries(USER)).toHaveLength(1);
    expect(getCostEntries('different-tester')).toHaveLength(1);
    expect(getCostEntries('non-existent')).toHaveLength(0);

    // Cleanup the other test user too so we don't leak across tests
    clearCostEntries('different-tester');
  });

  it('ignores empty test_user_id', () => {
    recordLlmCall('', 'concepts', { provider: 'gemini', model: 'gemini-2.5-flash', input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 });
    expect(getCostEntries('')).toHaveLength(0);
  });

  it('clearCostEntries removes the bucket', () => {
    recordLlmCall(USER, 'generate', { provider: 'openai', model: 'gpt-4o', input_tokens: 100, cached_input_tokens: 0, output_tokens: 50 });
    expect(getCostEntries(USER)).toHaveLength(1);
    clearCostEntries(USER);
    expect(getCostEntries(USER)).toHaveLength(0);
  });
});
