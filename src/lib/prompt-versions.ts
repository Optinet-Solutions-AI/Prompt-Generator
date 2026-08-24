import type { PromptVersion } from './assistant-types';

/**
 * Append a version, returning a NEW array.
 *
 * Never mutates the input — that is the entire point of this module. The
 * Assistant's prompt state used to be a single slot that generate and refine
 * both overwrote, so every exploratory click cost you the thing you were
 * exploring from.
 *
 * `id` and `createdAt` are supplied here so callers do not have to think about
 * them. crypto.randomUUID() exists in browsers and in Node 18+, so it also
 * works under this repo's node-environment test runner.
 */
export function appendVersion(
  versions: PromptVersion[],
  next: Omit<PromptVersion, 'id' | 'createdAt'>,
): PromptVersion[] {
  return [
    ...versions,
    { ...next, id: crypto.randomUUID(), createdAt: Date.now() },
  ];
}

/**
 * Button text for the version switcher. One definition, so the strip and any
 * future consumer cannot drift apart.
 */
export function versionLabel(v: PromptVersion, index: number): string {
  return `${index + 1} · ${v.source}`;
}
