import { describe, it } from 'vitest';
import { lintDeliverability } from './deliverability';

const cases: [string, string, string, string[]][] = [
  ['all rule-1 words', 'bonus free spins promotion deals', 'play win 100% guaranteed instant cash claim now risk free jackpot free money limited time offer', []],
  ['repetition', 'Update', 'Save today. Save more. Save big and save again with our savings savings savings.', []],
  ['currency all', 'Pay $5', 'Costs €10, £20, ¥30 total.', []],
  ['clean', 'A quick note', 'Thanks for joining. Reply any time and a real person helps.', []],
];

describe('rule compliance probe', () => {
  it('prints', () => {
    for (const [label, s, bdy, ig] of cases) {
      const r = lintDeliverability(s, bdy, { ignore: ig });
      const f = r.findings.map(x => x.match).join(' | ');
      // eslint-disable-next-line no-console
      console.log(`\n[${label}] ${r.level} ${r.score}\n  ${f}`);
    }
  });
});
