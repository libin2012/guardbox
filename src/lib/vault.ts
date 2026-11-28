/**
 * Encryption at rest for everything GuardBox writes to the device.
 *
 * - AES-256-GCM (authenticated encryption): reading fails if a single byte of
 *   the saved data was changed, so tampering is detected rather than loaded.
 * - The 256-bit key is random per install and kept in the iOS Keychain
 *   (WHEN_UNLOCKED_THIS_DEVICE_ONLY, via expo-secure-store). It never leaves the
 *   keychain except into memory while the app runs, and is never in backups.
 * - A fresh random 96-bit IV for every write.
 *
 * The cipher comes from @noble/ciphers (audited, pure TypeScript, no native code).
 */
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, bytesToUtf8, concatBytes, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils.js';
import * as Crypto from 'expo-crypto';
import { secureDelete, secureGet, secureSet } from './security';

const KEY_NAME = 'guardbox.datakey.v1';
const PREFIX = 'gbx1.';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export type VaultErrorCode = 'tampered' | 'key-missing' | 'corrupt' | 'unavailable';

/** A reason the saved data could not be opened. The UI explains each one. */
export class VaultError extends Error {
  constructor(public code: VaultErrorCode, message: string) {
    super(message);
    this.name = 'VaultError';
  }
}

export function randomBytes(n: number): Uint8Array {
  return new Uint8Array(Crypto.getRandomBytes(n));
}

// Hermes and Node both provide btoa/atob; chunked so large payloads do not overflow the stack.
export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x1000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x1000));
  return btoa(bin);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encrypt a string with AES-256-GCM. `aad` binds the ciphertext to its purpose. */
export function sealBytes(plain: Uint8Array, key: Uint8Array, aad: string): Uint8Array {
  const iv = randomBytes(IV_BYTES);
  return concatBytes(iv, gcm(key, iv, utf8ToBytes(aad)).encrypt(plain));
}

/** Decrypt and authenticate. Throws VaultError('tampered') if anything was changed. */
export function openBytes(sealed: Uint8Array, key: Uint8Array, aad: string): Uint8Array {
  if (sealed.length < IV_BYTES + 16) throw new VaultError('tampered', 'The saved data is incomplete.');
  try {
    return gcm(key, sealed.subarray(0, IV_BYTES), utf8ToBytes(aad)).decrypt(sealed.subarray(IV_BYTES));
  } catch {
    throw new VaultError('tampered', 'The saved data failed its integrity check.');
  }
}

export function isSealed(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function sealString(plain: string, key: Uint8Array, aad: string): string {
  return PREFIX + toBase64(sealBytes(utf8ToBytes(plain), key, aad));
}

export function openString(stored: string, key: Uint8Array, aad: string): string {
  if (!isSealed(stored)) throw new VaultError('corrupt', 'The saved data is not in a format GuardBox recognises.');
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(stored.slice(PREFIX.length));
  } catch {
    throw new VaultError('tampered', 'The saved data failed its integrity check.');
  }
  return bytesToUtf8(openBytes(bytes, key, aad));
}

let cachedKey: Uint8Array | null = null;

/**
 * The per-install data key. With `create`, a new random key is made when none
 * exists. Callers must only create one when there is no encrypted data yet,
 * otherwise that data could never be opened again.
 */
export async function getDataKey(create: boolean): Promise<Uint8Array | null> {
  if (cachedKey) return cachedKey;
  let stored: string | null;
  try {
    stored = await secureGet(KEY_NAME);
  } catch (e) {
    throw new VaultError('unavailable', `The iOS Keychain could not be read (${(e as Error).message}).`);
  }
  if (stored != null) {
    if (!/^[0-9a-f]{64}$/.test(stored)) throw new VaultError('key-missing', 'The encryption key on this device is damaged.');
    cachedKey = hexToBytes(stored);
    return cachedKey;
  }
  if (!create) return null;
  const key = randomBytes(KEY_BYTES);
  try {
    await secureSet(KEY_NAME, bytesToHex(key));
  } catch (e) {
    throw new VaultError('unavailable', `The iOS Keychain could not be written (${(e as Error).message}).`);
  }
  cachedKey = key;
  return key;
}

/** Remove the key (only when the encrypted data is erased with it). */
export async function deleteDataKey(): Promise<void> {
  cachedKey = null;
  await secureDelete(KEY_NAME);
}

/** Drop the in-memory copy; the next read goes back to the keychain. */
export function forgetCachedKey(): void {
  cachedKey = null;
}
