import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestConcepts, requestGenerate, AssistantRequestError } from './assistant-client';

let calls: Array<{ url: string; body: string }> = [];
let next: { status: number; text: string } = { status: 200, text: '{}' };
const answer = (status: number, text: string) => { next = { status, text }; };
const lastBody = () => calls[calls.length - 1].body;

describe('ideas client', () => {
  beforeEach(() => {
    calls = [];
    answer(200, JSON.stringify({ concepts: [], recommendation: '', usage: {} }));
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return new Response(next.text, { status: next.status });
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sends no token key when signed in (the main tool)', async () => {
    await requestConcepts({ brand: 'RocketSpin', task: 'x', model: 'gemini' });
    expect(JSON.parse(lastBody())).not.toHaveProperty('token');
    await requestGenerate({ brand: 'RocketSpin', task: 'x', model: 'gemini', pickedConcept: { title: 't', description: 'd' } });
    expect(JSON.parse(lastBody())).not.toHaveProperty('token');
  });

  it('still sends the tester token when there is one', async () => {
    await requestConcepts({ token: 'tester-a', brand: 'RocketSpin', task: 'x', model: 'gemini' });
    expect(JSON.parse(lastBody()).token).toBe('tester-a');
  });

  it('throws AssistantRequestError carrying the status', async () => {
    answer(429, 'cap');
    const err = await requestConcepts({ brand: 'RocketSpin', task: 'x', model: 'gemini' }).catch((e) => e);
    expect(err).toBeInstanceOf(AssistantRequestError);
    expect(err).toMatchObject({ name: 'AssistantRequestError', status: 429 });
    expect(err.message).toBe('/api/assistant/concepts (429): cap');
  });
});
