import { convert, formatMoney, formatPercent, parseAmount } from '../money';
import { CURRENCIES, FALLBACK_FX } from '../defaults';
import { FX } from '../../test/factories';

describe('convert', () => {
  it('is a no-op for the same currency', () => {
    expect(convert(123.45, 'INR', 'INR', FX)).toBe(123.45);
  });

  it('converts through USD both ways', () => {
    expect(convert(100, 'USD', 'GBP', FX)).toBeCloseTo(80);
    expect(convert(80, 'GBP', 'USD', FX)).toBeCloseTo(100);
    expect(convert(3.6725, 'AED', 'INR', FX)).toBeCloseTo(84);
  });

  it('round-trips without drift', () => {
    const there = convert(1000, 'EUR', 'AED', FX);
    expect(convert(there, 'AED', 'EUR', FX)).toBeCloseTo(1000, 8);
  });

  it('leaves amounts alone when a rate is missing or zero', () => {
    expect(convert(5, 'USD', 'XYZ', FX)).toBe(5);
    expect(convert(5, 'ZZZ', 'USD', { rates: { USD: 1, ZZZ: 0 } })).toBe(5);
  });

  it('passes non-finite amounts through', () => {
    expect(convert(NaN, 'USD', 'EUR', FX)).toBeNaN();
    expect(convert(Infinity, 'USD', 'EUR', FX)).toBe(Infinity);
  });

  it('has a fallback rate for every currency the user can pick', () => {
    for (const c of CURRENCIES) expect(FALLBACK_FX.rates[c.code]).toBeGreaterThan(0);
  });
});

describe('formatMoney', () => {
  it('masks amounts when hidden', () => {
    expect(formatMoney(1234, 'USD', { hidden: true })).toBe('••••••');
  });

  it('uses cents for small amounts and whole units for large ones', () => {
    expect(formatMoney(12.5, 'USD')).toMatch(/12\.50/);
    expect(formatMoney(1234.56, 'USD')).toMatch(/1,235/);
    expect(formatMoney(1234.56, 'USD')).not.toMatch(/\.56/);
  });

  it('shows the currency', () => {
    expect(formatMoney(10, 'USD')).toContain('$');
    expect(formatMoney(10, 'EUR')).toContain('€');
  });

  it('supports compact notation', () => {
    expect(formatMoney(1_500_000, 'USD', { compact: true })).toMatch(/1\.5M/);
  });

  it('formats negatives', () => {
    expect(formatMoney(-50, 'USD')).toMatch(/-|−|\(/);
  });

  it('does not throw for an invalid currency code', () => {
    expect(() => formatMoney(10, 'not-a-code')).not.toThrow();
    expect(formatMoney(10, 'not-a-code')).toMatch(/10/);
  });
});

describe('formatPercent', () => {
  it('adds a sign and one decimal', () => {
    expect(formatPercent(0.1234)).toBe('+12.3%');
    expect(formatPercent(-0.05)).toBe('-5.0%');
    expect(formatPercent(0)).toBe('0.0%');
  });
  it('shows a dash for non-finite values', () => {
    expect(formatPercent(NaN)).toBe('–');
    expect(formatPercent(Infinity)).toBe('–');
  });
});

describe('parseAmount', () => {
  it.each([
    ['42', 42],
    ['  42.5 ', 42.5],
    ['1 234,56', 1234.56],
    ['1,234.50', 1234.5],
    ['1.234', 1.234],
    ['1234,5', 1234.5],
    ['1,000', 1000],
    ['1,000,000', 1000000],
    ['-250', -250],
    ['0', 0],
  ])('parses %p as %p', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '12abc', '--1'])('rejects %p', (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});
