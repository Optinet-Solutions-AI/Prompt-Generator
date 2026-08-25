// TEMPORARY A/B PROBE — delete after reading the results.
//
// Question: the concepts stage runs on gemini-3.1-pro-preview ($2.00/M in,
// $12.00/M out) and the fan-out makes three of those calls per concept set.
// Would gemini-3.7-flash ($0.75/M in, $3.75/M out) produce concepts of
// comparable quality for ~3x less?
//
// This calls the Gemini API directly through the real chat() wrapper and the
// real production prompt builder, so thinking-budget injection and schema
// sanitisation behave exactly as they do in production. It deliberately does
// NOT go through /api/assistant/concepts, so it does not touch the app's
// daily spend cap.
import { describe, it } from 'vitest';
import fs from 'node:fs';
import { chat } from './_llm.js';
import { buildSingleConceptSystemPrompt, SINGLE_CONCEPT_JSON_SCHEMA, CONCEPT_LENSES } from './_assistant-prompts.js';
import { priceCall } from './_pricing.js';

// Load .env.local so chat() finds GEMINI_API_KEY.
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BRAND = 'RocketSpin';
const MODELS = ['gemini-3.1-pro-preview', 'gemini-3.7-flash'];

// Fixed lenses, not random — both models must get identical inputs or the
// comparison measures luck instead of the model.
const LENSES = CONCEPT_LENSES.slice(0, 3);

const BRIEFS = [
  { task: 'Summer slots promo banner', detail: 'A hero moment celebrating a big win. Energetic, premium.' },
  { task: 'Generic banner',            detail: 'We need 1 new generic banner' },
];

describe('A/B: concepts model', () => {
  it('compares Pro vs Flash on identical briefs and lenses', async () => {
    const system = buildSingleConceptSystemPrompt(BRAND);
    console.log(`\nsystem prompt: ${system.length} chars\n`);

    for (const brief of BRIEFS) {
      console.log(`\n${'='.repeat(78)}\nBRIEF: ${brief.task} — ${brief.detail}\n${'='.repeat(78)}`);

      for (const model of MODELS) {
        let cost = 0, inTok = 0, outTok = 0;
        const titles: string[] = [];
        const started = Date.now();

        const results = await Promise.allSettled(LENSES.map(lens => chat({
          provider: 'gemini',
          model,
          system,
          user: `Task: ${brief.task}\nExtra detail: ${brief.detail}\n\nCreative lens for this concept: ${lens}`,
          maxTokens: 4000,
          json: true,
          jsonSchema: SINGLE_CONCEPT_JSON_SCHEMA,
        })));

        for (const r of results) {
          if (r.status !== 'fulfilled') { titles.push(`!! FAILED: ${String(r.reason).slice(0, 90)}`); continue; }
          inTok += r.value.usage.input_tokens;
          outTok += r.value.usage.output_tokens;
          cost += priceCall(model, r.value.usage) ?? 0;
          try {
            const c = JSON.parse(r.value.text).concepts?.[0];
            titles.push(`${c?.title ?? '(no title)'} — ${String(c?.rationale ?? c?.description ?? '').replace(/\s+/g, ' ').slice(0, 150)}`);
          } catch {
            titles.push(`!! UNPARSEABLE: ${r.value.text.slice(0, 90)}`);
          }
        }

        console.log(`\n--- ${model} --- ${((Date.now() - started) / 1000).toFixed(1)}s`);
        console.log(`    tokens: ${inTok} in / ${outTok} out   cost for 3 calls: $${cost.toFixed(5)}`);
        titles.forEach((t, i) => console.log(`    ${i + 1}. ${t}`));
      }
    }
  }, 600000);
});
