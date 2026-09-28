import { describe, it, expect } from 'vitest';
import { summarize, type UsageRow } from './video.js';

const row = (o: Partial<UsageRow>): UsageRow => ({
  user_id: 'u1', job_id: Math.random().toString(), model: 'kling3_0', duration: 5, aspect_ratio: '9:16',
  brand: 'SpinJo', start_image: false, credits: 12.5, status: 'completed', created_at: new Date().toISOString(), ...o,
});

describe('summarize — Higgsfield credit usage', () => {
  it('adds up credits and videos, grouped by model and brand', () => {
    const s = summarize([
      row({}),
      row({ model: 'seedance_2_5', credits: 35, brand: 'Roosterbet' }),
      row({ credits: '12.5' }), // Supabase returns numeric columns as strings
    ]);
    expect(s.credits).toBe(60);
    expect(s.videos).toBe(3);
    expect(s.by_model).toEqual({ 'Kling 3.0 Pro': { videos: 2, credits: 25 }, 'Seedance 2.5': { videos: 1, credits: 35 } });
    expect(s.by_brand.SpinJo).toEqual({ videos: 2, credits: 25 });
  });

  it('lists failed renders but does not count their credits', () => {
    const s = summarize([row({}), row({ status: 'failed', credits: 70 })]);
    expect(s).toMatchObject({ credits: 12.5, videos: 1, failed: 1 });
  });

  it('counts renders still in progress (credits are already reserved)', () => {
    expect(summarize([row({ status: 'submitted' })]).credits).toBe(12.5);
  });

  it('handles an unknown price without breaking the total', () => {
    expect(summarize([row({ credits: null }), row({})]).credits).toBe(12.5);
  });
});
