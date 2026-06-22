import { describe, it } from 'vitest';
import { lintDeliverability } from './deliverability';

const cases: [string, string, string, string[]][] = [
  // label, subject, body, ignore
  ['clean 1:1 note', 'A quick note about your account', 'Thanks for joining us. Reply any time and a real person will help. We are glad to have you here.', []],
  ['spammy promo', 'WINNER!! Claim your FREE BONUS now', 'Limited time offer — guaranteed jackpot! Deposit $100 today only. Play now and win cash!!!', []],
  ['brand exempt', 'A note from FortunePlay', 'Welcome to FortunePlay. Your account is ready.', ['FortunePlay']],
  ['boundary (display/winter)', 'Your display settings', 'The winter update is ready to view in your account.', []],
  ['currency + caps only', 'Update', 'Your balance is $50. ACT FAST TODAY PLEASE.', []],
];

describe('spam checker accuracy probe', () => {
  it('prints scores + findings', () => {
    for (const [label, subj, body, ignore] of cases) {
      const r = lintDeliverability(subj, body, { ignore });
      const f = r.findings.map(x => `${x.severity}:${x.match}`).join(', ');
      // eslint-disable-next-line no-console
      console.log(`\n[${label}] level=${r.level} score=${r.score}\n  findings: ${f || '(none)'}`);
    }
  });
});
