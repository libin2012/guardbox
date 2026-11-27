import { describe, expect, it } from '@jest/globals';
import { breakdown, change, holdingValue, netWorthSeries, totals, withHistoryPoint, withSnapshot } from '../calc';
import { emptyData } from '../defaults';
import { convert, parseAmount } from '../money';
import { parseStooqCsv, stockQuoteCurrency, stooqSymbol } from '../prices';
import { AppData, Holding } from '../types';

const fx = { rates: { USD: 1, EUR: 0.9, INR: 84, AED: 3.6725 } };

function h(p: Partial<Holding>): Holding {
  return {
    id: Math.random().toString(36), name: 'x', kind: 'asset', categoryId: 'cat-cash', currency: 'USD',
    mode: 'manual', value: 0, createdAt: '', updatedAt: '', history: [], ...p,
  };
}

describe('money', () => {
  it('converts via USD', () => {
    expect(convert(100, 'USD', 'EUR', fx)).toBeCloseTo(90);
    expect(convert(84, 'INR', 'USD', fx)).toBeCloseTo(1);
    expect(convert(90, 'EUR', 'INR', fx)).toBeCloseTo(8400);
  });
  it('leaves unknown currencies unconverted', () => {
    expect(convert(5, 'XYZ', 'USD', fx)).toBe(5);
  });
  it('parses localized numbers', () => {
    expect(parseAmount('1,234.50')).toBe(1234.5);
    expect(parseAmount('1234,5')).toBe(1234.5);
    expect(parseAmount('1,000,000')).toBe(1000000);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('calc', () => {
  it('values quantity holdings', () => {
    expect(holdingValue(h({ mode: 'quantity', quantity: 2, unitPrice: 50, value: 1 }))).toBe(100);
    expect(holdingValue(h({ mode: 'manual', value: 7 }))).toBe(7);
  });

  it('totals assets and liabilities in base currency', () => {
    const t = totals([h({ value: 100 }), h({ value: 90, currency: 'EUR' }), h({ kind: 'liability', value: 50 })], 'USD', fx);
    expect(t.assets).toBeCloseTo(200);
    expect(t.liabilities).toBe(50);
    expect(t.netWorth).toBeCloseTo(150);
  });

  it('breaks down by category with shares', () => {
    const d = { ...emptyData(), fx, holdings: [h({ value: 75 }), h({ value: 25, categoryId: 'cat-bank' })] };
    const b = breakdown(d, 'asset', 'USD');
    expect(b.map((s) => s.category.id)).toEqual(['cat-cash', 'cat-bank']);
    expect(b[0].share).toBeCloseTo(0.75);
  });

  it('keeps one history point per day', () => {
    let hist = withHistoryPoint([], 1, '2026-01-01');
    hist = withHistoryPoint(hist, 2, '2026-01-02');
    hist = withHistoryPoint(hist, 3, '2026-01-02');
    expect(hist).toEqual([{ date: '2026-01-01', value: 1 }, { date: '2026-01-02', value: 3 }]);
  });

  it('builds a net worth series in the base currency', () => {
    const d: AppData = { ...emptyData(), fx, holdings: [h({ value: 100 })] };
    d.snapshots = [{ date: '2020-01-01', assetsUSD: 50, liabilitiesUSD: 10 }];
    d.snapshots = withSnapshot(d);
    const s = netWorthSeries(d, 'ALL', 'EUR');
    expect(s[0].value).toBeCloseTo(36);
    expect(s[s.length - 1].value).toBeCloseTo(90);
    expect(change(s)!.abs).toBeCloseTo(54);
  });
});

describe('stock quotes', () => {
  it('normalises symbols and currencies', () => {
    expect(stooqSymbol('AAPL')).toBe('aapl.us');
    expect(stooqSymbol('VOD.UK')).toBe('vod.uk');
    expect(stockQuoteCurrency('VOD.UK')).toBe('GBX');
    expect(stockQuoteCurrency('SAP.DE')).toBe('EUR');
  });
  it('parses stooq csv', () => {
    expect(parseStooqCsv('Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-11-26,22:00:00,230,232,229,231.5,1000\n')).toBe(231.5);
    expect(parseStooqCsv('Symbol,Date,Time,Open,High,Low,Close,Volume\nZZZ.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D')).toBeNull();
  });
});
