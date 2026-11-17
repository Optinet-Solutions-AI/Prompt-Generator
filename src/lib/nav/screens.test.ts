import { describe, it, expect } from 'vitest';
import {
  SCREENS, LEGACY_REDIRECTS, GROUP_LABELS, workScreenForPath, activeScreenForLocation, continueTarget, greetingFor,
} from './screens';

describe('workScreenForPath', () => {
  it('maps the work screens', () => {
    expect(workScreenForPath('/custom')).toBe('custom');
    expect(workScreenForPath('/sports')).toBe('sports');
    expect(workScreenForPath('/video')).toBe('video');
    expect(workScreenForPath('/video/')).toBe('video');
    expect(workScreenForPath('/Custom')).toBe('custom');
    expect(workScreenForPath('/EMAIL-CONTENT-CHECKER')).toBe('email');
    expect(workScreenForPath('/email-content-checker')).toBe('email');
  });
  it('returns null for everything else', () => {
    expect(workScreenForPath('/')).toBeNull();
    expect(workScreenForPath('/library/videos')).toBeNull();
    expect(workScreenForPath('/videox')).toBeNull();
  });
});

describe('activeScreenForLocation', () => {
  it('finds the highlighted sidebar item', () => {
    expect(activeScreenForLocation('/', '')).toBe('home');
    expect(activeScreenForLocation('/library/images', '')).toBe('images');
    expect(activeScreenForLocation('/library/images', '?from=items')).toBe('shared');
    expect(activeScreenForLocation('/library/videos', '?from=archive')).toBe('shared');
    expect(activeScreenForLocation('/library/images', '?from=11111111-0000-4000-8000-000000000001')).toBe('shared');
    expect(activeScreenForLocation('/library/videos', '?from=not-a-uuid')).toBe('videos');
    expect(activeScreenForLocation('/Library/Images', '')).toBe('images');
    expect(activeScreenForLocation('/shared', '')).toBe('shared');
    expect(activeScreenForLocation('/nope', '')).toBeNull();
  });
});

describe('continueTarget', () => {
  it('ignores missing, home and unknown values', () => {
    expect(continueTarget(null)).toBeNull();
    expect(continueTarget('home')).toBeNull();
    expect(continueTarget('bogus')).toBeNull();
  });
  it('returns the saved screen', () => {
    expect(continueTarget('video')?.path).toBe('/video');
  });
});

describe('SCREENS and LEGACY_REDIRECTS', () => {
  it('has the eight labels in sidebar order with unique paths', () => {
    expect(SCREENS.map(s => s.label)).toEqual([
      'Home', 'Custom prompt', 'Sports banner', 'Video',
      'My images', 'My videos', 'Shared with me', 'Email checker',
    ]);
    expect(new Set(SCREENS.map(s => s.path)).size).toBe(SCREENS.length);
  });
  it('redirects the old library addresses', () => {
    expect(LEGACY_REDIRECTS).toEqual({ '/library': '/library/images', '/video-library': '/library/videos' });
  });
  it('has the section headings', () => {
    expect(GROUP_LABELS).toEqual({ create: 'Create', libraries: 'Libraries', tools: 'Tools' });
  });
});

describe('greetingFor', () => {
  it('picks the greeting by hour', () => {
    expect(greetingFor(5)).toBe('Good morning');
    expect(greetingFor(11)).toBe('Good morning');
    expect(greetingFor(12)).toBe('Good afternoon');
    expect(greetingFor(17)).toBe('Good afternoon');
    expect(greetingFor(18)).toBe('Good evening');
    expect(greetingFor(2)).toBe('Good evening');
  });
});
