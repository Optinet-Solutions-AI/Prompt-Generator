#!/usr/bin/env node
// Diagnostic: exactly replicate the concepts endpoint's Gemini call.
// Prints the raw HTTP response so we can see what Gemini is actually returning.
//
// Run: node scripts/test-gemini-concepts.mjs

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local manually
const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

const MODEL = 'gemini-2.5-flash';

const system = `You are a senior visual concept partner working with a creative director.
Speak in first person. Be direct. Have opinions. Recommend the choice you
would make and say why in one short sentence.

Forbidden phrases (these reduce quality and waste tokens):
  "Great question", "I'd be happy to help", "Certainly", "Of course",
  "As an AI", "Here is", any preamble before the actual answer.

You are a collaborator, not a chatbot. Output the work, not commentary
about the work.

The brand for this work is RocketSpin. Apply these rules to every concept:

COLOR PALETTE:
Pristine white (#F5F5F0), champagne gold (#D4B26A), glowing cyan (#00BFFF), sky blue. Setting almost always bright sky with massive sun-lit cumulus clouds during golden hour, occasionally a premium futuristic interior. NEVER use dark moody tones, pastel washes, muted greys, or anime/cartoon colour styling.

STYLE MANDATE:
STYLE MANDATE: Hyperrealistic cinematic CGI at the quality of a live-action Marvel film (Unreal Engine 5 / MCU-grade). NEVER Pixar style, NEVER anime, NEVER cartoon, NEVER plastic skin, NEVER oversized head/eyes. HERO MANDATE: Athletic male, age 28-32, Hollywood casting type (Henry Cavill / Chris Evans), short tousled brown hair, light stubble, piercing blue eyes. Amber/orange-tinted aviator-style tactical goggles with a thin champagne-gold frame. Sleek white-and-gold Iron Man-style armor with a circular glowing cyan arc reactor centered on the chest, gold pauldrons, gold wrist cuffs. Female variant: long-haired blonde, same armor. BRAND OBJECTS (use at least one when relevant): gold coins engraved "RS", white rockets with golden thrusters, blue holographic UI elements, white gift boxes with gold ribbons, sparkling particles, confetti. COMPOSITION: Hero centered, facing camera, symmetrical framing, negative space on the sides for text. Lighting always warm and soft, with volumetric god rays and lens flare. MOOD: Premium, aspirational, optimistic, victorious, cinematic.

Return exactly 3 concepts as strict JSON: {"concepts":[{"title","description"}],"recommendation"}.
Each concept must be visually distinct (different setting, action, or framing).
Description must be 2-3 sentences, practical, scannable.
The "recommendation" field is one short sentence: which concept you would pick and why.`;

const user = `Task topic: for new year\nExtra detail: make it exciting and warm`;

// Same schema as CONCEPTS_JSON_SCHEMA, but stripped for Gemini (additionalProperties removed)
const schema = {
  type: 'object',
  required: ['concepts', 'recommendation'],
  properties: {
    concepts: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        required: ['title', 'description'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    recommendation: { type: 'string' },
  },
};

// Variants to test
const variants = [
  {
    name: 'A: 600 tokens, no thinking config (current code)',
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: 600,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    },
  },
  {
    name: 'B: 2000 tokens, no thinking config',
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: 2000,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    },
  },
  {
    name: 'C: 600 tokens, thinkingBudget=0 (disable thinking)',
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: 600,
        responseMimeType: 'application/json',
        responseSchema: schema,
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
  },
  {
    name: 'D: 2000 tokens, thinkingBudget=0',
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: 2000,
        responseMimeType: 'application/json',
        responseSchema: schema,
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
  },
];

const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

for (const v of variants) {
  console.log('\n=== ' + v.name + ' ===');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(v.body),
    });
    if (!res.ok) {
      console.log('HTTP', res.status, (await res.text()).slice(0, 400));
      continue;
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '<no text>';
    const finishReason = data.candidates?.[0]?.finishReason;
    console.log('finishReason:', finishReason);
    console.log('usage:', JSON.stringify(data.usageMetadata));
    console.log('text length:', text.length);
    console.log('text preview:', text.slice(0, 200) + (text.length > 200 ? '...' : ''));
    try {
      const parsed = JSON.parse(text);
      console.log('PARSED OK. concepts:', parsed.concepts?.length, 'recommendation:', parsed.recommendation?.slice(0, 80));
    } catch (e) {
      console.log('PARSE FAIL:', e.message);
    }
  } catch (e) {
    console.log('REQUEST FAIL:', e.message);
  }
}
