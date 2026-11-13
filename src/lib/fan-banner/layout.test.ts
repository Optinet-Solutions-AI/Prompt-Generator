import { describe, it, expect } from 'vitest';
import { FAN_BANNER_BRANDS } from './brands';
import { layoutFanBanner, FAN_W, FAN_H, type Measure, type FanBannerTexts } from './layout';

// Stand-in for the browser's text measuring: every character is 0.6× the font
// size wide and capitals are 0.72× tall. Real fonts differ, but the layout
// rules (fit, stack, order, side) are what these tests pin down.
const measure: Measure = (text, font) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)![1]);
  return { width: text.length * size * 0.6, ascent: size * 0.72, descent: 0 };
};

const FULL: FanBannerTexts = {
  headline: '250%',
  offer: 'BONUS',
  line1: '+100 FREE SPINS',
  line2: '',
  button: 'CLAIM NOW',
  codeLabel: 'Bonus Code:',
  code: 'WIN250',
};

const LOGO_ASPECT = 1011 / 240; // SpinsUp logo PNG

function run(texts: Partial<FanBannerTexts> = {}, opts: { brand?: keyof typeof FAN_BANNER_BRANDS; side?: 'left' | 'right' } = {}) {
  return layoutFanBanner({
    brand: FAN_BANNER_BRANDS[opts.brand ?? 'SpinsUp'],
    texts: { ...FULL, ...texts },
    side: opts.side ?? 'right',
    logoAspect: LOGO_ASPECT,
    measure,
  });
}

// Every drawn thing as a rectangle, top to bottom.
function boxes(l: ReturnType<typeof run>) {
  const out: Array<{ name: string; left: number; right: number; top: number; bottom: number }> = [];
  if (l.logo) out.push({ name: 'logo', left: l.logo.x, right: l.logo.x + l.logo.w, top: l.logo.y, bottom: l.logo.y + l.logo.h });
  for (const t of l.texts) {
    out.push({ name: t.role, left: t.centerX - t.width / 2, right: t.centerX + t.width / 2, top: t.baseline - t.ascent, bottom: t.baseline + t.descent });
  }
  if (l.button) out.push({ name: 'button', left: l.button.x, right: l.button.x + l.button.w, top: l.button.y, bottom: l.button.y + l.button.h });
  if (l.code && l.code.placement === 'under-button') {
    out.push({ name: 'code', left: l.code.centerX - l.code.width / 2, right: l.code.centerX + l.code.width / 2, top: l.code.baseline - l.code.ascent, bottom: l.code.baseline + l.code.descent });
  }
  return out;
}

describe('layoutFanBanner', () => {
  it('produces a 1200x600 banner', () => {
    expect(FAN_W).toBe(1200);
    expect(FAN_H).toBe(600);
  });

  it('keeps every element inside the text column and inside the banner, even with long text', () => {
    const l = run({
      headline: '€10000',
      offer: 'GRATISSPINN UTEN INNSKUDD',
      line1: '+100 GIRI GRATUITI SENZA DEPOSITO',
      line2: 'UP TO €5000 + 200 FREE SPINS',
      button: 'OTTIENI IL BONUS ADESSO',
      code: 'WELCOMEBACK400',
    });
    for (const b of boxes(l)) {
      expect(b.left, b.name).toBeGreaterThanOrEqual(l.column.x - 0.5);
      expect(b.right, b.name).toBeLessThanOrEqual(l.column.x + l.column.w + 0.5);
      expect(b.top, b.name).toBeGreaterThanOrEqual(0);
      expect(b.bottom, b.name).toBeLessThanOrEqual(FAN_H);
    }
  });

  it('stacks logo, number, offer, coloured line, button and code top to bottom without overlapping', () => {
    const list = boxes(run());
    expect(list.map((b) => b.name)).toEqual(['logo', 'headline', 'offer', 'line1', 'button', 'code']);
    for (let i = 1; i < list.length; i++) {
      expect(list[i].top, `${list[i].name} overlaps ${list[i - 1].name}`).toBeGreaterThanOrEqual(list[i - 1].bottom);
    }
  });

  it('leaves out the button and bonus code when they are empty', () => {
    const l = run({ button: '', code: '' });
    expect(l.button).toBeNull();
    expect(l.code).toBeNull();
  });

  it('leaves out empty text lines', () => {
    const l = run({ offer: '', line1: '', line2: '' });
    expect(l.texts.map((t) => t.role)).toEqual(['headline']);
  });

  it('sits on the right by default and moves to the left when asked', () => {
    const right = run();
    const left = run({}, { side: 'left' });
    expect(right.column.x).toBeGreaterThan(FAN_W / 2);
    expect(left.column.x + left.column.w).toBeLessThan(FAN_W / 2);
    for (const b of boxes(left)) expect(b.right).toBeLessThan(FAN_W / 2);
  });

  it('shrinks a long number so it still fits the column', () => {
    const short = run({ headline: '40' }).texts.find((t) => t.role === 'headline')!;
    const long = run({ headline: '€10000' }).texts.find((t) => t.role === 'headline')!;
    expect(long.size).toBeLessThan(short.size);
    expect(long.width).toBeLessThanOrEqual(run().column.w + 0.5);
  });

  it('makes the number bigger when there is less to fit', () => {
    const busy = run({ headline: '50', line2: 'UP TO $4000' }).texts.find((t) => t.role === 'headline')!;
    const quiet = run({ headline: '50', button: '', code: '', line2: '' }).texts.find((t) => t.role === 'headline')!;
    expect(quiet.size).toBeGreaterThan(busy.size);
  });

  it('writes in capitals for brands whose banners use capitals', () => {
    const l = run({ offer: 'free spins', line1: 'no deposit needed', button: 'play now' }, { brand: 'Roosterbet' });
    expect(l.texts.find((t) => t.role === 'offer')!.text).toBe('FREE SPINS');
    expect(l.texts.find((t) => t.role === 'line1')!.text).toBe('NO DEPOSIT NEEDED');
    expect(l.button!.text).toBe('PLAY NOW');
  });

  it('sets the bonus code larger when the brand font asks for it (tall, narrow fonts)', () => {
    const base = FAN_BANNER_BRANDS.SpinsUp;
    const scaled = { ...base, fonts: { ...base.fonts, code: { ...base.fonts.code, scale: 1.3 } } };
    // A short code, so the column width doesn't cap the size (long codes still shrink to fit).
    const texts = { ...FULL, codeLabel: 'Code:', code: 'W5' };
    const plain = layoutFanBanner({ brand: base, texts, side: 'right', logoAspect: LOGO_ASPECT, measure });
    const big = layoutFanBanner({ brand: scaled, texts, side: 'right', logoAspect: LOGO_ASPECT, measure });
    expect(big.code!.size).toBeGreaterThan(plain.code!.size * 1.2);
  });

  it("keeps Lucky7even's handwritten button text as typed", () => {
    const l = run({ button: 'Claim Now!' }, { brand: 'Lucky7even' });
    expect(l.button!.text).toBe('Claim Now!');
  });

  it("puts Lucky7even's bonus code in the bottom corner on the picture side", () => {
    const right = run({}, { brand: 'Lucky7even' });
    expect(right.code!.placement).toBe('corner');
    expect(right.code!.centerX + right.code!.width / 2).toBeLessThan(right.column.x);
    expect(right.code!.baseline).toBeGreaterThan(FAN_H * 0.85);

    const left = run({}, { brand: 'Lucky7even', side: 'left' });
    expect(left.code!.centerX - left.code!.width / 2).toBeGreaterThan(left.column.x + left.column.w);
  });
});
