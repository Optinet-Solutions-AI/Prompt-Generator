import { describe, it } from 'vitest';
import { lintDeliverability } from './deliverability';
describe('localized deliverability', () => {
  it('flags DE/NO/IT terms', () => {
    const de = lintDeliverability('Gratis Bonus', 'Gewinnen Sie jetzt im Casino, garantiert!', { locale: 'de' });
    const it = lintDeliverability('Bonus gratis', 'Vinci al casinò, premio garantito', { locale: 'it' });
    const no = lintDeliverability('Gratis bonus', 'Vinn i casino, garantert gevinst', { locale: 'no' });
    // eslint-disable-next-line no-console
    console.log('DE', de.level, de.findings.map(f => f.match).join(','));
    // eslint-disable-next-line no-console
    console.log('IT', it.level, it.findings.map(f => f.match).join(','));
    // eslint-disable-next-line no-console
    console.log('NO', no.level, no.findings.map(f => f.match).join(','));
  });
});
