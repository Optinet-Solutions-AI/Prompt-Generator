import type { VercelRequest, VercelResponse } from '@vercel/node';
import { brandSlug } from './_brand-slug.js';
import { OPENAI_IMAGE_MODEL, resolveGeminiModel } from './_image-models.js';
import { checkSpendCap } from './_spend-cap.js';

// Image generation is the slowest operation in the app — gpt-image-2 measured
// 79s for a 2048×1024 "high" quality render on 2026-08-22. Without this, the
// route ran on the Vercel default (60s) and 2K ChatGPT renders were being
// killed before they finished, leaving the user with a spinner that never
// resolves. This was the ONLY image route missing the 300s its siblings
// (edit-image.ts, generate-variations.ts, generate-variations-imagen.ts,
// [action].ts) already declare.
export const config = { maxDuration: 300 };

// ── Server-side exact-size fit (mirror-extend) ─────────────────────────
// The image model can only emit fixed sizes (1024², 1536×1024, 1024×1536),
// and 2:1 is WIDER+SHORTER than any of them — so cover-cropping to 2:1 used
// to slice the subject's head/feet. Instead we keep the ENTIRE generated image
// (fit by the filling dimension) and extend the small leftover side/top gaps by
// MIRRORING the real scene outward — sharp and seamless, no blur and no empty
// padding, and nothing is ever cut. This runs BEFORE saving to Drive, so the
// stored/preview image is the exact size too. Uses sharp (already
// a dependency). bannerDimensions is the "1200 × 600" string from the UI.
export async function resizeToExact(
  buffer: Buffer,
  bannerDimensions?: string,
  aspectRatio?: string,
): Promise<{ buffer: Buffer; mime: string; resized: boolean }> {
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buffer).metadata();
    const sw = meta.width || 0;
    const sh = meta.height || 0;
    if (!sw || !sh) return { buffer, mime: 'image/png', resized: false };
    const srcRatio = sw / sh;

    // Preserve the input format. Gemini image models return JPEG; re-encoding
    // that to PNG would inflate a ~2.5MB photo several times over on every
    // Drive upload. `encode` is applied at every return point below.
    const isJpeg = meta.format === 'jpeg';
    const outMime = isJpeg ? 'image/jpeg' : 'image/png';
    const encode = (p: import('sharp').Sharp) => (isJpeg ? p.jpeg({ quality: 92 }) : p.png());

    // Decide the TARGET width/height.
    let width = 0;
    let height = 0;
    // 1) Exact pixel size from bannerDimensions ("1200 × 600") wins.
    const dm = (bannerDimensions || '').trim().match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
    if (dm) { width = parseInt(dm[1], 10); height = parseInt(dm[2], 10); }
    // 2) Otherwise derive from the requested ASPECT RATIO by EXPANDING the source
    //    to that ratio (add margin) rather than cropping into it — so nothing is lost.
    else {
      const am = (aspectRatio || '').trim().match(/^(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)$/i);
      if (am) {
        const r = parseFloat(am[1]) / parseFloat(am[2]);
        if (r > 0) {
          if (r >= srcRatio) { height = sh; width = Math.round(sh * r); }  // wider → side margin
          else { width = sw; height = Math.round(sw / r); }                // taller → top/bottom margin
        }
      }
    }

    if (!width || !height) return { buffer, mime: 'image/png', resized: false };
    const tgtRatio = width / height;

    // If the target ratio already matches the source, a plain cover resize is exact
    // and lossless (e.g. square→square, portrait→portrait). No blur needed.
    if (Math.abs(tgtRatio - srcRatio) / tgtRatio < 0.02) {
      const out = await encode(
        sharp(buffer).resize(width, height, { fit: 'cover', position: sharp.gravity.centre })
      ).toBuffer();
      return { buffer: out, mime: outMime, resized: true };
    }

    // MIRROR-EXTEND. The target ratio differs from the source (e.g. 16:9 → 2:1), so a
    // cover-crop would cut the subject. Instead keep the WHOLE image (fit by the
    // dimension that fills the frame) and EXTEND the small leftover gaps by MIRRORING
    // the real scene outward — sharp, seamless, no blur and no empty padding. The
    // subject sits centred, so only background (crowd/arena/sky) gets reflected.
    const fitted = tgtRatio > srcRatio
      ? await sharp(buffer).resize({ height }).toBuffer()  // wider target → fit by height, mirror left/right
      : await sharp(buffer).resize({ width }).toBuffer();  // taller target → fit by width, mirror top/bottom
    const fm = await sharp(fitted).metadata();
    const padX = Math.max(0, width - (fm.width || 0));
    const padY = Math.max(0, height - (fm.height || 0));
    const left = Math.floor(padX / 2);
    const top = Math.floor(padY / 2);
    const out = await encode(
      sharp(fitted).extend({ left, right: padX - left, top, bottom: padY - top, extendWith: 'mirror' })
    ).toBuffer();
    console.log(`[generate-image] mirror-extend to ${width}x${height} (src ${sw}x${sh}, tgt=${tgtRatio.toFixed(3)} src=${srcRatio.toFixed(3)}, ${outMime})`);
    return { buffer: out, mime: outMime, resized: true };
  } catch (e) {
    console.error('[generate-image] sharp resize failed, using original bytes:', e);
    return { buffer, mime: 'image/png', resized: false };
  }
}

// Parse "W:H" / "WxH" / "1200 × 600" → numeric ratio, or null.
function ratioFromString(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/(\d+(?:\.\d+)?)\s*[:x×*]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  if (!w || !h) return null;
  return w / h;
}

// Snap any requested ratio to the closest aspect ratio Imagen (Vertex AI, the
// Gemini path) supports NATIVELY. Sending a supported ratio means the model
// generates a nearly-correct shape, so the exact-size crop is minimal (e.g. a
// 2:1 email banner → 16:9, then only ~11% trimmed — vs cropping a square in half).
function nearestImagenRatio(requestedRatio: number): string {
  const NATIVE: Array<{ token: string; ratio: number }> = [
    { token: '9:16', ratio: 9 / 16 },
    { token: '3:4', ratio: 0.75 },
    { token: '1:1', ratio: 1 },
    { token: '4:3', ratio: 4 / 3 },
    { token: '16:9', ratio: 16 / 9 },
  ];
  return NATIVE.reduce((best, cur) =>
    Math.abs(cur.ratio - requestedRatio) < Math.abs(best.ratio - requestedRatio) ? cur : best
  ).token;
}

// gpt-image-2 accepts any size whose edges are multiples of 16, up to 3840 per
// edge, with total pixels between 655,360 and 8,294,400 and a ratio within 3:1.
// That means (unlike gpt-image-1) we can ask for the banner's real shape — a
// 2:1 email banner comes back as a true 2:1, so resizeToExact only has to do a
// lossless downscale instead of mirror-extending a gap.
const OPENAI_STEP     = 16;
const OPENAI_MIN_PX   = 655_360;
const OPENAI_MAX_PX   = 8_294_400;
const OPENAI_MAX_EDGE = 3840;

// Pixel budget per resolution tier. Cost scales with output tokens, which scale
// with pixels, so tying this to the user's resolution choice keeps spend
// predictable rather than always generating at maximum size.
const OPENAI_TARGET_PX: Record<string, number> = {
  '1K': 1_048_576,
  '2K': 2_097_152,
  '3K': 4_194_304,
  '4K': 8_294_400,
};

export function pickOpenAiImageSize(requestedRatio: number, resolution: string): string {
  const snap = (v: number) => Math.max(OPENAI_STEP, Math.round(v / OPENAI_STEP) * OPENAI_STEP);
  // The API refuses ratios beyond 3:1 in either direction.
  const r = Math.min(3, Math.max(1 / 3, requestedRatio));
  const target = OPENAI_TARGET_PX[resolution] ?? OPENAI_TARGET_PX['2K'];

  let h = snap(Math.sqrt(target / r));
  let w = snap(h * r);

  // Respect the per-edge cap, re-deriving the other edge from the ratio.
  if (w > OPENAI_MAX_EDGE) { w = OPENAI_MAX_EDGE; h = snap(w / r); }
  if (h > OPENAI_MAX_EDGE) { h = OPENAI_MAX_EDGE; w = snap(h * r); }

  // Walk into the pixel budget in 16px steps, keeping the ratio.
  while (w * h > OPENAI_MAX_PX && h > OPENAI_STEP) { h -= OPENAI_STEP; w = snap(h * r); }
  while (w * h < OPENAI_MIN_PX && Math.max(w, h) < OPENAI_MAX_EDGE) {
    h += OPENAI_STEP;
    w = snap(h * r);
  }

  // Snapping the narrow edge down can push the achieved ratio past the API's
  // 3:1 limit (e.g. a 1:4 request landed on 832x2512 = 3.019:1, which OpenAI
  // rejects). Widen the narrow edge back until we're inside the limit.
  while (Math.max(w / h, h / w) > 3 && w * h + Math.max(w, h) * OPENAI_STEP <= OPENAI_MAX_PX) {
    if (w < h) w += OPENAI_STEP; else h += OPENAI_STEP;
  }

  return `${w}x${h}`;
}

// ── AI Assistant cost logging (opt-in via request body) ────────────────
// This helper is a no-op for the main app — only fires when the new
// AI Assistant page sends `source: 'assistant'` + `test_user_id`.
// Failures here NEVER affect the user's response.
export async function logAssistantImageGen(
  req: VercelRequest,
  fileId: string,
  provider: string,
  model: string,
  size: string,
  quality: string | null,
  // Present for providers that report token usage (both Gemini's gemini-api
  // transport AND OpenAI now report it). When given, cost is computed exactly
  // from tokens x the model's official rate instead of the legacy per-image
  // size/quality lookup table below — which has no row for the new banner
  // sizes (e.g. "2048x1024"), so without this, OpenAI cost would silently
  // stop being logged the moment Task 5's real-shape sizes ship. Optional so
  // the 4 existing 6-argument call sites/tests keep working unchanged.
  usage?: { text_input_tokens: number; image_output_tokens: number },
): Promise<void> {
  const body = (req as { body?: Record<string, unknown> }).body ?? {};
  if (body.source !== 'assistant' || !body.test_user_id) return;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const { computeImageCost, computeImageCostFromUsage } = await import('./_pricing.js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    await supabase.from('assistant_image_gens').insert({
      prompt_id:     (body.assistant_prompt_id as string) ?? null,
      test_user_id:  body.test_user_id as string,
      provider,
      model,
      size,
      quality,
      image_count:   1,
      drive_file_id: fileId,
      cost_usd:      usage
        ? computeImageCostFromUsage(model, usage)
        : computeImageCost(provider, size, quality, 1),
    });
  } catch (err) {
    // Non-fatal — cost logging must NEVER break the main flow.
    console.error('assistant_image_gens log failed (non-fatal):', err);
  }
}

// ── Google Drive helpers (inlined — Vercel API routes must be self-contained) ──

async function getGoogleAccessToken(): Promise<string> {
  const refreshToken = process.env.CLOUD_RUN_REFRESH_TOKEN;
  const clientId     = process.env.CLOUD_RUN_CLIENT_ID;
  const clientSecret = process.env.CLOUD_RUN_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing CLOUD_RUN_REFRESH_TOKEN / CLIENT_ID / CLIENT_SECRET');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: refreshToken,
      client_id: clientId, client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json() as { access_token?: string };
  if (data.access_token) return data.access_token;
  throw new Error('No access_token returned');
}

/** Make a Drive file readable by anyone with the link (so server-side fetches work). */
async function makeFilePublic(fileId: string, accessToken: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
}

async function uploadImageToDrive(params: {
  imageBuffer: Buffer; mimeType: string; filename: string;
  folderId: string; provider: string; aspectRatio: string;
  resolution: string; accessToken: string; brand?: string;
}): Promise<string> {
  const { imageBuffer, mimeType, filename, folderId, provider, aspectRatio, resolution, accessToken, brand } = params;
  const appProperties: Record<string, string> = { provider, aspectRatio, resolution };
  if (brand && brand.trim()) appProperties.brand = brand.trim();
  const metadata = { name: filename, parents: [folderId], appProperties };
  const boundary = 'drive_upload_boundary_xyz';
  const metaJson = JSON.stringify(metadata);
  const partHeaders =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(partHeaders, 'utf-8'), imageBuffer, Buffer.from(closing, 'utf-8')]);
  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary="${boundary}"` }, body }
  );
  if (!uploadRes.ok) throw new Error(`Drive upload failed: ${await uploadRes.text()}`);
  const file = await uploadRes.json() as { id: string };
  return file.id;
}

// ------------------------------------------------------------------
// Brand-specific mandatory style rules.
// These are injected into EVERY prompt for the matching brand so the
// image model cannot ignore them. Use strong, imperative language.
// ------------------------------------------------------------------
const BRAND_STYLES: Record<string, string> = {
  roosterbet:
    '[BRAND COLOR SIGNATURE] ' +
    'Render exactly the subject and setting described below, styled in the ' +
    'Roosterbet palette: bold red, crimson, vivid orange, black and bold white, ' +
    'with high-energy, high-contrast dynamic lighting and an intense, premium mood. ' +
    'Keep the described subject and scene faithful; the prompt text controls whether ' +
    'fire appears (only when the scene already calls for it or it is a sports/action banner).',
  fortuneplay:
    '[MANDATORY BRAND SIGNATURE — DO NOT OMIT] ' +
    'Luxurious aesthetics are required: prominent gold accents, warm gold lighting, and floating gold dust particles ' +
    'MUST be visible in the scene. Every surface should catch golden light. ' +
    'The overall mood must feel opulent, rich, and premium — gold is the defining visual element.',
  luckyvibe:
    '[BRAND COLOR SIGNATURE] ' +
    'Render exactly the subject and setting described below, styled with the LuckyVibe ' +
    'palette and lighting: warm golden-hour / sunset tones — sunset orange, tropical coral, ' +
    'soft amber — with warm backlight and a tropical, vibrant mood. Sand and palm trees ' +
    'belong only when the scene is outdoors or beach-appropriate; the prompt text controls that.',
  spinjo:
    '[MANDATORY BRAND SIGNATURE — DO NOT OMIT] ' +
    'The scene MUST have a sci-fi futuristic atmosphere: deep space blacks, electric purple and cyan lighting, ' +
    'neon glow effects, and a cosmic energy field surrounding the subject. ' +
    'The mood must feel high-tech, otherworldly, and electrifying.',
  spinsup:
    '[MANDATORY BRAND SIGNATURE — DO NOT OMIT] ' +
    'The scene MUST have a magical showman aesthetic: neon purple and electric magenta lighting, ' +
    'sparkling circus-bright particle effects, and a sense of theatrical spectacle. ' +
    'The atmosphere must feel magical, mystical, and larger-than-life.',
  playmojo:
    '[MANDATORY BRAND SIGNATURE — DO NOT OMIT] ' +
    'The scene MUST have a dark cinematic noir look: deep blacks, bold white highlights, sharp red accent lighting. ' +
    'The atmosphere must feel sleek, stylish, and high-contrast — like a cinematic thriller still.',
  lucky7even:
    '[MANDATORY BRAND SIGNATURE — DO NOT OMIT] ' +
    'The scene MUST exude premium luxury: deep purple and violet lighting, metallic gold accents, ' +
    'and an atmosphere of exclusivity and high-stakes elegance. ' +
    'Every element should feel rich, polished, and premium.',
  novadreams:
    '[MANDATORY BRAND SIGNATURE — DO NOT OMIT] ' +
    'The scene MUST have a cosmic space-age feel: electric cyan and deep navy lighting, ' +
    'cosmic starfield or nebula elements in the background, and a futuristic dreamlike quality. ' +
    'The atmosphere should feel infinite, ethereal, and visually stunning.',
  rollero:
    '[MANDATORY BRAND SIGNATURE — DO NOT OMIT] ' +
    'The scene MUST have a warrior combat aesthetic: deep crimson red and charcoal grey tones, ' +
    'dramatic high-contrast lighting, and a powerful intense atmosphere. ' +
    'The mood must feel fierce, bold, and battle-ready.',
};

/**
 * Enriches a raw user prompt with brand-mandatory style rules.
 * The brand rules are prepended so the model sees them FIRST (highest priority).
 */
function enrichPromptWithBrandStyle(prompt: string, brand: string): string {
  if (!brand) return prompt;
  const key = brand.toLowerCase().replace(/\s+/g, '');
  const style = BRAND_STYLES[key];
  if (!style) return prompt;
  return `${style}\n\n${prompt}`;
}

/**
 * Authenticates to Cloud Run using Vercel Workload Identity Federation (WIF).
 *
 * Flow:
 *  1. Vercel injects a short-lived OIDC token into each function invocation
 *  2. We swap it with Google STS for a federated access token
 *  3. We use that access token to impersonate the service account and get a
 *     Cloud Run ID token (the thing Cloud Run actually accepts)
 *
 * No keys, no refresh tokens — everything is automatic.
 */
async function getCloudRunIdToken(cloudRunUrl: string, req: VercelRequest): Promise<string> {
  const workloadProvider = process.env.GCP_WORKLOAD_PROVIDER;
  const serviceAccount   = process.env.GCP_SERVICE_ACCOUNT;

  if (!workloadProvider || !serviceAccount) {
    const missing = [
      !workloadProvider && 'GCP_WORKLOAD_PROVIDER',
      !serviceAccount   && 'GCP_SERVICE_ACCOUNT',
    ].filter(Boolean).join(', ');
    throw new Error(`Missing env vars: ${missing}`);
  }

  // Vercel injects the OIDC token into the request header for each invocation
  const oidcToken =
    (req.headers['x-vercel-oidc-token'] as string | undefined) ||
    process.env.VERCEL_OIDC_TOKEN;

  if (!oidcToken) {
    throw new Error(
      'No Vercel OIDC token found. Make sure OIDC is enabled in Vercel project settings ' +
      '(Settings → Security → Enable Vercel Authentication).'
    );
  }

  // ── Step 1: Exchange Vercel OIDC token → Google federated access token ──
  const stsRes = await fetch('https://sts.googleapis.com/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:           'urn:ietf:params:oauth:grant-type:token-exchange',
      audience:             `//iam.googleapis.com/${workloadProvider}`,
      scope:                'https://www.googleapis.com/auth/cloud-platform',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_token_type:   'urn:ietf:params:oauth:token-type:jwt',
      subject_token:        oidcToken,
    }),
  });

  if (!stsRes.ok) {
    const err = await stsRes.text();
    throw new Error(`Google STS token exchange failed (${stsRes.status}): ${err}`);
  }
  const { access_token: federatedToken } = await stsRes.json();

  // ── Step 2: Use federated token to generate a Cloud Run ID token ─────────
  const idTokenRes = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateIdToken`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${federatedToken}`,
      },
      body: JSON.stringify({ audience: cloudRunUrl, includeEmail: true }),
    }
  );

  if (!idTokenRes.ok) {
    const err = await idTokenRes.text();
    throw new Error(`generateIdToken failed (${idTokenRes.status}): ${err}`);
  }
  const { token } = await idTokenRes.json();
  return token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, provider, aspectRatio, imageSize, backend, resolution, brand, bannerDimensions, geminiModel } = req.body;

    // When an exact pixel size is requested (e.g. 1200×600) we crop+resize the
    // result to that size. To keep it SHARP we must DOWNSCALE a larger native
    // generation rather than upscale a small one — so bump the generation
    // resolution to at least 2K for exact-size requests. (No bump otherwise.)
    const RES_ORDER = ['1K', '2K', '3K', '4K'];
    const exactSizeRequested = !!ratioFromString(bannerDimensions);
    // Any banner whose ratio differs from the model's native shapes gets
    // cropped, so generate bigger and downscale to stay sharp. Bump to >=2K for
    // exact sizes and for wide (>=1.7) or tall (<=0.6) banners.
    const reqRatioForRes = ratioFromString(bannerDimensions) ?? ratioFromString(aspectRatio) ?? 1;
    const needsCrop = exactSizeRequested || reqRatioForRes >= 1.7 || reqRatioForRes <= 0.6;
    const genResolution = needsCrop
      ? (RES_ORDER.indexOf(resolution) >= RES_ORDER.indexOf('2K') ? resolution : '2K')
      : (resolution || '1K');

    if (!prompt || !provider) {
      return res.status(400).json({ error: 'Prompt and provider are required' });
    }

    // ── Assistant-scoped spend cap ──────────────────────────────────────
    // Image generation is the expensive part of a request (up to $0.134 on
    // gemini-3-pro-image, and "Generate Variations" fires four in parallel —
    // about $0.54 in one click) yet, until now, no image endpoint checked the
    // cap at all. This MUST run before the OpenAI/Gemini branches below —
    // both of which spend real money — so an over-cap tester is refused
    // BEFORE we pay for a render, not billed and then told no.
    //
    // Only assistant-scoped requests are checked: the same condition
    // logAssistantImageGen() (below) uses to decide whether to log a cost
    // row at all. A request with no test_user_id (the main app) has no
    // tester token to key a cap on, so it is intentionally left untouched —
    // see the "Out of scope" note in the fix's task description.
    const body = (req as { body?: Record<string, unknown> }).body ?? {};
    if (body.source === 'assistant' && body.test_user_id) {
      const cap = await checkSpendCap(body.test_user_id as string);
      if (!cap.allowed) {
        return res.status(429).json({ error: cap.reason, spent_today_usd: cap.spent_today_usd, cap_usd: cap.cap_usd });
      }
    }

    // Inject brand-mandatory style rules into the prompt
    const enrichedPrompt = enrichPromptWithBrandStyle(prompt, brand || '');

    // The image models RENDER any literal brand name they see (Imagen stamped garbled
    // "ROOSTERBET"/"ROOSTERN" on jerseys and arena boards, which the mirror-extend then
    // duplicated). Strip the brand name from the text the model sees — the brand look is
    // carried by colour/fire/style, not by writing the name. The rules already applied
    // their meaning above, so removing the word here doesn't change the look.
    const brandSafePrompt = (brand && brand.trim())
      ? enrichedPrompt.replace(new RegExp(brand.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'the brand')
      : enrichedPrompt;

    // gpt-image-2: short natural language quality signal — no "art/illustration" words (causes painting style).
    // "Hyperrealistic cinematic render" works for both CGI characters and photographic scenes.
    const CHATGPT_PREFIX = 'Hyperrealistic cinematic render, sharp photorealistic quality, dramatic professional lighting. ';

    // Hard constraint appended at the END — gpt-image-2 and Imagen both learned from
    // stock photos with corner watermarks, so they hallucinate garbled pseudo-logos
    // (e.g. "PILGCATHE") in the lower-right. Placed last because later tokens are
    // weighted as stronger constraints. Covers text, watermarks, logos, signatures.
    const NO_WATERMARKS =
      ' Absolutely no text, no letters, no numbers, no words, no typography of any kind. ' +
      'No watermarks, no logos, no brand marks, no signatures, no captions, no stamps, no overlays. ' +
      'All corners must be completely clean and empty — no marks in the bottom-right, bottom-left, top-right, or top-left. ' +
      'The final image must be fully unbranded and free of any written characters or symbols. ' +
      'Any clothing, jerseys, uniforms, signage or boards are plain and blank — no team names, no player names, no numbers, no lettering.';

    // ChatGPT-only wide-framing constraint for wide banners. gpt-image-2 tends to
    // compose a tight close-up that then gets cut by the banner crop; Gemini doesn't
    // need this. Placed near the end (gpt-image-2 weights later tokens stronger).
    // Only applied to wide banners (Gemini path never sees it).
    const WIDE_FRAMING = reqRatioForRes >= 1.7
      ? ' FRAMING: an ultra-wide, full-length establishing shot. The entire subject is visible head to toe, sized small-to-medium and centred within a large open environment. Leave a GENEROUS band of empty headroom above the very top of the head/comb/hat so the head sits well below the top edge, and clear floor/ground space below the feet, so the whole figure sits comfortably inside the frame with wide breathing room on every side and nothing touches any edge.'
      : '';
    const finalPrompt = CHATGPT_PREFIX + brandSafePrompt + WIDE_FRAMING + NO_WATERMARKS;

    // Gemini/Imagen responds to quality tags — avoid "illustration" (painting signal).
    const GEMINI_PREFIX = 'photorealistic, hyperrealistic, cinematic lighting, sharp focus, highly detailed, dramatic composition, rich deep colors, professional color grading, clean sharp render. ';
    const geminiPrompt = GEMINI_PREFIX + brandSafePrompt + NO_WATERMARKS;

    // ── Primary: OpenAI direct generation (ChatGPT provider) ────────────────
    // Uses gpt-image-2 via Vercel's OPENAI_API_KEY — no Cloud Run needed.
    const openaiKey = process.env.OPENAI_API_KEY;
    if (provider === 'chatgpt' && openaiKey) {
      console.log('[generate-image] Using OpenAI direct generation');

      // Ask gpt-image-2 for the banner's real shape. Prefer the ratio from
      // explicit pixel dimensions ("1200 × 600") since preset aspectRatio
      // strings are sometimes inaccurate.
      const requestedRatio = ratioFromString(bannerDimensions) ?? ratioFromString(aspectRatio) ?? 1.5;
      const outputSize = pickOpenAiImageSize(requestedRatio, genResolution);

      // Map resolution to quality. Banners bump genResolution to ≥2K (see needsCrop
      // above) → 'high' so gpt-image-2 renders the sharpest, least-distorted faces it
      // can (its faces degrade badly at low/medium). 1K quick previews stay 'low' (fast).
      const qualityMap: Record<string, 'low' | 'medium' | 'high'> = {
        '4K': 'high', '3K': 'high', '2K': 'high', '1K': 'low',
      };
      const outputQuality = qualityMap[genResolution] || 'high';

      console.log(`[generate-image] aspectRatio=${aspectRatio} bannerDimensions=${bannerDimensions || '-'} requestedRatio=${requestedRatio.toFixed(3)} → size=${outputSize}, resolution=${resolution} → quality=${outputQuality}`);

      const resp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_IMAGE_MODEL,
          prompt: finalPrompt,
          n: 1,
          size: outputSize,
          quality: outputQuality,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('[generate-image] OpenAI error:', resp.status, errText);
        return res.status(500).json({ error: `OpenAI failed (${resp.status}): ${errText}` });
      }

      const data = await resp.json() as {
        data?: Array<{ b64_json?: string; url?: string }>;
        // OpenAI reports token usage for image generation too — capture it so
        // the OpenAI branch can log an exact cost the same way Gemini does,
        // instead of relying on the legacy size/quality table (see the usage
        // comment at logAssistantImageGen for why that table can't be trusted
        // for the new banner sizes).
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const item = data.data?.[0];
      const imageUrl = item?.url
        ? item.url
        : item?.b64_json
          ? `data:image/png;base64,${item.b64_json}`
          : null;

      if (!imageUrl) {
        return res.status(500).json({ error: 'No image returned from OpenAI' });
      }

      // ── Save ChatGPT image to Google Drive ─────────────────────────────
      // This makes it persistent and visible in the Image Library across
      // any domain/deployment — not just in the current browser's localStorage.
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (folderId) {
        try {
          const accessToken = await getGoogleAccessToken();

          // Fetch or decode the image bytes
          let imageBuffer: Buffer;
          let imageMime = 'image/png';

          if (imageUrl.startsWith('data:')) {
            const [header, b64] = imageUrl.split(',');
            imageMime    = header.match(/data:([^;]+)/)?.[1] || 'image/png';
            imageBuffer  = Buffer.from(b64, 'base64');
          } else {
            const imgRes = await fetch(imageUrl);
            imageMime    = imgRes.headers.get('content-type')?.split(';')[0] || 'image/png';
            imageBuffer  = Buffer.from(await imgRes.arrayBuffer());
          }

          // Crop/resize to the exact requested size (e.g. 1200×600) before saving,
          // so the stored Drive image — and the in-app preview — match the request.
          const exact   = await resizeToExact(imageBuffer, bannerDimensions, aspectRatio);
          imageBuffer   = exact.buffer;
          imageMime     = exact.mime;

          const ext      = imageMime.split('/')[1] || 'png';
          const slug     = brandSlug(brand);
          const filename = `${slug ? slug + '-' : ''}chatgpt-${Date.now()}.${ext}`;

          const fileId = await uploadImageToDrive({
            imageBuffer,
            mimeType:    imageMime,
            filename,
            folderId,
            provider:    'chatgpt',
            aspectRatio: aspectRatio || '16:9',
            resolution:  resolution  || '1K',
            accessToken,
            brand,
          });

          // Make public so server-side fetches (edit, variations) work without auth
          await makeFilePublic(fileId, accessToken);

          // Prefer usage-based cost over the legacy size/quality table: Task 5's
          // real-shape sizes (e.g. "2048x1024") have no row in IMAGE_PRICING, so
          // the legacy lookup returns null for every OpenAI render now. Only pass
          // usage when OpenAI actually reported it — an absent usage object should
          // fall back to the legacy table, not log a bogus $0.
          await logAssistantImageGen(
            req, fileId, 'openai', OPENAI_IMAGE_MODEL, outputSize, outputQuality,
            data.usage
              ? {
                  text_input_tokens: data.usage.input_tokens ?? 0,
                  image_output_tokens: data.usage.output_tokens ?? 0,
                }
              : undefined,
          );

          // Return Drive URL so frontend stores Drive link (not temp OpenAI URL)
          const driveUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
          return res.status(200).json({
            fileId,
            public_url: driveUrl,
            imageUrl:   driveUrl,
            url:        driveUrl,
          });

        } catch (driveErr) {
          // Drive upload failed — fall back to returning the OpenAI URL
          console.error('[generate-image] Drive upload failed, returning OpenAI URL:', driveErr);
        }
      }

      // Fallback: no Drive folder configured or upload failed
      return res.status(200).json({ imageUrl, url: imageUrl });
    }

    // ── Gemini direct generation ────────────────────────────────────────
    // Runs whenever the caller selected a model on the gemini-api transport.
    // Both dropdown models (gemini-2.5-flash-image and gemini-3-pro-image)
    // now use 'gemini-api' — the current model used to stay on 'vertex' and
    // fall through to the Cloud Run path below, but that Cloud Run service
    // calls a retired Imagen model and 404s, so it was switched to this same
    // Developer API path (verified working live, ~9s/$0.039 per image).
    const geminiSpec = resolveGeminiModel(geminiModel);
    if (provider === 'gemini' && geminiSpec.transport === 'gemini-api') {
      console.log(`[generate-image] Using Gemini direct generation: ${geminiSpec.id}`);

      // Check the Drive folder BEFORE calling the (paid) Gemini API below —
      // this used to run after generateGeminiImage(), so a missing env var
      // threw away an image the user had already been billed up to $0.24 for.
      // Fail fast, at no cost, same as the OpenAI branch above.
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (!folderId) {
        return res.status(500).json({ error: 'GOOGLE_DRIVE_FOLDER_ID is not configured' });
      }

      const { generateGeminiImage } = await import('./_gemini-image.js');
      const reqRatio = ratioFromString(bannerDimensions) ?? ratioFromString(aspectRatio) ?? 1;

      // Whitelist the tier instead of casting: `as '1K'|'2K'|'4K'` would let an
      // unrecognised `resolution` string pass straight through as `genResolution`
      // (when needsCrop is false) and reach the Gemini API as an invalid
      // imageSize. Map anything unrecognised to '1K' instead of lying to the
      // type system.
      const GEMINI_IMAGE_SIZES = ['1K', '2K', '4K'] as const;
      type GeminiImageSize = typeof GEMINI_IMAGE_SIZES[number];
      const requestedGeminiSize: string = genResolution === '3K' ? '2K' : genResolution;
      const geminiImageSize: GeminiImageSize = (GEMINI_IMAGE_SIZES as readonly string[]).includes(requestedGeminiSize)
        ? (requestedGeminiSize as GeminiImageSize)
        : '1K';

      const gen = await generateGeminiImage({
        modelId: geminiSpec.id,
        prompt: geminiPrompt,
        // Pass the raw requested ratio — the helper snaps it to a supported one.
        aspectRatio: bannerDimensions || aspectRatio || '1:1',
        imageSize: geminiImageSize,
      });

      // Log the ACTUAL returned dimensions (not just byte length/token count) —
      // the spec's mitigation for risk #3 (imageSize: "2K" observed returning
      // 3168px wide) depends on this being visible in the logs. A metadata read
      // failure must never break the render, so this is wrapped and non-fatal.
      let returnedDims = '';
      try {
        const sharp = (await import('sharp')).default;
        const meta = await sharp(gen.bytes).metadata();
        returnedDims = ` ${meta.width}x${meta.height}`;
      } catch (metaErr) {
        console.error('[generate-image] could not read returned image dimensions (non-fatal):', metaErr);
      }

      console.log(`[generate-image] ${geminiSpec.id} returned ${gen.bytes.length} bytes ${gen.mime}${returnedDims}, ` +
        `${gen.usage.image_output_tokens} image tokens (requested ratio ${reqRatio.toFixed(3)})`);

      const exact  = await resizeToExact(gen.bytes, bannerDimensions, aspectRatio);
      const imgBuf = exact.buffer;
      const imgMime = exact.resized ? exact.mime : gen.mime;
      const ext    = imgMime.split('/')[1] || 'jpeg';
      const gSlug  = brandSlug(brand);

      // generateGeminiImage() above already spent real money — Gemini bills per
      // output token whether or not the image ever reaches the user — so from
      // here on a Drive failure must NOT throw the image away and 500. We try to
      // save it, but on failure we still hand back the image itself as a data
      // URL: unpersisted-but-delivered beats losing an already-paid-for image.
      // `driveSaveFailed: true` tells the caller it never reached the shared
      // Image Library (won't show up on other devices; localStorage is the only copy).
      try {
        const accessToken = await getGoogleAccessToken();
        const fileId = await uploadImageToDrive({
          imageBuffer: imgBuf,
          mimeType:    imgMime,
          filename:    `${gSlug ? gSlug + '-' : ''}gemini-${Date.now()}.${ext}`,
          folderId,
          provider:    'gemini',
          aspectRatio: aspectRatio || '16:9',
          resolution:  resolution  || '1K',
          accessToken,
          brand,
        });
        await makeFilePublic(fileId, accessToken);
        await logAssistantImageGen(
          req, fileId, 'gemini', geminiSpec.id, aspectRatio || '1:1', null, gen.usage,
        );

        const driveUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
        return res.status(200).json({
          fileId,
          public_url: driveUrl,
          imageUrl:   driveUrl,
          url:        driveUrl,
          model:      geminiSpec.id,
          usage:      gen.usage,
        });
      } catch (driveErr) {
        console.error(
          '[generate-image] Gemini Drive save failed — image was already generated ' +
          '(and paid for); returning the same exact-size image that would have been ' +
          'persisted, just unpersisted, as a data URL instead:',
          driveErr,
        );
        // Still log the cost even though there's no Drive fileId — this is a
        // paid render (Gemini already billed us above) and must not vanish
        // from the cost record just because the degraded path has nothing to
        // put in drive_file_id. Wrapped so a logging failure can never break
        // this already-degraded response.
        try {
          await logAssistantImageGen(
            req, 'drive-save-failed', 'gemini', geminiSpec.id, aspectRatio || '1:1', null, gen.usage,
          );
        } catch (logErr) {
          console.error('[generate-image] cost logging on Drive-failure path failed (non-fatal):', logErr);
        }
        // Use imgBuf/imgMime (the resizeToExact output), NOT gen.bytes/gen.mime (the
        // raw pre-resize bytes) — the success path above returns a Drive URL pointing
        // at the RESIZED image, so this degraded path must deliver the same pixels the
        // success path would have. Falling back to the raw bytes would hand the user
        // e.g. 3168x1344 when they asked for a 1200x600 banner: a worse match to what
        // they requested, on a path that is already a consolation prize.
        // resizeToExact() never throws (its own internal try/catch returns the
        // original buffer on failure), so imgBuf/imgMime are always populated here.
        const dataUrl = `data:${imgMime};base64,${imgBuf.toString('base64')}`;
        return res.status(200).json({
          imageUrl:        dataUrl,
          url:             dataUrl,
          public_url:      dataUrl,
          driveSaveFailed: true,
          model:           geminiSpec.id,
          usage:           gen.usage,
        });
      }
    }

    // ── Fallback: Cloud Run backend ─────────────────────────────────────────
    // Currently unreachable for any dropdown Gemini model: both now resolve
    // to transport 'gemini-api' and return from the branch above before
    // reaching this point. Left intact as the documented fallback path —
    // do not remove.
    if (backend === 'cloud-run') {
      const cloudRunUrl =
        process.env.GCP_CLOUD_RUN_URL ||
        process.env.CLOUD_RUN_URL ||
        process.env.NEXT_PUBLIC_IMAGE_API_URL;

      if (!cloudRunUrl) {
        return res.status(500).json({ error: 'GCP_CLOUD_RUN_URL is not configured' });
      }

      const idToken = await getCloudRunIdToken(cloudRunUrl, req);

      // Imagen only generates a fixed set of aspect ratios. Sending an
      // unsupported one (e.g. "2:1") makes it fall back to a near-square, which
      // then gets heavily cropped (cutting the subject). Snap to the closest
      // ratio Imagen supports natively so the generation is nearly the right
      // shape and resizeToExact only trims a little.
      const reqRatio = ratioFromString(bannerDimensions) ?? ratioFromString(aspectRatio) ?? 1;
      // Outpaint base is square; otherwise snap to the closest Imagen-native ratio.
      const nativeRatio = nearestImagenRatio(reqRatio);

      console.log('Sending to Cloud Run:', { provider, aspectRatio, bannerDimensions, reqRatio, nativeRatio, resolution });

      // Retry helper — tries the Cloud Run call up to `maxAttempts` times.
      // Retries on network timeout or 5xx server errors. Gives up on 4xx (bad request).
      const TIMEOUT_MS   = 120_000; // 2 minutes — image generation can be slow
      const MAX_ATTEMPTS = 2;

      let lastError: string = 'Unknown error';

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        // AbortController lets us cancel the fetch if it takes too long
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
          const response = await fetch(`${cloudRunUrl}/generate-image`, {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              prompt: geminiPrompt,
              provider,
              aspectRatio: nativeRatio,   // closest Imagen-native ratio (minimises crop)
              resolution:  genResolution, // bumped for exact-size so the downscale stays sharp
            }),
            signal: controller.signal,
          });

          clearTimeout(timer);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Cloud Run error (attempt ${attempt}):`, response.status, errorText);

            // 4xx = bad request — retrying won't help, fail immediately
            if (response.status >= 400 && response.status < 500) {
              return res.status(500).json({
                error: `Cloud Run failed (${response.status}): ${errorText || 'No details returned'}`
              });
            }

            // 5xx = server error — record it and retry
            lastError = `Cloud Run failed (${response.status}): ${errorText || 'No details returned'}`;
            continue;
          }

          const data = await response.json();
          console.log('Cloud Run response:', JSON.stringify(data));
          const result = Array.isArray(data) ? data[0] : data;

          // ── Save Gemini image to our Drive folder ───────────────────────
          // Cloud Run may save to its own folder. We re-save to our designated
          // folder so the Image Library can list ALL images from one place.
          const geminiFolder = process.env.GOOGLE_DRIVE_FOLDER_ID;
          if (geminiFolder) {
            try {
              // Get the image URL from Cloud Run response
              const cloudRunImageUrl =
                result.public_url || result.imageUrl || result.image_url ||
                result.url || result.displayUrl ||
                (result.fileId ? `https://lh3.googleusercontent.com/d/${result.fileId}` : null);

              if (cloudRunImageUrl && !cloudRunImageUrl.startsWith('data:')) {
                const geminiAccessToken = await getGoogleAccessToken();
                const imgRes  = await fetch(cloudRunImageUrl);
                const rawMime = imgRes.headers.get('content-type')?.split(';')[0] || 'image/png';
                const rawBuf  = Buffer.from(await imgRes.arrayBuffer());

                // Crop/resize to the exact requested size before saving, so the
                // stored Drive image and preview match the request (e.g. 1200×600).
                const exact   = await resizeToExact(rawBuf, bannerDimensions, aspectRatio);
                const imgBuf  = exact.buffer;
                const imgMime = exact.resized ? exact.mime : rawMime;
                const ext     = imgMime.split('/')[1] || 'png';
                const gSlug   = brandSlug(brand);

                const geminiFileId = await uploadImageToDrive({
                  imageBuffer: imgBuf,
                  mimeType:    imgMime,
                  filename:    `${gSlug ? gSlug + '-' : ''}gemini-${Date.now()}.${ext}`,
                  folderId:    geminiFolder,
                  provider:    'gemini',
                  aspectRatio: aspectRatio || '16:9',
                  resolution:  resolution  || '1K',
                  accessToken: geminiAccessToken,
                  brand,
                });

                // Make public so server-side fetches (edit, variations) work without auth
                await makeFilePublic(geminiFileId, geminiAccessToken);

                // Was the literal string 'imagen', which made Gemini image spend impossible
                // to attribute to a model in the Cost Tracker.
                await logAssistantImageGen(req, geminiFileId, 'gemini', geminiSpec.id, aspectRatio || '1:1', null);

                const driveUrl = `https://lh3.googleusercontent.com/d/${geminiFileId}`;
                // Return Drive URL so Image Library always gets a persistent link
                return res.status(200).json({
                  ...result,
                  fileId:     geminiFileId,
                  public_url: driveUrl,
                  imageUrl:   driveUrl,
                  url:        driveUrl,
                });
              }
            } catch (driveErr) {
              console.error('[generate-image] Gemini Drive save failed:', driveErr);
              // Fall through and return original Cloud Run result
            }
          }

          return res.status(200).json(result);

        } catch (fetchError: unknown) {
          clearTimeout(timer);

          // AbortError = our timeout fired — the request took too long
          const isTimeout =
            fetchError instanceof Error && fetchError.name === 'AbortError';

          if (isTimeout) {
            console.error(`Cloud Run timed out after ${TIMEOUT_MS / 1000}s (attempt ${attempt})`);
            lastError = `Cloud Run did not respond within ${TIMEOUT_MS / 1000} seconds`;
          } else {
            console.error(`Cloud Run network error (attempt ${attempt}):`, fetchError);
            lastError = fetchError instanceof Error ? fetchError.message : 'Network error';
          }

          // If this was the last attempt, fall through to the error response below
        }
      }

      // All attempts exhausted
      return res.status(500).json({ error: lastError });
    }

    // Cloud Run is the only supported backend
    return res.status(400).json({
      error: 'Only cloud-run backend is supported. Set backend: "cloud-run" in the request.',
    });

  } catch (error) {
    console.error('Image generation error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
