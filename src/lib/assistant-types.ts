export type AssistantProvider = 'openai' | 'gemini' | 'claude';

export interface AssistantConcept {
  title: string;
  description: string;
}

export interface AssistantUsage {
  provider: AssistantProvider;
  model: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

export interface ConceptsResponse {
  concepts: AssistantConcept[];     // normally 3, but can be fewer if a concept call fails
  recommendation: string;
  usage: AssistantUsage;
}

export interface GeneratedFields {
  format_layout: string;
  primary_object: string;
  subject: string;
  lighting: string;
  mood: string;
  background: string;
  positive_prompt: string;
  negative_prompt: string;
}

export interface GenerateResponse {
  success: true;
  prompt: string;
  metadata: GeneratedFields & { brand: string };
  usage: AssistantUsage;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface RefineOption {
  label: string;
  description: string;
}

export type RefineResponse =
  | {
      action: 'refine';
      message: string;
      refinedFields: GeneratedFields;
      usage: AssistantUsage;
    }
  | {
      action: 'clarify';
      message: string;
      options: RefineOption[];
      usage: AssistantUsage;
    };

/**
 * One prompt in the Assistant's history.
 *
 * The Assistant used to hold exactly ONE generated prompt, so picking a
 * different concept — or refining — destroyed whatever you were exploring
 * from. Every generate and every refine now appends one of these instead.
 *
 * `concept` and `source` are what make the list readable: a version is
 * identifiable as "refined from Neon Astronaut" rather than an anonymous entry.
 */
export interface PromptVersion {
  /** Stable id, used for React keys and selection. */
  id: string;
  fields: GeneratedFields & { brand: string };
  /** The concept direction this version came from. */
  concept: AssistantConcept;
  /** How this version came to exist. */
  source: 'generated' | 'refined';
  /**
   * Usage for the call that produced this version; null when that producing
   * call reported none. Both generate and refine ('refine' action) report
   * real usage, so this is populated in the normal case — null is the
   * exceptional path (e.g. no producing call reported usage at all).
   */
  usage: AssistantUsage | null;
  createdAt: number;
}
