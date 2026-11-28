import * as SecureStore from 'expo-secure-store';
import { deleteDataKey, forgetCachedKey, fromBase64, getDataKey, isSealed, openBytes, openString, randomBytes, sealBytes, sealString, toBase64, VaultError } from '../vault';
import { resetAppState } from '../../test/helpers';

const SS = SecureStore as jest.Mocked<typeof SecureStore>;
const key = () => randomBytes(32);
const AAD = 'guardbox:test';

beforeEach(async () => {
  await resetAppState();
});

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof VaultError ? e.code : `not a VaultError: ${String(e)}`;
  }
  return undefined;
}

describe('AES-256-GCM sealing', () => {
  it('round-trips text, including non-ASCII', () => {
    const k = key();
    const plain = JSON.stringify({ name: 'Flat in Dubaï ₹ 🏠', value: 250000 });
    const sealed = sealString(plain, k, AAD);
    expect(isSealed(sealed)).toBe(true);
    expect(openString(sealed, k, AAD)).toBe(plain);
  });

  it('never stores the plain text', () => {
    const sealed = sealString('my secret holding', key(), AAD);
    expect(sealed).not.toContain('secret');
    expect(atob(sealed.slice(5))).not.toContain('secret');
  });

  it('uses a fresh IV for every write, so equal data never looks equal', () => {
    const k = key();
    const a = sealBytes(new Uint8Array([1, 2, 3]), k, AAD);
    const b = sealBytes(new Uint8Array([1, 2, 3]), k, AAD);
    expect(toBase64(a.subarray(0, 12))).not.toBe(toBase64(b.subarray(0, 12)));
    expect(toBase64(a)).not.toBe(toBase64(b));
  });

  it('adds a 16-byte authentication tag after a 12-byte IV', () => {
    expect(sealBytes(new Uint8Array(10), key(), AAD)).toHaveLength(12 + 10 + 16);
  });

  it.each([0, 5, 12, 20, 33])('detects a single flipped bit at byte %i', (i) => {
    const k = key();
    const sealed = sealBytes(new Uint8Array(20).fill(7), k, AAD);
    sealed[i] ^= 0x01;
    expect(code(() => openBytes(sealed, k, AAD))).toBe('tampered');
  });

  it('detects a wrong key', () => {
    const sealed = sealString('x', key(), AAD);
    expect(code(() => openString(sealed, key(), AAD))).toBe('tampered');
  });

  it('detects data sealed for another purpose (AAD)', () => {
    const k = key();
    const sealed = sealString('x', k, 'guardbox:other');
    expect(code(() => openString(sealed, k, AAD))).toBe('tampered');
  });

  it('detects truncated data', () => {
    const k = key();
    const sealed = sealString('hello world', k, AAD);
    expect(code(() => openString(sealed.slice(0, 20), k, AAD))).toBe('tampered');
    expect(code(() => openBytes(new Uint8Array(27), k, AAD))).toBe('tampered');
  });

  it('detects data that is not valid base64', () => {
    expect(code(() => openString('gbx1.@@@not base64@@@', key(), AAD))).toBe('tampered');
  });

  it('refuses text that was never sealed', () => {
    expect(code(() => openString('{"holdings":[]}', key(), AAD))).toBe('corrupt');
  });
});

describe('base64', () => {
  it('round-trips every byte value and large buffers', () => {
    const all = new Uint8Array(256).map((_, i) => i);
    expect(fromBase64(toBase64(all))).toEqual(all);
    const big = randomBytes(200_000);
    expect(fromBase64(toBase64(big))).toEqual(big);
  });
});

describe('the data key', () => {
  it('is created once, 256 bits, in the keychain for this device only', async () => {
    const k = await getDataKey(true);
    expect(k).toHaveLength(32);
    expect(SS.setItemAsync).toHaveBeenCalledWith('guardbox.datakey.v1', expect.stringMatching(/^[0-9a-f]{64}$/), { keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' });
    forgetCachedKey();
    expect(await getDataKey(true)).toEqual(k);
    expect(SS.setItemAsync).toHaveBeenCalledTimes(1);
  });

  it('is random per install', async () => {
    const a = await getDataKey(true);
    await deleteDataKey();
    const b = await getDataKey(true);
    expect(toBase64(a!)).not.toBe(toBase64(b!));
  });

  it('is not created when only reading', async () => {
    expect(await getDataKey(false)).toBeNull();
    expect(SS.setItemAsync).not.toHaveBeenCalled();
  });

  it('stays in memory after the first read', async () => {
    await getDataKey(true);
    SS.getItemAsync.mockClear();
    await getDataKey(false);
    expect(SS.getItemAsync).not.toHaveBeenCalled();
  });

  it('reports a damaged key instead of replacing it', async () => {
    await SS.setItemAsync('guardbox.datakey.v1', 'not-a-key');
    await expect(getDataKey(true)).rejects.toMatchObject({ code: 'key-missing' });
    expect(await SS.getItemAsync('guardbox.datakey.v1')).toBe('not-a-key');
  });

  it('reports a keychain that cannot be read or written', async () => {
    SS.getItemAsync.mockRejectedValueOnce(new Error('locked'));
    await expect(getDataKey(true)).rejects.toMatchObject({ code: 'unavailable' });
    SS.setItemAsync.mockRejectedValueOnce(new Error('full'));
    await expect(getDataKey(true)).rejects.toMatchObject({ code: 'unavailable' });
  });
});
