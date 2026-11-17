// The list of screens in the sidebar, and the rules for which address shows which screen.
// Pure TypeScript (no React) so it is easy to test.
import { sourceFromSearch } from './library-address';

export type ScreenId = 'home' | 'custom' | 'sports' | 'video' | 'images' | 'videos' | 'shared' | 'email';
// The screens where a person does work (and could lose it by leaving).
export type WorkScreenId = 'custom' | 'sports' | 'video' | 'email';

export interface ScreenInfo {
  id: ScreenId;
  label: string;
  path: string;
  group: 'home' | 'create' | 'libraries' | 'tools';
  blurb: string;
  activity: string;
}

// Sidebar order.
export const SCREENS: readonly ScreenInfo[] = [
  { id: 'home', label: 'Home', path: '/', group: 'home', activity: 'Home', blurb: '' },
  { id: 'custom', label: 'Custom prompt', path: '/custom', group: 'create', activity: 'Custom Prompt', blurb: 'Make a brand image from a reference prompt' },
  { id: 'sports', label: 'Sports banner', path: '/sports', group: 'create', activity: 'Sports Banner', blurb: 'Build a sports promo banner step by step' },
  { id: 'video', label: 'Video', path: '/video', group: 'create', activity: 'Video', blurb: 'Make a short video for a brand' },
  { id: 'images', label: 'My images', path: '/library/images', group: 'libraries', activity: 'Image Library', blurb: "Every image you've made" },
  { id: 'videos', label: 'My videos', path: '/library/videos', group: 'libraries', activity: 'Video Library', blurb: "Every video you've made" },
  { id: 'shared', label: 'Shared with me', path: '/shared', group: 'libraries', activity: 'Shared with me', blurb: 'Images and videos colleagues shared with you' },
  { id: 'email', label: 'Email checker', path: '/email-content-checker', group: 'tools', activity: 'Email Checker', blurb: 'Build an email and check it for spam risk' },
];

// The section headings in the sidebar and on Home (Home itself has none).
export const GROUP_LABELS: Readonly<Record<'create' | 'libraries' | 'tools', string>> = {
  create: 'CREATE',
  libraries: 'LIBRARIES',
  tools: 'TOOLS',
};

// Old addresses that now point somewhere new.
export const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  '/library': '/library/images',
  '/video-library': '/library/videos',
};

// Browser-storage key that remembers the last screen the person used.
export const LAST_SCREEN_KEY = 'pg_lastScreen';

const WORK_PATHS: Record<string, WorkScreenId> = {
  '/custom': 'custom',
  '/sports': 'sports',
  '/video': 'video',
  '/email-content-checker': 'email',
};

// Lower-cases the address (the router matches without caring about capitals)
// and drops one trailing slash, but keeps '/' as it is.
function trimSlash(pathname: string): string {
  const p = pathname.toLowerCase();
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

// Which work screen (if any) this address shows.
export function workScreenForPath(pathname: string): WorkScreenId | null {
  return WORK_PATHS[trimSlash(pathname)] ?? null;
}

// Which sidebar item should be highlighted for this address.
// A library showing someone else's items (any valid ?from=) counts as "Shared with me".
// An invalid ?from= is treated as "my library", same as sourceFromSearch does.
export function activeScreenForLocation(pathname: string, search: string): ScreenId | null {
  const path = trimSlash(pathname);
  if ((path === '/library/images' || path === '/library/videos') && sourceFromSearch(search).kind !== 'mine') {
    return 'shared';
  }
  return SCREENS.find(s => s.path === path)?.id ?? null;
}

// The screen for the "Continue where you left off" card. Home and unknown values give nothing.
export function continueTarget(saved: string | null): ScreenInfo | null {
  if (!saved || saved === 'home') return null;
  return SCREENS.find(s => s.id === saved) ?? null;
}

export function greetingFor(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}
