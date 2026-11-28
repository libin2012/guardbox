/**
 * Passphrase-protected backup files.
 *
 * The key is derived from the passphrase with scrypt (memory-hard, so guessing
 * passphrases on GPUs is expensive) and a random salt, then the backup JSON is
 * sealed with AES-256-GCM. The KDF settings are stored in the file and covered
 * by the GCM tag, so they cannot be weakened without the file failing to open.
 */
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { parseBackup } from './store';
import { BackupFile } from './types';
import { fromBase64, openBytes, randomBytes, sealBytes, toBase64 } from './vault';

export const MIN_PASSPHRASE = 8;

/** scrypt N=2^16, r=8 (64 MiB): above OWASP's minimum and still a few seconds on a phone. */
export const DEFAULT_KDF = { N: 2 ** 16, r: 8, p: 1 };
// refuse files that ask for absurd work (a crafted file could otherwise hang the app)
const MAX = { N: 2 ** 20, r: 16, p: 4 };

interface KdfParams {
  name: 'scrypt';
  N: number;
  r: number;
  p: number;
  salt: string;
}

export interface EncryptedBackupFile {
  app: 'GuardBox';
  encrypted: 1;
  kdf: KdfParams;
  /** base64(iv || ciphertext || tag) */
  data: string;
}

function aad(kdf: KdfParams): string {
  return `guardbox:backup:v1:${kdf.name}:${kdf.N}:${kdf.r}:${kdf.p}:${kdf.salt}`;
}

async function deriveKey(passphrase: string, kdf: KdfParams): Promise<Uint8Array> {
  return scryptAsync(passphrase.normalize('NFKC'), fromBase64(kdf.salt), { N: kdf.N, r: kdf.r, p: kdf.p, dkLen: 32, maxmem: 2 ** 31 });
}

export function checkPassphrase(passphrase: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE) return `Use at least ${MIN_PASSPHRASE} characters.`;
  return null;
}

/**
 * The last key derived from a passphrase, kept in memory only. Cloud sync
 * reuses it (same salt, fresh IV each time) so auto sync does not run scrypt on
 * every upload. Exported files always get a fresh salt.
 */
let lastKey: { passphrase: string; kdf: KdfParams; key: Uint8Array } | null = null;

const sameKdf = (a: KdfParams, b: KdfParams) => a.name === b.name && a.N === b.N && a.r === b.r && a.p === b.p && a.salt === b.salt;

/** Forget the cached key (tests, and when the sync passphrase changes). */
export function forgetPassphraseKey(): void {
  lastKey = null;
}

/** Encrypt a backup with a passphrase. `reuseKey` lets cloud sync skip scrypt after the first upload. */
export async function sealBackup(backup: BackupFile, passphrase: string, opts: { params?: typeof DEFAULT_KDF; reuseKey?: boolean } = {}): Promise<EncryptedBackupFile> {
  const problem = checkPassphrase(passphrase);
  if (problem) throw new Error(problem);
  const params = opts.params ?? DEFAULT_KDF;
  let kdf: KdfParams;
  let key: Uint8Array;
  if (opts.reuseKey && lastKey && lastKey.passphrase === passphrase && lastKey.kdf.N === params.N && lastKey.kdf.r === params.r && lastKey.kdf.p === params.p) {
    ({ kdf, key } = lastKey);
  } else {
    kdf = { name: 'scrypt', ...params, salt: toBase64(randomBytes(16)) };
    key = await deriveKey(passphrase, kdf);
    if (opts.reuseKey) lastKey = { passphrase, kdf, key };
  }
  return { app: 'GuardBox', encrypted: 1, kdf, data: toBase64(sealBytes(utf8ToBytes(JSON.stringify(backup)), key, aad(kdf))) };
}

export async function encryptBackup(backup: BackupFile, passphrase: string, params = DEFAULT_KDF): Promise<string> {
  return JSON.stringify(await sealBackup(backup, passphrase, { params }), null, 2);
}

/** True when the value is a passphrase-protected GuardBox backup (parsed or not). */
export function isEncryptedBackup(value: unknown): value is EncryptedBackupFile {
  let f = value;
  if (typeof value === 'string') {
    try {
      f = JSON.parse(value);
    } catch {
      return false;
    }
  }
  const e = f as Partial<EncryptedBackupFile> | null;
  return !!e && typeof e === 'object' && e.app === 'GuardBox' && e.encrypted != null;
}

const WRONG = {
  file: 'Wrong passphrase, or the file was changed after it was exported.',
  cloud: 'The cloud copy could not be opened: wrong sync passphrase, or it was changed by someone else. Nothing was changed on this phone.',
};

/** Decrypt and authenticate an encrypted backup object. */
export async function openBackup(f: EncryptedBackupFile, passphrase: string, source: keyof typeof WRONG = 'file'): Promise<BackupFile> {
  const k = f?.kdf;
  if (f?.app !== 'GuardBox' || f.encrypted !== 1 || typeof f.data !== 'string' || !k || k.name !== 'scrypt' || typeof k.salt !== 'string') {
    throw new Error('This encrypted backup was made by a newer version of GuardBox, or is damaged.');
  }
  const ok = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max;
  if (!ok(k.N, MAX.N) || (k.N & (k.N - 1)) !== 0 || !ok(k.r, MAX.r) || !ok(k.p, MAX.p)) {
    throw new Error('This backup asks for unsupported encryption settings.');
  }
  const cached = source === 'cloud' && lastKey && lastKey.passphrase === passphrase && sameKdf(lastKey.kdf, k);
  const key = cached ? lastKey!.key : await deriveKey(passphrase, k);
  let plain: Uint8Array;
  try {
    plain = openBytes(fromBase64(f.data), key, aad(k));
  } catch {
    throw new Error(WRONG[source]);
  }
  if (source === 'cloud') lastKey = { passphrase, kdf: k, key };
  return parseBackup(bytesToUtf8(plain));
}

export async function decryptBackup(text: string, passphrase: string): Promise<BackupFile> {
  return openBackup(JSON.parse(text) as EncryptedBackupFile, passphrase, 'file');
}

/** What a sync provider stores: an encrypted backup, or a plain one from an older version. */
export type SyncPayload = BackupFile | EncryptedBackupFile;

/** Parse what a provider downloaded. */
export function parseSyncPayload(text: string): SyncPayload {
  const v = JSON.parse(text) as unknown;
  return isEncryptedBackup(v) ? v : parseBackup(text);
}
