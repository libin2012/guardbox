import * as LocalAuthentication from 'expo-local-authentication';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import Settings from '../../app/(tabs)/settings';
import Categories from '../../app/categories';
import PasscodeScreen from '../../app/passcode';
import SyncScreen from '../../app/sync';
import { decryptBackup, encryptBackup } from '../../lib/backupCrypto';
import { loadConfig } from '../../lib/sync';
import { icloudProvider } from '../../lib/sync/icloud';
import { emptyData } from '../../lib/defaults';
import { clearPasscode, hasPasscode, setPasscode, useLock, verifyPasscode } from '../../lib/security';
import { toBackup, useStore } from '../../lib/store';
import { makeHolding, makeProfile } from '../../test/factories';
import { resetAppState, seedStore } from '../../test/helpers';

jest.mock('expo-router', () => jest.requireActual('../../test/expoRouterMock'));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  class File {
    uri: string;
    constructor(dir: string, name?: string) {
      this.uri = name ? `${dir}/${name}` : dir;
    }
    get exists() {
      return files.has(this.uri);
    }
    create() {
      files.set(this.uri, '');
    }
    delete() {
      files.delete(this.uri);
    }
    async write(s: string) {
      files.set(this.uri, s);
    }
    async text() {
      return files.get(this.uri) ?? '';
    }
  }
  return { File, Paths: { cache: 'file:///cache' }, __files: files };
});

const { router, setParams } = jest.requireMock<typeof import('../../test/expoRouterMock')>('expo-router');
const { __files: files } = jest.requireMock<{ __files: Map<string, string> }>('expo-file-system');
const LA = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;
const state = () => useStore.getState().data;
type AlertButton = { text: string; onPress?: () => void };
let alert: jest.SpyInstance;
const pressAlertButton = async (text: string, call = -1) => {
  const buttons = alert.mock.calls.at(call)![2] as AlertButton[];
  await act(async () => buttons.find((b) => b.text === text)!.onPress!());
};

beforeEach(async () => {
  await resetAppState();
  await clearPasscode();
  setParams({});
  files.clear();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => alert.mockRestore());

describe('Settings', () => {
  it('shows the profile card and opens the Profile screen', async () => {
    seedStore({ profile: makeProfile({ mobile: '+1 555 123 4567' }) });
    await render(<Settings />);
    expect(screen.getByText('Asha Rao')).toBeOnTheScreen();
    expect(screen.getByText('asha@example.com')).toBeOnTheScreen();
    expect(screen.getByText('+1 555 123 4567')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Edit profile'));
    expect(router.push).toHaveBeenCalledWith('/profile');
  });

  it('turning the lock on without a passcode asks you to choose one', async () => {
    seedStore();
    await render(<Settings />);
    await fireEvent(screen.getAllByRole('switch')[1], 'valueChange', true);
    expect(router.push).toHaveBeenCalledWith('/passcode?mode=enable');
    expect(state().settings.lockEnabled).toBe(false);
  });

  it('turning the lock off removes the passcode and Face ID', async () => {
    await setPasscode('1234');
    seedStore({ settings: { ...emptyData().settings, lockEnabled: true, biometricsEnabled: true } });
    await render(<Settings />);
    expect(await screen.findByText('Unlock with Face ID')).toBeOnTheScreen();
    await fireEvent(screen.getAllByRole('switch')[1], 'valueChange', false);
    await waitFor(() => expect(state().settings.lockEnabled).toBe(false));
    expect(state().settings.biometricsEnabled).toBe(false);
    expect(await hasPasscode()).toBe(false);
  });

  it('turns Face ID on only after a successful scan', async () => {
    await setPasscode('1234');
    seedStore({ settings: { ...emptyData().settings, lockEnabled: true } });
    await render(<Settings />);
    await screen.findByText('Unlock with Face ID');
    const faceIdSwitch = () => screen.getAllByRole('switch')[2];
    LA.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
    await fireEvent(faceIdSwitch(), 'valueChange', true);
    expect(state().settings.biometricsEnabled).toBe(false);
    LA.authenticateAsync.mockResolvedValueOnce({ success: true });
    await fireEvent(faceIdSwitch(), 'valueChange', true);
    await waitFor(() => expect(state().settings.biometricsEnabled).toBe(true));
  });

  it('changes the main currency', async () => {
    seedStore();
    await render(<Settings />);
    await fireEvent.press(screen.getByText('Main currency'));
    await fireEvent.press(screen.getByText('INR'));
    expect(state().settings.baseCurrency).toBe('INR');
  });

  it('erases data after confirming, keeping the profile', async () => {
    seedStore({ profile: makeProfile(), holdings: [makeHolding({ value: 5 })] });
    await render(<Settings />);
    await fireEvent.press(screen.getByText('Erase all data'));
    expect(state().holdings).toHaveLength(1);
    await pressAlertButton('Erase');
    expect(state().holdings).toEqual([]);
    expect(state().profile).toEqual(makeProfile());
  });
});

describe('Passcode screen', () => {
  /** After a wrong code the screen clears the dots 350 ms later; let that finish inside act(). */
  const waitForCodeReset = () => act(() => new Promise((r) => setTimeout(r, 400)));
  const type = async (code: string) => {
    for (const d of code) await fireEvent.press(screen.getByText(d));
  };

  it('sets a new passcode after you confirm it, and turns the lock on', async () => {
    seedStore();
    setParams({ mode: 'enable' });
    await render(<PasscodeScreen />);
    expect(screen.getByText('Choose a passcode')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('4 digits'));
    await type('2580');
    expect(screen.getByText('Confirm passcode')).toBeOnTheScreen();
    await type('2580');
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(await verifyPasscode('2580')).toBe(true);
    expect(state().settings.lockEnabled).toBe(true);
    expect(useLock.getState().locked).toBe(false);
  });

  it('starts over when the confirmation does not match', async () => {
    seedStore();
    await render(<PasscodeScreen />);
    await type('111111');
    await type('222222');
    expect(await screen.findByText("Passcodes didn't match. Try again.")).toBeOnTheScreen();
    expect(screen.getByText('Choose a passcode')).toBeOnTheScreen();
    expect(await hasPasscode()).toBe(false);
    await waitForCodeReset();
  });

  it('needs the current passcode before changing it', async () => {
    await setPasscode('1234');
    seedStore({ settings: { ...emptyData().settings, lockEnabled: true } });
    setParams({ mode: 'change' });
    await render(<PasscodeScreen />);
    expect(screen.getByText('Enter current passcode')).toBeOnTheScreen();
    await act(async () => undefined);
    await type('9999');
    expect(await screen.findByText('Wrong passcode')).toBeOnTheScreen();
    await waitForCodeReset();
    await type('1234');
    expect(await screen.findByText('Choose a passcode')).toBeOnTheScreen();
  });
});

describe('Categories', () => {
  it('lists asset categories with item counts', async () => {
    seedStore({ holdings: [makeHolding({ categoryId: 'cat-cash' }), makeHolding({ categoryId: 'cat-cash' })] });
    await render(<Categories />);
    expect(screen.getByText('Cash')).toBeOnTheScreen();
    expect(screen.getByText('2 items')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Liabilities'));
    expect(screen.getByText('Mortgage')).toBeOnTheScreen();
  });

  it('adds a custom category', async () => {
    seedStore();
    await render(<Categories />);
    await fireEvent.press(screen.getByText('New category'));
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Pension'), 'Pension');
    await fireEvent.press(screen.getByText('Save'));
    expect(state().categories.at(-1)).toMatchObject({ name: 'Pension', kind: 'asset', type: 'other_asset' });
  });

  it('needs a name', async () => {
    seedStore();
    await render(<Categories />);
    await fireEvent.press(screen.getByText('New category'));
    await fireEvent.press(screen.getByText('Save'));
    expect(alert).toHaveBeenCalledWith('Enter a name');
  });

  it('renames a category and blocks deleting one in use', async () => {
    seedStore({ holdings: [makeHolding({ categoryId: 'cat-cash' })] });
    await render(<Categories />);
    await fireEvent.press(screen.getByText('Cash'));
    await fireEvent.press(screen.getByText('Delete category'));
    expect(alert).toHaveBeenCalledWith('Category in use', expect.any(String));
    await fireEvent.changeText(screen.getByDisplayValue('Cash'), 'Pocket money');
    await fireEvent.press(screen.getByText('Save'));
    expect(state().categories.find((c) => c.id === 'cat-cash')!.name).toBe('Pocket money');
  });
});

describe('Backup & sync screen', () => {
  /** The share sheet sees the file; afterwards it is deleted from the cache. */
  const shared = () => {
    const seen: { uri: string; text: string }[] = [];
    (Sharing.shareAsync as jest.Mock).mockImplementationOnce(async (uri: string) => void seen.push({ uri, text: files.get(uri)! }));
    return seen;
  };
  let prompt: jest.SpyInstance;
  beforeEach(() => {
    prompt = jest.spyOn(Alert, 'prompt').mockImplementation(() => undefined);
  });
  afterEach(() => prompt.mockRestore());
  type PromptButton = { text: string; onPress?: (v?: string) => void };
  const answerPrompt = async (button: string, value: string, call = -1) => {
    const buttons = prompt.mock.calls.at(call)![2] as PromptButton[];
    await act(async () => buttons.find((b) => b.text === button)!.onPress!(value));
  };

  it('exports a plain backup file when you choose no encryption, then removes the temp copy', async () => {
    seedStore({ profile: makeProfile(), holdings: [makeHolding({ name: 'Flat', value: 1 })], settings: { ...emptyData().settings, finnhubKey: 'secret' } });
    const seen = shared();
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByText('Export Backup…'));
    expect(alert).toHaveBeenCalledWith('Protect this backup?', expect.any(String), expect.any(Array));
    await pressAlertButton('Export without encryption');
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    const [uri, opts] = (Sharing.shareAsync as jest.Mock).mock.calls[0];
    expect(uri).toMatch(/^file:\/\/\/cache\/GuardBox-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(opts).toMatchObject({ mimeType: 'application/json', UTI: 'public.json' });
    const written = JSON.parse(seen[0].text);
    expect(written.app).toBe('GuardBox');
    expect(written.data.holdings[0].name).toBe('Flat');
    expect(seen[0].text).not.toContain('secret');
    await waitFor(() => expect(files.has(uri)).toBe(false));
  });

  it('exports an encrypted backup after the passphrase is typed twice', async () => {
    seedStore({ profile: makeProfile(), holdings: [makeHolding({ name: 'Flat', value: 1 })] });
    const seen = shared();
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByText('Export Backup…'));
    await pressAlertButton('Encrypt with passphrase');
    expect(prompt).toHaveBeenCalledWith('Choose a passphrase', expect.any(String), expect.any(Array), 'secure-text');
    await answerPrompt('Next', 'long enough pass');
    expect(prompt).toHaveBeenLastCalledWith('Type it again', undefined, expect.any(Array), 'secure-text');
    await answerPrompt('Continue', 'long enough pass');
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled(), { timeout: 5000 });
    expect(seen[0].uri).toMatch(/-encrypted\.json$/);
    expect(seen[0].text).not.toContain('Flat');
    const restored = await decryptBackup(seen[0].text, 'long enough pass');
    expect(restored.data.holdings[0].name).toBe('Flat');
  });

  it('does not export when the passphrase is too short or the two do not match', async () => {
    seedStore();
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByText('Export Backup…'));
    await pressAlertButton('Encrypt with passphrase');
    await answerPrompt('Next', 'short');
    expect(alert).toHaveBeenLastCalledWith('Passphrase too short', 'Use at least 8 characters.');
    await answerPrompt('Next', 'long enough pass');
    await answerPrompt('Continue', 'something else');
    expect(alert).toHaveBeenLastCalledWith('Passphrases do not match', expect.any(String));
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('imports an encrypted backup with the right passphrase', async () => {
    seedStore();
    const backup = toBackup({ ...emptyData(), holdings: [makeHolding({ name: 'Secret villa' })] });
    files.set('file:///enc.json', await encryptBackup(backup, 'long enough pass', { N: 2 ** 10, r: 8, p: 1 }));
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///enc.json' }] });
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByText('Restore from File…'));
    await waitFor(() => expect(prompt).toHaveBeenCalledWith('Enter the passphrase', 'This backup is encrypted.', expect.any(Array), 'secure-text'));
    await answerPrompt('Open', 'wrong passphrase');
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Import failed', 'Wrong passphrase, or the file was changed after it was exported.'));
    await answerPrompt('Open', 'long enough pass');
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Restore this backup?', expect.stringContaining('1 items'), expect.any(Array)));
    await pressAlertButton('Restore');
    expect(state().holdings[0].name).toBe('Secret villa');
    (DocumentPicker.getDocumentAsync as jest.Mock).mockReset();
  });

  it('imports a backup after confirming', async () => {
    seedStore();
    const backup = toBackup({ ...emptyData(), holdings: [makeHolding({ name: 'Imported' })] });
    files.set('file:///picked.json', JSON.stringify(backup));
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///picked.json' }] });
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByText('Restore from File…'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Restore this backup?', expect.stringContaining('1 items'), expect.any(Array)));
    await pressAlertButton('Restore');
    expect(state().holdings[0].name).toBe('Imported');
  });

  it('refuses a file that is not a backup', async () => {
    seedStore({ holdings: [makeHolding({ name: 'Mine' })] });
    files.set('file:///other.json', '{"hello":1}');
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///other.json' }] });
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByText('Restore from File…'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Import failed', 'This file is not a GuardBox backup.'));
    expect(state().holdings[0].name).toBe('Mine');
  });

  it('does nothing when the picker is cancelled', async () => {
    seedStore();
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByText('Restore from File…'));
    expect(alert).not.toHaveBeenCalled();
  });

  it('shows provider settings for the chosen cloud', async () => {
    seedStore();
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByText('Firebase'));
    expect(await screen.findByText('Firebase settings')).toBeOnTheScreen();
    expect(screen.getByText('Web API key')).toBeOnTheScreen();
    expect(screen.getByText('Create Account')).toBeOnTheScreen();
  });

  it('asks every provider, iCloud included, for an encryption passphrase', async () => {
    seedStore();
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByText('iCloud'));
    expect(await screen.findByText('iCloud settings')).toBeOnTheScreen();
    expect(screen.getByText('Encryption passphrase')).toBeOnTheScreen();
    expect(screen.getByText(/encrypted on this iPhone before upload/)).toBeOnTheScreen();
  });

  it('will not turn sync on without a passphrase of 8+ characters', async () => {
    seedStore();
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByText('iCloud'));
    await fireEvent.changeText(await screen.findByPlaceholderText('At least 8 characters'), 'short');
    await fireEvent.press(screen.getByText('Save & Sync Now'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Save failed', 'Encryption passphrase: Use at least 8 characters.'));
    expect(state().settings.syncProvider).toBe('none');
  });

  it('saves the passphrase with the provider settings and warns about an unencrypted cloud copy', async () => {
    seedStore({ modifiedAt: '2026-01-01T00:00:00.000Z' });
    const remote = { ...toBackup({ ...emptyData(), holdings: [makeHolding({ name: 'Old upload' })] }), exportedAt: '2026-01-02T00:00:00.000Z' };
    const pull = jest.spyOn(icloudProvider, 'pull').mockResolvedValue(remote);
    const push = jest.spyOn(icloudProvider, 'push').mockResolvedValue();
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByText('iCloud'));
    await fireEvent.changeText(await screen.findByPlaceholderText('At least 8 characters'), 'long enough pass');
    await fireEvent.press(screen.getByText('Save & Sync Now'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Unencrypted cloud copy', expect.stringContaining('not encrypted'), expect.any(Array)), { timeout: 5000 });
    expect((await loadConfig('icloud')).passphrase).toBe('long enough pass');
    expect(push).not.toHaveBeenCalled();
    await pressAlertButton('Keep this phone');
    await waitFor(() => expect(push).toHaveBeenCalled(), { timeout: 5000 });
    expect(push.mock.calls[0][1]).toMatchObject({ encrypted: 1 });
    pull.mockRestore();
    push.mockRestore();
  });

  it('turns sync off', async () => {
    seedStore({ settings: { ...emptyData().settings, syncProvider: 'firebase', autoSync: true } });
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByText('Off'));
    await fireEvent.press(screen.getByText('Turn Off Sync'));
    await waitFor(() => expect(state().settings.syncProvider).toBe('none'));
    expect(state().settings.autoSync).toBe(false);
  });
});
