import type {
  AssistantConcept,
  AssistantProvider,
  ChatTurn,
  ConceptsResponse,
  GeneratedFields,
  GenerateResponse,
  RefineResponse,
} from './assistant-types';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${url} (${res.status}): ${err}`);
  }
  return res.json() as Promise<T>;
}

export function requestConcepts(args: {
  token: string;
  brand: string;
  task: string;
  description?: string;
  model: AssistantProvider;
  avoid?: string[];
}) {
  return postJson<ConceptsResponse>('/api/assistant/concepts', args);
}

export function requestGenerate(args: {
  token: string;
  brand: string;
  task: string;
  description?: string;
  pickedConcept: AssistantConcept;
  model: AssistantProvider;
}) {
  return postJson<GenerateResponse>('/api/assistant/generate', args);
}

export function requestRefine(args: {
  token: string;
  brand: string;
  currentFields: GeneratedFields;
  chatHistory: ChatTurn[];
  userMessage: string;
  model: AssistantProvider;
  task?: string;
  description?: string;
}) {
  return postJson<RefineResponse>('/api/assistant/refine', args);
}
