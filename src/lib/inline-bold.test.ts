import { describe, it, expect } from 'vitest';
import { parseBoldSegments } from './inline-bold';

describe('parseBoldSegments', () => {
  it('returns a single plain segment when there is no markup', () => {
    expect(parseBoldSegments('just words')).toEqual([
      { text: 'just words', bold: false },
    ]);
  });

  it('splits out a bold span and drops the asterisks', () => {
    // This is the real string shape that was rendering asterisks on screen.
    expect(parseBoldSegments('I\'d go with **Rocket Surf**, because it works')).toEqual([
      { text: "I'd go with ", bold: false },
      { text: 'Rocket Surf', bold: true },
      { text: ', because it works', bold: false },
    ]);
  });

  it('handles a bold span at the very start with no leading text', () => {
    expect(parseBoldSegments('**Concept 3** is the one')).toEqual([
      { text: 'Concept 3', bold: true },
      { text: ' is the one', bold: false },
    ]);
  });

  it('handles several bold spans in one string', () => {
    expect(parseBoldSegments('**one** and **two**')).toEqual([
      { text: 'one', bold: true },
      { text: ' and ', bold: false },
      { text: 'two', bold: true },
    ]);
  });

  it('keeps an unmatched ** visible instead of swallowing the rest', () => {
    // The failure that matters: dropping the tail would silently delete the
    // end of the recommendation, which is worse than showing two asterisks.
    expect(parseBoldSegments('half open **and then nothing')).toEqual([
      { text: 'half open **and then nothing', bold: false },
    ]);
  });

  it('treats an empty **** span as literal text, not an empty bold', () => {
    expect(parseBoldSegments('a **** b')).toEqual([
      { text: 'a **** b', bold: false },
    ]);
  });

  it('returns nothing for an empty string', () => {
    expect(parseBoldSegments('')).toEqual([]);
  });

  it('never loses characters — the joined text always equals the input minus its markers', () => {
    const input = 'lead **bold one** middle **bold two** tail';
    const joined = parseBoldSegments(input).map(s => s.text).join('');
    expect(joined).toBe('lead bold one middle bold two tail');
  });
});
