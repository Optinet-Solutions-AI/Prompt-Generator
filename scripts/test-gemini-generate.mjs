#!/usr/bin/env node
// Real-API smoke test for the generate endpoint config.
// Mirrors api/assistant/generate.ts: gemini-2.5-pro, thinking enabled, 4000 maxTokens.
// Run: node scripts/test-gemini-generate.mjs

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) {
    // Strip surrounding quotes if present
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

const MODEL = "gemini-2.5-flash";

const PERSONALITY = `You are a senior visual concept partner working with a creative director.
Speak in first person. Be direct. Have opinions. Recommend the choice you
would make and say why in one short sentence.

Forbidden phrases (these reduce quality and waste tokens):
  "Great question", "I'd be happy to help", "Certainly", "Of course",
  "As an AI", "Here is", any preamble before the actual answer.

You are a collaborator, not a chatbot. Output the work, not commentary
about the work.`;

const BRAND_BLOCK = `The brand for this work is RocketSpin. Apply these rules to every concept:

COLOR PALETTE:
Pristine white (#F5F5F0), champagne gold (#D4B26A), glowing cyan (#00BFFF), sky blue. Setting almost always bright sky with massive sun-lit cumulus clouds during golden hour, occasionally a premium futuristic interior. NEVER use dark moody tones, pastel washes, muted greys, or anime/cartoon colour styling.

STYLE MANDATE:
STYLE MANDATE: Hyperrealistic cinematic CGI at the quality of a live-action superhero blockbuster (Unreal Engine 5, AAA cinematic render quality). NEVER Pixar style, NEVER anime, NEVER cartoon, NEVER plastic skin, NEVER oversized head/eyes. HERO MANDATE: Athletic male, age 28-32, rugged action-hero appearance with masculine angular features and a square jaw, fit athletic build, short tousled brown hair, light stubble, piercing blue eyes. Amber/orange-tinted aviator-style tactical goggles with a thin champagne-gold frame. Sleek white-and-gold high-tech armored suit with a circular glowing cyan chest reactor centered on the torso, gold pauldrons, gold wrist cuffs. Female variant: long-haired blonde, same armor. BRAND OBJECTS (use at least one when relevant): gold coins engraved "RS", white rockets with golden thrusters, blue holographic UI elements, white gift boxes with gold ribbons, sparkling particles, confetti. COMPOSITION: Hero centered, facing camera, symmetrical framing, negative space on the sides for text. Lighting always warm and soft, with volumetric god rays and lens flare. MOOD: Premium, aspirational, optimistic, victorious, cinematic. SAFETY: Never name any real person, celebrity, actor, athlete, or public figure. Never reference copyrighted franchises, characters, films, or brand names. Use descriptive features only.`;

const system = [
  PERSONALITY, '', BRAND_BLOCK, '',
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

const user = [
  'Task topic: new year banner',
  'Extra detail: make it warm and fun',
  'Picked concept title: Golden Hour Grandeur',
  'Picked concept description: A centered, symmetrical shot of our hero, facing the camera with a confident, victorious expression, his arms slightly outspread as if embracing the moment.',
].join('\n');

const schema = {
  type: 'object',
  required: ['format_layout','primary_object','subject','lighting','mood','background','positive_prompt','negative_prompt'],
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
};

const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
const body = {
  systemInstruction: { parts: [{ text: system }] },
  contents: [{ role: 'user', parts: [{ text: user }] }],
  generationConfig: {
    maxOutputTokens: 2000,
    thinkingConfig: { thinkingBudget: 0 },
    responseMimeType: 'application/json',
    responseSchema: schema,
    // Pro REQUIRES thinking — no thinkingBudget=0 setting.
  },
};

console.log('Calling Gemini 2.5 Pro for generate flow...');
const t0 = Date.now();
try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  console.log('\nPARSED OK. Field summary:');
  for (const key of Object.keys(parsed)) {
    const v = parsed[key];
    console.log('  ' + key + ':', typeof v === 'string' ? v.slice(0, 80) + (v.length > 80 ? '...' : '') : v);
  }
  console.log('\npositive_prompt length:', parsed.positive_prompt?.length, 'chars');
  console.log('positive_prompt full text:');
  console.log(parsed.positive_prompt);

  // Safety check — verify no trip wires made it into the output
  const positive = parsed.positive_prompt.toLowerCase();
  const tripWires = ['henry cavill', 'chris evans', 'iron man', 'marvel', ' mcu', 'star wars'];
  const violations = tripWires.filter(w => positive.includes(w));
  if (violations.length) {
    console.log('\n⚠ TRIP WIRES IN OUTPUT:', violations);
  } else {
    console.log('\n✓ No trip wires in output. Should pass image-gen safety filters.');
  }
} catch (e) {
  console.log('Error:', e.message);
  process.exit(1);
}
