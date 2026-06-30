/**
 * email-model.ts — block-based branded-email document model (PURE, no I/O).
 *
 * Ported from the Content Variation Studio "branded-email" transfer package.
 * An email is meta + an ordered array of blocks; the array is what makes
 * sections add-able / reorderable / removable. Block ids are supplied by the
 * caller (browser: crypto.randomUUID()) so the model stays deterministic.
 */

/** Per-block visual overrides (all optional; brand fonts/colors are the defaults). */
export interface BlockStyle {
  align?: 'left' | 'center' | 'right';
  fontFamily?: string; // font-family stack override — falls back to global, then brand font
  fontSize?: number; // px — text / heading / bonus / cta / wordmark / social
  bold?: boolean; // force bold (true) / normal (false) weight; undefined = block default
  italic?: boolean; // render this block's text in italic
  color?: string; // text color override
  background?: string; // panel background override — CSS hero (white / any color)
  logoPad?: number; // px padding inside the header logo card (default 12)
  spaceTop?: number; // px margin above the block
  spaceBottom?: number; // px margin below the block
  width?: number; // px max-width — image hero
  fullWidth?: boolean; // cta stretches to full width
  radius?: number; // px corner radius — image / button
  buttonBg?: string; // cta: button background colour override (brand button is the default)
  buttonColor?: string; // cta: button label colour override
  hideRule?: boolean; // bonus: hide the accent rule (legacy — superseded by ruleSide)
  ruleSide?: 'none' | 'left' | 'right'; // bonus: which side the accent rule sits on
}

/**
 * Email-safe font stacks for the family pickers. Each value is a full CSS stack
 * ending in a generic family, so it renders in EVERY email client with NO web-font
 * dependency (this keeps the downloaded HTML clean for ESP import). The empty-string
 * value is the "inherit" sentinel: a block falls back to the global default, and the
 * global default ('') falls back to the brand font.
 */
export const EMAIL_SAFE_FONTS: { label: string; value: string }[] = [
  { label: 'Brand font', value: '' },
  // ── Sans-serif ────────────────────────────────────────────────────────────
  { label: 'System default', value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { label: 'Arial', value: "Arial, 'Helvetica Neue', Helvetica, sans-serif" },
  { label: 'Helvetica', value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Verdana, Segoe, sans-serif' },
  { label: 'Trebuchet MS', value: "'Trebuchet MS', Helvetica, Arial, sans-serif" },
  { label: 'Segoe UI', value: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
  { label: 'Calibri', value: "Calibri, Candara, Segoe, 'Segoe UI', sans-serif" },
  { label: 'Century Gothic', value: "'Century Gothic', 'Apple Gothic', AppleGothic, sans-serif" },
  { label: 'Lucida Sans', value: "'Lucida Sans Unicode', 'Lucida Grande', Geneva, sans-serif" },
  // ── Serif ───────────────────────────────────────────────────────────────
  { label: 'Georgia', value: "Georgia, 'Times New Roman', Times, serif" },
  { label: 'Cambria', value: "Cambria, Georgia, 'Times New Roman', serif" },
  { label: 'Garamond', value: "Garamond, 'Hoefler Text', 'Times New Roman', Times, serif" },
  { label: 'Palatino', value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  // ── Monospace ───────────────────────────────────────────────────────────
  { label: 'Courier New', value: "'Courier New', Courier, monospace" },
  { label: 'Consolas', value: "Consolas, 'Lucida Console', 'Courier New', monospace" },
];

interface BlockBase {
  id: string;
  style?: BlockStyle;
}

export type EmailBlock =
  | (BlockBase & { type: 'header'; logoUrl?: string; mode?: 'banner' | 'logo' | 'text' })
  | (BlockBase & { type: 'hero'; mode: 'banner' | 'url' | 'css'; url?: string })
  | (BlockBase & { type: 'heading'; text: string })
  | (BlockBase & { type: 'paragraph'; text: string })
  | (BlockBase & { type: 'bonus'; offer: string; code?: string })
  | (BlockBase & { type: 'cta'; label: string; url: string })
  | (BlockBase & { type: 'divider' })
  | (BlockBase & { type: 'wordmark' })
  | (BlockBase & { type: 'social'; facebook?: string; twitter?: string; instagram?: string; website?: string })
  | (BlockBase & { type: 'footer'; attribution?: string; legal?: string; unsubscribeUrl?: string });

export type BlockType = EmailBlock['type'];

export interface EmailDoc {
  // `locale` is the language to write content in; `country` is the picker selection it's derived from.
  // `themeColor` (optional) overrides the brand palette with a single signature
  // colour — used for custom brands not built into the app.
  // `bgColor` (optional) overrides the Light/Dark canvas with a custom email
  // background colour; ink colours auto-adjust to the colour's luminance.
  // `fontFamily` (optional) is the email-wide default font stack ('' / undefined = brand
  // font); `fontSize` (optional) is the global base body size. Per-block style overrides win.
  meta: { brand: string; locale: string; subject: string; preheader: string; country?: string; themeColor?: string; dark?: boolean; bgColor?: string; fontFamily?: string; fontSize?: number };
  blocks: EmailBlock[];
}

export interface BrandEmailConfig {
  logo_url?: string | null;
  banner_url?: string | null;
  header_url?: string | null;
  wordmark_url?: string | null;
  wordmark_dark_bg?: boolean | null;
  website_url?: string | null;
  unsubscribe_url?: string | null;
  footer_attribution?: string | null;
  legal_text?: string | null;
}

export const BLOCK_TYPES: BlockType[] = [
  'header', 'hero', 'heading', 'paragraph', 'bonus', 'cta', 'divider', 'wordmark', 'social', 'footer',
];

export function newBlock(type: BlockType, id: string): EmailBlock {
  switch (type) {
    case 'header': return { id, type, logoUrl: '', mode: 'banner' };
    case 'hero': return { id, type, mode: 'css', url: '' };
    case 'heading': return { id, type, text: '' };
    case 'paragraph': return { id, type, text: '' };
    case 'bonus': return { id, type, offer: '', code: '' };
    case 'cta': return { id, type, label: '', url: '' };
    case 'divider': return { id, type };
    case 'wordmark': return { id, type };
    case 'social': return { id, type, facebook: '', twitter: '', instagram: '', website: '' };
    case 'footer': return { id, type, attribution: '', legal: '', unsubscribeUrl: '' };
  }
}

export function defaultEmailDoc(brand: string, genId: () => string): EmailDoc {
  const order: BlockType[] = [
    'header', 'hero', 'heading', 'paragraph', 'bonus', 'paragraph', 'cta', 'wordmark', 'social', 'footer',
  ];
  return {
    meta: { brand, locale: 'en', subject: '', preheader: '', country: 'US' },
    blocks: order.map((t) => newBlock(t, genId())),
  };
}

export function moveBlock(blocks: EmailBlock[], id: string, dir: -1 | 1): EmailBlock[] {
  const i = blocks.findIndex((b) => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= blocks.length) return blocks;
  const next = blocks.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function removeBlock(blocks: EmailBlock[], id: string): EmailBlock[] {
  return blocks.filter((b) => b.id !== id);
}

export function updateBlock(blocks: EmailBlock[], id: string, patch: Partial<EmailBlock>): EmailBlock[] {
  return blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b));
}
