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

/** Details read from an EPF (Indian Provident Fund) passbook. */
export interface EpfDetails {
  uan?: string;
  memberId?: string;
  establishment?: string;
  employeeShare: number;
  employerShare: number;
  pensionShare: number;
  /** count the EPS (pension) column in the asset value */
  includePension: boolean;
  /** yyyy-mm-dd the passbook balance is valid for */
  asOf?: string;
  importedAt: string;
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
  /** set on Provident Fund holdings created or updated from a passbook */
  epf?: EpfDetails;
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

export type SyncProviderId = 'none' | 'icloud' | 'firebase' | 'supabase' | 'aws';

export type ReminderFrequency = 'monthly' | 'quarterly';

export interface EpfReminderSettings {
  enabled: boolean;
  frequency: ReminderFrequency;
  /** day of month, 1-28 */
  day: number;
  /** hour of day, 0-23 */
  hour: number;
}

export interface Settings {
  baseCurrency: string;
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
  epfReminder: EpfReminderSettings;
  /** true once the user has been asked about the PF reminder */
  epfReminderAsked?: boolean;
}

export interface AppData {
  version: 1;
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
