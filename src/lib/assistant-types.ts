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
  concepts: AssistantConcept[];     // exactly 3
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
