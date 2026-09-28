/**
 * _video-brand.ts — stamp the REAL brand onto a finished UGC video.
 *
 * WHY: AI video models draw logos and text badly (warped, misspelled,
 * flickering), so the prompt tells them NOT to draw any. Instead, after the
 * video renders, we add the brand ourselves with ffmpeg:
 *   A) Logo in the corner — the brand's real logo on a soft dark pill,
 *      top-left (clear of TikTok/Reels buttons on the right and the caption
 *      area at the bottom).
 *   B) End card — a 1.5s closing frame: the logo on the brand's dark panel
 *      colour with a glow in its accent colour, fading in.
 *
 * Logos come from /public/brand-references/<brand>/scraped/ (SVG) and are
 * rasterised with sharp. ffmpeg comes from the ffmpeg-static package
 * (bundled into the function via vercel.json "includeFiles").
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
  spinjo: { panel: '#020B18', accent: '#00B4D8', logo: 'logo-1.svg' },
  luckyvibe: { panel: '#0A0F1A', accent: '#29B6F6', logo: 'logo-1.svg' },
  spinsup: { panel: '#12001A', accent: '#FF00FF', logo: 'logo-1.svg' },
  playmojo: { panel: '#001418', accent: '#00BCD4', logo: 'logo-1.svg' },
  lucky7even: { panel: '#12001F', accent: '#CE93D8', logo: 'logo-1.svg' },
  novadreams: { panel: '#000A1A', accent: '#40C4FF', logo: 'logo-long.svg' },
  rollero: { panel: '#120D00', accent: '#D4A017', logo: 'logo-long.svg' },
};

export const END_CARD_SECONDS = 1.5;

export interface BrandOptions { logo: boolean; endCard: boolean }

async function ffmpegPath(): Promise<string> {
  const mod = await import('ffmpeg-static');
  const p = (mod.default ?? mod) as unknown as string;
  if (!p) throw new Error('ffmpeg binary not available on this platform');
  return p;
}

/** Load the brand's SVG logo: from disk locally, from the site itself on Vercel. */
async function loadLogoSvg(slug: string, file: string, siteOrigin: string): Promise<Buffer> {
  const rel = `brand-references/${slug}/scraped/${file}`;
  try { return await fs.readFile(path.join(process.cwd(), 'public', rel)); } catch { /* not on disk — fetch */ }
  const res = await fetch(`${siteOrigin}/${rel}`);
  if (!res.ok) throw new Error(`logo fetch failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
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

/**
 * Brand a video. Returns the new MP4 bytes, or the original bytes unchanged
 * when branding is off / the brand has no kit.
 */
export async function brandVideo(
  input: Buffer, brand: string, opts: BrandOptions, siteOrigin: string,
): Promise<{ buffer: Buffer; branded: boolean }> {
  const slug = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
  const kit = BRAND_KIT[slug];
  if (!kit || (!opts.logo && !opts.endCard)) return { buffer: input, branded: false };

  const sharp = (await import('sharp')).default;
  const ff = await ffmpegPath();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ugc-'));
  try {
    const src = path.join(dir, 'in.mp4');
    await fs.writeFile(src, input);
    const v = await probe(ff, src);
    const svg = await loadLogoSvg(slug, kit.logo, siteOrigin);

    const args: string[] = ['-hide_banner', '-y', '-i', src];
    const filters: string[] = [];
    let mainV = '0:v';
    let nextInput = 1;

    // ── A) corner logo on a rounded dark pill ──
    if (opts.logo) {
      const logoW = Math.round(v.width * 0.34);
      const logoPng = await sharp(svg, { density: 400 }).resize({ width: logoW, height: Math.round(logoW / 2.6), fit: 'inside' }).png().toBuffer();
      const lm = await sharp(logoPng).metadata();
      const padX = Math.round(logoW * 0.07); const padY = Math.round(logoW * 0.05);
      const pw = (lm.width || logoW) + padX * 2; const ph = (lm.height || 60) + padY * 2;
      const pill = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><rect width="${pw}" height="${ph}" rx="${Math.round(ph / 2.4)}" fill="#000" fill-opacity="0.55"/></svg>`,
      );
      const badge = path.join(dir, 'badge.png');
      await sharp(pill).composite([{ input: logoPng, left: padX, top: padY }]).png().toFile(badge);
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
      // ── B) end card: logo on brand panel with an accent glow ──
      const cardLogoW = Math.round(v.width * 0.7);
      const cardLogo = await sharp(svg, { density: 400 }).resize({ width: cardLogoW, height: Math.round(v.height * 0.3), fit: 'inside' }).png().toBuffer();
      const cm = await sharp(cardLogo).metadata();
      const bg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${v.width}" height="${v.height}">` +
        `<defs><radialGradient id="g" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="${kit.accent}" stop-opacity="0.45"/>` +
        `<stop offset="100%" stop-color="${kit.panel}" stop-opacity="0"/></radialGradient></defs>` +
        `<rect width="100%" height="100%" fill="${kit.panel}"/><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
      );
      const card = path.join(dir, 'card.png');
      await sharp(bg).composite([{
        input: cardLogo,
        left: Math.round((v.width - (cm.width || cardLogoW)) / 2),
        top: Math.round((v.height - (cm.height || 200)) / 2),
      }]).png().toFile(card);

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
