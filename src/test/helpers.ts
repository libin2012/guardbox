import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from '@testing-library/react-native';
import { emptyData } from '../lib/defaults';
import { useLock } from '../lib/security';
import { useStore } from '../lib/store';
import { AppData } from '../lib/types';

export const STORAGE_KEY = 'guardbox:data:v1';

/** Put the app store into a known state (ready, with the given data). */
export function seedStore(data: Partial<AppData> = {}, ready = true) {
  useStore.setState({ ready, data: { ...emptyData(), ...data } });
}

/** Back to a fresh install: empty store, empty storage, locked. */
export async function resetAppState() {
  useStore.setState({ ready: false, data: emptyData() });
  useLock.setState({ locked: true });
  await AsyncStorage.clear();
}

/** What has been written to disk (after the 250 ms save debounce has run). */
export async function savedData(): Promise<AppData | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as AppData) : null;
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
