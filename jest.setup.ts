/**
 * Global test setup. Native modules have no implementation under Jest, so each
 * one the app touches gets a small, deterministic stand-in here. Tests that need
 * different behaviour override these per test (see "Testing" in CLAUDE.md).
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual<typeof import('crypto')>('crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    randomUUID: () => nodeCrypto.randomUUID(),
    getRandomBytes: (n: number) => new Uint8Array(nodeCrypto.randomBytes(n)),
    digestStringAsync: async (_alg: string, data: string) => nodeCrypto.createHash('sha256').update(data).digest('hex'),
  };
});

jest.mock('expo-secure-store', () => {
  const items = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    getItemAsync: jest.fn(async (k: string) => items.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void items.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void items.delete(k)),
    __items: items,
  };
});

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  supportedAuthenticationTypesAsync: jest.fn(async () => [2]),
  authenticateAsync: jest.fn(async () => ({ success: false, error: 'user_cancel' })),
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));

// Icons are fonts on device; in tests they render as nothing.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// No test may reach the network. Tests that exercise fetch install their own mock.
beforeEach(() => {
  global.fetch = jest.fn(async (url: unknown) => {
    throw new Error(`Unexpected network call in test: ${String(url)}`);
  }) as unknown as typeof fetch;
});
