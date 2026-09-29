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

export interface BrandOptions {
  logo: boolean;
  endCard: boolean;
  /** On-screen hook caption for the first HOOK_SECONDS (TikTok-style text). */
  hook?: string;
}

export const HOOK_SECONDS = 3;

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
  // A brand colour that is already dark (e.g. Demajo's forest #191E19) is used
  // as the end-card panel as-is; lighter colours are darkened so text pops.
  const n = parseInt(color.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  const panel = lum < 0.2 ? color : darken(color, 0.72);
  return { name, panel, accent, logo, tagline: String(c.tagline || '').trim().slice(0, 80) || undefined };
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

/** Relative brightness of a hex colour, 0 (black) … 1 (white). */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** A soft drop shadow in the shape of a PNG (padded by 2×blur on each side). */
async function softShadow(png: Buffer, blur: number, alpha: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const m = await sharp(png).metadata();
  const solid = await sharp({ create: { width: m.width || 1, height: m.height || 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha } } })
    .composite([{ input: png, blend: 'dest-in' }]).png().toBuffer();
  return sharp(solid).extend({ top: blur * 2, bottom: blur * 2, left: blur * 2, right: blur * 2, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(blur).png().toBuffer();
}

/** The kit's logo (or name, as text) resized to fit a box. */
async function markPng(kit: VideoKit, boxW: number, boxH: number, maxTextW = boxW): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  if (kit.logo) {
    return sharp(kit.logo, { density: 400 }).resize({ width: boxW, height: boxH, fit: 'inside', withoutEnlargement: false }).png().toBuffer();
  }
  // No logo: the business name in the bundled font, sized from the box HEIGHT
  // and allowed up to `maxTextW` wide so a long name stays readable.
  const px = Math.max(16, Math.round(boxH * 0.55));
  const t = await textPng(kit.name, 'Bold', px);
  return sharp(t).resize({ width: maxTextW, height: boxH, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}

/**
 * Brand a video with a kit. Returns the new MP4 bytes, or the original bytes
 * unchanged when branding is off / there's no kit.
 */
export async function brandVideoWithKit(input: Buffer, kit: VideoKit | null, opts: BrandOptions): Promise<{ buffer: Buffer; branded: boolean }> {
  // Emoji aren't in the bundled font — strip them so they don't render as boxes.
  const hookText = String(opts.hook || '').replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '').replace(/\s+/g, ' ').trim().slice(0, 90);
  if (!kit || (!opts.logo && !opts.endCard && !hookText)) return { buffer: input, branded: false };

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

    // ── A) corner logo — Reels/TikTok-ad style: no box. A soft dark gradient
    //    fades down from the top edge and the logo carries a soft shadow, so
    //    a white logo reads on any background without looking like a label.
    if (opts.logo) {
      // Wide, short logos (e.g. a crest + two lines of text, ~7:1) get more
      // width so their small text stays readable.
      let wide = false;
      if (kit.logo) {
        const lm = await sharp(kit.logo, { density: 72 }).metadata().catch(() => ({} as { width?: number; height?: number }));
        wide = !!lm.width && !!lm.height && lm.width / lm.height > 4;
      }
      const markW = Math.round(v.width * (wide ? 0.5 : 0.3));
      const mark = await markPng(kit, markW, Math.round(markW / (wide ? 5 : 2.4)), Math.round(v.width * 0.6));
      const shadowBlur = Math.max(3, Math.round(v.width * 0.009));
      const markShadow = await softShadow(mark, shadowBlur, 0.6);
      const scrimH = Math.round(v.height * 0.2);
      const x = Math.round(v.width * 0.045); const y = Math.round(v.height * 0.05);
      const layer = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${v.width}" height="${scrimH}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>` +
        `<rect width="100%" height="100%" fill="url(#g)"/></svg>`,
      );
      const badge = path.join(dir, 'badge.png');
      await sharp(layer).composite([
        { input: markShadow, left: Math.max(0, x - shadowBlur * 2), top: Math.max(0, y - shadowBlur * 2 + 2) },
        { input: mark, left: x, top: y },
      ]).png().toFile(badge);
      args.push('-i', badge);
      filters.push(`[0:v][${nextInput}:v]overlay=0:0[withlogo]`);
      mainV = 'withlogo';
      nextInput++;
    }

    // ── Hook caption — "brand colour" card: the business's accent colour,
    //    dark or white text chosen for contrast, soft shadow, fades in/out.
    if (hookText) {
      const onAccent = luminance(kit.accent) > 0.55 ? kit.panel : '#FFFFFF';
      const txt = await textPng(hookText, 'Bold', Math.round(v.width * 0.056), onAccent, Math.round(v.width * 0.78));
      const tm = await sharp(txt).metadata();
      const padX = Math.round(v.width * 0.042); const padY = Math.round(v.width * 0.026);
      const bw = (tm.width || 0) + padX * 2; const bh = (tm.height || 0) + padY * 2;
      const card = await sharp(Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}"><rect width="${bw}" height="${bh}" rx="${Math.round(v.width * 0.032)}" fill="${kit.accent}"/></svg>`,
      )).composite([{ input: txt, left: padX, top: padY }]).png().toBuffer();
      const blur = Math.max(4, Math.round(v.width * 0.014));
      const cardShadow = await softShadow(card, blur, 0.35);
      const cs = await sharp(cardShadow).metadata();
      const hookPng = path.join(dir, 'hook.png');
      await sharp({ create: { width: cs.width || bw, height: (cs.height || bh) + 6, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: cardShadow, left: 0, top: 6 }, { input: card, left: blur * 2, top: blur * 2 }]).png().toFile(hookPng);
      const hookIn = nextInput++;
      args.push('-loop', '1', '-framerate', String(v.fps), '-t', String(HOOK_SECONDS), '-i', hookPng);
      filters.push(`[${hookIn}:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=${HOOK_SECONDS - 0.4}:d=0.4:alpha=1[hk]`);
      filters.push(`[${mainV}][hk]overlay=(W-w)/2:${Math.round(v.height * 0.19)}:eof_action=pass[withhook]`);
      mainV = 'withhook';
    }

    if (!opts.endCard) {
      filters.push(`[${mainV}]format=yuv420p[v]`);
      args.push('-filter_complex', filters.join(';'), '-map', '[v]');
      if (v.hasAudio) args.push('-map', '0:a?', '-c:a', 'copy');
    } else {
      // ── B) end card: logo/name (+ tagline) on the panel with an accent glow ──
      const mark = await markPng(kit, Math.round(v.width * 0.7), Math.round(v.height * (kit.tagline ? 0.1 : 0.14)), Math.round(v.width * 0.86));
      const mm = await sharp(mark).metadata();
      const layers: Array<{ input: Buffer; left: number; top: number }> = [];
      // Tagline → an ad-style call-to-action: "Book your consultation · site.org"
      // becomes a button in the accent colour + the rest small underneath.
      let tagH = 0; let tag: Buffer | null = null;
      if (kit.tagline) {
        const [cta, ...restParts] = kit.tagline.split(/\s*[·|•]\s*/);
        const rest = restParts.join(' · ');
        const onAccent = luminance(kit.accent) > 0.55 ? kit.panel : '#FFFFFF';
        const ctaTxt = await textPng(cta, 'Bold', Math.round(v.width * 0.046), onAccent, Math.round(v.width * 0.72));
        const ct = await sharp(ctaTxt).metadata();
        const bx = Math.round(v.width * 0.06); const by = Math.round(v.width * 0.028);
        const btnW = (ct.width || 0) + bx * 2; const btnH = (ct.height || 0) + by * 2;
        const button = await sharp(Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${btnW}" height="${btnH}"><rect width="${btnW}" height="${btnH}" rx="${Math.round(btnH / 2)}" fill="${kit.accent}"/></svg>`,
        )).composite([{ input: ctaTxt, left: bx, top: by }]).png().toBuffer();
        const small = rest ? await textPng(rest, 'Medium', Math.round(v.width * 0.036), '#FFFFFF', Math.round(v.width * 0.8)) : null;
        const sm = small ? await sharp(small).metadata() : null;
        const gapIn = small ? Math.round(v.height * 0.02) : 0;
        const w = Math.max(btnW, sm?.width || 0); const h = btnH + gapIn + (sm?.height || 0);
        tag = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
          .composite([
            { input: button, left: Math.round((w - btnW) / 2), top: 0 },
            ...(small && sm ? [{ input: small, left: Math.round((w - (sm.width || 0)) / 2), top: btnH + gapIn }] : []),
          ]).png().toBuffer();
        tagH = h;
      }
      const gap = tag ? Math.round(v.height * 0.05) : 0;
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
