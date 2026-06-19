# Banner & Email HTML Format — Transfer Spec

Everything needed to reproduce the promotional **banner HTML** and **email campaign HTML** in another project. Two independent builders share one brand-styling source of truth.

| Builder | File | Output |
|---|---|---|
| Promotional banner | `src/lib/build-banner-html.ts` | Self-contained standalone HTML page — AI image as full-bleed background, gradient overlay, offer headline + CTA |
| Email campaign | `src/lib/build-email-html.ts` | Table-based inline-CSS email (Gmail/Outlook/Apple Mail safe) — header → body → hero → wordmark → social → footer |
| Brand styling | `src/lib/brand-standards.ts` | `BrandStyle` per brand (fonts + colors). Consumed by **both** builders via `getBrandStyle(brand)` |
| Brand color rules (image gen) | `src/lib/brand-colors.ts` | Text palette enforcement injected into GPT image prompts |
| Per-brand email config | Supabase table `brand_email_config` | Static logo/banner/header/wordmark/footer URLs, loaded at modal open |

---

## 1. Brands (9 total)

Roosterbet · FortunePlay · SpinJo · LuckyVibe · SpinsUp · PlayMojo · Lucky7even · NovaDreams · Rollero

### Brand design & color coding (`BRAND_STANDARDS`)

Each brand maps to a `BrandStyle`:

```ts
export interface BrandStyle {
  fontFamily: string;     // CSS font-family stack (web-safe fallbacks)
  googleFont: string;     // Google Fonts import token, e.g. "Oswald:wght@600;700"
  panelBg: string;        // dark end of gradient overlay / email header panel
  headlineColor: string;  // main headline text
  bodyColor: string;      // sub-text + descriptor
  accentColor: string;    // highlight (bonus line, brand label, social links)
  buttonBg: string;       // CTA background
  buttonText: string;     // CTA label color
  buttonShadow: string;   // CTA glow (rgba)
}
```

| Brand | Theme | Font (googleFont) | panelBg | headline | body | accent | buttonBg | buttonText | buttonShadow |
|---|---|---|---|---|---|---|---|---|---|
| **Roosterbet** | Red/dark aggressive — rooster | Oswald 600;700 | `#140000` | `#FFFFFF` | `#FFCCCC` | `#FF3333` | `#CC0000` | `#FFFFFF` | `rgba(204,0,0,0.6)` |
| **FortunePlay** | Gold/black premium — lion | Cinzel 700;900 | `#0F0800` | `#FFFFFF` | `#FFF8E1` | `#FFD700` | `#E67E00` | `#FFFFFF` | `rgba(230,126,0,0.6)` |
| **SpinJo** | Navy/cyan space — astronaut | Orbitron 700;900 | `#000D1A` | `#FFFFFF` | `#B3D9FF` | `#00B4D8` | `#0077B6` | `#FFFFFF` | `rgba(0,119,182,0.65)` |
| **LuckyVibe** | Navy/blue tropical fresh | Poppins 600;800 | `#001A33` | `#FFFFFF` | `#D0EEFF` | `#29B6F6` | `#1565C0` | `#FFFFFF` | `rgba(21,101,192,0.6)` |
| **SpinsUp** | Dark/neon magical | Fredoka One | `#08001C` | `#FFFFFF` | `#F3E5F5` | `#FF00FF` | `#1565C0` | `#FFFFFF` | `rgba(21,101,192,0.65)` |
| **PlayMojo** | Navy/teal clean modern — bunny | Montserrat 700;900 | `#020D16` | `#FFFFFF` | `#B2EBF2` | `#00BCD4` | `#00838F` | `#FFFFFF` | `rgba(0,131,143,0.6)` |
| **Lucky7even** | Purple/gold cosmic neon | Playfair Display 700;900 | `#08001A` | `#FFFFFF` | `#E1BEE7` | `#CE93D8` | `#6A1B9A` | `#FFFFFF` | `rgba(106,27,154,0.65)` |
| **NovaDreams** | Cosmic blue/white explorer | Space Grotesk 600;700 | `#00030F` | `#00E5FF` | `#E3F2FD` | `#40C4FF` | `#1565C0` | `#FFFFFF` | `rgba(21,101,192,0.65)` |
| **Rollero** | Charcoal/gold Roman warrior | Barlow Condensed 700;800 | `#080600` | `#FFFFFF` | `#F5DEB3` | `#D4A017` | `#B8860B` | `#FFFFFF` | `rgba(184,134,11,0.6)` |

**Fallback (`DEFAULT_BRAND_STYLE`)** — unknown/no brand:
Montserrat 700;900 · panelBg `#0D0D0D` · headline `#FFFFFF` · body `#E0E0E0` · accent `#7C4DFF` · buttonBg `#7C4DFF` · buttonText `#FFFFFF` · shadow `rgba(124,77,255,0.5)`.

```ts
export function getBrandStyle(brand?: string | null): BrandStyle {
  if (brand && BRAND_STANDARDS[brand]) return BRAND_STANDARDS[brand];
  return DEFAULT_BRAND_STYLE;
}
```

### Brand color rules for image generation (`brand-colors.ts`)

Separate from CSS styling — these are **plain-text palette instructions** injected into the GPT image prompt so the AI image itself stays on-brand. Known brand → strict approved/forbidden palette; unknown brand → "preserve reference prompt colors."

| Brand | Approved palette / forbidden |
|---|---|
| Roosterbet | Red, crimson, fiery orange, black, bold white. NEVER pastel, soft pink, blue, muted. |
| FortunePlay | Yellow, orange, gold, warm amber, warm casino lighting. NEVER blue, purple, cyan, neon, cold. |
| SpinJo | Deep navy blue, electric cyan, white, space black. NEVER gold, amber, orange, purple, earthy. |
| LuckyVibe | Golden-hour warm, sunset orange, tropical coral, soft amber. NEVER cold blue, purple, neon. |
| SpinsUp | Neon purple, electric magenta, showman gold, deep black. NEVER muted earthy or pastels. |
| PlayMojo | Dark navy black, teal, cyan, cool blue, clean white. NEVER warm gold, red, orange, cheerful bright. |
| Lucky7even | Deep purple, electric violet, metallic gold, black. NEVER flat grey, earthy, muted. |
| NovaDreams | Cosmic blue, electric cyan, white, deep navy black. NEVER warm orange, red, gold, earthy. |
| Rollero | Dark charcoal, aged gold, warm wheat, black, sharp white. NEVER pastel, neon, cold blue, soft. |

> Note: the image-gen color rule for **LuckyVibe** describes a warm sunset palette, while its CSS `BrandStyle` is navy/blue. They serve different layers (AI image vs HTML overlay) — keep both as-is when transferring.

```ts
getBrandColorRule(brand) // → "BRAND COLOR ENFORCEMENT: ... Approved color palette: ... MUST comply ..."
```

---

## 2. Promotional Banner HTML (`build-banner-html.ts`)

Standalone HTML page. The AI image is a full-bleed `object-fit:cover` background; a brand-colored gradient fades in from the text side; offer copy + CTA sit on top.

### Inputs

```ts
buildBannerHtml({
  imageSrc,                       // data URI or URL
  brand,                          // optional → picks BrandStyle
  formData: BannerFormData,
  offerType: 'freespins' | 'bonus' | 'nodeposit' | 'freebet',
  textPosition: 'left' | 'right',
  imgWidth, imgHeight,            // natural image dims → banner matches them
})

interface BannerFormData {
  mainValue: string;   // headline value (e.g. "20", "400", "$5")
  subValue: string;    // bonus "up to" value (bonus type only)
  crossSell: string;   // optional cross-sell line
  bonusCode: string;   // optional "Use code: XXX"
  ctaUrl: string;
  ctaText: string;     // defaults to "Play Now"
}
```

### Offer types (`OFFER_CONFIG`)

| offerType | typeLabel | descriptor | headline shown | showSubValue |
|---|---|---|---|---|
| `freespins` | "Free Spins" | "No Deposit Bonus" | `mainValue` | no |
| `bonus` | "Bonus" | "Up to {subValue}" / "Welcome Bonus" | `{mainValue}%` | yes |
| `nodeposit` | "No Deposit" | "Bonus" | `mainValue` | no |
| `freebet` | "Free Bet" | "No Deposit Required" | `mainValue` | no |

### Shape-adaptive layout

Detected from `imgHeight / imgWidth`:
- **Tall** (ratio > 1, portrait/story): gradient fades top→bottom; text panel 90% width, anchored bottom-center.
- **Leaderboard** (ratio < 0.2, ultra-wide strip): horizontal text row, 60% width, small fonts.
- **Standard** (everything else): gradient fades to the `textPosition` side; text panel 46% width.

Gradient is built from `panelBg` at 3 alpha stops via `hexToRgba`: `dark40` (0.40), `dark70` (0.70), `dark95` (0.95). `textPosition` controls gradient direction (`to left`/`to right`) and `justify-content`.

### Structure & key CSS

```html
<div class="banner">                  <!-- max-width:imgWidth; aspect-ratio:imgWidth/imgHeight; border-radius:10px -->
  <img class="banner__bg" />          <!-- inset:0; object-fit:cover; z-index:0 -->
  <div class="banner__gradient"></div><!-- inset:0; background:<gradientCss>; z-index:1 -->
  <div class="banner__content">       <!-- flex; alignment per shape; z-index:2 -->
    <div class="banner__text">
      <p  class="banner__brand">      <!-- 10px 700 accentColor, letter-spacing .28em, uppercase -->
      <span class="banner__number">   <!-- clamp(56px,8.5vw,96px) 900 headlineColor -->
      <span class="banner__type">     <!-- typeLabel, uppercase 800 headlineColor -->
      <p  class="banner__descriptor"> <!-- 11px 600 bodyColor, .22em, uppercase, opacity .8 -->
      <p  class="banner__crosssell">  <!-- accentColor 700 -->
      <a  class="banner__cta">        <!-- buttonBg/buttonText, uppercase .14em, box-shadow buttonShadow -->
      <p  class="banner__code">       <!-- "Use code: XXX", bodyColor opacity .45 -->
    </div>
  </div>
</div>
```

- Fonts loaded via `<link href="https://fonts.googleapis.com/css2?family=${googleFont}&display=swap">`.
- Mobile (`max-width:600px`): text panel goes 100% width with a `dark70` solid backing.
- Page `body` background `#0d0d0d`, centers the banner.

---

## 3. Email Campaign HTML (`build-email-html.ts`)

Table-based layout with inline CSS for maximum email-client compatibility (Gmail, Outlook, Apple Mail, Yahoo). Container width **600px**, rounded bottom corners, white body. Atlassian-style neutral ink for body copy; brand color appears only as restrained cues (accent tick, link color, footer rule, header panel).

### Inputs

```ts
buildEmailHtml({
  imageSrc, brand, imgWidth, imgHeight,
  formData: EmailFormData,
  variant?: 'image-hero' | 'brand-only',   // default 'image-hero'
  staticConfig?: StaticBrandConfig,          // from Supabase brand_email_config
})

interface EmailFormData {
  headline: string;
  introText: string;        // may contain {link} placeholder
  linkText: string; linkUrl: string;
  bodyText: string;
  secondaryLogoUrl: string; // header logo (fallback path)
  brandWordmark: string;
  facebookUrl: string; twitterUrl: string; instagramUrl: string; websiteUrl: string;
  footerAttribution: string;
  unsubscribeUrl: string;
}
// EMPTY_EMAIL_FORM exports an all-blank instance.
```

### Template variants

- **`image-hero`** (default) — the AI-generated image is the hero block.
- **`brand-only`** — AI image ignored; hero is the brand's static banner (`banner_url`), or a CSS-rendered fallback (solid `panelBg` + big `accentColor` wordmark) when no banner exists.

### Document order (top → bottom)

1. **Preheader** — hidden inbox-preview text (first ~110 chars of intro / "brand — headline" / brand).
2. **Header** — two paths:
   - If `staticConfig.header_url` set → single full-width composite `<img>` (texture + logo), flush to edges. Works identically in all clients.
   - Else fallback → torn-paper top edge + dark `panelBg` panel with SVG grunge brush-strokes (`accentColor`) + centered logo (or brand text) + torn-paper bottom edge. (Outlook ignores the SVG bg and shows solid `panelBg` — acceptable.)
3. **Content** — accent tick (32×3px `buttonBg`) → `<h1>` headline (navy ink `#172b4d`) → intro paragraph (with optional inline brand-colored link) → body paragraph.
4. **Hero** — `image-hero`: AI `<img>` at 600px width, height scaled from `imgHeight/imgWidth`. `brand-only`: static banner (ratio `1656/500`) or CSS fallback.
5. **Wordmark** — centered brand wordmark below hero (replaces a CTA button). If `wordmark_dark_bg` true, wraps the logo in a tight dark `panelBg` pill so light logos (gold Rollero, cyan NovaDreams) stay legible.
6. **Divider** — 1px `#ebecf0` rule (only if footer/social below).
7. **Social row** — Facebook · Twitter · Instagram · Website, separated by `|`, links in brand `accentColor`. Only renders entries with URLs.
8. **Footer** — soft tint `#fafbfc`, 2px brand `accentColor` top rule: attribution → legal text → unsubscribe link.

### Neutral ink palette (constants)

```ts
INK_HEADLINE = '#172b4d'  // headline
INK_BODY     = '#42526e'  // body copy
INK_MUTED    = '#5e6c84'  // socials / footer attribution
INK_LIGHT    = '#97a0af'  // legal / fine print
LINE_COLOR   = '#ebecf0'  // dividers
PAGE_BG      = '#ffffff'  // page canvas
FOOTER_BG    = '#fafbfc'  // footer tint
FONT_STACK   = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif"
```

### Email-safe techniques (carry these over)

- `<!DOCTYPE ... XHTML 1.0 Transitional>` + `role="presentation"` tables, `cellspacing=0 cellpadding=0 border=0`, `border-collapse:collapse`, `mso-table-lspace/rspace:0`.
- All visual CSS **inline**; only resets + the `@media (max-width:620px)` mobile rules live in `<style>`.
- Images: `display:block; border:0; outline:none; -ms-interpolation-mode:bicubic`, explicit `width`/`height`.
- **Torn-paper edge** and **grunge header** are rendered as inline **base64-encoded SVG `data:` URIs** (Gmail/Outlook-web/Apple Mail honor them); percent-encoded UTF-8 fallback.
- All text passes through `escapeHtml`; all URLs through `safeUrl` (forces `https://` if no scheme, allows `mailto:`/`tel:`).
- A **plain-text twin** is generated by `buildEmailText(...)` — strips HTML, renders links as `text (url)`. Always send both parts.

### Static per-brand config (`StaticBrandConfig` ← Supabase)

```ts
interface StaticBrandConfig {
  logo_url?, banner_url?, header_url?, wordmark_url?: string | null;
  wordmark_dark_bg?: boolean | null;  // wrap wordmark in dark pill for light logos
  website_url?, unsubscribe_url?, footer_attribution?, legal_text?: string | null;
}
```

Form fields left blank fall through to `staticConfig`, then to brand-derived defaults.

---

## 4. Supabase table: `brand_email_config`

```sql
CREATE TABLE IF NOT EXISTS brand_email_config (
  brand_name          TEXT PRIMARY KEY,
  logo_url            TEXT,
  banner_url          TEXT,
  website_url         TEXT,
  unsubscribe_url     TEXT,
  footer_attribution  TEXT,
  legal_text          TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- RLS: anon + authenticated may SELECT (read-only).
-- header_url / wordmark_url / wordmark_dark_bg columns added in a later migration (003).
```

Assets are stored in the Supabase Storage bucket `brand-assets/<brand>/{logo.svg, banner.webp|jpg}` and seeded by `scripts/upload-brand-assets.mjs`. Brand websites used in seed:
rooster.bet, fortuneplay.com, luckyvibe.com, lucky7even.com, playmojo.com, spinjo.com, spinsup.com, novadreams.com, rollero.com.

---

## 5. Transfer checklist

1. Copy `src/lib/brand-standards.ts` (BrandStyle + table + `getBrandStyle`) — **shared dependency of both builders**.
2. Copy `src/lib/build-banner-html.ts` and `src/lib/build-email-html.ts` (plain `.ts`, not `.tsx` — closing HTML tags break the JSX parser).
3. (Optional, for AI image gen) copy `src/lib/brand-colors.ts`.
4. Create the `brand_email_config` table + Storage bucket; upload per-brand logo/banner/header/wordmark assets.
5. Wire UI modals (`HtmlConversionModal.tsx` for banner, `EmailHtmlConversionModal.tsx` for email) or call the builders directly — they return a complete HTML string.
