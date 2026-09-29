/**
 * _script-writer.ts — "✨ Write the script for me" (Video tab, optional).
 *
 * Given a business (name, industry, research notes) and a chosen format, the
 * AI writes the scene (creator / setting / action / camera), a spoken line
 * that FITS the clip length, and an on-screen hook caption. Rules baked in:
 *   - make the industry instantly obvious (the first Demajo test didn't)
 *   - the line must be speakable in the time (≈2.5 words/s, 1 s lead-in)
 *   - no business names or readable text in the scene; no medical claims
 * The user reviews / edits everything before generating.
 */
import { softenClaims } from './_business-research.js';

const MODEL = 'gemini-3.5-flash';

export interface ScriptRequest {
  business: { name?: string; industry?: string; promote?: string; research?: { summary?: string; selling_points?: string[]; services?: string[]; audience?: string; tone?: string; location?: string } | null };
  format?: { label?: string; creator?: string; setting?: string; action?: string; camera?: string } | null;
  duration: number;
  audio: boolean;
  goal?: string;
}

export interface ScriptResult { creator: string; setting: string; action: string; camera: string; line: string; hook: string }

/** Max spoken words for a clip length (keep in sync with speechFit in src/lib/ugc-video.ts). */
export const maxWordsFor = (duration: number) => Math.floor((duration - 1 - 0.5) * 2.5);

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export async function writeScript(req: ScriptRequest): Promise<ScriptResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  const maxWords = maxWordsFor(req.duration);
  const b = req.business; const r = b.research || {};
  const prompt = `Write one ${req.duration}-second vertical UGC-style video ad scene (TikTok/Reels, filmed on a phone) for this business.

Business: ${b.name || '(unnamed)'} — industry: ${b.industry || 'other'}${r.location ? `, ${r.location}` : ''}
What they do: ${r.summary || ''}
What they stress: ${(r.selling_points || []).join('; ')}
Services: ${(r.services || []).join('; ')}
Audience: ${r.audience || ''}
Tone: ${r.tone || 'friendly, trustworthy'}
Promote in this ad: ${b.promote || '(pick their strongest selling point)'}
${req.goal ? `Goal of the ad: ${req.goal}` : ''}
${req.format?.label ? `Format to use: "${req.format.label}" — ${[req.format.creator, req.format.setting, req.format.action].filter(Boolean).join(' / ')}` : ''}

Return ONLY valid JSON: {"creator":"","setting":"","action":"","camera":"","line":"","hook":""}
- creator: who is on camera (age, look, clothes) — an AI actor, no real names
- setting: where — it must make the industry INSTANTLY obvious with clear props (e.g. dental: treatment chair with overhead lamp, staff in scrubs)
- action: ONE clear beat that fits ${req.duration} seconds
- camera: phone-shot style (selfie / handheld / tripod)
- line: ${req.audio ? `what they say — natural, MAX ${maxWords} words so it fits ${req.duration}s with a 1s lead-in` : 'empty string (silent video)'}
- hook: on-screen caption for the first 3 seconds, max 8 words, a scroll-stopping hook that names the kind of business (e.g. "POV: Malta's dental clinic with its own lab"). No emoji, no business name.
Rules: no readable text, signs, screens or brochures in the scene; no blood, needles or graphic procedures; no claims like pain-free, stress-free, best, guaranteed results; realistic and phone-shot.`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1500, temperature: 0.7, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) throw new Error(`Script AI failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const j = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  const d = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>;
  const f = (k: string, max: number) => softenClaims(String(d[k] ?? '').trim()).slice(0, max);

  let line = req.audio ? f('line', 160) : '';
  // Hard guarantee the line fits: trim to the word budget at a natural break.
  if (words(line) > maxWords) line = line.split(/\s+/).slice(0, maxWords).join(' ').replace(/[,;:–-]+$/, '') + '.';
  const hook = f('hook', 70).replace(/\p{Extended_Pictographic}|️|‍/gu, '').trim();
  return { creator: f('creator', 200), setting: f('setting', 220), action: f('action', 300), camera: f('camera', 150), line, hook };
}
