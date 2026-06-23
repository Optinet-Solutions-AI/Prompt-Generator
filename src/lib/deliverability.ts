/**
 * deliverability.ts — spam / deliverability linter for email copy (PURE, no I/O)
 *
 * Ported from the Content Variation Studio "branded-email" transfer package.
 *
 * Inputs:  subject + body text
 * Outputs: a DeliverabilityReport (score + findings with safer suggestions)
 * Used by: the email conversion modal (live client-side feedback as you type).
 *          No secrets, no server-only — safe to run on every keystroke.
 *
 * Implements the operator's deliverability rules:
 *   1. Spam-word detection (with suggested alternatives)
 *   2. Spam-impression analysis (urgency, CAPS, emojis, !!!, sales CTAs, gambling)
 *   3. Currency-symbol restriction ($ € £ ¥ -> USD / EUR / GBP / JPY)
 */

export type FindingType = "spam_word" | "currency_symbol" | "impression";
export type Severity = "high" | "medium" | "low";

export interface DeliverabilityFinding {
  type: FindingType;
  severity: Severity;
  match: string; // the offending fragment
  message: string; // why it's flagged
  suggestion?: string; // safer alternative
}

export interface DeliverabilityReport {
  score: number; // 0–100, higher = riskier
  level: "clean" | "caution" | "high-risk";
  findings: DeliverabilityFinding[];
}

// ── 1. Spam words → safer alternative ────────────────────────────────────────
const SPAM_WORDS: Record<string, string> = {
  bonus: "extra value",
  "free spins": "complimentary rounds",
  promotion: "update",
  promotions: "updates",
  deals: "options",
  deal: "option",
  play: "join",
  win: "earn",
  winner: "selected",
  "100%": "fully",
  guaranteed: "reliable",
  guarantee: "assurance",
  "instant cash": "quick payout",
  "claim now": "see details",
  "risk free": "no-obligation",
  "risk-free": "no-obligation",
  jackpot: "top reward",
  "free money": "added value",
  "limited time offer": "current availability",
  "limited time": "current availability",
  "act now": "take a look",
  "buy now": "explore options",
  "order now": "get started",
  "click here": "learn more",
  "sign up now": "join us",
  cash: "funds",
  cheap: "affordable",
  discount: "savings",
};

// ── 2. Impression signals ────────────────────────────────────────────────────
const URGENCY = [
  "hurry",
  "urgent",
  "don't miss",
  "dont miss",
  "expires",
  "expiring",
  "today only",
  "last chance",
  "ends soon",
  "only hours left",
  "while supplies last",
];

// Note: "bet" alone is too broad (matches brand names like "Rooster.Bet" and common
// words) — we flag the unambiguous "betting"/"wager" instead.
const GAMBLING = [
  "casino",
  "betting",
  "wager",
  "slots",
  "roulette",
  "poker",
  "gamble",
  "gambling",
  "jackpot",
];

const SALES_CTA = ["buy now", "order now", "click here", "subscribe now", "sign up now"];

// Common words excluded from the "repetitive phrasing" check (they repeat naturally).
const STOPWORDS = new Set([
  "this", "that", "your", "with", "from", "have", "will", "about", "just", "more",
  "they", "them", "then", "than", "when", "what", "which", "were", "here", "there",
  "their", "you", "our", "for", "and", "the", "are", "was", "can", "get", "out",
  "into", "over", "only", "also", "been", "being", "would", "could", "should",
  "us", "we", "to", "of", "in", "on", "is", "it", "a", "an", "or", "be", "as", "at",
]);

// ── 3. Currency symbols → safe code ──────────────────────────────────────────
const CURRENCY: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
};

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

function countMatches(haystack: string, needle: string): number {
  if (!needle) return 0;
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return (haystack.match(re) ?? []).length;
}

/**
 * Whole-token match: adds a \b word boundary only where the term's edge is
 * alphanumeric. Stops "play" matching "display", "win" matching "winter", etc.,
 * while still matching symbol/phrase terms like "100%" and "free spins".
 */
function matchesTerm(haystack: string, term: string): boolean {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const left = /^[a-z0-9]/i.test(term) ? "\\b" : "";
  const right = /[a-z0-9]$/i.test(term) ? "\\b" : "";
  return new RegExp(`${left}${esc}${right}`, "i").test(haystack);
}

// ── Localized term packs (DE / NO / IT). English uses the constants above. ───
interface LangPack { spam: Record<string, string>; urgency: string[]; gambling: string[]; salesCta: string[] }
const PACKS: Record<string, LangPack> = {
  de: {
    spam: { gratis: 'inklusive', kostenlos: 'ohne Aufpreis', gewinnen: 'erhalten', gewinn: 'Vorteil', garantiert: 'zuverlässig', bonus: 'Mehrwert', freispiele: 'Freirunden', aktion: 'Update', angebot: 'Option', 'limitiertes angebot': 'aktuelle Verfügbarkeit', jackpot: 'Hauptpreis', sofort: 'schnell', bargeld: 'Guthaben' },
    urgency: ['nur heute', 'letzte chance', 'läuft ab', 'beeil dich', 'verpassen sie nicht', 'jetzt zugreifen'],
    gambling: ['casino', 'wetten', 'spielautomaten', 'poker', 'roulette', 'glücksspiel', 'jackpot'],
    salesCta: ['jetzt kaufen', 'jetzt bestellen', 'hier klicken', 'jetzt anmelden'],
  },
  no: {
    spam: { gratis: 'inkludert', vinn: 'få', vinne: 'få', gevinst: 'fordel', garantert: 'pålitelig', bonus: 'ekstra verdi', gratisspinn: 'gratisrunder', kampanje: 'oppdatering', tilbud: 'alternativ', umiddelbar: 'rask', kontanter: 'saldo', jackpot: 'toppgevinst' },
    urgency: ['kun i dag', 'siste sjanse', 'utløper', 'skynd deg', 'ikke gå glipp av'],
    gambling: ['casino', 'betting', 'spilleautomater', 'poker', 'rulett', 'pengespill', 'jackpot'],
    salesCta: ['kjøp nå', 'bestill nå', 'klikk her', 'registrer deg nå'],
  },
  it: {
    spam: { gratis: 'incluso', gratuito: 'incluso', vinci: 'ottieni', vincere: 'ottenere', vincita: 'vantaggio', garantito: 'affidabile', bonus: 'valore extra', 'giri gratis': 'giri inclusi', promozione: 'aggiornamento', offerta: 'opzione', istantaneo: 'rapido', contanti: 'saldo', jackpot: 'premio principale' },
    urgency: ['solo oggi', 'ultima possibilità', 'scade', 'affrettati', 'non perdere'],
    gambling: ['casinò', 'scommesse', 'slot', 'poker', 'roulette', "gioco d'azzardo", 'jackpot'],
    salesCta: ['compra ora', 'ordina ora', 'clicca qui', 'registrati ora'],
  },
};
function packFor(locale?: string): LangPack {
  if (locale && PACKS[locale]) return PACKS[locale];
  return { spam: SPAM_WORDS, urgency: URGENCY, gambling: GAMBLING, salesCta: SALES_CTA };
}

const SEVERITY_WEIGHT: Record<Severity, number> = { high: 18, medium: 9, low: 4 };

/**
 * Lint a subject + body and return a scored report. Pure + synchronous —
 * safe to call on every keystroke in the editor.
 */
export interface LintOptions {
  /** Terms to exempt from detection — e.g. the brand name, so "Fortune Play" isn't read as "play". */
  ignore?: string[];
  /** Language for the term lists: 'en' (default) | 'de' | 'no' | 'it'. */
  locale?: string;
}

export function lintDeliverability(
  subject: string,
  body: string,
  opts: LintOptions = {},
): DeliverabilityReport {
  const findings: DeliverabilityFinding[] = [];
  // Strip merge placeholders before scanning so the "$" in ${name} isn't read as a
  // currency symbol and {{field}} names don't trip spam-word matches.
  let text = `${subject}\n${body}`.replace(/\$\{[^}]*\}/g, " ").replace(/\{\{[^}]*\}\}/g, " ");
  // Exempt caller-supplied terms (brand names are proper nouns, not promo language).
  for (const term of opts.ignore ?? []) {
    const t = term?.trim();
    if (t) text = text.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  const lower = text.toLowerCase();
  const pack = packFor(opts.locale);

  // 1. Spam words — boundary-aware (longer phrases first so they win over substrings).
  const seen = new Set<string>();
  for (const term of Object.keys(pack.spam).sort((a, b) => b.length - a.length)) {
    if (!matchesTerm(lower, term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    findings.push({
      type: "spam_word",
      severity: term.includes(" ") ? "high" : "medium",
      match: term,
      message: `"${term}" is a high-risk spam trigger.`,
      suggestion: `Try "${pack.spam[term]}".`,
    });
  }

  // 3. Currency symbols.
  for (const [symbol, code] of Object.entries(CURRENCY)) {
    if (text.includes(symbol)) {
      findings.push({
        type: "currency_symbol",
        severity: "high",
        match: symbol,
        message: `Currency symbol "${symbol}" hurts deliverability.`,
        suggestion: `Use the code "${code}" instead.`,
      });
    }
  }

  // 2. Impression signals.
  const capsWords = (text.match(/\b[A-Z]{4,}\b/g) ?? []).filter((w) => w !== "USD" && w !== "EUR" && w !== "GBP" && w !== "JPY");
  if (capsWords.length >= 2) {
    findings.push({
      type: "impression",
      severity: capsWords.length >= 4 ? "high" : "medium",
      match: capsWords.slice(0, 3).join(", "),
      message: `Excessive capitalization (${capsWords.length} all-caps words) reads as shouting.`,
      suggestion: "Use sentence case.",
    });
  }

  const bangs = (text.match(/!/g) ?? []).length;
  if (bangs >= 2) {
    findings.push({
      type: "impression",
      severity: bangs >= 4 ? "high" : "medium",
      match: "!".repeat(Math.min(bangs, 3)),
      message: `Multiple exclamation marks (${bangs}) signal hype.`,
      suggestion: "Keep to at most one, or none.",
    });
  }

  const emojis = (text.match(EMOJI_RE) ?? []).length;
  if (emojis >= 2) {
    findings.push({
      type: "impression",
      severity: emojis >= 4 ? "high" : "medium",
      match: `${emojis} emojis`,
      message: `Too many emojis (${emojis}) look promotional.`,
      suggestion: "Use one at most in a 1:1 email.",
    });
  }

  for (const phrase of pack.urgency) {
    if (lower.includes(phrase)) {
      findings.push({
        type: "impression",
        severity: "medium",
        match: phrase,
        message: `Urgency phrase "${phrase}" raises spam impression.`,
        suggestion: "Drop the pressure; state the timing plainly.",
      });
    }
  }

  for (const phrase of pack.salesCta) {
    if (lower.includes(phrase) && !seen.has(phrase)) {
      findings.push({
        type: "impression",
        severity: "medium",
        match: phrase,
        message: `Aggressive CTA "${phrase}" reads as sales-driven.`,
        suggestion: 'Soften it (e.g. "happy to share more").',
      });
    }
  }

  for (const word of pack.gambling) {
    if (countMatches(lower, `\\b${word}\\b`) > 0) {
      findings.push({
        type: "impression",
        severity: "high",
        match: word,
        message: `Gambling-focused wording "${word}" is a major spam signal.`,
        suggestion: "Avoid gambling vocabulary entirely.",
      });
    }
  }

  // Repetitive promotional phrasing — the same notable word used too often reads
  // as promotional/spammy. Ignores short/common words; the brand name is already
  // stripped above via opts.ignore.
  const counts: Record<string, number> = {};
  for (const w of lower.match(/[a-z]{4,}/g) ?? []) {
    if (STOPWORDS.has(w)) continue;
    counts[w] = (counts[w] ?? 0) + 1;
  }
  for (const [w, n] of Object.entries(counts)) {
    // 4+ is genuinely repetitive; 2–3 occurrences of a normal word (e.g. "account")
    // is fine and shouldn't be flagged.
    if (n >= 4) {
      findings.push({
        type: "impression",
        severity: "medium",
        match: `${w} ×${n}`,
        message: `"${w}" is repeated ${n} times — repetitive phrasing reads as promotional.`,
        suggestion: "Vary the wording or cut the repeats.",
      });
    }
  }

  // Score: weighted sum of findings, capped at 100.
  const raw = findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
  const score = Math.min(100, raw);
  const level: DeliverabilityReport["level"] =
    score === 0 ? "clean" : score < 25 ? "caution" : "high-risk";

  return { score, level, findings };
}

/**
 * Deterministically strip the easy mechanical triggers the AI sometimes leaves:
 * currency symbols → codes, and ALL exclamation marks → periods. Pure + safe;
 * keeps the ${name} placeholder intact. Spam words stay AI-handled (contextual).
 */
export function sanitizeContent(text: string): string {
  return text
    .replace(/\$(?!\{)/g, "USD ") // "$" but not the "$" in ${name}
    .replace(/€/g, "EUR ")
    .replace(/£/g, "GBP ")
    .replace(/¥/g, "JPY ")
    .replace(/\s*!+/g, ".") // no exclamation marks at all
    .replace(/\.{2,}/g, "."); // tidy any ".." this produced
}

/**
 * Aggressively clean copy: replace spam-trigger WORDS with their safer
 * alternatives (boundary-aware, case-preserving), then apply the mechanical
 * sanitize (currency symbols → codes, drop exclamation marks). This is what the
 * "Clean up copy" button uses — so it actually rewrites, not just suggests.
 * Caller-supplied `ignore` terms (e.g. the brand name) are never touched.
 */
export function autoFix(text: string, opts: LintOptions = {}): string {
  const ignore = new Set((opts.ignore ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean));
  const pack = packFor(opts.locale);
  let out = text;
  // Longest phrases first so "limited time offer" wins over "limited time".
  for (const term of Object.keys(pack.spam).sort((a, b) => b.length - a.length)) {
    if (ignore.has(term)) continue;
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const left = /^[a-z0-9]/i.test(term) ? "\\b" : "";
    const right = /[a-z0-9]$/i.test(term) ? "\\b" : "";
    const re = new RegExp(`${left}${esc}${right}`, "gi");
    out = out.replace(re, (match) => {
      const alt = pack.spam[term];
      // Preserve leading capitalization of the original match.
      return /^[A-Z]/.test(match) ? alt.charAt(0).toUpperCase() + alt.slice(1) : alt;
    });
  }
  // De-shout ALL-CAPS words (keep currency codes) → Title case.
  out = out.replace(/\b[A-Z]{4,}\b/g, (w) =>
    (['USD', 'EUR', 'GBP', 'JPY'].includes(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()),
  );
  return sanitizeContent(out);
}

/** One-line guidance block appended to the AI prompt so copy avoids these. */
export const DELIVERABILITY_AI_RULES = [
  "Deliverability rules (follow strictly):",
  "- Do NOT use spam-trigger words such as: bonus, free spins, promotion, deals, play, win, 100%, guaranteed, instant cash, claim now, risk free, jackpot, free money, limited time offer.",
  "- Avoid hype: no excessive capitalization, NO exclamation marks at all, at most one emoji, no false urgency, no aggressive 'buy now / click here' CTAs, no gambling vocabulary.",
  "- Never use currency symbols ($ € £ ¥). Write the code instead (USD, EUR, GBP, JPY).",
  "- Keep the brand name exactly as given; do not alter it.",
  "- Keep it natural, specific, and conversational — like a real 1:1 email.",
].join("\n");
