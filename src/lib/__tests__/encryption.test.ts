/** Encryption at rest of the app's saved data (see vault.ts). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { emptyData } from '../defaults';
import { useStore } from '../store';
import { forgetCachedKey, getDataKey, sealString } from '../vault';
import { makeHolding, makeProfile } from '../../test/factories';
import { flushSave, resetAppState, savedData, seedStore, STORAGE_KEY, storedText } from '../../test/helpers';

const SS = SecureStore as jest.Mocked<typeof SecureStore>;
const store = () => useStore.getState();
const KEY_NAME = 'guardbox.datakey.v1';
let warn: jest.SpyInstance;

beforeEach(async () => {
  jest.useFakeTimers();
  await resetAppState();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  warn.mockRestore();
});

const addSavings = () => store().addHolding({ name: 'Emergency savings', kind: 'asset', categoryId: 'cat-bank', currency: 'USD', mode: 'manual', value: 12345 });

/** Simulate quitting and reopening the app: memory is cleared, the disk and keychain stay. */
async function relaunch() {
  useStore.setState({ ready: false, data: emptyData(), storageError: undefined });
  forgetCachedKey();
  await store().load();
}

describe('saving', () => {
  it('writes only ciphertext: no names, amounts, emails or API keys on disk', async () => {
    seedStore({ profile: makeProfile(), settings: { ...emptyData().settings, finnhubKey: 'fh-secret-key' } });
    addSavings();
    flushSave();
    const raw = (await storedText())!;
    expect(raw.startsWith('gbx1.')).toBe(true);
    for (const s of ['Emergency savings', '12345', 'asha@example.com', 'Asha', 'fh-secret-key', 'holdings']) expect(raw).not.toContain(s);
    expect((await savedData())!.holdings[0].name).toBe('Emergency savings');
  });

  it('writes different ciphertext each time, even for the same data', async () => {
    seedStore();
    store().updateSettings({ hideAmounts: true });
    flushSave();
    const first = await storedText();
    store().updateSettings({ hideAmounts: true });
    flushSave();
    expect(await storedText()).not.toBe(first);
  });

  it('reopens what it saved after a relaunch', async () => {
    seedStore({ profile: makeProfile() });
    addSavings();
    flushSave();
    await storedText();
    await relaunch();
    expect(store().storageError).toBeUndefined();
    expect(store().data.holdings[0].value).toBe(12345);
    expect(store().data.profile?.email).toBe('asha@example.com');
  });

  it('creates the key on first launch', async () => {
    await store().load();
    expect(await SS.getItemAsync(KEY_NAME)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('upgrading from plain-text storage', () => {
  const legacy = () => ({ ...emptyData(), profile: makeProfile(), holdings: [makeHolding({ name: 'Old flat', value: 99 })], modifiedAt: '2026-03-03T00:00:00.000Z' });

  it('encrypts existing data on first launch without losing anything', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(legacy()));
    await store().load();
    expect(store().data.holdings[0].name).toBe('Old flat');
    const raw = (await AsyncStorage.getItem(STORAGE_KEY))!;
    expect(raw.startsWith('gbx1.')).toBe(true);
    expect(raw).not.toContain('Old flat');
    await relaunch();
    expect(store().data.holdings[0]).toMatchObject({ name: 'Old flat', value: 99 });
    expect(store().data.profile).toEqual(makeProfile());
    expect(store().data.modifiedAt).toBe('2026-03-03T00:00:00.000Z');
  });

  it('keeps the plain-text copy if the encrypted write fails, and tries again on the next save', async () => {
    const plain = JSON.stringify(legacy());
    await AsyncStorage.setItem(STORAGE_KEY, plain);
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await store().load();
    expect(store().data.holdings[0].name).toBe('Old flat');
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(plain);
    addSavings();
    flushSave();
    expect((await storedText())!.startsWith('gbx1.')).toBe(true);
    expect((await savedData())!.holdings.map((h) => h.name)).toEqual(['Old flat', 'Emergency savings']);
  });
});

describe('failing safely', () => {
  async function saveSomething() {
    seedStore({ profile: makeProfile() });
    addSavings();
    flushSave();
    return (await storedText())!;
  }

  it('refuses tampered data, says so, and never overwrites it', async () => {
    const raw = await saveSomething();
    // flip one character in the middle of the ciphertext
    const i = Math.floor(raw.length / 2);
    const tampered = raw.slice(0, i) + (raw[i] === 'A' ? 'B' : 'A') + raw.slice(i + 1);
    await AsyncStorage.setItem(STORAGE_KEY, tampered);
    await relaunch();
    expect(store().ready).toBe(true);
    expect(store().storageError).toBe('tampered');
    expect(store().data.holdings).toEqual([]);
    // later edits (or background price refreshes) must not replace the evidence
    addSavings();
    store().applyPrices({});
    flushSave();
    expect(await storedText()).toBe(tampered);
  });

  it('refuses data encrypted with another key', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, sealString(JSON.stringify(emptyData()), new Uint8Array(32).fill(1), 'guardbox:data:v1'));
    await getDataKey(true);
    forgetCachedKey();
    await store().load();
    expect(store().storageError).toBe('tampered');
  });

  it('reports a missing key and does not make a new one over the old data', async () => {
    const raw = await saveSomething();
    await SS.deleteItemAsync(KEY_NAME);
    await relaunch();
    expect(store().storageError).toBe('key-missing');
    expect(await SS.getItemAsync(KEY_NAME)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it('reports unreadable plain text as damaged instead of starting over silently', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '{not json');
    await store().load();
    expect(store().storageError).toBe('corrupt');
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('{not json');
  });

  it('reports a keychain that does not answer, and opens on retry', async () => {
    await saveSomething();
    forgetCachedKey();
    useStore.setState({ ready: false, data: emptyData() });
    SS.getItemAsync.mockRejectedValueOnce(new Error('interaction not allowed'));
    await store().load();
    expect(store().storageError).toBe('unavailable');
    await store().load();
    expect(store().storageError).toBeUndefined();
    expect(store().data.holdings[0].name).toBe('Emergency savings');
  });

  it('erasing unreadable data removes it and its key, then starts fresh', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'gbx1.AAAA');
    await getDataKey(true);
    forgetCachedKey();
    await store().load();
    expect(store().storageError).toBe('tampered');
    await store().eraseUnreadableData();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
    await store().load();
    expect(store().storageError).toBeUndefined();
    addSavings();
    flushSave();
    expect((await savedData())!.holdings).toHaveLength(1);
  });
});
