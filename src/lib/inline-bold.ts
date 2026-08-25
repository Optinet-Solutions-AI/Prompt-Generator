/**
 * Splits text containing markdown-style **bold** spans into plain segments.
 *
 * Why this exists: the Assistant's recommendation comes straight from the model,
 * and models write markdown whether you ask them to or not — the concept
 * recommendation was rendering literal asterisks on screen
 * ("I'd go with Concept 3, **Stratospheric Rocket Surf**, because...").
 *
 * Why a parser and not `dangerouslySetInnerHTML`: this string is model output.
 * Turning it into HTML would let anything the model emits become markup. This
 * returns plain data instead, so the caller renders real React elements and the
 * text can never be interpreted as HTML.
 *
 * Only `**bold**` is handled. That is the only markdown that showed up in
 * practice, and guessing at the rest would be a markdown renderer, not a fix.
 */
export interface BoldSegment {
  text: string;
  bold: boolean;
}

export function parseBoldSegments(input: string): BoldSegment[] {
  if (!input) return [];

  const segments: BoldSegment[] = [];
  let rest = input;

  while (rest.length > 0) {
    const open = rest.indexOf('**');
    if (open === -1) break;

    // A closing ** must exist AND have something between the two markers.
    // `indexOf` from open + 2 means "****" finds a close at distance 0, which
    // is an empty span — treated as literal text rather than an empty <strong>.
    const close = rest.indexOf('**', open + 2);
    if (close === -1 || close === open + 2) break;

    if (open > 0) segments.push({ text: rest.slice(0, open), bold: false });
    segments.push({ text: rest.slice(open + 2, close), bold: true });
    rest = rest.slice(close + 2);
  }

  // Whatever is left had no usable bold span — including the case of an
  // unmatched "**", which stays visible rather than silently eating the
  // remainder of the sentence.
  if (rest.length > 0) segments.push({ text: rest, bold: false });

  return segments;
}
