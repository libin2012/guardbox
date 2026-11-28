import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { withHistoryPoint, withSnapshot, holdingValue } from './calc';
import { emptyData } from './defaults';
import { newId } from './id';
import { isCompleteProfile } from './profile';
import { AppData, BackupFile, Category, FxRates, Holding, Profile, Settings } from './types';
import { deleteDataKey, getDataKey, isSealed, openString, sealString, VaultError, VaultErrorCode } from './vault';

const STORAGE_KEY = 'guardbox:data:v1';
/** Additional authenticated data: a sealed blob only opens as GuardBox app data. */
const DATA_AAD = 'guardbox:data:v1';

type HoldingInput = Omit<Holding, 'id' | 'createdAt' | 'updatedAt' | 'history'>;

interface Store {
  ready: boolean;
  data: AppData;
  /** Set when saved data exists but could not be opened. Nothing is saved until it is resolved. */
  storageError?: VaultErrorCode;
  load(): Promise<void>;
  /** Delete unreadable saved data and its key. Call load() afterwards to start fresh. */
  eraseUnreadableData(): Promise<void>;
  addHolding(input: HoldingInput): string;
  updateHolding(id: string, patch: Partial<HoldingInput>): void;
  deleteHolding(id: string): void;
  applyPrices(prices: Record<string, number>): void;
  addCategory(c: Omit<Category, 'id'>): void;
  updateCategory(id: string, patch: Partial<Omit<Category, 'id' | 'kind'>>): void;
  deleteCategory(id: string): boolean;
  updateSettings(patch: Partial<Settings>): void;
  setProfile(p: Profile): void;
  setFx(fx: FxRates): void;
  restoreBackup(b: BackupFile): void;
  resetAll(): void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWrite: Promise<void> = Promise.resolve();
const changeListeners = new Set<() => void>();

/** Subscribe to user-driven data changes (used for auto sync). */
export function onDataChanged(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/** Encrypt and write. Every save gets a fresh IV. */
async function writeEncrypted(data: AppData): Promise<void> {
  const key = await getDataKey(true);
  await AsyncStorage.setItem(STORAGE_KEY, sealString(JSON.stringify(data), key!, DATA_AAD));
}

function persist(data: AppData) {
  // unreadable data stays on disk untouched until the user decides what to do
  if (useStore.getState().storageError) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    pendingWrite = pendingWrite.then(() => writeEncrypted(data)).catch((e) => console.warn('save failed', e));
  }, 250);
}

/** Drop a save that is scheduled but not started (tests, and before erasing). */
export function cancelScheduledSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}

/** Resolves once the latest started write has reached storage. */
export function whenSaved(): Promise<void> {
  return pendingWrite;
}

/**
 * Read and decrypt saved data. Older versions saved plain JSON; that is
 * returned with `legacy` so the caller re-saves it encrypted.
 */
async function readStored(): Promise<{ raw: unknown; legacy: boolean }> {
  await pendingWrite;
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored == null) return { raw: null, legacy: false };
  if (isSealed(stored)) {
    const key = await getDataKey(false);
    if (!key) throw new VaultError('key-missing', 'The encryption key for this data is not on this device.');
    try {
      return { raw: JSON.parse(openString(stored, key, DATA_AAD)), legacy: false };
    } catch (e) {
      if (e instanceof VaultError) throw e;
      throw new VaultError('corrupt', 'The saved data could not be read.');
    }
  }
  try {
    return { raw: JSON.parse(stored), legacy: true };
  } catch {
    throw new VaultError('corrupt', 'The saved data could not be read.');
  }
}

function migrate(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const d = raw as Partial<AppData>;
  const categories = Array.isArray(d.categories) && d.categories.length ? d.categories : base.categories;
  // make sure newly added built-in categories appear for existing users
  for (const c of base.categories) if (!categories.some((x) => x.id === c.id)) categories.push(c);
  return {
    ...base,
    ...d,
    version: 1,
    categories,
    holdings: Array.isArray(d.holdings) ? d.holdings.map((h) => ({ ...h, history: h.history ?? [] })) : [],
    snapshots: Array.isArray(d.snapshots) ? d.snapshots : [],
    profile: isCompleteProfile(d.profile) ? d.profile : undefined,
    settings: { ...base.settings, ...(d.settings ?? {}) },
    fx: d.fx?.rates ? { rates: { ...base.fx.rates, ...d.fx.rates }, updatedAt: d.fx.updatedAt } : base.fx,
  };
}

export const useStore = create<Store>((set, get) => {
  /** Apply a change to user data: snapshot net worth, persist and notify. */
  const commit = (next: AppData, userChange = true) => {
    const stamped: AppData = userChange ? { ...next, modifiedAt: new Date().toISOString() } : next;
    stamped.snapshots = withSnapshot(stamped);
    set({ data: stamped });
    persist(stamped);
    if (userChange) changeListeners.forEach((fn) => fn());
  };

  return {
    ready: false,
    data: emptyData(),

    async load() {
      try {
        const { raw, legacy } = await readStored();
        // make the key now so the first save never has to wait on the keychain
        await getDataKey(true);
        const data = migrate(raw);
        data.snapshots = withSnapshot(data);
        set({ data, ready: true, storageError: undefined });
        if (legacy) {
          // one-time upgrade: replace the plain-text copy with an encrypted one
          pendingWrite = pendingWrite.then(() => writeEncrypted(data)).catch((e) => console.warn('encrypting saved data failed', e));
          await pendingWrite;
        }
      } catch (e) {
        console.warn('load failed', e);
        set({ data: emptyData(), ready: true, storageError: e instanceof VaultError ? e.code : 'unavailable' });
      }
    },

    async eraseUnreadableData() {
      cancelScheduledSave();
      await pendingWrite;
      await AsyncStorage.removeItem(STORAGE_KEY);
      await deleteDataKey();
      set({ data: emptyData(), storageError: undefined, ready: false });
    },

    addHolding(input) {
      const now = new Date().toISOString();
      const h: Holding = { ...input, id: newId('h'), createdAt: now, updatedAt: now, history: [] };
      h.history = withHistoryPoint([], holdingValue(h));
      commit({ ...get().data, holdings: [...get().data.holdings, h] });
      return h.id;
    },

    updateHolding(id, patch) {
      const holdings = get().data.holdings.map((h) => {
        if (h.id !== id) return h;
        const next: Holding = { ...h, ...patch, updatedAt: new Date().toISOString() };
        next.history = withHistoryPoint(h.history, holdingValue(next));
        return next;
      });
      commit({ ...get().data, holdings });
    },

    deleteHolding(id) {
      commit({ ...get().data, holdings: get().data.holdings.filter((h) => h.id !== id) });
    },

    applyPrices(prices) {
      const now = new Date().toISOString();
      let changed = false;
      const holdings = get().data.holdings.map((h) => {
        const p = prices[h.id];
        if (p == null || !Number.isFinite(p)) return h;
        changed = true;
        const next: Holding = { ...h, unitPrice: p, priceUpdatedAt: now };
        next.value = holdingValue(next);
        next.history = withHistoryPoint(h.history, next.value);
        return next;
      });
      if (changed) commit({ ...get().data, holdings }, false);
    },

    addCategory(c) {
      commit({ ...get().data, categories: [...get().data.categories, { ...c, id: newId('cat') }] });
    },

    updateCategory(id, patch) {
      commit({ ...get().data, categories: get().data.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
    },

    deleteCategory(id) {
      const d = get().data;
      if (d.holdings.some((h) => h.categoryId === id)) return false;
      commit({ ...d, categories: d.categories.filter((c) => c.id !== id) });
      return true;
    },

    updateSettings(patch) {
      const d = get().data;
      const next = { ...d, settings: { ...d.settings, ...patch } };
      set({ data: next });
      persist(next);
    },

    setProfile(p) {
      commit({ ...get().data, profile: p });
    },

    setFx(fx) {
      const d = get().data;
      commit({ ...d, fx: { rates: { ...d.fx.rates, ...fx.rates }, updatedAt: fx.updatedAt } }, false);
    },

    restoreBackup(b) {
      const d = get().data;
      const restored = migrate({ ...b.data, settings: { ...d.settings, baseCurrency: b.data.settings.baseCurrency } });
      // the profile typed on this device wins; older backups have none
      restored.profile = d.profile ?? restored.profile;
      restored.modifiedAt = b.data.modifiedAt;
      set({ data: restored });
      persist(restored);
    },

    resetAll() {
      const fresh = emptyData();
      fresh.settings = { ...get().data.settings, syncProvider: 'none', lastSyncAt: undefined, lastDriveBackupAt: undefined };
      // erasing wealth data keeps who you are, so onboarding does not run again
      fresh.profile = get().data.profile;
      commit(fresh);
    },
  };
});

export function toBackup(d: AppData): BackupFile {
  const { settings, ...rest } = d;
  return {
    app: 'GuardBox',
    format: 1,
    exportedAt: new Date().toISOString(),
    data: { ...rest, settings: { baseCurrency: settings.baseCurrency } },
  };
}

export function parseBackup(text: string): BackupFile {
  const b = JSON.parse(text) as BackupFile;
  if (b?.app !== 'GuardBox' || b.format !== 1 || !b.data || !Array.isArray(b.data.holdings)) {
    throw new Error('This file is not a GuardBox backup.');
  }
  return b;
}
