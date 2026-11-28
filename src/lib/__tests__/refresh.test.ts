import { refreshAll, refreshIfStale } from '../refresh';
import { useStore } from '../store';
import { FX, makeHolding } from '../../test/factories';
import { json, mockFetch, resetAppState, seedStore } from '../../test/helpers';

beforeEach(async () => {
  await resetAppState();
});

function feeds(opts: { fxDown?: boolean } = {}) {
  return mockFetch((url) => {
    if (url.includes('er-api') || url.includes('frankfurter')) return opts.fxDown ? json({}, 500) : json({ result: 'success', rates: { USD: 1, EUR: 0.5 } });
    if (url.includes('coingecko')) return json({ bitcoin: { usd: 100 } });
    throw new Error(url);
  });
}

describe('refreshAll', () => {
  it('updates rates first, then prices, and returns no errors', async () => {
    seedStore({ fx: FX, holdings: [makeHolding({ id: 'btc', categoryId: 'cat-crypto', mode: 'quantity', symbol: 'bitcoin', quantity: 2, currency: 'EUR' })] });
    feeds();
    expect(await refreshAll()).toEqual([]);
    const d = useStore.getState().data;
    expect(d.fx.rates.EUR).toBe(0.5);
    expect(d.fx.updatedAt).toBeTruthy();
    expect(d.holdings[0].unitPrice).toBeCloseTo(50);
    expect(d.holdings[0].value).toBeCloseTo(100);
  });

  it('still refreshes prices when exchange rates are down', async () => {
    seedStore({ fx: FX, holdings: [makeHolding({ id: 'btc', categoryId: 'cat-crypto', mode: 'quantity', symbol: 'bitcoin', quantity: 1 })] });
    feeds({ fxDown: true });
    const errors = await refreshAll();
    expect(errors).toEqual([expect.stringMatching(/^Exchange rates: /)]);
    expect(useStore.getState().data.holdings[0].unitPrice).toBe(100);
  });

  it('shares one refresh between overlapping callers', async () => {
    seedStore({ fx: FX });
    const f = feeds();
    const [a, b] = [refreshAll(), refreshAll()];
    expect(a).toBe(b);
    await a;
    expect(f).toHaveBeenCalledTimes(1);
    await refreshAll();
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('refreshIfStale', () => {
  it('skips when rates are fresh', async () => {
    seedStore({ fx: { ...FX, updatedAt: new Date().toISOString() } });
    const f = feeds();
    await refreshIfStale();
    expect(f).not.toHaveBeenCalled();
  });

  it('refreshes when rates are old or never fetched', async () => {
    seedStore({ fx: { ...FX, updatedAt: new Date(Date.now() - 2 * 3600_000).toISOString() } });
    const f = feeds();
    await refreshIfStale();
    expect(f).toHaveBeenCalled();
  });

  it('never throws', async () => {
    seedStore({ fx: FX });
    mockFetch(() => {
      throw new Error('offline');
    });
    await expect(refreshIfStale()).resolves.toBeUndefined();
  });
});
