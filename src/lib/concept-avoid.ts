import type { AssistantConcept } from './assistant-types';

/** Compact "title — first words of description" descriptor used to tell the model what to avoid. */
export function conceptGist(c: { title: string; description: string }, words = 12): string {
  const title = (c.title || '').trim();
  const gist = (c.description || '').trim().split(/\s+/).filter(Boolean).slice(0, words).join(' ');
  return gist ? `${title} — ${gist}` : title;
}

/** Append new concepts' gists to the running avoid-list, de-dupe (case-insensitive), keep the last `cap`. */
export function mergeAvoid(prev: string[], concepts: AssistantConcept[], cap = 15): string[] {
  const seen = new Set(prev.map(s => s.toLowerCase()));
  const out = [...prev];
  for (const c of concepts) {
    const g = conceptGist(c);
    const key = g.toLowerCase();
    if (!seen.has(key)) { out.push(g); seen.add(key); }
  }
  return out.slice(-cap);
}
