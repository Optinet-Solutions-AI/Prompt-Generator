import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantConcept, GeneratedFields } from '@/lib/assistant-types';
import { requestConcepts, requestGenerate } from '@/lib/assistant-client';
import { mergeAvoid } from '@/lib/concept-avoid';
import { briefKey, canAskForIdeas, ideasErrorMessage, isStaleAnswer } from '@/lib/ideas';

/**
 * "Get ideas" state for Custom prompt.
 *
 * Kept in WorkScreens (not in the panel) because the form — and the panel in
 * it — is taken off the page while a prompt is made and while the result
 * shows. Living one level up, the ideas are still there after "Edit form" and
 * after visiting other screens. A refresh or a brand change clears them.
 */
const MODEL = 'gemini' as const; // the tester page's default; no model picker in the main tool
// People here ask for a banner for a real occasion ("Black Friday Main Banner"),
// so every idea must clearly show it. The tester page keeps its surprising ideas.
const ON_BRIEF = true;

export interface Ideas {
  open: boolean;
  setOpen: (v: boolean) => void;
  task: string;
  setTask: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  ideas: AssistantConcept[] | null;
  recommendation: string;
  loading: boolean;
  /** Title of the idea being turned into a prompt right now, if any. */
  preparingTitle: string | null;
  error: string | null;
  /** "Get 3 ideas" and "More ideas" (the same brief avoids what was already shown). */
  getIdeas: () => Promise<void>;
  /** The idea's eight prompt parts, or null if another idea is being prepared or it failed. */
  prepareIdea: (idea: AssistantConcept) => Promise<GeneratedFields | null>;
}

export function useIdeas(brand: string): Ideas {
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState('');
  const [description, setDescription] = useState('');
  const [ideas, setIdeas] = useState<AssistantConcept[] | null>(null);
  const [recommendation, setRecommendation] = useState('');
  const [loading, setLoading] = useState(false);
  const [preparingTitle, setPreparingTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // What was already shown for the current brief, so "More ideas" asks for different ones.
  const avoidRef = useRef<{ key: string; list: string[] }>({ key: '', list: [] });
  // The brief as it is now — an answer that arrives for an older brief is dropped.
  const currentKeyRef = useRef(briefKey(brand, task));
  currentKeyRef.current = briefKey(brand, task);
  // Only the newest request may switch the spinner off.
  const requestRef = useRef(0);
  // Set synchronously so a double-click can't prepare two ideas.
  const preparingRef = useRef(false);

  // Ideas belong to one brand: a brand change clears them (and any pending answer).
  useEffect(() => {
    requestRef.current++;
    setIdeas(null);
    setRecommendation('');
    setError(null);
    setLoading(false);
    avoidRef.current = { key: '', list: [] };
  }, [brand]);

  const getIdeas = useCallback(async () => {
    if (!canAskForIdeas(brand, task)) return;
    const id = ++requestRef.current;
    const key = briefKey(brand, task);
    const avoid = avoidRef.current.key === key ? avoidRef.current.list : [];
    setLoading(true);
    setError(null);
    try {
      const r = await requestConcepts({
        brand, task: task.trim(), description: description.trim() || undefined, model: MODEL, avoid, onBrief: ON_BRIEF,
      });
      if (id !== requestRef.current || isStaleAnswer(key, currentKeyRef.current)) return;
      setIdeas(r.concepts);
      setRecommendation(r.recommendation || '');
      avoidRef.current = { key, list: mergeAvoid(avoid, r.concepts) };
    } catch (e) {
      if (id === requestRef.current && !isStaleAnswer(key, currentKeyRef.current)) setError(ideasErrorMessage(e));
    } finally {
      if (id === requestRef.current) setLoading(false);
    }
  }, [brand, task, description]);

  const prepareIdea = useCallback(async (idea: AssistantConcept): Promise<GeneratedFields | null> => {
    if (preparingRef.current) return null;
    preparingRef.current = true;
    setPreparingTitle(idea.title);
    setError(null);
    try {
      const r = await requestGenerate({
        brand, task: task.trim(), description: description.trim() || undefined, model: MODEL, pickedConcept: idea, onBrief: ON_BRIEF,
      });
      return r.metadata;
    } catch (e) {
      setError(ideasErrorMessage(e));
      return null;
    } finally {
      preparingRef.current = false;
      setPreparingTitle(null);
    }
  }, [brand, task, description]);

  return {
    open, setOpen, task, setTask, description, setDescription,
    ideas, recommendation, loading, preparingTitle, error, getIdeas, prepareIdea,
  };
}
