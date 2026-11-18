import type {
  AssistantConcept,
  AssistantProvider,
  ChatTurn,
  ConceptsResponse,
  GeneratedFields,
  GenerateResponse,
  RefineResponse,
} from './assistant-types';

/** A failed ideas request, with the HTTP status (429 = daily budget used up, 401 = signed out). */
export class AssistantRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AssistantRequestError';
    this.status = status;
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new AssistantRequestError(`${url} (${res.status}): ${err}`, res.status);
  }
  return res.json() as Promise<T>;
}

// `token` is the tester link's; the main tool is signed in and sends none.
export function requestConcepts(args: {
  token?: string;
  brand: string;
  task: string;
  description?: string;
  model: AssistantProvider;
  avoid?: string[];
  /** Main tool only: every idea must clearly show the occasion (the tester page leaves it off). */
  onBrief?: boolean;
}) {
  return postJson<ConceptsResponse>('/api/assistant/concepts', args);
}

export function requestGenerate(args: {
  token?: string;
  brand: string;
  task: string;
  description?: string;
  pickedConcept: AssistantConcept;
  model: AssistantProvider;
  onBrief?: boolean;
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
