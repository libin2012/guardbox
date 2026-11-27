import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { withHistoryPoint, withSnapshot, holdingValue } from './calc';
import { emptyData } from './defaults';
import { newId } from './id';
import { AppData, BackupFile, Category, FxRates, Holding, Settings } from './types';

const STORAGE_KEY = 'guardbox:data:v1';

type HoldingInput = Omit<Holding, 'id' | 'createdAt' | 'updatedAt' | 'history'>;

interface Store {
  ready: boolean;
  data: AppData;
  load(): Promise<void>;
  addHolding(input: HoldingInput): string;
  updateHolding(id: string, patch: Partial<HoldingInput>): void;
  deleteHolding(id: string): void;
  applyPrices(prices: Record<string, number>): void;
  addCategory(c: Omit<Category, 'id'>): void;
  updateCategory(id: string, patch: Partial<Omit<Category, 'id' | 'kind'>>): void;
  deleteCategory(id: string): boolean;
  updateSettings(patch: Partial<Settings>): void;
  setFx(fx: FxRates): void;
  restoreBackup(b: BackupFile): void;
  resetAll(): void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const changeListeners = new Set<() => void>();

/** Subscribe to user-driven data changes (used for auto sync). */
export function onDataChanged(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

function persist(data: AppData) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch((e) => console.warn('save failed', e));
  }, 250);
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
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        const data = migrate(json ? JSON.parse(json) : null);
        data.snapshots = withSnapshot(data);
        set({ data, ready: true });
      } catch (e) {
        console.warn('load failed', e);
        set({ ready: true });
      }
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

    setFx(fx) {
      const d = get().data;
      commit({ ...d, fx: { rates: { ...d.fx.rates, ...fx.rates }, updatedAt: fx.updatedAt } }, false);
    },

    restoreBackup(b) {
      const d = get().data;
      const restored = migrate({ ...b.data, settings: { ...d.settings, baseCurrency: b.data.settings.baseCurrency } });
      restored.modifiedAt = b.data.modifiedAt;
      set({ data: restored });
      persist(restored);
    },

    resetAll() {
      const fresh = emptyData();
      fresh.settings = { ...get().data.settings, syncProvider: 'none', lastSyncAt: undefined };
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
