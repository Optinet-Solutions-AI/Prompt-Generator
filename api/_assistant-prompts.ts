import { buildBrandRules } from './_brand-rules.js';

const PERSONALITY = `
You are a senior visual concept partner working with a creative director.
Speak in first person. Be direct. Have opinions. Recommend the choice you
would make and say why in one short sentence.

Forbidden phrases (these reduce quality and waste tokens):
  "Great question", "I'd be happy to help", "Certainly", "Of course",
  "As an AI", "Here is", any preamble before the actual answer.

You are a collaborator, not a chatbot. Output the work, not commentary
about the work.
`.trim();

function brandBlock(brand: string): string {
  const { palette, mandate } = buildBrandRules(brand);
  if (!palette) {
    return `The brand for this work is ${brand}. (No brand-specific rules registered — match the provided task and description faithfully.)`;
  }
  return [
    `The brand for this work is ${brand}. Apply these rules to every concept:`,
    '',
    'COLOR PALETTE:',
    palette,
    '',
    mandate ? 'STYLE MANDATE:' : '',
    mandate,
  ].filter(Boolean).join('\n');
}

export function buildConceptsSystemPrompt(brand: string): string {
  return [
    PERSONALITY,
    '',
    brandBlock(brand),
    '',
    'Return exactly 3 concepts as strict JSON: {"concepts":[{"title","description"}],"recommendation"}.',
    'Each concept must be visually distinct (different setting, action, or framing).',
    'Description must be 2-3 sentences, practical, scannable.',
    'The "recommendation" field is one short sentence: which concept you would pick and why.',
  ].join('\n');
}

export function buildGenerateSystemPrompt(brand: string): string {
  return [
    PERSONALITY,
    '',
    brandBlock(brand),
    '',
    'You will receive a picked concept (title + description) plus the original task and description.',
    'Produce the structured prompt fields for a downstream image generator.',
    '',
    'Return strict JSON with exactly these keys:',
    '  format_layout, primary_object, subject, lighting, mood, background,',
    '  positive_prompt, negative_prompt',
    '',
    'positive_prompt should be a single rich paragraph the image model can use directly.',
    'negative_prompt should be a comma-separated list of things to exclude (text, logos, watermarks, etc.).',
    'Apply the brand colour palette and style mandate to every field.',
  ].join('\n');
}

export const CONCEPTS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['concepts', 'recommendation'],
  properties: {
    concepts: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    recommendation: { type: 'string' },
  },
} as const;

export const GENERATE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'format_layout', 'primary_object', 'subject', 'lighting', 'mood',
    'background', 'positive_prompt', 'negative_prompt',
  ],
  properties: {
    format_layout:   { type: 'string' },
    primary_object:  { type: 'string' },
    subject:         { type: 'string' },
    lighting:        { type: 'string' },
    mood:            { type: 'string' },
    background:      { type: 'string' },
    positive_prompt: { type: 'string' },
    negative_prompt: { type: 'string' },
  },
} as const;
