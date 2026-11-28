import { DEFAULT_SETTINGS } from '../defaults';
import { fetchCryptoUSD, fetchFxRates, fetchGoldUSDPerOz, fetchStock, LIVE_PRICE_TYPES, refreshPrices, searchCoins, supportsLivePrice } from '../prices';
import { Holding, HoldingType } from '../types';
import { FX, makeHolding } from '../../test/factories';
import { json, mockFetch, text } from '../../test/helpers';

const STOOQ_HEADER = 'Symbol,Date,Time,Open,High,Low,Close,Volume';
const stooq = (close: string) => text(`${STOOQ_HEADER}\nX,2026-11-27,22:00:00,1,1,1,${close},100\n`);

describe('exchange rates', () => {
  it('uses open.er-api.com first', async () => {
    const f = mockFetch(() => json({ result: 'success', rates: { USD: 1, EUR: 0.93 } }));
    const fx = await fetchFxRates();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toContain('open.er-api.com');
    expect(fx.rates.EUR).toBe(0.93);
    expect(Date.parse(fx.updatedAt!)).not.toBeNaN();
  });

  it('falls back to Frankfurter and adds USD', async () => {
    const f = mockFetch((url) => (url.includes('er-api') ? json({}, 500) : json({ rates: { EUR: 0.95 } })));
    const fx = await fetchFxRates();
    expect(f.mock.calls[1][0]).toContain('frankfurter');
    expect(fx.rates).toEqual({ EUR: 0.95, USD: 1 });
  });

  it('falls back when the first feed answers without rates', async () => {
    mockFetch((url) => (url.includes('er-api') ? json({ result: 'error' }) : json({ rates: { GBP: 0.8 } })));
    expect((await fetchFxRates()).rates.GBP).toBe(0.8);
  });

  it('fails when both feeds fail', async () => {
    mockFetch(() => json({}, 503));
    await expect(fetchFxRates()).rejects.toThrow('HTTP 503 from api.frankfurter.app');
  });
});

describe('crypto', () => {
  it('fetches unique coin ids in one call and ignores missing prices', async () => {
    const f = mockFetch(() => json({ bitcoin: { usd: 60000 }, ethereum: { usd: 3000 }, junk: {} }));
    const r = await fetchCryptoUSD(['bitcoin', 'ethereum', 'bitcoin', 'junk'], {});
    expect(r).toEqual({ bitcoin: 60000, ethereum: 3000 });
    expect(f).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(f.mock.calls[0][0])).toContain('ids=bitcoin,ethereum,junk');
  });

  it('makes no call for an empty list', async () => {
    const f = mockFetch(() => json({}));
    expect(await fetchCryptoUSD([], {})).toEqual({});
    expect(f).not.toHaveBeenCalled();
  });

  it('sends the optional CoinGecko demo key', async () => {
    const f = mockFetch(() => json({ bitcoin: { usd: 1 } }));
    await fetchCryptoUSD(['bitcoin'], { coingeckoKey: 'demo' });
    expect((f.mock.calls[0][1]!.headers as Record<string, string>)['x-cg-demo-api-key']).toBe('demo');
  });

  it('searches coins and caps the list', async () => {
    const coins = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, name: `Coin ${i}`, symbol: `C${i}` }));
    const f = mockFetch(() => json({ coins }));
    const r = await searchCoins('  bit ', {});
    expect(r).toHaveLength(15);
    expect(f.mock.calls[0][0]).toContain('query=bit');
    expect(await searchCoins('   ', {})).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('gold', () => {
  it('uses gold-api.com first', async () => {
    mockFetch(() => json({ price: 2400 }));
    expect(await fetchGoldUSDPerOz({})).toBe(2400);
  });

  it('falls back to PAX Gold on CoinGecko', async () => {
    mockFetch((url) => (url.includes('gold-api') ? json({}, 500) : json({ 'pax-gold': { usd: 2390 } })));
    expect(await fetchGoldUSDPerOz({})).toBe(2390);
  });

  it('fails clearly when neither feed has a price', async () => {
    mockFetch((url) => (url.includes('gold-api') ? json({ price: 0 }) : json({})));
    await expect(fetchGoldUSDPerOz({})).rejects.toThrow('Gold price unavailable');
  });
});

describe('stocks', () => {
  it('quotes US tickers from Stooq in USD', async () => {
    const f = mockFetch(() => stooq('231.5'));
    expect(await fetchStock('aapl', {})).toEqual({ price: 231.5, currency: 'USD' });
    expect(f.mock.calls[0][0]).toContain('s=aapl.us');
  });

  it('converts London pence quotes to pounds', async () => {
    mockFetch(() => stooq('7250'));
    expect(await fetchStock('VOD.UK', {})).toEqual({ price: 72.5, currency: 'GBP' });
  });

  it('uses the market currency for other exchanges', async () => {
    mockFetch(() => stooq('180'));
    expect(await fetchStock('SAP.DE', {})).toEqual({ price: 180, currency: 'EUR' });
  });

  it('reports unknown tickers', async () => {
    mockFetch(() => text(`${STOOQ_HEADER}\nNOPE.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D\n`));
    await expect(fetchStock('nope', {})).rejects.toThrow('No quote for NOPE');
  });

  it('prefers Finnhub for US tickers when a key is set', async () => {
    const f = mockFetch(() => json({ c: 230 }));
    expect(await fetchStock('AAPL.US', { finnhubKey: 'k' })).toEqual({ price: 230, currency: 'USD' });
    expect(f.mock.calls[0][0]).toContain('finnhub.io');
    expect(f.mock.calls[0][0]).toContain('symbol=AAPL&');
  });

  it('falls back to Stooq when Finnhub has no quote', async () => {
    const f = mockFetch((url) => (url.includes('finnhub') ? json({ c: 0 }) : stooq('229')));
    expect((await fetchStock('AAPL', { finnhubKey: 'k' })).price).toBe(229);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('never sends non-US tickers to Finnhub', async () => {
    const f = mockFetch(() => stooq('10'));
    await fetchStock('VOD.UK', { finnhubKey: 'k' });
    expect(f.mock.calls.every(([u]) => !u.includes('finnhub'))).toBe(true);
  });
});

describe('refreshPrices', () => {
  const types: Record<string, HoldingType> = { 'cat-crypto': 'crypto', 'cat-gold': 'gold', 'cat-stock': 'stock', 'cat-cash': 'cash' };
  const typeOf = (h: Holding) => types[h.categoryId];

  it('lists which types have live prices', () => {
    expect(LIVE_PRICE_TYPES).toEqual(['stock', 'crypto', 'gold']);
    expect(supportsLivePrice('crypto')).toBe(true);
    expect(supportsLivePrice('property')).toBe(false);
  });

  it('prices crypto, gold (oz and g) and stocks in each holding\'s currency', async () => {
    mockFetch((url) => {
      if (url.includes('coingecko')) return json({ bitcoin: { usd: 50000 } });
      if (url.includes('gold-api')) return json({ price: 3110.34768 });
      if (url.includes('stooq')) return stooq('100');
      throw new Error(url);
    });
    const holdings = [
      makeHolding({ id: 'btc', categoryId: 'cat-crypto', mode: 'quantity', symbol: 'bitcoin', currency: 'EUR', quantity: 1 }),
      makeHolding({ id: 'oz', categoryId: 'cat-gold', mode: 'quantity', goldUnit: 'oz', currency: 'USD', quantity: 1 }),
      makeHolding({ id: 'g', categoryId: 'cat-gold', mode: 'quantity', goldUnit: 'g', currency: 'INR', quantity: 10 }),
      makeHolding({ id: 'aapl', categoryId: 'cat-stock', mode: 'quantity', symbol: 'AAPL', currency: 'GBP', quantity: 1 }),
    ];
    const r = await refreshPrices(holdings, typeOf, DEFAULT_SETTINGS, FX);
    expect(r.errors).toEqual([]);
    expect(r.prices.btc).toBeCloseTo(45000);
    expect(r.prices.oz).toBeCloseTo(3110.34768);
    expect(r.prices.g).toBeCloseTo(100 * 84);
    expect(r.prices.aapl).toBeCloseTo(80);
  });

  it('skips manual holdings, auto-price turned off, and cash', async () => {
    const f = mockFetch(() => json({}));
    const r = await refreshPrices(
      [
        makeHolding({ categoryId: 'cat-crypto', mode: 'manual', symbol: 'bitcoin' }),
        makeHolding({ categoryId: 'cat-crypto', mode: 'quantity', symbol: 'bitcoin', autoPrice: false }),
        makeHolding({ categoryId: 'cat-cash', mode: 'quantity' }),
      ],
      typeOf,
      DEFAULT_SETTINGS,
      FX,
    );
    expect(r).toEqual({ prices: {}, errors: [] });
    expect(f).not.toHaveBeenCalled();
  });

  it('keeps going when one feed fails and reports each problem', async () => {
    mockFetch((url) => {
      if (url.includes('coingecko')) return json({ bitcoin: { usd: 1 } });
      if (url.includes('gold-api')) return json({}, 500);
      if (url.includes('stooq')) return stooq('N/D');
      throw new Error(url);
    });
    const r = await refreshPrices(
      [
        makeHolding({ id: 'btc', name: 'BTC', categoryId: 'cat-crypto', mode: 'quantity', symbol: 'bitcoin' }),
        makeHolding({ id: 'bad', name: 'Mystery', categoryId: 'cat-crypto', mode: 'quantity', symbol: 'not-a-coin' }),
        makeHolding({ id: 'gold', categoryId: 'cat-gold', mode: 'quantity' }),
        makeHolding({ id: 'zzz', name: 'ZZZ', categoryId: 'cat-stock', mode: 'quantity', symbol: 'ZZZ' }),
      ],
      typeOf,
      DEFAULT_SETTINGS,
      FX,
    );
    expect(Object.keys(r.prices)).toEqual(['btc']);
    expect(r.errors).toEqual(expect.arrayContaining(['Mystery: unknown coin id "not-a-coin"', 'Gold: Gold price unavailable', 'ZZZ: No quote for ZZZ']));
  });

  it('reports a crypto outage once', async () => {
    mockFetch(() => json({}, 429));
    const r = await refreshPrices([makeHolding({ categoryId: 'cat-crypto', mode: 'quantity', symbol: 'bitcoin' })], typeOf, DEFAULT_SETTINGS, FX);
    expect(r.errors).toEqual(['Crypto: HTTP 429 from api.coingecko.com']);
  });
});
