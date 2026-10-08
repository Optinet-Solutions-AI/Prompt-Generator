/**
 * _ad-speech.ts — find WHEN the scripted line is spoken inside a generated
 * scene clip, so cut-downs can start the scene right before the words.
 *
 * Why not just "skip silence"? Video models often add laughter or a sigh
 * before the line (the 6s bumper test started on 2s of laughter and cut the
 * punchline). So we ask Gemini where the KNOWN line starts and ends, then
 * snap that to the nearest real pause found by ffmpeg's silence detector
 * (Gemini's timestamps are only roughly right). Runs once per scene, when
 * it finishes generating; costs a fraction of a cent.
 *
 * Underscore file = helper, not its own Vercel route.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ffmpegPath } from './_video-brand.js';

const run = promisify(execFile);
const MODEL = 'gemini-3.5-flash';

export interface SpeechWindow { start: number; end: number }

/** Moments where a pause ends (= sound starts), from ffmpeg's silence detector. */
export function soundStarts(silenceLog: string): number[] {
  const ends = [...silenceLog.matchAll(/silence_end: ([\d.]+)/g)].map(m => parseFloat(m[1]));
  // A clip that starts with sound has an implicit "sound start" at 0.
  const firstSilence = silenceLog.match(/silence_start: (-?[\d.]+)/);
  if (!firstSilence || parseFloat(firstSilence[1]) > 0.05) ends.unshift(0);
  return ends;
}

/**
 * Snap a rough line start to the nearest pause-end within ±0.6s (the real
 * first syllable), or keep the rough value when there's no pause near it.
 */
export function snapStart(rough: number, starts: number[]): number {
  let best = rough; let dist = 0.6;
  for (const s of starts) {
    const d = Math.abs(s - rough);
    if (d <= dist) { best = s; dist = d; }
  }
  return best;
}

/** Ask Gemini where `line` is spoken in the clip's audio. Null if it can't tell. */
async function askGemini(mp3: Buffer, line: string, clipSeconds: number): Promise<SpeechWindow | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { inlineData: { mimeType: 'audio/mpeg', data: mp3.toString('base64') } },
        { text: `This ${clipSeconds.toFixed(1)}-second clip should contain the spoken line: "${line}". ` +
          'At what second does the FIRST WORD of that line start, and when does the LAST WORD end? Ignore laughter, sighs and other sounds. ' +
          'Reply ONLY with JSON: {"start": <seconds>, "end": <seconds>} or {"start": null, "end": null} if the line is not spoken.' },
      ] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) return null;
  const j = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  try {
    const d = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { start?: unknown; end?: unknown };
    const start = Number(d.start); const end = Number(d.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return { start: Math.max(0, start), end: Math.min(clipSeconds, end) };
  } catch { return null; }
}

/**
 * Where the scripted line is spoken in a clip (MP4 bytes). Returns null when
 * there is no line, no audio, or it can't be found — the assembler then
 * falls back to simply skipping leading silence.
 */
export async function findLine(clip: Buffer, line: string, clipSeconds: number): Promise<SpeechWindow | null> {
  if (!line.trim()) return null;
  const ff = await ffmpegPath();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'speech-'));
  try {
    const src = path.join(dir, 'in.mp4'); const mp3 = path.join(dir, 'a.mp3');
    await fs.writeFile(src, clip);
    await run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-b:a', '64k', mp3]);
    const [rough, silence] = await Promise.all([
      askGemini(await fs.readFile(mp3), line, clipSeconds).catch(() => null),
      run(ff, ['-hide_banner', '-i', mp3, '-af', 'silencedetect=noise=-32dB:d=0.15', '-f', 'null', '-'])
        .then(r => String(r.stderr)).catch((e: { stderr?: string }) => String(e.stderr || '')),
    ]);
    if (!rough) return null;
    return { start: snapStart(rough.start, soundStarts(silence)), end: rough.end };
  } catch {
    return null; // no audio track etc.
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
