import Constants from 'expo-constants';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import SyncScreen from '../../app/sync';
import { decryptBackup, encryptBackup } from '../../lib/backupCrypto';
import { emptyData } from '../../lib/defaults';
import { connectGoogle, createFile, forgetGoogleAccessToken } from '../../lib/google';
import { getSecret, setSecret } from '../../lib/security';
import { toBackup, useStore } from '../../lib/store';
import { CLIENT_ID, fakeGoogle, mockAuthResult } from '../../test/fakeDrive';
import { makeHolding } from '../../test/factories';
import { resetAppState, seedStore } from '../../test/helpers';

jest.mock('expo-auth-session', () => jest.requireActual('../../test/fakeDrive').authSessionMock());
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: 'file:///cache' } }));

const extra = (Constants.expoConfig as { extra: Record<string, unknown> }).extra;
const state = () => useStore.getState().data;
type Button = { text: string; onPress?: (v?: string) => void };
let alert: jest.SpyInstance;
let prompt: jest.SpyInstance;

const pressAlertButton = async (text: string) => {
  const buttons = alert.mock.calls.at(-1)![2] as Button[];
  await act(async () => buttons.find((b) => b.text === text)!.onPress!());
};
const answerPrompt = async (button: string, value: string) => {
  const buttons = prompt.mock.calls.at(-1)![2] as Button[];
  await act(async () => buttons.find((b) => b.text === button)!.onPress!(value));
};

beforeEach(async () => {
  await resetAppState();
  forgetGoogleAccessToken();
  extra.googleIosClientId = CLIENT_ID;
  mockAuthResult({ type: 'success', params: { code: 'auth-code' } });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  prompt = jest.spyOn(Alert, 'prompt').mockImplementation(() => undefined);
});
afterEach(() => {
  alert.mockRestore();
  prompt.mockRestore();
});

describe('Google Drive on the Backup & sync screen', () => {
  it('connects a Google account', async () => {
    seedStore();
    fakeGoogle();
    await render(<SyncScreen />);
    expect(screen.queryByText('Back Up Now')).toBeNull();
    await fireEvent.press(screen.getAllByText('Connect Google Drive')[0]);
    expect(await screen.findByText('asha@gmail.com')).toBeOnTheScreen();
    expect(screen.getByText('Asha Rao · Connected')).toBeOnTheScreen();
    expect(screen.getByText('Back Up Now')).toBeOnTheScreen();
    expect(screen.getByText('Restore from Google Drive')).toBeOnTheScreen();
  });

  it('explains when the build has no Google client ID', async () => {
    seedStore();
    extra.googleIosClientId = undefined;
    await render(<SyncScreen />);
    await fireEvent.press(screen.getAllByText('Connect Google Drive')[0]);
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Connect failed', expect.stringContaining('GOOGLE_IOS_CLIENT_ID')));
  });

  it('stays disconnected when sign-in is cancelled', async () => {
    seedStore();
    fakeGoogle();
    mockAuthResult({ type: 'dismiss' });
    await render(<SyncScreen />);
    await fireEvent.press(screen.getAllByText('Connect Google Drive')[0]);
    await waitFor(() => expect(screen.queryByText('Back Up Now')).toBeNull());
    expect(alert).not.toHaveBeenCalled();
  });

  it('backs up an encrypted copy after the passphrase is typed twice', async () => {
    seedStore({ holdings: [makeHolding({ name: 'Beach house' })] });
    const g = fakeGoogle();
    await connectGoogle();
    await render(<SyncScreen />);
    await fireEvent.press(await screen.findByText('Back Up Now'));
    await answerPrompt('Next', 'long enough pass');
    await answerPrompt('Continue', 'long enough pass');
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Backed up to Google Drive', expect.any(String)), { timeout: 8000 });
    const [file] = [...g.files.values()].filter((f) => f.appProperties?.guardbox === 'backup');
    expect(file.content).not.toContain('Beach house');
    expect((await decryptBackup(file.content, 'long enough pass')).data.holdings[0].name).toBe('Beach house');
    expect(state().settings.lastDriveBackupAt).toBeDefined();
    expect(screen.getByText(/Last backup: Just now\./)).toBeOnTheScreen();
  }, 20000);

  it('does not back up when the passphrases differ', async () => {
    seedStore();
    const g = fakeGoogle();
    await connectGoogle();
    await render(<SyncScreen />);
    await fireEvent.press(await screen.findByText('Back Up Now'));
    await answerPrompt('Next', 'long enough pass');
    await answerPrompt('Continue', 'another passphrase');
    expect(alert).toHaveBeenLastCalledWith('Passphrases do not match', 'Nothing was saved. Try again.');
    expect([...g.files.values()].filter((f) => f.appProperties?.guardbox === 'backup')).toHaveLength(0);
  });

  it('picks a backup from Drive, asks for its passphrase and restores it', async () => {
    seedStore({ holdings: [makeHolding({ name: 'Current' })] });
    fakeGoogle();
    await connectGoogle();
    const text = await encryptBackup(toBackup({ ...emptyData(), holdings: [makeHolding({ name: 'From Drive' })] }), 'long enough pass', { N: 2 ** 10, r: 8, p: 1 });
    await createFile('GuardBox-backup-2026-11-20-0800.json', text, 'backup');
    await render(<SyncScreen />);
    await fireEvent.press(await screen.findByText('Restore from Google Drive'));
    await fireEvent.press(await screen.findByText(/GuardBox-backup-2026-11-20-0800\.json/));
    expect(prompt).toHaveBeenLastCalledWith('Enter the passphrase', 'This backup is encrypted.', expect.any(Array), 'secure-text');
    await answerPrompt('Open', 'wrong passphrase');
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Restore failed', expect.stringContaining('Wrong passphrase')));
    expect(state().holdings[0].name).toBe('Current');
    await answerPrompt('Open', 'long enough pass');
    await waitFor(() => expect(alert).toHaveBeenLastCalledWith('Restore this backup?', expect.stringContaining('1 items'), expect.any(Array)));
    await pressAlertButton('Restore');
    expect(state().holdings[0].name).toBe('From Drive');
  });

  it('says when there are no backups in Drive yet', async () => {
    seedStore();
    fakeGoogle();
    await connectGoogle();
    await render(<SyncScreen />);
    await fireEvent.press(await screen.findByText('Restore from Google Drive'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('No backups yet', expect.any(String)));
  });

  it('switches back to Connect when Google access was revoked', async () => {
    seedStore();
    const g = fakeGoogle();
    await connectGoogle();
    forgetGoogleAccessToken();
    g.tokens.rejectRefresh = true;
    await render(<SyncScreen />);
    await fireEvent.press(await screen.findByText('Restore from Google Drive'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Restore failed', expect.stringContaining('Connect your Google account again')));
    expect(await screen.findByText('Back up to your own Google Drive')).toBeOnTheScreen();
  });

  it('disconnects after confirming and turns Google Drive sync off', async () => {
    seedStore({ settings: { ...emptyData().settings, syncProvider: 'gdrive', autoSync: true } });
    const g = fakeGoogle();
    await connectGoogle();
    await render(<SyncScreen />);
    await fireEvent.press(await screen.findByText('Disconnect'));
    expect(alert).toHaveBeenLastCalledWith('Disconnect Google Drive?', expect.stringContaining('Google Drive sync turns off'), expect.any(Array));
    await pressAlertButton('Disconnect');
    await waitFor(() => expect(state().settings.syncProvider).toBe('none'));
    expect(state().settings.autoSync).toBe(false);
    expect(g.tokens.revoked).toEqual(['refresh-1']);
    expect(await getSecret('google')).toBeNull();
    expect(screen.getAllByText('Connect Google Drive').length).toBeGreaterThan(0);
  });

  it('needs a connected account before Google Drive sync can be turned on', async () => {
    seedStore();
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Google Drive' }));
    expect(await screen.findByText('Google Drive settings')).toBeOnTheScreen();
    expect(screen.getByText('Not connected')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByPlaceholderText('At least 8 characters'), 'long enough pass');
    await fireEvent.press(screen.getByText('Save & Sync Now'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Save failed', 'Connect your Google account first.'));
    expect(state().settings.syncProvider).toBe('none');
  });

  it('turns on Google Drive sync once connected', async () => {
    seedStore({ holdings: [makeHolding({ name: 'Savings' })] });
    const g = fakeGoogle();
    await connectGoogle();
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Google Drive' }));
    await fireEvent.changeText(await screen.findByPlaceholderText('At least 8 characters'), 'long enough pass');
    await fireEvent.press(screen.getByText('Save & Sync Now'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Sync complete', 'Uploaded your data.'), { timeout: 8000 });
    expect(state().settings.syncProvider).toBe('gdrive');
    const synced = [...g.files.values()].find((f) => f.appProperties?.guardbox === 'sync')!;
    expect(synced.content).not.toContain('Savings');
    expect(screen.getByText(/Google Drive · Synced just now/)).toBeOnTheScreen();
    expect(screen.getByText('Sync Automatically')).toBeOnTheScreen();
  }, 20000);
});

describe('sync status', () => {
  it('shows that sync is off', async () => {
    seedStore();
    await render(<SyncScreen />);
    expect(screen.getByText('Cloud sync is off')).toBeOnTheScreen();
    expect(screen.queryByText('Sync Automatically')).toBeNull();
  });

  it('shows the last error in the status and under the sync controls', async () => {
    seedStore({ settings: { ...emptyData().settings, syncProvider: 'firebase', lastSyncError: 'Missing: Password' } });
    await render(<SyncScreen />);
    expect(screen.getByText('Firebase · Needs attention')).toBeOnTheScreen();
    expect(screen.getByText('Last error: Missing: Password')).toBeOnTheScreen();
  });

  it('shows when it has not synced yet, and toggles auto sync', async () => {
    seedStore({ settings: { ...emptyData().settings, syncProvider: 'icloud' } });
    await setSecret('sync.icloud', JSON.stringify({ passphrase: 'long enough pass' }));
    await render(<SyncScreen />);
    expect(screen.getByText('iCloud · Not synced yet')).toBeOnTheScreen();
    await fireEvent(screen.getByLabelText('Sync Automatically'), 'valueChange', true);
    expect(state().settings.autoSync).toBe(true);
  });

  it('asks before replacing this phone with the cloud copy', async () => {
    seedStore({ settings: { ...emptyData().settings, syncProvider: 'icloud' } });
    await render(<SyncScreen />);
    await fireEvent.press(screen.getByText('Replace with Cloud Copy'));
    expect(alert).toHaveBeenLastCalledWith('Replace this device’s data?', expect.any(String), expect.any(Array));
  });
});
