import { describe, it, expect } from 'vitest';
import { brandFromDriveFile } from './list-drive-images.js';

describe('brandFromDriveFile', () => {
  it('prefers appProperties.brand', () => {
    expect(brandFromDriveFile('roosterbet-chatgpt-123.png', { brand: 'Roosterbet' })).toBe('Roosterbet');
  });
  it('falls back to a known slug parsed from the filename prefix', () => {
    expect(brandFromDriveFile('roosterbet-chatgpt-123.png', {})).toBe('Roosterbet');
    expect(brandFromDriveFile('fortuneplay-gemini-9.png', undefined)).toBe('FortunePlay');
  });
  it('returns empty string when there is no brand and no known prefix', () => {
    expect(brandFromDriveFile('chatgpt-123.png', {})).toBe('');
    expect(brandFromDriveFile('gemini-123.png', undefined)).toBe('');
  });
  it('parses the lucky7even slug (digit in the middle)', () => {
    expect(brandFromDriveFile('lucky7even-chatgpt-99.png', undefined)).toBe('Lucky7even');
  });
  it('falls through to the filename slug when appProperties.brand is an empty string', () => {
    expect(brandFromDriveFile('roosterbet-chatgpt-1.png', { brand: '' })).toBe('Roosterbet');
  });
});
