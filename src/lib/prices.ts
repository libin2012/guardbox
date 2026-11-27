/**
 * Free price feeds. Every provider here is free of charge:
 *  - Crypto: CoinGecko public API (no key needed; an optional free "demo" key raises limits)
 *  - Gold:   gold-api.com (free, no key), falling back to CoinGecko PAX Gold (1 token = 1 troy oz)
 *  - Stocks: Stooq quotes (free, no key, global exchanges), or Finnhub if the user adds a free key
 *  - FX:     open.er-api.com (free, no key), falling back to Frankfurter (ECB rates)
 * Property, vehicles, cash, bank and debts stay manual: there is no free, reliable feed for them.
 */
import { GRAMS_PER_TROY_OZ, holdingValue } from './calc';
import { convert } from './money';
import { FxRates, Holding, HoldingType, Settings } from './types';

const TIMEOUT_MS = 12000;

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

async function getText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// ---------- FX ----------

export async function fetchFxRates(): Promise<FxRates> {
  try {
    const r = await getJson<{ result: string; rates: Record<string, number> }>('https://open.er-api.com/v6/latest/USD');
    if (r.result === 'success' && r.rates?.USD) return { rates: r.rates, updatedAt: new Date().toISOString() };
  } catch {
    // fall through
  }
  const f = await getJson<{ rates: Record<string, number> }>('https://api.frankfurter.app/latest?from=USD');
  return { rates: { ...f.rates, USD: 1 }, updatedAt: new Date().toISOString() };
}

// ---------- Crypto ----------

function cgHeaders(settings: Pick<Settings, 'coingeckoKey'>): Record<string, string> {
  return settings.coingeckoKey ? { 'x-cg-demo-api-key': settings.coingeckoKey } : {};
}

export interface CoinResult {
  id: string;
  name: string;
  symbol: string;
  thumb?: string;
}

export async function searchCoins(query: string, settings: Pick<Settings, 'coingeckoKey'>): Promise<CoinResult[]> {
  const q = query.trim();
  if (!q) return [];
  const r = await getJson<{ coins: CoinResult[] }>(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`,
    cgHeaders(settings),
  );
  return (r.coins ?? []).slice(0, 15);
}

export async function fetchCryptoUSD(ids: string[], settings: Pick<Settings, 'coingeckoKey'>): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const unique = [...new Set(ids)].join(',');
  const r = await getJson<Record<string, { usd?: number }>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(unique)}&vs_currencies=usd`,
    cgHeaders(settings),
  );
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(r)) if (typeof v.usd === 'number') out[id] = v.usd;
  return out;
}

// ---------- Gold ----------

/** USD per troy ounce. */
export async function fetchGoldUSDPerOz(settings: Pick<Settings, 'coingeckoKey'>): Promise<number> {
  try {
    const r = await getJson<{ price?: number }>('https://api.gold-api.com/price/XAU');
    if (typeof r.price === 'number' && r.price > 0) return r.price;
  } catch {
    // fall through
  }
  const cg = await fetchCryptoUSD(['pax-gold'], settings);
  if (!cg['pax-gold']) throw new Error('Gold price unavailable');
  return cg['pax-gold'];
}

// ---------- Stocks ----------

/** Currency a Stooq market suffix is quoted in. GBX = pence. */
const STOOQ_SUFFIX_CCY: Record<string, string> = {
  us: 'USD', uk: 'GBX', de: 'EUR', fr: 'EUR', nl: 'EUR', es: 'EUR', it: 'EUR', jp: 'JPY',
  hk: 'HKD', pl: 'PLN', hu: 'HUF', ch: 'CHF', ca: 'CAD',
};

/** Normalise user input like "AAPL" or "VOD.UK" into a Stooq symbol. */
export function stooqSymbol(input: string): string {
  const s = input.trim().toLowerCase();
  return s.includes('.') ? s : `${s}.us`;
}

export function stockQuoteCurrency(input: string): string {
  const suffix = stooqSymbol(input).split('.').pop() ?? 'us';
  return STOOQ_SUFFIX_CCY[suffix] ?? 'USD';
}

/** Parse Stooq's CSV quote response: Symbol,Date,Time,Open,High,Low,Close,Volume */
export function parseStooqCsv(csv: string): number | null {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const row = lines[1].split(',');
  const close = row[header.indexOf('close')];
  const n = Number(close);
  return close && close !== 'N/D' && Number.isFinite(n) ? n : null;
}

async function fetchStooq(symbol: string): Promise<{ price: number; currency: string }> {
  const sym = stooqSymbol(symbol);
  const csv = await getText(`https://stooq.com/q/l/?s=${encodeURIComponent(sym)}&f=sd2t2ohlcv&h&e=csv`);
  const p = parseStooqCsv(csv);
  if (p == null) throw new Error(`No quote for ${symbol.toUpperCase()}`);
  const ccy = stockQuoteCurrency(symbol);
  return ccy === 'GBX' ? { price: p / 100, currency: 'GBP' } : { price: p, currency: ccy };
}

async function fetchFinnhub(symbol: string, key: string): Promise<{ price: number; currency: string }> {
  const sym = symbol.trim().toUpperCase().replace(/\.US$/, '');
  const r = await getJson<{ c?: number }>(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(key)}`);
  if (!r.c) throw new Error(`No quote for ${sym}`);
  return { price: r.c, currency: 'USD' };
}

export async function fetchStock(symbol: string, settings: Pick<Settings, 'finnhubKey'>): Promise<{ price: number; currency: string }> {
  const isUS = stockQuoteCurrency(symbol) === 'USD';
  if (settings.finnhubKey && isUS) {
    try {
      return await fetchFinnhub(symbol, settings.finnhubKey);
    } catch {
      // fall back to Stooq
    }
  }
  return fetchStooq(symbol);
}

// ---------- Refresh all ----------

export const LIVE_PRICE_TYPES: HoldingType[] = ['stock', 'crypto', 'gold'];

export function supportsLivePrice(type: HoldingType): boolean {
  return LIVE_PRICE_TYPES.includes(type);
}

export interface RefreshResult {
  /** new unit price per holding id, in the holding's currency */
  prices: Record<string, number>;
  errors: string[];
}

export async function refreshPrices(
  holdings: Holding[],
  typeOf: (h: Holding) => HoldingType | undefined,
  settings: Settings,
  fx: FxRates,
): Promise<RefreshResult> {
  const live = holdings.filter((h) => h.mode === 'quantity' && h.autoPrice !== false && (h.symbol || typeOf(h) === 'gold'));
  const prices: Record<string, number> = {};
  const errors: string[] = [];

  const crypto = live.filter((h) => typeOf(h) === 'crypto' && h.symbol);
  if (crypto.length) {
    try {
      const usd = await fetchCryptoUSD(crypto.map((h) => h.symbol!), settings);
      for (const h of crypto) {
        const p = usd[h.symbol!];
        if (p != null) prices[h.id] = convert(p, 'USD', h.currency, fx);
        else errors.push(`${h.name}: unknown coin id "${h.symbol}"`);
      }
    } catch (e) {
      errors.push(`Crypto: ${(e as Error).message}`);
    }
  }

  const gold = live.filter((h) => typeOf(h) === 'gold');
  if (gold.length) {
    try {
      const perOz = await fetchGoldUSDPerOz(settings);
      for (const h of gold) {
        const perUnit = h.goldUnit === 'g' ? perOz / GRAMS_PER_TROY_OZ : perOz;
        prices[h.id] = convert(perUnit, 'USD', h.currency, fx);
      }
    } catch (e) {
      errors.push(`Gold: ${(e as Error).message}`);
    }
  }

  const stocks = live.filter((h) => typeOf(h) === 'stock' && h.symbol);
  await Promise.all(
    stocks.map(async (h) => {
      try {
        const q = await fetchStock(h.symbol!, settings);
        prices[h.id] = convert(q.price, q.currency, h.currency, fx);
      } catch (e) {
        errors.push(`${h.name}: ${(e as Error).message}`);
      }
    }),
  );

  return { prices, errors };
}

export { holdingValue };
