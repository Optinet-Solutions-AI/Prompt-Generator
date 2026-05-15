#!/usr/bin/env node
// Real-API smoke test for the refine endpoint config.
// Run: node scripts/test-gemini-refine.mjs

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) {
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

const MODEL = 'gemini-2.5-flash';
const CURRENT = {
  format_layout: 'Wide cinematic banner (16:9), hero centered.',
  primary_object: 'Athletic male hero in high-tech armor.',
  subject: 'Confident male hero, rugged action-hero appearance, blue eyes, brown hair.',
  lighting: 'Warm golden-hour rays, volumetric god rays.',
  mood: 'Premium, victorious, cinematic.',
  background: 'Massive sunlit cumulus clouds during golden hour, futuristic cityscape.',
  positive_prompt: 'Hyperrealistic cinematic CGI of an athletic male hero in white-and-gold high-tech armor with a glowing cyan chest reactor, standing triumphantly atop a futuristic cityscape against vibrant golden-hour clouds. White rockets with golden thrusters streak through the sky behind him. Sparkling particles and gold "RS" coins float around. Warm volumetric god rays, lens flare. "HAPPY NEW YEAR" holographic text in cyan above.',
  negative_prompt: 'no anime, no cartoon, no plastic skin, no watermarks, no other text',
};

const system = `You are a senior visual concept partner working with a creative director.
You already generated a structured prompt for them. They have now seen the image and
want to iterate. Read their feedback, acknowledge it in one short conversational sentence,
then return updated structured prompt fields reflecting the change.

Speak in first person. Be direct. No filler.

BRAND: RocketSpin
COLOR PALETTE: Pristine white, champagne gold, glowing cyan, sky blue.
STYLE MANDATE: Hyperrealistic cinematic CGI, action-hero appearance with masculine angular features.

CURRENT STRUCTURED PROMPT:
${JSON.stringify(CURRENT, null, 2)}

Return strict JSON: {"message": "...", "refinedFields": {all 8 fields}}.
message: 1-2 sentences acknowledging the change.
refinedFields: every key from the current prompt, with edits applied.

SAFETY: Never name real people. Never reference copyrighted franchises.`;

const userMessage = "I don't want it on the city — put him on a tropical beach at sunset with palm trees, and shrink the rockets";

const schema = {
  type: 'object',
  required: ['message', 'refinedFields'],
  properties: {
    message: { type: 'string' },
    refinedFields: {
      type: 'object',
      required: ['format_layout','primary_object','subject','lighting','mood','background','positive_prompt','negative_prompt'],
      properties: {
        format_layout: { type: 'string' },
        primary_object: { type: 'string' },
        subject: { type: 'string' },
        lighting: { type: 'string' },
        mood: { type: 'string' },
        background: { type: 'string' },
        positive_prompt: { type: 'string' },
        negative_prompt: { type: 'string' },
      },
    },
  },
};

const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
const body = {
  systemInstruction: { parts: [{ text: system }] },
  contents: [{ role: 'user', parts: [{ text: userMessage }] }],
  generationConfig: {
    maxOutputTokens: 2000,
    thinkingConfig: { thinkingBudget: 0 },
    responseMimeType: 'application/json',
    responseSchema: schema,
  },
};

console.log('Calling Gemini Flash for refine...');
console.log('User feedback:', userMessage, '\n');
const t0 = Date.now();
const res = await fetch(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const ms = Date.now() - t0;
if (!res.ok) {
  console.log('HTTP', res.status, '(' + ms + 'ms)');
  console.log((await res.text()).slice(0, 600));
  process.exit(1);
}
const data = await res.json();
const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '<no text>';
console.log('finishReason:', data.candidates?.[0]?.finishReason, '(' + ms + 'ms)');
console.log('usage:', JSON.stringify(data.usageMetadata));

const parsed = JSON.parse(text);
console.log('\nAI MESSAGE:', parsed.message);
console.log('\nUPDATED background:', parsed.refinedFields.background);
console.log('\nUPDATED positive_prompt:');
console.log(parsed.refinedFields.positive_prompt);

// Verify the change actually happened
const newPositive = parsed.refinedFields.positive_prompt.toLowerCase();
const hasBeach = newPositive.includes('beach') || newPositive.includes('palm') || newPositive.includes('sand');
const stillHasCityscape = newPositive.includes('cityscape') || newPositive.includes('skyscraper');
console.log('\nincorporates beach/palm/sand:', hasBeach ? '✓' : '✗');
console.log('removed cityscape reference:', stillHasCityscape ? '✗ still there' : '✓');

const tripWires = ['henry cavill', 'chris evans', 'iron man', 'marvel', ' mcu'];
const violations = tripWires.filter(w => newPositive.includes(w));
console.log('safety trip wires:', violations.length ? '✗ ' + violations.join(', ') : '✓ clean');
