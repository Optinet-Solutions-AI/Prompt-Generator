import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logAssistantImageGen } from './generate-image';

const insertMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (_table: string) => ({ insert: insertMock }),
  }),
}));

describe('logAssistantImageGen', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ data: null, error: null });
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('no-ops when source is not "assistant"', async () => {
    const req = { body: { test_user_id: 'tester-her' } } as any;
    await logAssistantImageGen(req, 'file-id', 'openai', 'gpt-image-1', '1024x1024', 'standard');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('no-ops when test_user_id is missing even if source is "assistant"', async () => {
    const req = { body: { source: 'assistant' } } as any;
    await logAssistantImageGen(req, 'file-id', 'openai', 'gpt-image-1', '1024x1024', 'standard');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('inserts a row when source="assistant" + test_user_id are present', async () => {
    const req = { body: { source: 'assistant', test_user_id: 'tester-her', assistant_prompt_id: 'p-1' } } as any;
    await logAssistantImageGen(req, 'file-id-abc', 'openai', 'gpt-image-1', '1024x1024', 'standard');
    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0][0];
    expect(row).toMatchObject({
      prompt_id: 'p-1',
      test_user_id: 'tester-her',
      provider: 'openai',
      model: 'gpt-image-1',
      size: '1024x1024',
      quality: 'standard',
      image_count: 1,
      drive_file_id: 'file-id-abc',
    });
    expect('cost_usd' in row).toBe(true);
  });

  it('swallows insert errors silently (does not throw)', async () => {
    insertMock.mockRejectedValueOnce(new Error('supabase down'));
    const req = { body: { source: 'assistant', test_user_id: 'tester-her' } } as any;
    await expect(
      logAssistantImageGen(req, 'file-id', 'openai', 'gpt-image-1', '1024x1024', 'standard')
    ).resolves.toBeUndefined();
  });
});
