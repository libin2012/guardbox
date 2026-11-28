import { breakdown, change, GRAMS_PER_TROY_OZ, holdingSeries, holdingValue, netWorthSeries, rangeStart, RANGES, totals, withHistoryPoint, withSnapshot } from '../calc';
import { addDays, dayKey, parseDay } from '../dates';
import { DEFAULT_CATEGORIES } from '../defaults';
import { FX, makeData, makeHolding } from '../../test/factories';

describe('dates', () => {
  it('formats and parses local day keys', () => {
    const d = new Date(2026, 0, 5, 23, 59);
    expect(dayKey(d)).toBe('2026-01-05');
    expect(parseDay('2026-01-05').getDate()).toBe(5);
    expect(dayKey(parseDay('2026-12-31'))).toBe('2026-12-31');
  });
  it('adds days across month and year ends without mutating', () => {
    const d = new Date(2026, 11, 31);
    expect(dayKey(addDays(d, 1))).toBe('2027-01-01');
    expect(dayKey(addDays(d, -31))).toBe('2026-11-30');
    expect(dayKey(d)).toBe('2026-12-31');
  });
});

describe('holdingValue', () => {
  it('uses the typed value for manual holdings', () => {
    expect(holdingValue(makeHolding({ value: 250 }))).toBe(250);
  });
  it('uses quantity x unit price for quantity holdings', () => {
    expect(holdingValue(makeHolding({ mode: 'quantity', quantity: 0.5, unitPrice: 60000, value: 1 }))).toBe(30000);
  });
  it('falls back to value until a price is known', () => {
    expect(holdingValue(makeHolding({ mode: 'quantity', quantity: 3, value: 99 }))).toBe(99);
    expect(holdingValue(makeHolding({ mode: 'quantity', unitPrice: 10, value: 7 }))).toBe(7);
  });
  it('knows the grams in a troy ounce', () => {
    expect(GRAMS_PER_TROY_OZ).toBeCloseTo(31.1035, 4);
  });
});

describe('totals', () => {
  it('is zero for no holdings', () => {
    expect(totals([], 'USD', FX)).toEqual({ assets: 0, liabilities: 0, netWorth: 0 });
  });

  it('adds assets and subtracts liabilities in the base currency', () => {
    const t = totals(
      [
        makeHolding({ value: 1000 }),
        makeHolding({ value: 840, currency: 'INR' }),
        makeHolding({ kind: 'liability', categoryId: 'cat-loan', value: 90, currency: 'EUR' }),
      ],
      'USD',
      FX,
    );
    expect(t.assets).toBeCloseTo(1010);
    expect(t.liabilities).toBeCloseTo(100);
    expect(t.netWorth).toBeCloseTo(910);
  });

  it('can go negative when debts exceed assets', () => {
    const t = totals([makeHolding({ value: 10 }), makeHolding({ kind: 'liability', value: 50 })], 'USD', FX);
    expect(t.netWorth).toBe(-40);
  });

  it('changes with the base currency', () => {
    const hs = [makeHolding({ value: 100 })];
    expect(totals(hs, 'EUR', FX).netWorth).toBeCloseTo(90);
    expect(totals(hs, 'INR', FX).netWorth).toBeCloseTo(8400);
  });
});

describe('breakdown', () => {
  const data = makeData({
    fx: FX,
    holdings: [
      makeHolding({ categoryId: 'cat-cash', value: 100 }),
      makeHolding({ categoryId: 'cat-cash', value: 50 }),
      makeHolding({ categoryId: 'cat-stock', value: 450 }),
      makeHolding({ categoryId: 'cat-loan', kind: 'liability', value: 300 }),
      makeHolding({ categoryId: 'cat-card', kind: 'liability', value: 100 }),
    ],
  });

  it('groups assets by category, largest first, with counts and shares', () => {
    const b = breakdown(data, 'asset', 'USD');
    expect(b.map((s) => [s.category.id, s.value, s.count])).toEqual([
      ['cat-stock', 450, 1],
      ['cat-cash', 150, 2],
    ]);
    expect(b[0].share).toBeCloseTo(0.75);
    expect(b.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1);
  });

  it('groups liabilities separately', () => {
    expect(breakdown(data, 'liability', 'USD').map((s) => s.category.id)).toEqual(['cat-loan', 'cat-card']);
  });

  it('skips holdings whose category was removed', () => {
    const d = { ...data, holdings: [makeHolding({ categoryId: 'cat-gone', value: 5 })] };
    expect(breakdown(d, 'asset', 'USD')).toEqual([]);
  });

  it('gives zero shares when everything is worth zero', () => {
    const d = { ...data, holdings: [makeHolding({ value: 0 })] };
    expect(breakdown(d, 'asset', 'USD')[0].share).toBe(0);
  });
});

describe('history and snapshots', () => {
  it('keeps one sorted point per day', () => {
    let h = withHistoryPoint([], 5, '2026-03-02');
    h = withHistoryPoint(h, 3, '2026-03-01');
    h = withHistoryPoint(h, 6, '2026-03-02');
    expect(h).toEqual([{ date: '2026-03-01', value: 3 }, { date: '2026-03-02', value: 6 }]);
  });

  it('does not mutate the history it is given', () => {
    const h = [{ date: '2026-03-01', value: 1 }];
    withHistoryPoint(h, 2, '2026-03-01');
    expect(h).toEqual([{ date: '2026-03-01', value: 1 }]);
  });

  it('defaults to today', () => {
    expect(withHistoryPoint([], 1)[0].date).toBe(dayKey());
  });

  it('stores snapshots in USD regardless of holding currency', () => {
    const d = makeData({ fx: FX, holdings: [makeHolding({ value: 90, currency: 'EUR' }), makeHolding({ kind: 'liability', value: 8, currency: 'GBP' })] });
    expect(withSnapshot(d, '2026-04-01')).toEqual([{ date: '2026-04-01', assetsUSD: 100, liabilitiesUSD: 10 }]);
  });

  it('replaces today\'s snapshot and keeps older ones in order', () => {
    const d = makeData({ fx: FX, holdings: [makeHolding({ value: 7 })], snapshots: [{ date: '2026-04-02', assetsUSD: 1, liabilitiesUSD: 0 }, { date: '2026-04-01', assetsUSD: 2, liabilitiesUSD: 0 }] });
    expect(withSnapshot(d, '2026-04-02')).toEqual([
      { date: '2026-04-01', assetsUSD: 2, liabilitiesUSD: 0 },
      { date: '2026-04-02', assetsUSD: 7, liabilitiesUSD: 0 },
    ]);
  });
});

describe('ranges and series', () => {
  const now = new Date(2026, 5, 30);

  it('computes range start dates', () => {
    expect(dayKey(rangeStart('1M', now)!)).toBe('2026-05-31');
    expect(dayKey(rangeStart('1Y', now)!)).toBe('2025-06-30');
    expect(rangeStart('ALL', now)).toBeNull();
    expect(RANGES.map((r) => r.value)).toEqual(['1M', '3M', '6M', '1Y', 'ALL']);
  });

  it('carries the last point before the range in to the range start', () => {
    const old = dayKey(addDays(new Date(), -400));
    const recent = dayKey(addDays(new Date(), -5));
    const d = makeData({ fx: FX, snapshots: [{ date: old, assetsUSD: 100, liabilitiesUSD: 0 }, { date: recent, assetsUSD: 200, liabilitiesUSD: 50 }] });
    const s = netWorthSeries(d, '1M', 'USD');
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ t: parseDay(dayKey(rangeStart('1M')!)).getTime(), value: 100 });
    expect(s[1].value).toBe(150);
  });

  it('can plot assets or liabilities alone, converted to the base currency', () => {
    const d = makeData({ fx: FX, snapshots: [{ date: '2026-01-01', assetsUSD: 100, liabilitiesUSD: 40 }] });
    expect(netWorthSeries(d, 'ALL', 'EUR', 'assets')[0].value).toBeCloseTo(90);
    expect(netWorthSeries(d, 'ALL', 'EUR', 'liabilities')[0].value).toBeCloseTo(36);
    expect(netWorthSeries(d, 'ALL', 'EUR')[0].value).toBeCloseTo(54);
  });

  it('builds a holding series the same way', () => {
    const old = dayKey(addDays(new Date(), -100));
    const h = makeHolding({ history: [{ date: old, value: 10 }, { date: dayKey(), value: 12 }] });
    expect(holdingSeries(h, '1M').map((p) => p.value)).toEqual([10, 12]);
    expect(holdingSeries(h, 'ALL').map((p) => p.value)).toEqual([10, 12]);
    expect(holdingSeries(makeHolding(), '1Y')).toEqual([]);
  });

  it('reports change between first and last points', () => {
    expect(change([])).toBeNull();
    expect(change([{ t: 0, value: 1 }])).toBeNull();
    expect(change([{ t: 0, value: 200 }, { t: 1, value: 150 }])).toEqual({ abs: -50, pct: -0.25 });
    expect(change([{ t: 0, value: -100 }, { t: 1, value: -50 }])).toEqual({ abs: 50, pct: 0.5 });
    expect(change([{ t: 0, value: 0 }, { t: 1, value: 5 }])!.pct).toBeNaN();
  });
});

describe('default categories', () => {
  it('have unique ids and cover both kinds', () => {
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.id)).size).toBe(DEFAULT_CATEGORIES.length);
    expect(DEFAULT_CATEGORIES.some((c) => c.kind === 'asset')).toBe(true);
    expect(DEFAULT_CATEGORIES.some((c) => c.kind === 'liability')).toBe(true);
    expect(DEFAULT_CATEGORIES.every((c) => c.builtIn)).toBe(true);
  });

  it('include the asset types the app supports', () => {
    const types = DEFAULT_CATEGORIES.map((c) => c.type);
    for (const t of ['cash', 'bank', 'stock', 'crypto', 'property', 'gold', 'loan', 'mortgage', 'credit_card']) expect(types).toContain(t);
  });
});
