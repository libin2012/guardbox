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

export async function encryptBackup(backup: BackupFile, passphrase: string, params = DEFAULT_KDF): Promise<string> {
  const problem = checkPassphrase(passphrase);
  if (problem) throw new Error(problem);
  const kdf: KdfParams = { name: 'scrypt', ...params, salt: toBase64(randomBytes(16)) };
  const key = await deriveKey(passphrase, kdf);
  const file: EncryptedBackupFile = { app: 'GuardBox', encrypted: 1, kdf, data: toBase64(sealBytes(utf8ToBytes(JSON.stringify(backup)), key, aad(kdf))) };
  return JSON.stringify(file, null, 2);
}

/** True when the text is a passphrase-protected GuardBox backup. */
export function isEncryptedBackup(text: string): boolean {
  try {
    const f = JSON.parse(text) as Partial<EncryptedBackupFile> | null;
    return f?.app === 'GuardBox' && f.encrypted != null;
  } catch {
    return false;
  }
}

export async function decryptBackup(text: string, passphrase: string): Promise<BackupFile> {
  const f = JSON.parse(text) as EncryptedBackupFile;
  const k = f?.kdf;
  if (f?.app !== 'GuardBox' || f.encrypted !== 1 || typeof f.data !== 'string' || !k || k.name !== 'scrypt' || typeof k.salt !== 'string') {
    throw new Error('This encrypted backup was made by a newer version of GuardBox, or is damaged.');
  }
  const ok = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max;
  if (!ok(k.N, MAX.N) || (k.N & (k.N - 1)) !== 0 || !ok(k.r, MAX.r) || !ok(k.p, MAX.p)) {
    throw new Error('This backup asks for unsupported encryption settings.');
  }
  const key = await deriveKey(passphrase, k);
  let plain: Uint8Array;
  try {
    plain = openBytes(fromBase64(f.data), key, aad(k));
  } catch {
    throw new Error('Wrong passphrase, or the file was changed after it was exported.');
  }
  return parseBackup(bytesToUtf8(plain));
}
