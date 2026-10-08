/**
 * _ad-assemble.ts — build a finished ad (30s master or a 15/10/6s cut-down)
 * from the generated scene clips, with ffmpeg.
 *
 * What it does, in order:
 *   1. Lays out the cut with buildTimeline() (_ad-timeline.ts).
 *   2. Trims each scene clip, scales/crops it to the ad size, keeps the
 *      actors' own voices (the video model makes the dialogue).
 *   3. Optional captions: each scene's spoken line, burned in at the bottom
 *      (most social video is watched with the sound off).
 *   4. End card drawn by us (AI can't draw logos/text reliably): logo,
 *      catchphrase, call-to-action button and website, fading in.
 *   5. Audio mix: scene dialogue + background music kept LOW under the
 *      scenes and lifted under the end card + the end-card voiceover
 *      ("Found online? Optinet."), then levelled for social platforms.
 *
 * Re-uses the drawing helpers from _video-brand.ts (bundled Poppins font,
 * ffmpeg-static). Underscore file = helper, not its own Vercel route.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ffmpegPath, textPng, probe, luminance, markPng, softShadow, type VideoKit } from './_video-brand.js';
import type { SpeechWindow } from './_ad-speech.js';
import { buildTimeline, FPS, CUT_SECONDS, type AdBeat, type AdCut, type Segment, type ShotInfo } from './_ad-timeline.js';

const run = promisify(execFile);

export interface AdEndCard {
  /** Big line, e.g. "Found online? Optinet." */
  catchphrase?: string;
  /** Button text, e.g. "Claim your free SEO audit" */
  cta?: string;
  /** Small line under the button, e.g. "optinetsolutions.com" */
  url?: string;
}

export interface AdRenderInput {
  cut: AdCut;
  /** Output size, e.g. 1920×1080 (16:9) or 1080×1920 (9:16). */
  width: number;
  height: number;
  /** The generated scene clips (MP4 bytes), by beat. Missing beats are skipped. */
  shots: Partial<Record<AdBeat, Buffer>>;
  /** Optional caption per beat (the spoken line). */
  captions?: Partial<Record<AdBeat, string>>;
  /** Where each scene's line is spoken (from findLine, saved when the scene was made). */
  speech?: Partial<Record<AdBeat, SpeechWindow | null>>;
  kit: VideoKit;
  endCard: AdEndCard;
  /** End-card voiceover (mp3/wav), starts just after the end card appears. */
  voiceover?: Buffer | null;
  /** Background music (mp3/wav); looped/trimmed to the ad length. */
  music?: Buffer | null;
}

export interface AdRenderResult {
  buffer: Buffer;
  timeline: Segment[];
  /** How long ffmpeg took (ms) — useful to watch the 300s function budget. */
  renderMs: number;
}

// Music level under dialogue vs under the end card (linear gain).
const MUSIC_UNDER_SCENES = 0.12;
const MUSIC_UNDER_END_CARD = 0.3;
const VOICEOVER_DELAY = 0.25;

/**
 * Logos often come as a JPG on a white box (e.g. Optinet's). On a light end
 * card that box shows as a slightly different rectangle, so near-white
 * pixels are made transparent (soft edge between 225 and 245 brightness).
 */
async function keyOutWhite(logo: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(logo).metadata();
  if (meta.hasAlpha || meta.format === 'svg') return logo;
  const { data, info } = await sharp(logo).resize({ width: 1600, withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    if (min >= 245) data[i + 3] = 0;
    else if (min > 225) data[i + 3] = Math.round(255 * (245 - min) / 20);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** The end card: brand panel + accent glow, logo, catchphrase, CTA button, url. */
async function endCardPng(kit: VideoKit, card: AdEndCard, W: number, H: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const u = Math.min(W, H); // size unit — works for 16:9 and 9:16 alike
  // Light panel (e.g. white, like Trivago's end card) → dark text; dark panel → white text.
  const light = luminance(kit.panel) > 0.55;
  const ink = light ? '#111111' : '#FFFFFF';
  const blocks: Buffer[] = [];

  const logoKit = light && kit.logo ? { ...kit, logo: await keyOutWhite(kit.logo) } : kit;
  blocks.push(await markPng(logoKit, Math.round(Math.min(W * 0.55, u * 0.9)), Math.round(u * 0.2), Math.round(W * 0.8)));
  if (card.catchphrase) {
    blocks.push(await textPng(card.catchphrase, 'Bold', Math.round(u * 0.075), ink, Math.round(W * 0.86)));
  }
  if (card.cta) {
    const onAccent = luminance(kit.accent) > 0.55 ? '#111111' : '#FFFFFF';
    const t = await textPng(card.cta, 'Bold', Math.round(u * 0.045), onAccent, Math.round(W * 0.7));
    const tm = await sharp(t).metadata();
    const bx = Math.round(u * 0.05); const by = Math.round(u * 0.024);
    const bw = (tm.width || 0) + bx * 2; const bh = (tm.height || 0) + by * 2;
    blocks.push(await sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}"><rect width="${bw}" height="${bh}" rx="${Math.round(bh / 2)}" fill="${kit.accent}"/></svg>`,
    )).composite([{ input: t, left: bx, top: by }]).png().toBuffer());
  }
  if (card.url) blocks.push(await textPng(card.url, 'Medium', Math.round(u * 0.034), ink, Math.round(W * 0.8)));

  const metas = await Promise.all(blocks.map(b => sharp(b).metadata()));
  const gap = Math.round(u * 0.045);
  const blockH = metas.reduce((n, m) => n + (m.height || 0), 0) + gap * (blocks.length - 1);
  let top = Math.round((H - blockH) / 2);
  const layers: Array<{ input: Buffer; left: number; top: number }> = [];
  for (let i = 0; i < blocks.length; i++) {
    const w = metas[i].width || 0;
    layers.push({ input: blocks[i], left: Math.round((W - w) / 2), top });
    top += (metas[i].height || 0) + gap;
  }
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<defs><radialGradient id="g" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="${kit.accent}" stop-opacity="${light ? 0.12 : 0.45}"/>` +
    `<stop offset="100%" stop-color="${kit.panel}" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="100%" height="100%" fill="${kit.panel}"/><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  return sharp(bg).composite(layers).png().toBuffer();
}

/** A caption: white bold text on a soft dark rounded box. */
async function captionPng(text: string, W: number, H: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const u = Math.min(W, H);
  const t = await textPng(text, 'Bold', Math.round(u * 0.05), '#FFFFFF', Math.round(W * 0.78));
  const m = await sharp(t).metadata();
  const px = Math.round(u * 0.03); const py = Math.round(u * 0.016);
  const bw = (m.width || 0) + px * 2; const bh = (m.height || 0) + py * 2;
  const box = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}"><rect width="${bw}" height="${bh}" rx="${Math.round(u * 0.022)}" fill="#000000" fill-opacity="0.55"/></svg>`,
  )).composite([{ input: t, left: px, top: py }]).png().toBuffer();
  const blur = Math.max(3, Math.round(u * 0.01));
  const shadow = await softShadow(box, blur, 0.25);
  return sharp(shadow).composite([{ input: box, left: blur * 2, top: blur * 2 }]).png().toBuffer();
}

/**
 * Where the speech starts in a clip (seconds), so dead air at the start can
 * be skipped. Uses ffmpeg's silence detector; 0 when it starts talking at
 * once or has no audio. We keep a short breath (0.25s) before the first word.
 */
async function speechStart(ff: string, file: string): Promise<number> {
  const out = await run(ff, ['-hide_banner', '-i', file, '-vn', '-af', 'silencedetect=noise=-35dB:d=0.3', '-f', 'null', '-'])
    .catch((e: { stderr?: string }) => ({ stderr: e.stderr || '' }));
  const log = String(out.stderr);
  const first = log.match(/silence_start: (-?[\d.]+)/);
  const end = log.match(/silence_end: ([\d.]+)/);
  if (!first || !end || parseFloat(first[1]) > 0.05) return 0;
  return Math.max(0, parseFloat(end[1]) - 0.25);
}

const cleanCaption = (s: string) => s.replace(/\p{Extended_Pictographic}|️|‍/gu, '').replace(/\s+/g, ' ').trim().slice(0, 140);

/** Build one cut of the ad. Throws if ffmpeg fails. */
export async function renderAd(input: AdRenderInput): Promise<AdRenderResult> {
  const ff = await ffmpegPath();
  const W = input.width; const H = input.height;
  const total = CUT_SECONDS[input.cut];
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-'));
  try {
    // Write clips to disk and measure them.
    const files: Partial<Record<AdBeat, { file: string; duration: number; hasAudio: boolean; from: number }>> = {};
    for (const [beat, buf] of Object.entries(input.shots) as Array<[AdBeat, Buffer]>) {
      if (!buf) continue;
      const file = path.join(dir, `${beat}.mp4`);
      await fs.writeFile(file, buf);
      const p = await probe(ff, file);
      // Start just before the scripted line when we know where it is; else skip leading silence.
      const known = input.speech?.[beat];
      const from = known ? Math.max(0, known.start - 0.2) : p.hasAudio ? await speechStart(ff, file) : 0;
      files[beat] = { file, duration: p.duration, hasAudio: p.hasAudio, from };
    }
    const shots = Object.fromEntries(Object.entries(files).map(([b, f]) => [b, { duration: f!.duration, from: f!.from }])) as Partial<Record<AdBeat, ShotInfo>>;
    const timeline = buildTimeline(input.cut, shots);
    const end = timeline[timeline.length - 1];

    const args: string[] = ['-hide_banner', '-y'];
    const filters: string[] = [];
    let n = 0; // next input index
    const parts: string[] = [];

    for (const [k, seg] of timeline.entries()) {
      const d = seg.duration.toFixed(3);
      if (seg.beat === 'endcard') {
        const card = path.join(dir, 'endcard.png');
        await fs.writeFile(card, await endCardPng(input.kit, input.endCard, W, H));
        const vi = n++; args.push('-loop', '1', '-framerate', String(FPS), '-t', d, '-i', card);
        const ai = n++; args.push('-f', 'lavfi', '-t', d, '-i', 'anullsrc=r=48000:cl=stereo');
        filters.push(`[${vi}:v]fps=${FPS},scale=${W}:${H},setsar=1,format=yuv420p,fade=t=in:st=0:d=0.3[v${k}]`);
        filters.push(`[${ai}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${k}]`);
      } else {
        const f = files[seg.beat]!;
        const vi = n++; args.push('-i', f.file);
        const a0 = seg.from.toFixed(3); const a1 = (seg.from + seg.duration).toFixed(3);
        const v = `[${vi}:v]trim=${a0}:${a1},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,format=yuv420p`;
        const cap = input.captions?.[seg.beat] ? cleanCaption(input.captions[seg.beat]!) : '';
        if (cap) {
          const capFile = path.join(dir, `cap-${seg.beat}.png`);
          await fs.writeFile(capFile, await captionPng(cap, W, H));
          const ci = n++; args.push('-loop', '1', '-framerate', String(FPS), '-t', d, '-i', capFile);
          filters.push(`${v}[base${k}]`);
          filters.push(`[base${k}][${ci}:v]overlay=(W-w)/2:H-h-${Math.round(H * 0.07)}:shortest=1,format=yuv420p[v${k}]`);
        } else {
          filters.push(`${v}[v${k}]`);
        }
        if (f.hasAudio) {
          filters.push(`[${vi}:a]atrim=${a0}:${a1},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${d}[a${k}]`);
        } else {
          const ai = n++; args.push('-f', 'lavfi', '-t', d, '-i', 'anullsrc=r=48000:cl=stereo');
          filters.push(`[${ai}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${k}]`);
        }
      }
      parts.push(`[v${k}][a${k}]`);
    }
    filters.push(`${parts.join('')}concat=n=${timeline.length}:v=1:a=1[vout][dialog]`);

    // Audio bed: dialogue + music (+ end-card voiceover), then level it.
    const mix = ['[dialog]'];
    if (input.music) {
      const mf = path.join(dir, 'music.audio');
      await fs.writeFile(mf, input.music);
      const mi = n++; args.push('-stream_loop', '-1', '-i', mf);
      const fadeAt = Math.max(0, total - 1.2).toFixed(2);
      filters.push(`[${mi}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${total},asetpts=PTS-STARTPTS,` +
        `volume='if(lt(t,${end.start.toFixed(3)}),${MUSIC_UNDER_SCENES},${MUSIC_UNDER_END_CARD})':eval=frame,afade=t=out:st=${fadeAt}:d=1.2[music]`);
      mix.push('[music]');
    }
    if (input.voiceover) {
      const vf = path.join(dir, 'vo.audio');
      await fs.writeFile(vf, input.voiceover);
      const voi = n++; args.push('-i', vf);
      const ms = Math.round((end.start + VOICEOVER_DELAY) * 1000);
      filters.push(`[${voi}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${ms}|${ms},apad,atrim=0:${total}[vo]`);
      mix.push('[vo]');
    }
    if (mix.length > 1) {
      filters.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]`);
    } else {
      filters.push(`[dialog]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]`);
    }

    const out = path.join(dir, 'ad.mp4');
    args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-t', String(total), '-movflags', '+faststart', out);
    const t0 = Date.now();
    await run(ff, args, { maxBuffer: 32 * 1024 * 1024 });
    const renderMs = Date.now() - t0;
    return { buffer: await fs.readFile(out), timeline, renderMs };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
