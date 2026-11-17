/**
 * Helpers for "Get ideas" in Custom prompt.
 *
 * A picked idea is turned (by the ideas AI) into the same eight prompt parts a
 * saved reference has. The form then treats the idea AS its reference: the
 * reference value becomes "idea:<title>" so the form knows where the parts came
 * from, Rename/Archive (which act on a saved reference) can be hidden, and the
 * normal "reference required" check is satisfied.
 */
import type { FormData } from '@/types/prompt';
import type { GeneratedFields } from './assistant-types';
import { AssistantRequestError } from './assistant-client';

export const IDEA_REFERENCE_PREFIX = 'idea:';

export function ideaReference(title: string): string {
  return `${IDEA_REFERENCE_PREFIX}${title}`;
}

/** The idea's title when the form's reference came from an idea, otherwise null. */
export function ideaTitleFromReference(reference: string | null | undefined): string | null {
  if (!reference || !reference.startsWith(IDEA_REFERENCE_PREFIX)) return null;
  const title = reference.slice(IDEA_REFERENCE_PREFIX.length);
  return title || null;
}

/** The form after using an idea: the user's settings stay, the eight parts come from the idea. */
export function formDataFromIdea(current: FormData, title: string, fields: GeneratedFields): FormData {
  return {
    ...current,
    reference: ideaReference(title),
    format_layout: fields.format_layout,
    primary_object: fields.primary_object,
    subject: fields.subject,
    lighting: fields.lighting,
    mood: fields.mood,
    background: fields.background,
    positive_prompt: fields.positive_prompt,
    negative_prompt: fields.negative_prompt,
  };
}

export function canAskForIdeas(brand: string, task: string): boolean {
  return !!brand && task.trim().length > 0;
}

/** Same key the tester page uses for its "avoid these" list: one brief = brand + what it's for. */
export function briefKey(brand: string, task: string): string {
  return `${brand}␟${task.trim()}`;
}

/** An answer that arrives after the brand or brief changed belongs to the old brief: drop it. */
export function isStaleAnswer(askedKey: string, currentKey: string): boolean {
  return askedKey !== currentKey;
}

export function ideasErrorMessage(err: unknown): string {
  if (err instanceof AssistantRequestError) {
    if (err.status === 429) return "You've reached today's ideas budget — try again tomorrow";
    if (err.status === 401) return 'Your sign-in has expired — sign in again to get ideas';
  }
  return "Couldn't get ideas — try again";
}
