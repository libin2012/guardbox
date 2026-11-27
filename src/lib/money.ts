import { FxRates } from './types';

/** Convert an amount between ISO currencies using USD-based rates. */
export function convert(amount: number, from: string, to: string, fx: FxRates): number {
  if (from === to || !Number.isFinite(amount)) return amount;
  const rf = fx.rates[from];
  const rt = fx.rates[to];
  if (!rf || !rt) return amount; // unknown currency: leave unconverted rather than zero it
  return (amount / rf) * rt;
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number, currency: string, opts: { compact?: boolean; hidden?: boolean } = {}): string {
  if (opts.hidden) return '••••••';
  // whole units for large amounts keeps lists tidy; cents for small ones
  const decimals = opts.compact ? 1 : Math.abs(amount) >= 1000 ? 0 : 2;
  const key = `${currency}|${opts.compact ? 1 : 0}|${decimals}`;
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        notation: opts.compact ? 'compact' : 'standard',
        maximumFractionDigits: decimals,
        minimumFractionDigits: opts.compact ? 0 : decimals,
      });
    } catch {
      f = new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals });
    }
    formatters.set(key, f);
  }
  return f.format(amount);
}

export function formatPercent(p: number): string {
  if (!Number.isFinite(p)) return '–';
  const sign = p > 0 ? '+' : '';
  return `${sign}${(p * 100).toFixed(1)}%`;
}

/** Parse a user-entered number, accepting "1,234.5" and "1234,5". */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/\s/g, '');
  if (!t) return null;
  let norm = t;
  if (t.includes(',') && t.includes('.')) norm = t.replace(/,/g, '');
  else if (t.includes(',')) norm = /,\d{1,2}$/.test(t) && (t.match(/,/g) ?? []).length === 1 ? t.replace(',', '.') : t.replace(/,/g, '');
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}
