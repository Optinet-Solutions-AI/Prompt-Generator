#!/usr/bin/env node
// Real-API smoke test for the refine endpoint with the new clarify-or-refine schema.
// Tests both paths: a specific user message (expect action=refine) and a vague one
// (expect action=clarify with 3 options).
//
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
  subject: 'Confident male hero, rugged action-hero appearance.',
  lighting: 'Warm golden-hour rays, volumetric god rays.',
  mood: 'Premium, victorious, cinematic.',
  background: 'Massive sunlit cumulus clouds during golden hour, futuristic cityscape.',
  positive_prompt: 'Hyperrealistic cinematic CGI of an athletic male hero in white-and-gold high-tech armor with a glowing cyan chest reactor, standing triumphantly atop a futuristic cityscape against vibrant golden-hour clouds.',
  negative_prompt: 'no anime, no cartoon, no plastic skin, no watermarks',
};

const PERSONALITY = `You are a senior visual concept partner working with a creative director.
Speak in first person. Be direct. No filler.`;

const system = [
  PERSONALITY, '',
  'BRAND: RocketSpin',
  'COLOR PALETTE: Pristine white, champagne gold, glowing cyan, sky blue. Golden hour clouds.',
  'STYLE MANDATE: Hyperrealistic cinematic CGI. Action-hero appearance, masculine angular features.',
  '',
  'CURRENT STRUCTURED PROMPT:',
  JSON.stringify(CURRENT, null, 2),
  '',
  'YOU HAVE TWO POSSIBLE ACTIONS:',
  '',
  '1) action="refine" — when the feedback is clear (e.g. "smaller rockets", "put him on a beach", "make it night"). Return:',
  '   { action: "refine", message: "<1-2 sentence acknowledgement>", refinedFields: { all 8 keys } }',
  '',
  '2) action="clarify" — when the feedback is vague or could go multiple ways (e.g. "make it better", "different vibe"). Return:',
  '   { action: "clarify", message: "<1 sentence framing the question>", options: [3 distinct options with label + description] }',
  '',
  'CHOOSE INTELLIGENTLY. Don\'t ask when intent is clear. Don\'t refine when user is vague.',
].join('\n');

const schema = {
  type: 'object',
  required: ['action', 'message'],
  properties: {
    action: { type: 'string', enum: ['clarify', 'refine'] },
    message: { type: 'string' },
    options: {
      type: 'array', maxItems: 3,
      items: {
        type: 'object', required: ['label', 'description'],
        properties: { label: { type: 'string' }, description: { type: 'string' } },
      },
    },
    refinedFields: {
      type: 'object',
      required: ['format_layout','primary_object','subject','lighting','mood','background','positive_prompt','negative_prompt'],
      properties: {
        format_layout: { type: 'string' }, primary_object: { type: 'string' }, subject: { type: 'string' },
        lighting: { type: 'string' }, mood: { type: 'string' }, background: { type: 'string' },
        positive_prompt: { type: 'string' }, negative_prompt: { type: 'string' },
      },
    },
  },
};

const TESTS = [
  { name: 'SPECIFIC FEEDBACK → expect refine', userMessage: 'put him on a beach at sunset, shrink the rockets' },
  { name: 'VAGUE FEEDBACK → expect clarify',  userMessage: 'make it better' },
  { name: 'VAGUE FEEDBACK 2 → expect clarify', userMessage: 'different vibe' },
];

const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

for (const test of TESTS) {
  console.log('\n=== ' + test.name + ' ===');
  console.log('User: "' + test.userMessage + '"\n');

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: `USER FEEDBACK: ${test.userMessage}` }] }],
    generationConfig: {
      maxOutputTokens: 2000,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    console.log('HTTP', res.status, '(' + ms + 'ms)');
    console.log((await res.text()).slice(0, 400));
    continue;
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '<no text>';
  const parsed = JSON.parse(text);
  console.log('  action:', parsed.action, '(' + ms + 'ms)');
  console.log('  message:', parsed.message);
  if (parsed.action === 'clarify') {
    console.log('  options:');
    for (const o of (parsed.options ?? [])) {
      console.log('    • ' + o.label + ' — ' + o.description);
    }
  } else if (parsed.action === 'refine') {
    console.log('  background:', parsed.refinedFields.background);
    console.log('  positive_prompt (first 120):', parsed.refinedFields.positive_prompt.slice(0, 120) + '…');
  }
}
