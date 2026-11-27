import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

const PASSCODE_KEY = 'guardbox.passcode.v1';

interface StoredPasscode {
  salt: string;
  hash: string;
  length: number;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPasscode(code: string, salt: string): Promise<string> {
  // iterate to slow down brute force if the keychain item were ever extracted
  let h = `${salt}:${code}`;
  for (let i = 0; i < 2000; i++) {
    h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, h);
  }
  return h;
}

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') return void globalThis.localStorage?.setItem(key, value);
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') return void globalThis.localStorage?.removeItem(key);
  await SecureStore.deleteItemAsync(key);
}

export async function hasPasscode(): Promise<boolean> {
  return (await secureGet(PASSCODE_KEY)) != null;
}

export async function passcodeLength(): Promise<number> {
  const raw = await secureGet(PASSCODE_KEY);
  return raw ? (JSON.parse(raw) as StoredPasscode).length : 6;
}

export async function setPasscode(code: string): Promise<void> {
  const salt = toHex(Crypto.getRandomBytes(16));
  const hash = await hashPasscode(code, salt);
  await secureSet(PASSCODE_KEY, JSON.stringify({ salt, hash, length: code.length } satisfies StoredPasscode));
}

export async function verifyPasscode(code: string): Promise<boolean> {
  const raw = await secureGet(PASSCODE_KEY);
  if (!raw) return false;
  const stored = JSON.parse(raw) as StoredPasscode;
  return (await hashPasscode(code, stored.salt)) === stored.hash;
}

export async function clearPasscode(): Promise<void> {
  await secureDelete(PASSCODE_KEY);
}

export async function biometricLabel(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const [hw, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
  if (!hw || !enrolled) return null;
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return Platform.OS === 'ios' ? 'Face ID' : 'Face unlock';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
  return 'Biometrics';
}

export async function authenticateBiometric(): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock GuardBox',
    cancelLabel: 'Use passcode',
    disableDeviceFallback: true,
  });
  return r.success;
}

/** Secrets for sync providers live in the keychain, never in the backup. */
export async function getSecret(name: string): Promise<string | null> {
  return secureGet(`guardbox.secret.${name}`);
}
export async function setSecret(name: string, value: string): Promise<void> {
  if (!value) return secureDelete(`guardbox.secret.${name}`);
  return secureSet(`guardbox.secret.${name}`, value);
}

interface LockState {
  locked: boolean;
  lock(): void;
  unlock(): void;
}

export const useLock = create<LockState>((set) => ({
  locked: true,
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
}));
