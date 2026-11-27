import { addDays, dayKey, parseDay } from './dates';
import { convert } from './money';
import { AppData, Category, FxRates, Holding, Snapshot, ValuePoint } from './types';

export const GRAMS_PER_TROY_OZ = 31.1034768;

export function holdingValue(h: Holding): number {
  if (h.mode === 'quantity' && h.quantity != null && h.unitPrice != null) {
    return h.quantity * h.unitPrice;
  }
  return h.value;
}

export interface Totals {
  assets: number;
  liabilities: number;
  netWorth: number;
}

export function totals(holdings: Holding[], base: string, fx: FxRates): Totals {
  let assets = 0;
  let liabilities = 0;
  for (const h of holdings) {
    const v = convert(holdingValue(h), h.currency, base, fx);
    if (h.kind === 'asset') assets += v;
    else liabilities += v;
  }
  return { assets, liabilities, netWorth: assets - liabilities };
}

export interface Slice {
  category: Category;
  value: number;
  share: number;
  count: number;
}

export function breakdown(data: Pick<AppData, 'holdings' | 'categories' | 'fx'>, kind: 'asset' | 'liability', base: string): Slice[] {
  const sums = new Map<string, { value: number; count: number }>();
  for (const h of data.holdings) {
    if (h.kind !== kind) continue;
    const v = convert(holdingValue(h), h.currency, base, data.fx);
    const s = sums.get(h.categoryId) ?? { value: 0, count: 0 };
    s.value += v;
    s.count += 1;
    sums.set(h.categoryId, s);
  }
  const total = [...sums.values()].reduce((a, b) => a + b.value, 0);
  const out: Slice[] = [];
  for (const [id, s] of sums) {
    const category = data.categories.find((c) => c.id === id);
    if (!category) continue;
    out.push({ category, value: s.value, count: s.count, share: total > 0 ? s.value / total : 0 });
  }
  return out.sort((a, b) => b.value - a.value);
}

/** Record or replace today's value in a holding's history. */
export function withHistoryPoint(history: ValuePoint[], value: number, date = dayKey()): ValuePoint[] {
  const rest = history.filter((p) => p.date !== date);
  rest.push({ date, value });
  rest.sort((a, b) => a.date.localeCompare(b.date));
  return rest;
}

/** Record or replace today's net-worth snapshot (stored in USD). */
export function withSnapshot(data: AppData, date = dayKey()): Snapshot[] {
  const t = totals(data.holdings, 'USD', data.fx);
  const rest = data.snapshots.filter((s) => s.date !== date);
  rest.push({ date, assetsUSD: t.assets, liabilitiesUSD: t.liabilities });
  rest.sort((a, b) => a.date.localeCompare(b.date));
  return rest;
}

export type Range = '1M' | '3M' | '6M' | '1Y' | 'ALL';

export function rangeStart(range: Range, now = new Date()): Date | null {
  switch (range) {
    case '1M': return addDays(now, -30);
    case '3M': return addDays(now, -91);
    case '6M': return addDays(now, -182);
    case '1Y': return addDays(now, -365);
    default: return null;
  }
}

export interface SeriesPoint {
  t: number; // ms timestamp
  value: number;
}

/** Net-worth series in the base currency, filtered to a range. */
export function netWorthSeries(data: AppData, range: Range, base: string, field: 'net' | 'assets' | 'liabilities' = 'net'): SeriesPoint[] {
  const start = rangeStart(range);
  const startKey = start ? dayKey(start) : '';
  const snaps = data.snapshots.filter((s) => s.date >= startKey);
  // carry the last snapshot before the range in, so the line starts at the left edge
  const before = data.snapshots.filter((s) => s.date < startKey).pop();
  if (before && start) snaps.unshift({ ...before, date: dayKey(start) });
  return snaps.map((s) => {
    const a = convert(s.assetsUSD, 'USD', base, data.fx);
    const l = convert(s.liabilitiesUSD, 'USD', base, data.fx);
    return { t: parseDay(s.date).getTime(), value: field === 'net' ? a - l : field === 'assets' ? a : l };
  });
}

export function holdingSeries(h: Holding, range: Range): SeriesPoint[] {
  const start = rangeStart(range);
  const startKey = start ? dayKey(start) : '';
  const pts = h.history.filter((p) => p.date >= startKey);
  const before = h.history.filter((p) => p.date < startKey).pop();
  if (before && start) pts.unshift({ ...before, date: dayKey(start) });
  return pts.map((p) => ({ t: parseDay(p.date).getTime(), value: p.value }));
}

export function change(series: SeriesPoint[]): { abs: number; pct: number } | null {
  if (series.length < 2) return null;
  const first = series[0].value;
  const last = series[series.length - 1].value;
  return { abs: last - first, pct: first !== 0 ? (last - first) / Math.abs(first) : NaN };
}

export const RANGES: { value: Range; label: string }[] = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
  { value: 'ALL', label: 'All' },
];
