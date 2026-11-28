import AsyncStorage from '@react-native-async-storage/async-storage';
import { dayKey } from '../dates';
import { DEFAULT_CATEGORIES, emptyData } from '../defaults';
import { onDataChanged, useStore } from '../store';
import { FX, makeHolding, makeProfile } from '../../test/factories';
import { flushSave, resetAppState, savedData, seedStore, STORAGE_KEY } from '../../test/helpers';

const store = () => useStore.getState();

beforeEach(async () => {
  jest.useFakeTimers();
  await resetAppState();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('load and migration', () => {
  it('starts a fresh install with defaults and today\'s snapshot', async () => {
    await store().load();
    expect(store().ready).toBe(true);
    expect(store().data.holdings).toEqual([]);
    expect(store().data.categories).toEqual(DEFAULT_CATEGORIES);
    expect(store().data.profile).toBeUndefined();
    expect(store().data.snapshots).toEqual([{ date: dayKey(), assetsUSD: 0, liabilitiesUSD: 0 }]);
  });

  it('loads saved data', async () => {
    const h = makeHolding({ value: 42 });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), holdings: [h], profile: makeProfile() }));
    await store().load();
    expect(store().data.holdings).toHaveLength(1);
    expect(store().data.holdings[0].value).toBe(42);
    expect(store().data.profile?.email).toBe('asha@example.com');
  });

  it('fills in fields that older saves did not have', async () => {
    const { history: _history, ...old } = makeHolding({ value: 1 });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ holdings: [old], settings: { baseCurrency: 'INR' }, fx: { rates: { INR: 90 } } }));
    await store().load();
    const d = store().data;
    expect(d.holdings[0].history).toEqual([]);
    expect(d.settings.baseCurrency).toBe('INR');
    expect(d.settings.autoLockSeconds).toBe(30);
    expect(d.fx.rates.INR).toBe(90);
    expect(d.fx.rates.EUR).toBeGreaterThan(0);
    expect(d.version).toBe(1);
  });

  it('adds new built-in categories without losing custom ones', async () => {
    const custom = { id: 'cat-x', name: 'Art', kind: 'asset' as const, type: 'other_asset' as const, color: '#000', icon: 'brush' };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), categories: [DEFAULT_CATEGORIES[0], custom] }));
    await store().load();
    const ids = store().data.categories.map((c) => c.id);
    expect(ids).toContain('cat-x');
    for (const c of DEFAULT_CATEGORIES) expect(ids).toContain(c.id);
  });

  it('drops an incomplete stored profile so onboarding runs again', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), profile: { fullName: 'A B', email: 'nope', updatedAt: '' } }));
    await store().load();
    expect(store().data.profile).toBeUndefined();
  });

  it('survives corrupt storage', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await AsyncStorage.setItem(STORAGE_KEY, '{not json');
    await store().load();
    expect(store().ready).toBe(true);
    expect(store().data.holdings).toEqual([]);
    warn.mockRestore();
  });
});

describe('holdings', () => {
  beforeEach(() => seedStore({ fx: FX }));

  it('adds a holding with an id, timestamps, a first history point and a snapshot', () => {
    const id = store().addHolding({ name: 'Savings', kind: 'asset', categoryId: 'cat-bank', currency: 'EUR', mode: 'manual', value: 900 });
    const h = store().data.holdings.find((x) => x.id === id)!;
    expect(id).toMatch(/^h-/);
    expect(h.createdAt).toBe(h.updatedAt);
    expect(h.history).toEqual([{ date: dayKey(), value: 900 }]);
    expect(store().data.snapshots.at(-1)).toEqual({ date: dayKey(), assetsUSD: 1000, liabilitiesUSD: 0 });
    expect(store().data.modifiedAt).not.toBe(new Date(0).toISOString());
  });

  it('values quantity holdings when added', () => {
    const id = store().addHolding({ name: 'BTC', kind: 'asset', categoryId: 'cat-crypto', currency: 'USD', mode: 'quantity', quantity: 2, unitPrice: 100, value: 0, symbol: 'bitcoin' });
    expect(store().data.holdings.find((h) => h.id === id)!.history[0].value).toBe(200);
  });

  it('updates a holding and today\'s history point', () => {
    const id = store().addHolding({ name: 'Cash', kind: 'asset', categoryId: 'cat-cash', currency: 'USD', mode: 'manual', value: 10 });
    store().updateHolding(id, { value: 25, name: 'Wallet' });
    const h = store().data.holdings[0];
    expect(h.name).toBe('Wallet');
    expect(h.history).toEqual([{ date: dayKey(), value: 25 }]);
    expect(store().data.snapshots.at(-1)!.assetsUSD).toBe(25);
  });

  it('leaves other holdings alone on update', () => {
    const a = store().addHolding({ name: 'A', kind: 'asset', categoryId: 'cat-cash', currency: 'USD', mode: 'manual', value: 1 });
    const b = store().addHolding({ name: 'B', kind: 'asset', categoryId: 'cat-cash', currency: 'USD', mode: 'manual', value: 2 });
    const before = store().data.holdings.find((h) => h.id === b);
    store().updateHolding(a, { value: 5 });
    expect(store().data.holdings.find((h) => h.id === b)).toBe(before);
  });

  it('deletes a holding and updates the snapshot', () => {
    const id = store().addHolding({ name: 'Loan', kind: 'liability', categoryId: 'cat-loan', currency: 'USD', mode: 'manual', value: 300 });
    expect(store().data.snapshots.at(-1)!.liabilitiesUSD).toBe(300);
    store().deleteHolding(id);
    expect(store().data.holdings).toEqual([]);
    expect(store().data.snapshots.at(-1)!.liabilitiesUSD).toBe(0);
  });

  it('applies live prices without counting as a user edit', () => {
    seedStore({ fx: FX, holdings: [makeHolding({ id: 'btc', mode: 'quantity', quantity: 2, unitPrice: 10, value: 20 }), makeHolding({ id: 'cash', value: 5 })] });
    const listener = jest.fn();
    const off = onDataChanged(listener);
    const modifiedAt = store().data.modifiedAt;
    store().applyPrices({ btc: 15, cash: NaN, missing: 1 });
    off();
    const btc = store().data.holdings.find((h) => h.id === 'btc')!;
    expect(btc.unitPrice).toBe(15);
    expect(btc.value).toBe(30);
    expect(btc.priceUpdatedAt).toBeTruthy();
    expect(btc.history.at(-1)).toEqual({ date: dayKey(), value: 30 });
    expect(store().data.holdings.find((h) => h.id === 'cash')!.unitPrice).toBeUndefined();
    expect(store().data.modifiedAt).toBe(modifiedAt);
    expect(listener).not.toHaveBeenCalled();
  });

  it('does nothing when no prices apply', () => {
    const before = store().data;
    store().applyPrices({});
    expect(store().data).toBe(before);
  });
});

describe('categories', () => {
  beforeEach(() => seedStore());

  it('adds, renames and deletes a custom category', () => {
    store().addCategory({ name: 'Art', kind: 'asset', type: 'other_asset', color: '#123456', icon: 'brush-outline' });
    const cat = store().data.categories.at(-1)!;
    expect(cat.id).toMatch(/^cat-/);
    store().updateCategory(cat.id, { name: 'Paintings' });
    expect(store().data.categories.find((c) => c.id === cat.id)!.name).toBe('Paintings');
    expect(store().deleteCategory(cat.id)).toBe(true);
    expect(store().data.categories.find((c) => c.id === cat.id)).toBeUndefined();
  });

  it('refuses to delete a category that still has holdings', () => {
    seedStore({ holdings: [makeHolding({ categoryId: 'cat-cash' })] });
    expect(store().deleteCategory('cat-cash')).toBe(false);
    expect(store().data.categories.some((c) => c.id === 'cat-cash')).toBe(true);
  });
});

describe('settings, profile and FX', () => {
  beforeEach(() => seedStore());

  it('updates settings without notifying sync', () => {
    const listener = jest.fn();
    const off = onDataChanged(listener);
    store().updateSettings({ baseCurrency: 'AED', hideAmounts: true });
    off();
    expect(store().data.settings).toMatchObject({ baseCurrency: 'AED', hideAmounts: true, autoLockSeconds: 30 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('saves the profile as a user change', () => {
    const listener = jest.fn();
    const off = onDataChanged(listener);
    store().setProfile(makeProfile({ mobile: '+91 98765 43210' }));
    off();
    expect(store().data.profile?.mobile).toBe('+91 98765 43210');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('merges fresh FX rates into the known ones', () => {
    store().setFx({ rates: { USD: 1, EUR: 0.5 }, updatedAt: '2026-11-28T00:00:00.000Z' });
    expect(store().data.fx.rates.EUR).toBe(0.5);
    expect(store().data.fx.rates.INR).toBe(84);
    expect(store().data.fx.updatedAt).toBe('2026-11-28T00:00:00.000Z');
  });
});

describe('persistence', () => {
  beforeEach(() => seedStore());

  it('saves to storage after a short debounce', async () => {
    store().addHolding({ name: 'A', kind: 'asset', categoryId: 'cat-cash', currency: 'USD', mode: 'manual', value: 1 });
    expect(await savedData()).toBeNull();
    flushSave();
    expect((await savedData())!.holdings).toHaveLength(1);
  });

  it('coalesces quick edits into one write with the latest data', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    store().addHolding({ name: 'A', kind: 'asset', categoryId: 'cat-cash', currency: 'USD', mode: 'manual', value: 1 });
    store().addHolding({ name: 'B', kind: 'asset', categoryId: 'cat-cash', currency: 'USD', mode: 'manual', value: 2 });
    store().updateSettings({ baseCurrency: 'GBP' });
    flushSave();
    expect(setItem).toHaveBeenCalledTimes(1);
    const saved = (await savedData())!;
    expect(saved.holdings.map((h) => h.name)).toEqual(['A', 'B']);
    expect(saved.settings.baseCurrency).toBe('GBP');
  });

  it('reloads exactly what it saved', async () => {
    store().setProfile(makeProfile());
    store().addHolding({ name: 'Gold', kind: 'asset', categoryId: 'cat-gold', currency: 'USD', mode: 'quantity', quantity: 1, goldUnit: 'oz', unitPrice: 2000, value: 2000 });
    flushSave();
    const before = store().data;
    useStore.setState({ ready: false, data: emptyData() });
    await store().load();
    expect(store().data.holdings).toEqual(before.holdings);
    expect(store().data.profile).toEqual(before.profile);
  });
});

describe('erase all data', () => {
  it('clears wealth data but keeps the profile and turns sync off', () => {
    seedStore({
      profile: makeProfile(),
      holdings: [makeHolding({ value: 9 })],
      settings: { ...emptyData().settings, baseCurrency: 'INR', syncProvider: 'firebase', lastSyncAt: '2026-01-01', lockEnabled: true },
    });
    store().addCategory({ name: 'Art', kind: 'asset', type: 'other_asset', color: '#000', icon: 'brush' });
    store().resetAll();
    const d = store().data;
    expect(d.holdings).toEqual([]);
    expect(d.categories).toEqual(DEFAULT_CATEGORIES);
    expect(d.profile).toEqual(makeProfile());
    expect(d.settings).toMatchObject({ baseCurrency: 'INR', lockEnabled: true, syncProvider: 'none', lastSyncAt: undefined });
  });
});
