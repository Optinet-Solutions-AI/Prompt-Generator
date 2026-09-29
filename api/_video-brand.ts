/**
 * _video-brand.ts — stamp the REAL brand onto a finished UGC video.
 *
 * WHY: AI video models draw logos and text badly (warped, misspelled,
 * flickering), so the prompt tells them NOT to draw any. Instead, after the
 * video renders, we add the brand ourselves with ffmpeg:
 *   A) Corner badge — the real logo (or, with no logo, the business NAME in
 *      a clean font) on a soft dark pill, top-left (clear of TikTok/Reels
 *      buttons on the right and the caption area at the bottom).
 *   B) End card — a 1.5s closing frame: logo (or name) on the brand's dark
 *      panel colour with a glow in its accent colour, plus an optional
 *      tagline such as "Book today · drdemajo.com", fading in.
 *
 * TWO KINDS OF KIT:
 *   - our brands: logos from /public/brand-references/<brand>/scraped/ (SVG)
 *   - custom businesses (Video tab → "Custom business"): logo the user
 *     uploaded (PNG/JPG/WebP/SVG data URL), their colours, name and tagline
 *
 * Text is drawn with the bundled Poppins font (api/fonts, SIL OFL) because
 * Vercel's servers have no fonts installed. ffmpeg comes from ffmpeg-static.
 * Both are bundled into the function via vercel.json "includeFiles".
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const run = promisify(execFile);

// Dark panel + accent per brand (mirrors src/lib/brand-standards.ts — API
// files can't import from src/). Logo file names mirror src/lib/brand-logos.ts.
const BRAND_KIT: Record<string, { panel: string; accent: string; logo: string }> = {
  roosterbet: { panel: '#140000', accent: '#FF3333', logo: 'logo-1.svg' },
  fortuneplay: { panel: '#0F0800', accent: '#FFD700', logo: 'logo-1.svg' },
  spinjo: { panel: '#000D1A', accent: '#00B4D8', logo: 'logo-1.svg' },
  luckyvibe: { panel: '#001A33', accent: '#29B6F6', logo: 'logo-1.svg' },
  spinsup: { panel: '#08001C', accent: '#FF00FF', logo: 'logo-1.svg' },
  playmojo: { panel: '#020D16', accent: '#00BCD4', logo: 'logo-1.svg' },
  lucky7even: { panel: '#08001A', accent: '#CE93D8', logo: 'logo-1.svg' },
  novadreams: { panel: '#00030F', accent: '#40C4FF', logo: 'logo-long.svg' },
  rollero: { panel: '#080600', accent: '#D4A017', logo: 'logo-long.svg' },
};

export const END_CARD_SECONDS = 1.5;

export interface BrandOptions { logo: boolean; endCard: boolean }

/** Everything needed to brand one video. */
export interface VideoKit {
  name: string;          // shown as text when there's no logo
  panel: string;         // end-card background (dark)
  accent: string;        // end-card glow
  logo: Buffer | null;   // PNG/JPG/WebP/SVG bytes, or null → use the name
  tagline?: string;      // optional end-card line under the logo/name
}

/** Custom business settings sent by the Video tab. */
export interface CustomKitInput {
  name?: string; color?: string; accent?: string; logo?: string; tagline?: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Darken a hex colour toward black (0..1) — turns a brand colour into an end-card panel. */
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v * (1 - amount)).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

const escapeMarkup = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function ffmpegPath(): Promise<string> {
  const mod = await import('ffmpeg-static');
  const p = (mod.default ?? mod) as unknown as string;
  if (!p) throw new Error('ffmpeg binary not available on this platform');
  return p;
}

/** Path to a bundled font file (works locally and inside the Vercel function). */
async function fontFile(weight: 'Bold' | 'Medium'): Promise<string> {
  const candidates = [
    path.join(process.cwd(), 'api', 'fonts', `Poppins-${weight}.ttf`),
    path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fonts', `Poppins-${weight}.ttf`),
  ];
  for (const c of candidates) { try { await fs.access(c); return c; } catch { /* next */ } }
  throw new Error('bundled font not found');
}

/** Render a line of text to a transparent PNG with the bundled font. */
async function textPng(text: string, weight: 'Bold' | 'Medium', px: number, color = '#FFFFFF', maxWidth?: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({
    text: {
      text: `<span foreground="${color}">${escapeMarkup(text)}</span>`,
      font: `Poppins ${weight} ${px}`,
      fontfile: await fontFile(weight),
      rgba: true,
      dpi: 72,
      align: 'centre',
      ...(maxWidth ? { width: maxWidth, wrap: 'word' as const } : {}),
    },
  }).png().toBuffer();
}

/** Load a built-in brand's SVG logo: from disk locally, from the site itself on Vercel. */
async function loadLogoSvg(slug: string, file: string, siteOrigin: string): Promise<Buffer> {
  const rel = `brand-references/${slug}/scraped/${file}`;
  try { return await fs.readFile(path.join(process.cwd(), 'public', rel)); } catch { /* not on disk — fetch */ }
  const res = await fetch(`${siteOrigin}/${rel}`);
  if (!res.ok) throw new Error(`logo fetch failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Kit for one of our built-in brands, or null if the brand has none. */
export async function brandKit(brand: string, siteOrigin: string): Promise<VideoKit | null> {
  const slug = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
  const k = BRAND_KIT[slug];
  if (!k) return null;
  return { name: brand, panel: k.panel, accent: k.accent, logo: await loadLogoSvg(slug, k.logo, siteOrigin) };
}

/** Kit for a custom business from the Video tab's fields. */
export function customKit(c: CustomKitInput): VideoKit | null {
  const name = String(c.name || '').trim().slice(0, 60);
  if (!name) return null;
  const color = HEX.test(String(c.color)) ? String(c.color) : '#0F4C81';
  const accent = HEX.test(String(c.accent)) ? String(c.accent) : '#38BDF8';
  let logo: Buffer | null = null;
  const m = String(c.logo || '').match(/^data:image\/(png|jpeg|webp|svg\+xml);base64,(.+)$/);
  if (m) logo = Buffer.from(m[2], 'base64');
  return { name, panel: darken(color, 0.72), accent, logo, tagline: String(c.tagline || '').trim().slice(0, 80) || undefined };
}

/** Read width, height, fps and whether there's an audio track. */
async function probe(ff: string, file: string) {
  // `ffmpeg -i` with no output exits non-zero but prints the stream info to stderr.
  const out = await run(ff, ['-hide_banner', '-i', file]).catch((e: { stderr?: string }) => ({ stderr: e.stderr || '' }));
  const info = String(out.stderr);
  const size = info.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
  const fps = info.match(/(\d+(?:\.\d+)?) fps/);
  const dur = info.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  return {
    width: size ? parseInt(size[1], 10) : 720,
    height: size ? parseInt(size[2], 10) : 1280,
    fps: fps ? parseFloat(fps[1]) : 24,
    hasAudio: /Audio:/.test(info),
    duration: dur ? (+dur[1]) * 3600 + (+dur[2]) * 60 + parseFloat(dur[3]) : 0,
  };
}

/** The kit's logo (or name, as text) resized to fit a box. */
async function markPng(kit: VideoKit, boxW: number, boxH: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  if (kit.logo) {
    return sharp(kit.logo, { density: 400 }).resize({ width: boxW, height: boxH, fit: 'inside', withoutEnlargement: false }).png().toBuffer();
  }
  const px = Math.max(14, Math.round(boxH * 0.62));
  const t = await textPng(kit.name, 'Bold', px);
  return sharp(t).resize({ width: boxW, height: boxH, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}

/**
 * Brand a video with a kit. Returns the new MP4 bytes, or the original bytes
 * unchanged when branding is off / there's no kit.
 */
export async function brandVideoWithKit(input: Buffer, kit: VideoKit | null, opts: BrandOptions): Promise<{ buffer: Buffer; branded: boolean }> {
  if (!kit || (!opts.logo && !opts.endCard)) return { buffer: input, branded: false };

  const sharp = (await import('sharp')).default;
  const ff = await ffmpegPath();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ugc-'));
  try {
    const src = path.join(dir, 'in.mp4');
    await fs.writeFile(src, input);
    const v = await probe(ff, src);

    const args: string[] = ['-hide_banner', '-y', '-i', src];
    const filters: string[] = [];
    let mainV = '0:v';
    let nextInput = 1;

    // ── A) corner badge on a rounded dark pill ──
    if (opts.logo) {
      const markW = Math.round(v.width * 0.34);
      const mark = await markPng(kit, markW, Math.round(markW / 2.6));
      const mm = await sharp(mark).metadata();
      const padX = Math.round(markW * 0.07); const padY = Math.round(markW * 0.05);
      const pw = (mm.width || markW) + padX * 2; const ph = (mm.height || 60) + padY * 2;
      const pill = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><rect width="${pw}" height="${ph}" rx="${Math.round(ph / 2.4)}" fill="#000" fill-opacity="0.55"/></svg>`,
      );
      const badge = path.join(dir, 'badge.png');
      await sharp(pill).composite([{ input: mark, left: padX, top: padY }]).png().toFile(badge);
      args.push('-i', badge);
      const x = Math.round(v.width * 0.045); const y = Math.round(v.height * 0.06);
      filters.push(`[0:v][${nextInput}:v]overlay=${x}:${y}[withlogo]`);
      mainV = 'withlogo';
      nextInput++;
    }

    if (!opts.endCard) {
      filters.push(`[${mainV}]format=yuv420p[v]`);
      args.push('-filter_complex', filters.join(';'), '-map', '[v]');
      if (v.hasAudio) args.push('-map', '0:a?', '-c:a', 'copy');
    } else {
      // ── B) end card: logo/name (+ tagline) on the panel with an accent glow ──
      const mark = await markPng(kit, Math.round(v.width * 0.7), Math.round(v.height * (kit.tagline ? 0.22 : 0.3)));
      const mm = await sharp(mark).metadata();
      const layers: Array<{ input: Buffer; left: number; top: number }> = [];
      let tagH = 0; let tag: Buffer | null = null;
      if (kit.tagline) {
        tag = await textPng(kit.tagline, 'Medium', Math.round(v.width * 0.045), '#FFFFFF', Math.round(v.width * 0.8));
        tagH = (await sharp(tag).metadata()).height || 0;
      }
      const gap = tag ? Math.round(v.height * 0.035) : 0;
      const blockH = (mm.height || 0) + gap + tagH;
      const top = Math.round((v.height - blockH) / 2);
      layers.push({ input: mark, left: Math.round((v.width - (mm.width || 0)) / 2), top });
      if (tag) {
        const tw = (await sharp(tag).metadata()).width || 0;
        layers.push({ input: tag, left: Math.round((v.width - tw) / 2), top: top + (mm.height || 0) + gap });
      }
      const bg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${v.width}" height="${v.height}">` +
        `<defs><radialGradient id="g" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="${kit.accent}" stop-opacity="0.45"/>` +
        `<stop offset="100%" stop-color="${kit.panel}" stop-opacity="0"/></radialGradient></defs>` +
        `<rect width="100%" height="100%" fill="${kit.panel}"/><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
      );
      const card = path.join(dir, 'card.png');
      await sharp(bg).composite(layers).png().toFile(card);

      const cardIn = nextInput++;
      args.push('-loop', '1', '-framerate', String(v.fps), '-t', String(END_CARD_SECONDS), '-i', card);
      const silenceIn = nextInput++;
      args.push('-f', 'lavfi', '-t', String(END_CARD_SECONDS), '-i', 'anullsrc=r=44100:cl=stereo');

      filters.push(`[${mainV}]fps=${v.fps},format=yuv420p,setsar=1[main]`);
      filters.push(`[${cardIn}:v]fps=${v.fps},format=yuv420p,setsar=1,fade=t=in:st=0:d=0.35[card]`);
      if (v.hasAudio) {
        filters.push('[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0]');
        filters.push(`[main][a0][card][${silenceIn}:a]concat=n=2:v=1:a=1[v][a]`);
        args.push('-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]', '-c:a', 'aac', '-b:a', '128k');
      } else {
        filters.push('[main][card]concat=n=2:v=1:a=0[v]');
        args.push('-filter_complex', filters.join(';'), '-map', '[v]');
      }
    }

    const out = path.join(dir, 'out.mp4');
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out);
    await run(ff, args, { maxBuffer: 16 * 1024 * 1024 });
    return { buffer: await fs.readFile(out), branded: true };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Built-in brand version (kept for existing callers). */
export async function brandVideo(input: Buffer, brand: string, opts: BrandOptions, siteOrigin: string) {
  return brandVideoWithKit(input, await brandKit(brand, siteOrigin), opts);
}
