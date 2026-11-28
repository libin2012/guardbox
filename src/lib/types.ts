export type Kind = 'asset' | 'liability';

/** Behaviour of a category: decides which fields and price feeds apply. */
export type HoldingType =
  | 'cash'
  | 'bank'
  | 'stock'
  | 'crypto'
  | 'property'
  | 'gold'
  | 'vehicle'
  | 'other_asset'
  | 'loan'
  | 'mortgage'
  | 'credit_card'
  | 'other_liability';

export interface Category {
  id: string;
  name: string;
  kind: Kind;
  type: HoldingType;
  color: string;
  icon: string; // Ionicons name
  builtIn?: boolean;
}

export type GoldUnit = 'oz' | 'g';

export interface ValuePoint {
  /** yyyy-mm-dd */
  date: string;
  /** value in the holding's own currency */
  value: number;
}

export interface Holding {
  id: string;
  name: string;
  kind: Kind;
  categoryId: string;
  currency: string;
  /** manual: user types the value. quantity: quantity x live/unit price. */
  mode: 'manual' | 'quantity';
  value: number;
  quantity?: number;
  /** ticker (stocks), CoinGecko id (crypto) */
  symbol?: string;
  goldUnit?: GoldUnit;
  /** last unit price, in `currency` */
  unitPrice?: number;
  priceUpdatedAt?: string;
  autoPrice?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  history: ValuePoint[];
}

/** Daily net-worth snapshot, stored in USD so the base currency can change. */
export interface Snapshot {
  date: string;
  assetsUSD: number;
  liabilitiesUSD: number;
}

export interface FxRates {
  /** units of currency per 1 USD */
  rates: Record<string, number>;
  updatedAt?: string;
}

export type SyncProviderId = 'none' | 'icloud' | 'gdrive' | 'firebase' | 'supabase' | 'aws';

/**
 * Appearance preference. 'system' follows the iOS setting; 'light'/'dark' force
 * one; 'auto' switches by time of day (dark overnight — see NIGHT_START/END).
 */
export type ThemeMode = 'system' | 'light' | 'dark' | 'auto';

export interface Settings {
  baseCurrency: string;
  /** which colour scheme the app uses; defaults to 'auto' (time-based) */
  themeMode: ThemeMode;
  lockEnabled: boolean;
  biometricsEnabled: boolean;
  autoLockSeconds: number;
  hideAmounts: boolean;
  finnhubKey?: string;
  coingeckoKey?: string;
  syncProvider: SyncProviderId;
  autoSync: boolean;
  lastSyncAt?: string;
  lastSyncError?: string;
  /** when an encrypted backup was last saved to Google Drive from this phone */
  lastDriveBackupAt?: string;
}

/** The person using the app. Kept on the device (and in backups); there is no account. */
export interface Profile {
  fullName: string;
  email: string;
  /** optional, as typed (spaces and a leading + are kept) */
  mobile?: string;
  updatedAt: string;
}

export interface AppData {
  version: 1;
  /** set by the first-launch onboarding; required before the app opens */
  profile?: Profile;
  holdings: Holding[];
  categories: Category[];
  snapshots: Snapshot[];
  settings: Settings;
  fx: FxRates;
  /** ISO timestamp of the last user change; used for sync conflict checks */
  modifiedAt: string;
}

export interface BackupFile {
  app: 'GuardBox';
  format: 1;
  exportedAt: string;
  data: Omit<AppData, 'settings'> & { settings: Pick<Settings, 'baseCurrency'> };
}
