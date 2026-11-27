import { AppData, Category, FxRates, Settings } from './types';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-cash', name: 'Cash', kind: 'asset', type: 'cash', color: '#2BB673', icon: 'cash-outline', builtIn: true },
  { id: 'cat-bank', name: 'Bank accounts', kind: 'asset', type: 'bank', color: '#3D8BFD', icon: 'business-outline', builtIn: true },
  { id: 'cat-stock', name: 'Stocks & ETFs', kind: 'asset', type: 'stock', color: '#8B5CF6', icon: 'trending-up-outline', builtIn: true },
  { id: 'cat-crypto', name: 'Crypto', kind: 'asset', type: 'crypto', color: '#F59E0B', icon: 'logo-bitcoin', builtIn: true },
  { id: 'cat-property', name: 'Property', kind: 'asset', type: 'property', color: '#14B8A6', icon: 'home-outline', builtIn: true },
  { id: 'cat-gold', name: 'Gold', kind: 'asset', type: 'gold', color: '#D4AF37', icon: 'diamond-outline', builtIn: true },
  { id: 'cat-vehicle', name: 'Vehicles', kind: 'asset', type: 'vehicle', color: '#64748B', icon: 'car-outline', builtIn: true },
  { id: 'cat-other-asset', name: 'Other assets', kind: 'asset', type: 'other_asset', color: '#A3A3A3', icon: 'cube-outline', builtIn: true },
  { id: 'cat-loan', name: 'Loans', kind: 'liability', type: 'loan', color: '#EF4444', icon: 'document-text-outline', builtIn: true },
  { id: 'cat-mortgage', name: 'Mortgage', kind: 'liability', type: 'mortgage', color: '#F97316', icon: 'key-outline', builtIn: true },
  { id: 'cat-card', name: 'Credit cards', kind: 'liability', type: 'credit_card', color: '#EC4899', icon: 'card-outline', builtIn: true },
  { id: 'cat-other-liability', name: 'Other debts', kind: 'liability', type: 'other_liability', color: '#9CA3AF', icon: 'remove-circle-outline', builtIn: true },
];

export const DEFAULT_SETTINGS: Settings = {
  baseCurrency: 'USD',
  lockEnabled: false,
  biometricsEnabled: false,
  autoLockSeconds: 30,
  hideAmounts: false,
  syncProvider: 'none',
  autoSync: false,
};

/** Offline fallback rates (approximate) so conversion works before the first refresh. */
export const FALLBACK_FX: FxRates = {
  rates: {
    USD: 1, EUR: 0.92, GBP: 0.79, JPY: 150, CHF: 0.88, CAD: 1.37, AUD: 1.52, NZD: 1.66,
    CNY: 7.2, HKD: 7.8, SGD: 1.34, INR: 84, AED: 3.6725, SAR: 3.75, QAR: 3.64, KWD: 0.307,
    BHD: 0.376, OMR: 0.385, PKR: 280, BDT: 120, LKR: 300, NPR: 134, MYR: 4.5, IDR: 15800,
    THB: 35, PHP: 57, KRW: 1350, TRY: 34, ZAR: 18, NGN: 1550, EGP: 48, BRL: 5.5, MXN: 18,
    SEK: 10.5, NOK: 10.8, DKK: 6.9, PLN: 4, RUB: 92, ILS: 3.7,
  },
};

export const CURRENCIES: { code: string; name: string }[] = [
  ['USD', 'US Dollar'], ['EUR', 'Euro'], ['GBP', 'British Pound'], ['INR', 'Indian Rupee'],
  ['AED', 'UAE Dirham'], ['SAR', 'Saudi Riyal'], ['QAR', 'Qatari Riyal'], ['KWD', 'Kuwaiti Dinar'],
  ['BHD', 'Bahraini Dinar'], ['OMR', 'Omani Rial'], ['JPY', 'Japanese Yen'], ['CHF', 'Swiss Franc'],
  ['CAD', 'Canadian Dollar'], ['AUD', 'Australian Dollar'], ['NZD', 'New Zealand Dollar'],
  ['CNY', 'Chinese Yuan'], ['HKD', 'Hong Kong Dollar'], ['SGD', 'Singapore Dollar'],
  ['PKR', 'Pakistani Rupee'], ['BDT', 'Bangladeshi Taka'], ['LKR', 'Sri Lankan Rupee'],
  ['NPR', 'Nepalese Rupee'], ['MYR', 'Malaysian Ringgit'], ['IDR', 'Indonesian Rupiah'],
  ['THB', 'Thai Baht'], ['PHP', 'Philippine Peso'], ['KRW', 'South Korean Won'],
  ['TRY', 'Turkish Lira'], ['ZAR', 'South African Rand'], ['NGN', 'Nigerian Naira'],
  ['EGP', 'Egyptian Pound'], ['BRL', 'Brazilian Real'], ['MXN', 'Mexican Peso'],
  ['SEK', 'Swedish Krona'], ['NOK', 'Norwegian Krone'], ['DKK', 'Danish Krone'],
  ['PLN', 'Polish Zloty'], ['RUB', 'Russian Ruble'], ['ILS', 'Israeli Shekel'],
].map(([code, name]) => ({ code, name }));

export function emptyData(): AppData {
  return {
    version: 1,
    holdings: [],
    categories: DEFAULT_CATEGORIES,
    snapshots: [],
    settings: { ...DEFAULT_SETTINGS },
    fx: FALLBACK_FX,
    modifiedAt: new Date(0).toISOString(),
  };
}
