import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from '@testing-library/react-native';
import { emptyData } from '../lib/defaults';
import { useLock } from '../lib/security';
import { useStore, whenSaved } from '../lib/store';
import { AppData } from '../lib/types';
import { forgetCachedKey, getDataKey, openString } from '../lib/vault';

export const STORAGE_KEY = 'guardbox:data:v1';

/** Put the app store into a known state (ready, with the given data). */
export function seedStore(data: Partial<AppData> = {}, ready = true) {
  useStore.setState({ ready, data: { ...emptyData(), ...data } });
}

/** Back to a fresh install: empty store, empty storage, locked. */
export async function resetAppState() {
  useStore.setState({ ready: false, data: emptyData(), storageError: undefined });
  useLock.setState({ locked: true });
  await AsyncStorage.clear();
  // a fresh install has no data key either
  forgetCachedKey();
  (jest.requireMock('expo-secure-store') as { __items: Map<string, string> }).__items.clear();
}

/** The raw string in storage (encrypted, unless written by an older version). */
export async function storedText(): Promise<string | null> {
  await whenSaved();
  return AsyncStorage.getItem(STORAGE_KEY);
}

/** What has been written to disk, decrypted (after the 250 ms save debounce has run). */
export async function savedData(): Promise<AppData | null> {
  const raw = await storedText();
  if (!raw) return null;
  const key = await getDataKey(false);
  return JSON.parse(openString(raw, key!, 'guardbox:data:v1')) as AppData;
}

/** Run the store's debounced save. Needs fake timers. */
export function flushSave() {
  act(() => {
    jest.advanceTimersByTime(300);
  });
}

/** Typed handles on the fetch mock installed in jest.setup.ts. */
export function mockFetch(handler: (url: string, init?: RequestInit) => Partial<Response> | Promise<Partial<Response>>) {
  const fn = jest.fn(async (url: string, init?: RequestInit) => handler(String(url), init));
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

export function json(body: unknown, status = 200): Partial<Response> {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

export function text(body: string, status = 200): Partial<Response> {
  return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
}
