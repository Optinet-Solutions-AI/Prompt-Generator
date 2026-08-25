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
  const parts: string[] = [
    `The brand for this work is ${brand}. Apply these rules to every concept:`,
    '',
    'COLOR PALETTE:',
    palette,
  ];
  if (mandate) {
    parts.push('', 'STYLE MANDATE:', mandate);
  }
  parts.push(
    '',
    'IDENTITY vs COMPOSITION: The rules above define the brand IDENTITY — colour palette, character look, and style — and MUST be applied to every concept. They are NOT a fixed composition: vary the setting, shot scale (wide establishing vs tight hero vs product-forward), framing, camera angle, action/moment, and mood across concepts. Any specific composition a rule suggests (e.g. a centered hero or symmetrical framing) is ONE option to draw from, not a requirement for every image.',
  );
  return parts.join('\n');
}

// When the brief doesn't state a subject's gender (or ethnicity), the model used to
// pick one on its own (e.g. defaulting a "navigator" to a specific woman). Applied to
// BOTH stages so neither concepts nor generate bakes in a demographic the user never asked
// for — the user stays in control via the brief / refine.
const SUBJECT_NEUTRALITY = [
  'SUBJECT DEMOGRAPHICS — DO NOT ASSUME:',
  "Unless the task, description, or picked concept explicitly states the human subject's",
  'gender or ethnicity, do NOT introduce one. Describe the subject with neutral, non-gendered',
  'wording and no gendered pronouns (e.g. "a navigator", "a hero", "an athlete" — not "a woman"',
  'or "a man"). If the brief already specifies a gender or ethnicity, keep it exactly.',
].join('\n');

/**
 * RETAINED REVERT PATH — NOT CALLED IN PRODUCTION.
 *
 * `buildConceptsSystemPrompt`, `CONCEPTS_JSON_SCHEMA`, and `pickConceptLens`
 * (singular) are the pre-fan-out design: one call producing all three
 * concepts together, with one randomly-chosen lens per request. The concepts
 * endpoint (api/assistant/concepts.ts) now uses the fan-out design instead
 * (buildSingleConceptSystemPrompt + SINGLE_CONCEPT_JSON_SCHEMA + pickConceptLenses,
 * three parallel calls, one lens per concept).
 *
 * These three exports are kept deliberately, not dead code: the fan-out's
 * diversity benefit currently rests on a single A/B sample, so this is the
 * rollback path if the live A/B in
 * docs/superpowers/specs/2026-08-22-assistant-concept-quality-design.md
 * (risk 1) doesn't hold up on real brands. Delete all three together —
 * this function, CONCEPTS_JSON_SCHEMA, and pickConceptLens — once that
 * A/B validates the fan-out.
 */
export function buildConceptsSystemPrompt(brand: string): string {
  return [
    PERSONALITY,
    '',
    brandBlock(brand),
    '',
    SUBJECT_NEUTRALITY,
    '',
    "YOUR JOB IS TO EXPAND THE USER'S THINKING, NOT NARROW IT: give them more and newer ideas than they arrived with. Propose fresh, non-obvious directions they may not have considered. Avoid the most predictable or clichéd take on the brief.",
    '',
    'Return exactly 3 concepts as strict JSON: {"concepts":[{"title":"...","description":"..."}],"recommendation":"..."}.',
    'The 3 concepts must each open a GENUINELY DIFFERENT visual direction, differing on',
    'different axes — a different environment/setting, a different shot scale (wide establishing vs tight hero vs product-forward), a different action/moment, a different mood or time of day,',
    'or a different conceptual angle. Do NOT return the same scene or subject with only minor',
    'changes — if two concepts could share one background, they are too similar; push them apart.',
    'Span a range of boldness: at least one concept is a safe, on-brief direction and at least',
    'one is a bolder, more unexpected stretch that widens the options.',
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
    SUBJECT_NEUTRALITY,
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
    '',
    'IMAGE-GEN SAFETY (HARD RULES — image generators reject prompts that violate these):',
    '- Never name any real person, celebrity, actor, athlete, musician, or public figure.',
    '  Use descriptive features (jaw, build, hair, eyes) instead.',
    '- Never reference copyrighted franchises, films, shows, characters, or brand names.',
    '  Use generic terms like "superhero suit", "high-tech armor", "cinematic blockbuster',
    '  style" instead.',
    '- Never reference real brand logos beyond the one we are designing for.',
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

// Each concepts call is stateless, so the model re-derives the same "obvious"
// on-brand idea every time (e.g. always a hero in a golden sky). To make repeated
// regenerations explore NEW ground, we inject one creative lens per concept call —
// three distinct lenses per request, one per concept — a different angle that
// pushes the model off its default anchor. Brand IDENTITY still applies (see
// brandBlock); only the creative angle rotates.
export const CONCEPT_LENSES: string[] = [
  'Lead with an UNEXPECTED SETTING you would not normally pick for this brand — surprise me with where the scene takes place.',
  'AVOID the most obvious brand image (e.g. a hero standing triumphantly in a golden sky). Find a fresh metaphor for the offer instead.',
  'Anchor this concept on a strong EMOTIONAL moment or story beat, not a product-hero pose.',
  'Push to the boldest, most unexpected stretch — reject the safe, on-brief reading of this brief entirely.',
  'Build around an UNUSUAL CAMERA ANGLE or perspective — top-down, worm\'s-eye, over-the-shoulder, or an extreme close detail.',
  'Center this concept on a single striking VISUAL OBJECT or symbol rather than the character.',
  'Explore a different TIME or ENERGY than the default — quiet aftermath, frantic peak-action, dawn, or deep night.',
];

/** A prompt block listing ideas the model must NOT repeat. Empty list → '' (no block). */
export function buildAvoidClause(avoid: string[]): string {
  const items = (avoid || []).map(s => s.trim()).filter(Boolean);
  if (items.length === 0) return '';
  return [
    'ALREADY-SHOWN IDEAS — do NOT repeat or lightly re-skin any of these. Every concept must be a brand-new direction not in this list:',
    ...items.map(s => `- ${s}`),
  ].join('\n');
}

/** Pick one creative lens at random (inject a different angle on each regenerate). */
export function pickConceptLens(rand: () => number = Math.random): string {
  return CONCEPT_LENSES[Math.floor(rand() * CONCEPT_LENSES.length)];
}

/**
 * Pick `n` DISTINCT creative lenses.
 *
 * The concepts endpoint fires one model call per concept, and each call gets a
 * different lens from this list. That is what makes the three concepts differ
 * in KIND — one may be an unexpected setting, another an emotional beat,
 * another an unusual camera angle. Picking the same lens twice would waste a
 * call, so selection is without replacement.
 */
export function pickConceptLenses(n: number, rand: () => number = Math.random): string[] {
  if (n <= 0) return [];
  const pool = [...CONCEPT_LENSES];
  const out: string[] = [];
  // Draw from a shrinking pool — guarantees distinctness without a retry loop.
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(rand() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/**
 * System prompt for a SINGLE concept.
 *
 * The endpoint fires three of these in parallel, each with a different lens.
 * Compared with buildConceptsSystemPrompt this deliberately DROPS all the
 * "make the three concepts differ from each other" instructions — there is
 * only one concept in this call, so those lines would be wasted tokens and
 * confusing. Divergence is now guaranteed structurally by giving each call a
 * different lens, instead of asking one call to diverge from itself.
 */
export function buildSingleConceptSystemPrompt(brand: string): string {
  return [
    PERSONALITY,
    '',
    brandBlock(brand),
    '',
    SUBJECT_NEUTRALITY,
    '',
    "YOUR JOB IS TO EXPAND THE USER'S THINKING, NOT NARROW IT: propose a fresh, non-obvious direction they may not have considered. Avoid the most predictable or clichéd take on the brief.",
    '',
    'Return exactly ONE concept as strict JSON: {"concepts":[{"title":"...","description":"..."}]}.',
    'The CREATIVE LENS in the user message is the defining constraint for this concept — obey it, do not treat it as one option among many.',
    'Description must be 2-3 sentences, practical and scannable: someone should be able to picture the finished banner from it.',
  ].join('\n');
}

export const SINGLE_CONCEPT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['concepts'],
  properties: {
    concepts: {
      type: 'array',
      minItems: 1,
      maxItems: 1,
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
  },
} as const;

/**
 * Prompt for the recommendation sentence.
 *
 * This needs to see all three concepts at once to compare them, so it cannot
 * be folded into the parallel single-concept calls. It runs on the cheapest
 * model tier because it is a short judgement, not ideation.
 */
export function buildRecommendationPrompt(
  concepts: Array<{ title: string; description: string }>,
): { system: string; user: string } {
  const system = [
    PERSONALITY,
    '',
    'You are choosing between concept directions for a creative director.',
    'Reply with ONE short sentence naming the concept you would pick and why.',
    'No preamble, no list, no restating the options. Just the pick and the reason.',
  ].join('\n');
  const user = [
    'Here are the concept directions:',
    '',
    ...concepts.map((c, i) => `${i + 1}. ${c.title} — ${c.description}`),
    '',
    'Which would you pick, and why?',
  ].join('\n');
  return { system, user };
}

/**
 * Read-only brand context for the DISSECT call — deliberately NOT brandBlock.
 *
 * brandBlock() is the GENERATION mandate: "Apply these rules to every
 * concept", plus, for brands with one, a ~1,300-character STYLE MANDATE that
 * tells the model to ADD things to the scene (e.g. Roosterbet's fire
 * signature, wrapped in "MUST be applied to every concept"). Dissect is the
 * opposite kind of call — read-only extraction, no concept, nothing being
 * composed — so brandBlock's generative language directly fights the
 * EXTRACT, DO NOT INVENT rule: a sports banner that never mentions fire would
 * sit under a system prompt whose longest, most emphatic block explicitly
 * demands fire. This helper gives the model only the brand's usual PALETTE
 * (never the scene mandate), framed explicitly as something to *recognise*,
 * not apply. If a future maintainer is tempted to simplify this back to
 * brandBlock(brand) — don't: that reintroduces the exact confabulation risk
 * this whole feature exists to prevent.
 */
function dissectBrandContext(brand: string): string {
  const { palette } = buildBrandRules(brand);
  if (!palette) {
    return `For reference only: no brand palette is registered for ${brand}. This does not change how you extract the fields below — extract only what the pasted prompt actually says.`;
  }
  return [
    `For reference only — ${brand}'s usual color palette:`,
    palette,
    'This is given so you can NOTICE where the pasted prompt already matches the brand. It is not an instruction to apply, and nothing from it should be added to, or used to change, any field.',
  ].join('\n');
}

/**
 * System prompt for dissecting a FINISHED prompt into the eight reference
 * fields.
 *
 * This is the inverse of buildGenerateSystemPrompt: that one composes eight
 * fields from a brief, this one reads them back out of prose someone already
 * wrote (typically in ChatGPT).
 *
 * The extract-don't-invent rule below is the whole feature. A model asked for
 * eight fields will produce eight fields, and a confidently invented "lighting"
 * looks authoritative in the Reference Prompt Data panel — then silently steers
 * every prompt later generated from that reference. An honest "not specified"
 * is far more useful than a plausible guess.
 *
 * Ordering matters here: YOUR JOB and EXTRACT, DO NOT INVENT come FIRST — not
 * after the brand context — so primacy (what the model reads first) and
 * recency (what it reads right before acting) both favour extraction. The
 * brand context (dissectBrandContext, palette only, read-only) sits in the
 * weakest position, in between. A previous version led with the full
 * generation-mandate brandBlock() before ever mentioning extraction, which is
 * what let a brand's scene mandate outweigh the extract-don't-invent rule.
 */
export function buildDissectSystemPrompt(brand: string): string {
  return [
    'YOUR JOB: read the prompt the user pasted and DESCRIBE WHAT WAS PASTED by splitting it into the eight reference fields. You are documenting an existing prompt, not writing a new one.',
    '',
    'EXTRACT, DO NOT INVENT. If the pasted prompt does not state something — many prompts say nothing about format or layout — write exactly "Not specified in the source prompt" for that field. Do NOT invent a plausible value to fill the gap. A wrong value here is worse than an empty one, because it will be reused as if it were true.',
    '',
    dissectBrandContext(brand),
    '',
    'Do NOT rewrite the prompt to fit the brand. The brand rules above are context for understanding what you are reading, not a target to conform the fields to. If the pasted prompt contradicts the brand palette, describe what it actually says.',
    '',
    'positive_prompt: the pasted text itself, trimmed of surrounding whitespace. Do NOT rewrite, shorten, improve or re-order it — the user pasted a prompt they already like.',
    'negative_prompt: only what the source explicitly excludes. If it names no exclusions, write "Not specified in the source prompt".',
    '',
    'Return strict JSON with exactly these keys: format_layout, primary_object, subject, lighting, mood, background, positive_prompt, negative_prompt.',
  ].join('\n');
}

export const DISSECT_JSON_SCHEMA = {
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
