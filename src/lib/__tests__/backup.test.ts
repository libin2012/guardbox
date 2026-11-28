import { emptyData } from '../defaults';
import { parseBackup, toBackup, useStore } from '../store';
import { makeHolding, makeProfile } from '../../test/factories';
import { resetAppState, seedStore } from '../../test/helpers';

const store = () => useStore.getState();

beforeEach(async () => {
  jest.useFakeTimers();
  await resetAppState();
});
afterEach(() => jest.useRealTimers());

function sampleData() {
  return {
    ...emptyData(),
    profile: makeProfile(),
    holdings: [makeHolding({ name: 'Flat', categoryId: 'cat-property', value: 250000 }), makeHolding({ name: 'Card', kind: 'liability' as const, categoryId: 'cat-card', value: 900 })],
    snapshots: [{ date: '2026-01-01', assetsUSD: 1, liabilitiesUSD: 0 }],
    settings: { ...emptyData().settings, baseCurrency: 'AED', finnhubKey: 'secret-finnhub', coingeckoKey: 'secret-cg', syncProvider: 'supabase' as const, lockEnabled: true },
    modifiedAt: '2026-02-02T00:00:00.000Z',
  };
}

describe('export', () => {
  it('wraps the data with app, format and export time', () => {
    const b = toBackup(sampleData());
    expect(b.app).toBe('GuardBox');
    expect(b.format).toBe(1);
    expect(Date.parse(b.exportedAt)).not.toBeNaN();
    expect(b.data.holdings).toHaveLength(2);
    expect(b.data.profile).toEqual(makeProfile());
  });

  it('keeps only the base currency from settings, never API keys or lock state', () => {
    const b = toBackup(sampleData());
    expect(b.data.settings).toEqual({ baseCurrency: 'AED' });
    const json = JSON.stringify(b);
    expect(json).not.toContain('secret-finnhub');
    expect(json).not.toContain('secret-cg');
  });
});

describe('import', () => {
  it('round-trips through JSON', () => {
    const b = toBackup(sampleData());
    expect(parseBackup(JSON.stringify(b, null, 2))).toEqual(b);
  });

  it.each([
    ['not JSON', '{oops'],
    ['another app', JSON.stringify({ app: 'Other', format: 1, data: { holdings: [] } })],
    ['a newer format', JSON.stringify({ app: 'GuardBox', format: 2, data: { holdings: [] } })],
    ['no data', JSON.stringify({ app: 'GuardBox', format: 1 })],
    ['no holdings list', JSON.stringify({ app: 'GuardBox', format: 1, data: { holdings: 'x' } })],
    ['null', 'null'],
  ])('rejects %s', (_label, text) => {
    expect(() => parseBackup(text)).toThrow();
  });

  it('explains what is wrong with a non-backup file', () => {
    expect(() => parseBackup('{}')).toThrow('This file is not a GuardBox backup.');
  });
});

describe('restore', () => {
  it('replaces holdings and keeps this device\'s settings, except the base currency', () => {
    const backup = toBackup(sampleData());
    seedStore({ settings: { ...emptyData().settings, baseCurrency: 'USD', finnhubKey: 'mine', autoLockSeconds: 300 } });
    store().restoreBackup(backup);
    const d = store().data;
    expect(d.holdings.map((h) => h.name)).toEqual(['Flat', 'Card']);
    expect(d.settings).toMatchObject({ baseCurrency: 'AED', finnhubKey: 'mine', autoLockSeconds: 300, lockEnabled: false });
    expect(d.modifiedAt).toBe('2026-02-02T00:00:00.000Z');
  });

  it('keeps the profile typed on this device', () => {
    const mine = makeProfile({ fullName: 'Local Person', email: 'local@example.com' });
    seedStore({ profile: mine });
    store().restoreBackup(toBackup(sampleData()));
    expect(store().data.profile).toEqual(mine);
  });

  it('takes the backup profile when this device has none', () => {
    store().restoreBackup(toBackup(sampleData()));
    expect(store().data.profile).toEqual(makeProfile());
  });

  it('restores older backups that have no profile', () => {
    const { profile: _p, ...noProfile } = sampleData();
    store().restoreBackup(toBackup({ ...noProfile }));
    expect(store().data.profile).toBeUndefined();
    expect(store().data.holdings).toHaveLength(2);
  });
});
