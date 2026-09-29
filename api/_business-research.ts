/**
 * _business-research.ts — "Auto-fill from website" for Custom business mode.
 *
 * Paste a business's website → we do the reverse research a person would:
 *   1. READ THE SITE ourselves (browser-like request): name, description,
 *      logo, and the real brand colours from its stylesheets (e.g. Dr Demajo:
 *      gold #C88D36 on forest #162A26 — found in their theme CSS).
 *   2. ASK GEMINI (with Google Search) to turn the page text + web results
 *      into a business profile: industry, what to promote, end-card line,
 *      selling points, and 3 UGC video formats written for THIS business.
 *
 * Everything returned is a suggestion — the user reviews it and clicks Save.
 * Underscore file = helper, not its own Vercel route.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const INDUSTRY_IDS = ['dental', 'medical', 'aesthetics', 'gym', 'restaurant', 'real-estate', 'salon', 'physio', 'other'] as const;
const RESEARCH_MODEL = 'gemini-3.5-flash';

export interface ResearchPreset {
  id: string; label: string; emoji: string; creator: string; setting: string; action: string; camera: string;
  line: string; endCard: string;
}

export interface BusinessResearch {
  business: {
    name: string; industry: string; promote: string; color: string; accent: string; tagline: string;
    logo: string; website: string;
  };
  presets: ResearchPreset[];
  research: {
    full_name: string; summary: string; location: string; services: string[]; selling_points: string[];
    tone: string; audience: string; social: string; compliance: string; sources: string[];
  };
  found: { logo_from: string | null; colours: string[]; site_read: boolean };
}

// ── 1. Read the site ──────────────────────────────────────────────────────

export function normaliseUrl(raw: string): URL {
  let s = String(raw || '').trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) websites');
  // Never let the server be pointed at private/internal addresses.
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1)/i.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname) || !u.hostname.includes('.')) {
    throw new Error('That address is not a public website');
  }
  return u;
}

async function get(url: string, accept: string, maxBytes: number): Promise<{ ok: boolean; type: string; body: Buffer; finalUrl: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en' }, redirect: 'follow', signal: ctrl.signal });
    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: r.ok, type: r.headers.get('content-type') || '', body: buf.subarray(0, maxBytes), finalUrl: r.url || url };
  } catch {
    return { ok: false, type: '', body: Buffer.alloc(0), finalUrl: url };
  } finally { clearTimeout(t); }
}

const attr = (tag: string, name: string) => (tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i')) || [])[1] || '';
const meta = (html: string, key: string) => {
  const tag = (html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, 'i')) || [])[0] || '';
  return attr(tag, 'content');
};
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#8211;|&ndash;/g, '–').replace(/&#8217;/g, '’');

/** Visible text of a page (scripts/styles/tags removed), trimmed. */
export function pageText(html: string, max = 9000): string {
  return decode(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Hex → HSL-ish numbers for filtering. */
function hsl(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/**
 * Brand colours from CSS: count every colour, drop whites/blacks/greys and
 * WordPress/Bootstrap defaults, then pick
 *   accent = most-used vivid colour, main = most-used dark colour (for the end card).
 */
export function pickColours(css: string): { main: string | null; accent: string | null; ranked: string[] } {
  const counts = new Map<string, number>();
  const add = (hex: string) => { const h = hex.toLowerCase(); counts.set(h, (counts.get(h) || 0) + 1); };
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const v = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
    add(`#${v}`);
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi)) {
    add('#' + [m[1], m[2], m[3]].map(x => Math.min(255, +x).toString(16).padStart(2, '0')).join(''));
  }
  // Framework defaults that say nothing about the brand.
  const DEFAULTS = new Set(['#0693e3', '#00d084', '#ff6900', '#fcb900', '#fdd79a', '#cf2e2e', '#9b51e0', '#8ed1fc', '#7bdcb5', '#f78da7', '#abb8c3', '#0d6efd', '#6610f2', '#6f42c1', '#d63384', '#dc3545', '#fd7e14', '#ffc107', '#198754', '#20c997', '#0dcaf0', '#6c757d', '#212529', '#f8f9fa', '#32373c', '#313131']);
  const ranked = [...counts.entries()].filter(([h]) => !DEFAULTS.has(h)).sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const vivid = ranked.find(h => { const c = hsl(h); return c.s > 0.35 && c.l > 0.25 && c.l < 0.8; }) || null;
  const dark = ranked.find(h => { const c = hsl(h); return c.l < 0.22 && c.l > 0.03 && c.s > 0.08; })
    || ranked.find(h => { const c = hsl(h); return c.s > 0.3 && c.l < 0.45 && h !== vivid; }) || null;
  return { main: dark, accent: vivid, ranked: ranked.slice(0, 8) };
}

/** Candidate logo URLs, best first. */
export function logoCandidates(html: string, base: string): string[] {
  const abs = (u: string) => { try { return new URL(decode(u), base).href; } catch { return ''; } };
  const out: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = attr(tag, 'src') || attr(tag, 'data-src');
    if (src && /logo/i.test(`${src} ${attr(tag, 'class')} ${attr(tag, 'alt')} ${attr(tag, 'id')}`)) out.push(abs(src));
  }
  // Inside a header/navbar: first image there is usually the logo.
  const header = (html.match(/<header[\s\S]*?<\/header>/i) || [])[0] || '';
  const firstImg = (header.match(/<img\b[^>]*>/i) || [])[0];
  if (firstImg) out.push(abs(attr(firstImg, 'src')));
  const apple = (html.match(/<link[^>]+rel=["']apple-touch-icon[^>]*>/i) || [])[0];
  if (apple) out.push(abs(attr(apple, 'href')));
  return [...new Set(out.filter(Boolean))];
}

async function logoDataUrl(candidates: string[]): Promise<{ dataUrl: string; from: string } | null> {
  const sharp = (await import('sharp')).default;
  for (const url of candidates.slice(0, 5)) {
    const r = await get(url, 'image/*', 3_000_000);
    if (!r.ok || r.body.length < 100) continue;
    const isSvg = /svg/.test(r.type) || /\.svg(\?|$)/i.test(url) || r.body.subarray(0, 300).toString().includes('<svg');
    try {
      if (isSvg && r.body.length < 900_000) {
        await sharp(r.body).metadata(); // valid?
        return { dataUrl: `data:image/svg+xml;base64,${r.body.toString('base64')}`, from: url };
      }
      const png = await sharp(r.body).resize({ width: 800, height: 400, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      if (png.length < 1_000_000) return { dataUrl: `data:image/png;base64,${png.toString('base64')}`, from: url };
    } catch { /* not an image — next */ }
  }
  return null;
}

// ── 2. Ask Gemini (with Google Search) ────────────────────────────────────

function extractJson(text: string): Record<string, unknown> {
  const t = text.replace(/```json|```/g, '');
  const start = t.indexOf('{'); const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON in research answer');
  return JSON.parse(t.slice(start, end + 1));
}

async function askGemini(site: { url: string; title: string; description: string; text: string }): Promise<{ data: Record<string, unknown>; sources: string[] }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  const prompt = `You are a social media ad strategist doing reverse research on a business so an AI tool can make 5–10 second vertical UGC-style videos (TikTok / Reels) for it.

Business website: ${site.url}
Page title: ${site.title}
Meta description: ${site.description}
Text from the website (may be partial):
"""${site.text}"""

Also use Google Search to confirm facts (location, services, reviews, social media accounts) and to see which short-video formats work for this kind of business.

Return ONLY valid JSON (no markdown) with exactly these keys:
{
  "name": "short display name for an end card, max 30 chars (e.g. 'Dr Demajo')",
  "full_name": "full official business name",
  "industry": one of ${JSON.stringify(INDUSTRY_IDS)},
  "summary": "2 sentences: what they are and what makes them different",
  "location": "city/country, or '' if unknown",
  "services": ["up to 8 services"],
  "selling_points": ["up to 5 things they emphasise"],
  "tone": "their tone of voice in a few words",
  "audience": "who they are trying to reach",
  "social": "what you found about their TikTok/Instagram/Facebook presence, or 'not found'",
  "promote": "one line: the best thing to promote in a first ad, based on their own site (no invented prices or offers)",
  "tagline": "end-card call to action, max 55 chars, may include their domain (e.g. 'Book your consultation · example.com')",
  "compliance": "one line of ad-rule cautions for this industry (e.g. healthcare: no guaranteed results, AI actors are not real patients)",
  "presets": [ exactly 3 video formats written for THIS business, each:
    {"label": "2-4 words", "emoji": "one emoji", "creator": "who is on camera (no real names)", "setting": "where", "action": "what happens in 5-10 s, one clear beat", "camera": "phone-shot style", "line": "natural spoken line, under 12 words", "endCard": "end-card line, max 45 chars"} ]
}
Rules: no real person names in presets; no readable text inside the scene; no gore, needles or graphic procedures; no claims like "pain-free" or guaranteed results; keep it realistic and phone-shot.`;

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${RESEARCH_MODEL}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 4000, temperature: 0.4 },
    }),
  });
  if (!r.ok) throw new Error(`Research AI failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const j = await r.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } }>;
  };
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts || []).map(p => p.text || '').join('');
  const sources = (cand?.groundingMetadata?.groundingChunks || []).map(c => c.web?.title || c.web?.uri || '').filter(Boolean).slice(0, 8);
  return { data: extractJson(text), sources };
}

// ── Put it together ───────────────────────────────────────────────────────

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map(x => str(x, 120)).filter(Boolean).slice(0, n) : []);

export async function researchBusiness(rawUrl: string): Promise<BusinessResearch> {
  const url = normaliseUrl(rawUrl);
  const home = await get(url.href, 'text/html,application/xhtml+xml', 2_000_000);
  const html = home.ok ? home.body.toString('utf8') : '';
  const base = home.finalUrl || url.href;

  // A couple of inner pages (services/about/treatments) for more real text.
  let extraText = '';
  if (html) {
    const links = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)].map(m => { try { return new URL(decode(m[1]), base); } catch { return null; } })
      .filter((u): u is URL => !!u && u.hostname === new URL(base).hostname && /(service|treatment|about|price|menu|what-we-do)/i.test(u.pathname));
    const pages = [...new Set(links.map(u => u.href))].slice(0, 2);
    const texts = await Promise.all(pages.map(async p => { const r = await get(p, 'text/html', 1_000_000); return r.ok ? pageText(r.body.toString('utf8'), 3000) : ''; }));
    extraText = texts.filter(Boolean).join('\n---\n');
  }

  // Brand colours from the site's own stylesheets (same-site CSS first).
  let css = (html.match(/<style[\s\S]*?<\/style>/gi) || []).join('\n');
  if (html) {
    const sheets = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)].map(m => attr(m[0], 'href'))
      .map(h => { try { return new URL(decode(h), base); } catch { return null; } })
      .filter((u): u is URL => !!u)
      .sort((a, b) => Number(b.hostname === new URL(base).hostname) - Number(a.hostname === new URL(base).hostname))
      .filter(u => !/wp-includes|bootstrap|font-awesome|fonts\.googleapis/i.test(u.href))
      .slice(0, 4);
    const bodies = await Promise.all(sheets.map(async s => { const r = await get(s.href, 'text/css', 800_000); return r.ok ? r.body.toString('utf8') : ''; }));
    css += '\n' + bodies.join('\n');
  }
  const themeColour = meta(html, 'theme-color');
  const colours = pickColours(css);

  const title = decode((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '').trim();
  const description = decode(meta(html, 'description') || meta(html, 'og:description'));
  const [logo, ai] = await Promise.all([
    html ? logoDataUrl(logoCandidates(html, base)) : Promise.resolve(null),
    askGemini({ url: base, title, description, text: `${pageText(html)}\n---\n${extraText}`.slice(0, 14000) }),
  ]);

  const d = ai.data;
  const industry = (INDUSTRY_IDS as readonly string[]).includes(String(d.industry)) ? String(d.industry) : 'other';
  const presets: ResearchPreset[] = (Array.isArray(d.presets) ? d.presets : []).slice(0, 3).map((p: Record<string, unknown>, i: number) => ({
    id: `biz-${i}-${str(p.label, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label: str(p.label, 40) || `Format ${i + 1}`, emoji: str(p.emoji, 8) || '🎬',
    creator: str(p.creator, 200), setting: str(p.setting, 200), action: str(p.action, 300), camera: str(p.camera, 150),
    line: str(p.line, 90), endCard: str(p.endCard, 60),
  })).filter(p => p.creator && p.action);

  const hex = (v: string | null) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);
  return {
    business: {
      name: str(d.name, 30) || title.split(/[|–-]/)[0].trim().slice(0, 30),
      industry,
      promote: str(d.promote, 300),
      color: hex(colours.main) || hex(themeColour) || '#0f4c81',
      accent: hex(colours.accent) || '#38bdf8',
      tagline: str(d.tagline, 80),
      logo: logo?.dataUrl || '',
      website: base,
    },
    presets,
    research: {
      full_name: str(d.full_name, 120), summary: str(d.summary, 500), location: str(d.location, 120),
      services: list(d.services, 8), selling_points: list(d.selling_points, 5), tone: str(d.tone, 100),
      audience: str(d.audience, 160), social: str(d.social, 300), compliance: str(d.compliance, 300), sources: ai.sources,
    },
    found: { logo_from: logo?.from || null, colours: colours.ranked, site_read: !!html },
  };
}
