/**
 * The launch flow: loading → lock screen (when a passcode is on) → onboarding
 * (until a profile exists, so only once) → the app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import * as SecureStore from 'expo-secure-store';
import { Alert, AppState, AppStateStatus } from 'react-native';
import RootLayout from '../../app/_layout';
import { emptyData } from '../../lib/defaults';
import { clearPasscode, setPasscode, useLock } from '../../lib/security';
import { useStore } from '../../lib/store';
import { makeProfile } from '../../test/factories';
import { resetAppState, STORAGE_KEY, storedText } from '../../test/helpers';

jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  const Stack = Object.assign(function MockStack() {
    return <RNText>App content</RNText>;
  }, { Screen: () => null });
  const theme = { dark: false, colors: {}, fonts: {} };
  return { Stack, ThemeProvider: ({ children }: { children: React.ReactNode }) => children, DarkTheme: theme, DefaultTheme: theme };
});
jest.mock('../../lib/refresh', () => ({ refreshIfStale: jest.fn(async () => undefined) }));
jest.mock('../../lib/sync', () => ({ syncNow: jest.fn(async () => ({ kind: 'up-to-date' })) }));

const { syncNow } = jest.requireMock<{ syncNow: jest.Mock }>('../../lib/sync');
const { refreshIfStale } = jest.requireMock<{ refreshIfStale: jest.Mock }>('../../lib/refresh');
const LA = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

async function install(data: Partial<ReturnType<typeof emptyData>>) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), ...data }));
}

const lockOn = { ...emptyData().settings, lockEnabled: true };

beforeEach(async () => {
  await resetAppState();
  await clearPasscode();
});

describe('first launch', () => {
  it('shows onboarding over the app until a profile is saved', async () => {
    await render(<RootLayout />);
    expect(await screen.findByText('Welcome to GuardBox')).toBeOnTheScreen();
    // the app is mounted underneath but hidden from VoiceOver while onboarding is up
    expect(screen.queryByText('App content')).not.toBeOnTheScreen();
    expect(screen.getByText('App content', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(refreshIfStale).toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Asha Rao');
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'asha@example.com');
    await fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(screen.queryByText('Welcome to GuardBox')).not.toBeOnTheScreen(), { timeout: 2000 });
    expect(screen.getByText('App content')).toBeOnTheScreen();
    expect(useStore.getState().data.profile?.email).toBe('asha@example.com');
  });
});

describe('later launches', () => {
  it('goes straight to the app when a profile exists', async () => {
    await install({ profile: makeProfile() });
    await render(<RootLayout />);
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    expect(screen.queryByText('Welcome to GuardBox')).not.toBeOnTheScreen();
  });

  it('shows onboarding again if the stored profile is incomplete', async () => {
    await install({ profile: { fullName: 'Asha Rao', email: '', updatedAt: '' } });
    await render(<RootLayout />);
    expect(await screen.findByText('Welcome to GuardBox')).toBeOnTheScreen();
  });

  it('does not show onboarding again after erasing all data', async () => {
    await install({ profile: makeProfile() });
    await render(<RootLayout />);
    await screen.findByText('App content');
    await act(async () => useStore.getState().resetAll());
    expect(screen.queryByText('Welcome to GuardBox')).not.toBeOnTheScreen();
  });
});

describe('passcode lock', () => {
  it('shows the lock screen before anything else', async () => {
    await setPasscode('1234');
    await install({ settings: lockOn, profile: makeProfile() });
    await render(<RootLayout />);
    expect(await screen.findByText('GuardBox is locked')).toBeOnTheScreen();
    expect(screen.queryByText('App content')).not.toBeOnTheScreen();
  });

  it('shows the lock screen before onboarding on a fresh profile', async () => {
    await setPasscode('1234');
    await install({ settings: lockOn });
    await render(<RootLayout />);
    expect(await screen.findByText('GuardBox is locked')).toBeOnTheScreen();
    expect(screen.queryByText('Welcome to GuardBox')).not.toBeOnTheScreen();
    for (const d of '1234') await fireEvent.press(screen.getByText(d));
    expect(await screen.findByText('Welcome to GuardBox')).toBeOnTheScreen();
  });

  it('opens with Face ID when enabled', async () => {
    await setPasscode('1234');
    await install({ settings: { ...lockOn, biometricsEnabled: true }, profile: makeProfile() });
    LA.authenticateAsync.mockResolvedValueOnce({ success: true });
    await render(<RootLayout />);
    expect(await screen.findByText('App content')).toBeOnTheScreen();
  });

  it('never locks you out if the passcode is missing from the keychain', async () => {
    await install({ settings: lockOn, profile: makeProfile() });
    await render(<RootLayout />);
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    expect(useLock.getState().locked).toBe(false);
  });
});

describe('app switcher and auto-lock', () => {
  let emit: (s: AppStateStatus) => void;
  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
      emit = fn as (s: AppStateStatus) => void;
      return { remove: jest.fn() } as never;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('locks again after being away longer than the auto-lock delay', async () => {
    await setPasscode('1234');
    await install({ settings: { ...lockOn, autoLockSeconds: 0 }, profile: makeProfile() });
    useLock.setState({ locked: false });
    await render(<RootLayout />);
    await act(async () => useLock.getState().unlock());
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    await act(async () => emit('background'));
    await act(async () => emit('active'));
    expect(await screen.findByText('GuardBox is locked')).toBeOnTheScreen();
  });

  it('stays unlocked after a short trip away', async () => {
    await setPasscode('1234');
    await install({ settings: { ...lockOn, autoLockSeconds: 300 }, profile: makeProfile() });
    await render(<RootLayout />);
    await act(async () => useLock.getState().unlock());
    await screen.findByText('App content');
    await act(async () => emit('background'));
    await act(async () => emit('active'));
    expect(screen.getByText('App content')).toBeOnTheScreen();
    expect(useLock.getState().locked).toBe(false);
  });
});

describe('auto sync', () => {
  afterEach(() => jest.useRealTimers());

  it('syncs a few seconds after an edit when turned on', async () => {
    await install({ profile: makeProfile(), settings: { ...emptyData().settings, syncProvider: 'icloud', autoSync: true } });
    await render(<RootLayout />);
    await screen.findByText('App content');
    jest.useFakeTimers();
    await act(async () => useStore.getState().addHolding({ name: 'A', kind: 'asset', categoryId: 'cat-cash', currency: 'USD', mode: 'manual', value: 1 }));
    await act(async () => useStore.getState().addHolding({ name: 'B', kind: 'asset', categoryId: 'cat-cash', currency: 'USD', mode: 'manual', value: 2 }));
    expect(syncNow).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('does not sync when auto sync is off', async () => {
    await install({ profile: makeProfile(), settings: { ...emptyData().settings, syncProvider: 'icloud', autoSync: false } });
    await render(<RootLayout />);
    await screen.findByText('App content');
    jest.useFakeTimers();
    await act(async () => useStore.getState().addHolding({ name: 'A', kind: 'asset', categoryId: 'cat-cash', currency: 'USD', mode: 'manual', value: 1 }));
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(syncNow).not.toHaveBeenCalled();
  });
});

describe('encrypted storage', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('opens data saved by an older version and re-saves it encrypted', async () => {
    await install({ profile: makeProfile() });
    await render(<RootLayout />);
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    const raw = (await storedText())!;
    expect(raw.startsWith('gbx1.')).toBe(true);
    expect(raw).not.toContain('asha@example.com');
  });

  it('shows a warning instead of the app when the data was tampered with, and can start fresh', async () => {
    await SecureStore.setItemAsync('guardbox.datakey.v1', 'ab'.repeat(32));
    await AsyncStorage.setItem(STORAGE_KEY, 'gbx1.' + 'A'.repeat(80));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<RootLayout />);
    expect(await screen.findByText('Your data failed a security check')).toBeOnTheScreen();
    expect(screen.queryByText('App content')).not.toBeOnTheScreen();
    expect(refreshIfStale).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Your data failed a security check')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Erase and start again'));
    const buttons = alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Erase')!.onPress!());
    expect(await screen.findByText('Welcome to GuardBox')).toBeOnTheScreen();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
    alert.mockRestore();
  });

  it('explains a missing key', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'gbx1.' + 'A'.repeat(80));
    await render(<RootLayout />);
    expect(await screen.findByText('The key for your data is missing')).toBeOnTheScreen();
  });

  it('retries when the keychain did not answer, then still asks for the passcode', async () => {
    await install({ profile: makeProfile(), settings: lockOn });
    await setPasscode('123456');
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('interaction not allowed'));
    await render(<RootLayout />);
    expect(await screen.findByText('GuardBox can’t reach the Keychain')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('GuardBox is locked')).toBeOnTheScreen();
  });
});
