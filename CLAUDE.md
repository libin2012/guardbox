# CLAUDE.md

Guidance for Claude (and any other coding agent) working in this repository. Read [AGENTS.md](AGENTS.md) too: it covers Expo specifics, including the rule to check the versioned Expo docs instead of trusting memory.

## What this is

GuardBox is a private, offline-first personal net-worth tracker for **iPhone** (iOS only for now; the code stays cross-platform so Android can come later). Users add assets and liabilities in any currency, see net worth over time, and lock the app with a passcode and Face ID. There is no account or server: data lives on the device, with optional backup to a file, iCloud, Firebase, Supabase or AWS (each the user's own project).

Stack: Expo SDK 58, React Native 0.88, React 19.3, TypeScript (strict), expo-router, zustand, AsyncStorage, expo-secure-store, Jest + jest-expo + React Native Testing Library 14.

## Commands

```bash
npm ci                          # install (runs patch-package via postinstall)
npm run lint                    # ESLint, must report 0 problems
npm run typecheck               # tsc --noEmit
npm test                        # all tests
npm test -- src/lib/__tests__/store.test.ts   # one file
npm run test:coverage           # tests + coverage; fails below thresholds in jest.config.js
npx expo run:ios --device       # build and run on a connected iPhone (needs a Mac with Xcode)
npx expo start                  # dev server (Expo Go works for everything except iCloud)
npm run web                     # quick browser preview (no Face ID, keychain or iCloud)
```

Add packages with `npx expo install <pkg>` so versions match the SDK. If that command cannot reach Expo's servers, use `npm install` with the version Expo SDK 58 expects.

Before calling any change done, run **lint, typecheck and test:coverage**. CI (`.github/workflows/ci.yml`) runs the same three on every pull request.

## Architecture

```
src/app/              Screens (expo-router; every file is a route)
  _layout.tsx         Root: loads data, then lock screen -> onboarding -> app; auto-lock; auto sync
  (tabs)/             Overview (index), Holdings, Insights, Settings
  holding/            [id] detail, edit (add/edit a holding)
  profile.tsx, passcode.tsx, categories.tsx, sync.tsx
src/components/       UI kit (ui.tsx), theme, charts (SVG), LockScreen, PinPad, Onboarding, ProfileForm, OptionSheet
src/lib/              All business logic, no UI
  types.ts            Data model: AppData, Holding, Category, Settings, Profile, BackupFile
  store.ts            zustand store; encrypted persistence to AsyncStorage (debounced 250 ms); migrate(); backup to/from JSON
  vault.ts            AES-256-GCM encryption at rest; per-install data key in the keychain; VaultError codes
  backupCrypto.ts     Passphrase-protected backup files (scrypt + AES-256-GCM)
  calc.ts             Totals, net worth, category breakdown, history points, daily snapshots, chart series
  money.ts            Currency conversion (USD-based rates), formatting, parsing typed amounts
  prices.ts           Free price feeds: CoinGecko, gold-api.com, Stooq, Finnhub, open.er-api.com, Frankfurter
  refresh.ts          Refresh FX + live prices (deduplicated); refreshIfStale
  security.ts         Passcode (salted, hashed, keychain), Face ID / Touch ID, sync secrets, lock state
  profile.ts          Profile validation and normalisation (name + email required, mobile optional)
  defaults.ts         Built-in categories, default settings, fallback FX rates, currency list
  sync/               SyncProvider implementations (icloud, firebase, supabase, aws + sigv4) and syncNow(); uploads are end-to-end encrypted with the sync passphrase
src/test/             Test-only helpers (never imported by app code)
src/__tests__/screens Screen and launch-flow tests (kept out of src/app so they never become routes)
```

Key rules of the data model:

- Each holding keeps its value in **its own currency**. Totals convert to `settings.baseCurrency` at read time.
- Daily net-worth snapshots are stored **in USD** so changing the base currency redraws history correctly.
- Every user edit goes through the store's `commit()`, which stamps `modifiedAt`, updates today's snapshot, saves, and notifies auto sync. Price and FX refreshes are not user edits (they do not change `modifiedAt`).
- `migrate()` in `store.ts` must accept every older saved shape. When you add a field to `AppData`, give it a default there and add a migration test.
- Everything saved to AsyncStorage is encrypted (`vault.ts`, see SECURITY.md). Never write app data to AsyncStorage, files or logs in plain text. If saved data cannot be opened (`storageError`), nothing is saved until the user retries or erases; keep it that way so unreadable data is never overwritten.
- Cloud sync payloads are sealed in `syncNow()` (`sealBackup`) before any provider sees them; providers store the payload as is and must never receive a plain `BackupFile` from this version.
- Backups (`toBackup`) contain only the base currency from settings: never API keys, lock state or sync credentials. Sync secrets live in the keychain.
- The profile is required (onboarding runs until `isCompleteProfile` passes). Erasing data and restoring a backup keep the profile typed on this device.

## Conventions

- TypeScript strict; no `any` unless a third-party shape forces it.
- Keep logic in `src/lib` as plain functions so it is testable without rendering; screens stay thin.
- Use `useTheme()` and `space()` from `components/theme.ts` for colours and spacing; reuse the components in `components/ui.tsx`.
- Routes only in `src/app/`; never hand-edit `ios/` or `android/` (they are generated). Native config goes in `app.config.ts`.
- Network calls go through the helpers in `prices.ts` / `sync/types.ts`, with timeouts and readable error messages.
- Lint must stay at zero problems; fix the code rather than disabling rules.

## Testing

**Every new feature or bug fix must come with tests**, and existing tests must keep passing. The suite exists so new work cannot silently break what already ships. Do not delete, skip or weaken a test to get a change through; if behaviour is meant to change, update the test and say so in the PR.

Where tests live:

| What | Where |
|---|---|
| Business logic (`src/lib/**`) | `src/lib/__tests__/<module>.test.ts` |
| Components | `src/components/__tests__/<Component>.test.tsx` |
| Screens and launch flow | `src/__tests__/screens/*.test.tsx` (not under `src/app/`: every file there becomes a route) |

How to write them:

- Tests run on the iOS platform preset (`jest-expo/ios`). Native modules (AsyncStorage, SecureStore, LocalAuthentication, Crypto, Haptics, vector icons, safe area) are mocked once in `jest.setup.ts`. Override per test with `mockResolvedValueOnce` on the mocked module, e.g. `LocalAuthentication.authenticateAsync`.
- **No real network.** `fetch` throws by default in every test. Use `mockFetch()` with `json()` / `text()` from `src/test/helpers.ts`.
- Build data with `makeHolding`, `makeProfile`, `makeData` and the fixed `FX` rates from `src/test/factories.ts`.
- Reset state in `beforeEach` with `resetAppState()` (also clears the keychain mock and the cached data key), then `seedStore({...})`. Use `flushSave()` (fake timers), then `savedData()` (decrypted) or `storedText()` (the raw ciphertext) to check what was persisted. Writing plain JSON to `STORAGE_KEY` simulates data saved by an older version, which `load()` migrates.
- Screens: mock expo-router with `jest.mock('expo-router', () => jest.requireActual('../../test/expoRouterMock'))`, import the screen from `../../app/...`, set params with `setParams`, and assert on `router.push` / `router.back`. Header buttons are rendered inline so they can be pressed.
- React Native Testing Library 14 is async: always `await render(...)` and `await fireEvent.press(...)`. Prefer queries by text, label or placeholder over test IDs. Its docs for the installed version are in `node_modules/@testing-library/react-native/docs/`.
- Alerts: `jest.spyOn(Alert, 'alert')`, then call the button's `onPress` inside `act()`.
- Avoid fake timers while a screen is loading through RNTL `findBy*`; switch to fake timers after the screen is up (see the auto sync tests in `RootLayout.test.tsx`).

Coverage thresholds live in `jest.config.js` (global, plus a higher bar for `src/lib`). Raise them as coverage grows; never lower them to merge.

## Scope notes

- iOS only for now. iCloud sync needs a paid Apple Developer account and `ENABLE_ICLOUD=1`.
- No bank linking, no paywall, no analytics. Price feeds must stay free.
- Ask the owner before large scope changes or before re-adding features that were removed from `main`.
