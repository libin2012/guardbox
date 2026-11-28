import Constants from 'expo-constants';
import { decryptBackup, encryptBackup } from '../backupCrypto';
import { backupToDrive, deleteDriveBackup, listDriveBackups, openDriveBackup } from '../driveBackup';
import {
  backupFileName,
  connectGoogle,
  createFile,
  disconnectGoogle,
  downloadFile,
  ensureFolder,
  forgetGoogleAccessToken,
  getGoogleAccount,
  googleClientId,
  GoogleNotConnectedError,
  listGuardBoxFiles,
  redirectUri,
  reversedClientId,
  updateFile,
} from '../google';
import { emptyData } from '../defaults';
import { getSecret, setSecret } from '../security';
import { syncNow } from '../sync';
import { gdriveProvider } from '../sync/gdrive';
import { toBackup, useStore } from '../store';
import { CLIENT_ID, fakeGoogle, mockAuthResult } from '../../test/fakeDrive';
import { makeHolding } from '../../test/factories';
import { resetAppState, seedStore } from '../../test/helpers';

jest.mock('expo-auth-session', () => jest.requireActual('../../test/fakeDrive').authSessionMock());
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { googleIosClientId: '123-abc.apps.googleusercontent.com' } } } }));

const extra = (Constants.expoConfig as { extra: Record<string, unknown> }).extra;
const AuthSession = jest.requireMock<{ __requests: Record<string, unknown>[] }>('expo-auth-session');
const FAST = { N: 2 ** 10, r: 8, p: 1 };

beforeEach(async () => {
  await resetAppState();
  forgetGoogleAccessToken();
  extra.googleIosClientId = CLIENT_ID;
  mockAuthResult({ type: 'success', params: { code: 'auth-code' } });
  AuthSession.__requests.length = 0;
});

async function connected(opts?: Parameters<typeof fakeGoogle>[0]) {
  const g = fakeGoogle(opts);
  await connectGoogle();
  return g;
}

describe('client ID', () => {
  it('turns the client ID into the URL scheme Google redirects back to', () => {
    expect(reversedClientId(CLIENT_ID)).toBe('com.googleusercontent.apps.123-abc');
    expect(redirectUri(CLIENT_ID)).toBe('com.googleusercontent.apps.123-abc:/oauthredirect');
    expect(googleClientId()).toBe(CLIENT_ID);
  });

  it('explains how to set up a build without a client ID', async () => {
    extra.googleIosClientId = '  ';
    expect(googleClientId()).toBeUndefined();
    await expect(connectGoogle()).rejects.toThrow(/GOOGLE_IOS_CLIENT_ID/);
  });
});

describe('connecting a Google account', () => {
  it('signs in with PKCE, asks only for drive.file, and keeps the refresh token in the keychain', async () => {
    const g = fakeGoogle();
    await expect(connectGoogle()).resolves.toEqual({ email: 'asha@gmail.com', name: 'Asha Rao' });
    expect(AuthSession.__requests[0]).toMatchObject({ clientId: CLIENT_ID, usePKCE: true, scopes: ['https://www.googleapis.com/auth/drive.file'], redirectUri: 'com.googleusercontent.apps.123-abc:/oauthredirect' });
    const tokenCall = g.fetch.mock.calls.find(([url]) => url.includes('/token'))!;
    expect(String(tokenCall[1]!.body)).toContain('code_verifier=verifier-123');
    expect(JSON.parse((await getSecret('google'))!)).toMatchObject({ refreshToken: 'refresh-1', email: 'asha@gmail.com' });
    await expect(getGoogleAccount()).resolves.toEqual({ email: 'asha@gmail.com', name: 'Asha Rao' });
  });

  it('returns null and stores nothing when the user cancels', async () => {
    const g = fakeGoogle();
    mockAuthResult({ type: 'cancel' });
    await expect(connectGoogle()).resolves.toBeNull();
    expect(g.fetch).not.toHaveBeenCalled();
    await expect(getGoogleAccount()).resolves.toBeNull();
  });

  it('reports an error from Google', async () => {
    fakeGoogle();
    mockAuthResult({ type: 'error', params: {}, error: { message: 'access_denied' } });
    await expect(connectGoogle()).rejects.toThrow('access_denied');
    mockAuthResult({ type: 'success', params: {} });
    await expect(connectGoogle()).rejects.toThrow('did not complete');
  });

  it('reports a failed code exchange', async () => {
    fakeGoogle();
    mockAuthResult({ type: 'success', params: { code: 'stale' } });
    await expect(connectGoogle()).rejects.toThrow('Bad code');
    await expect(getGoogleAccount()).resolves.toBeNull();
  });

  it('refuses a sign-in without a refresh token', async () => {
    const g = fakeGoogle();
    g.tokens.refresh = '';
    await expect(connectGoogle()).rejects.toThrow('did not return a sign-in token');
  });

  it('still connects when the account name cannot be read', async () => {
    const g = fakeGoogle();
    const real = g.fetch.getMockImplementation()!;
    g.fetch.mockImplementation(async (url, init) => (url.includes('/about') ? { ok: false, status: 500, json: async () => ({}) } : real(url, init)));
    await expect(connectGoogle()).resolves.toEqual({ email: undefined, name: undefined });
  });

  it('ignores a damaged keychain entry', async () => {
    await setSecret('google', 'not json');
    await expect(getGoogleAccount()).resolves.toBeNull();
  });

  it('disconnects: revokes the token and forgets the account', async () => {
    const g = await connected();
    await disconnectGoogle();
    expect(g.tokens.revoked).toEqual(['refresh-1']);
    await expect(getGoogleAccount()).resolves.toBeNull();
    await expect(listGuardBoxFiles('backup')).rejects.toBeInstanceOf(GoogleNotConnectedError);
  });

  it('forgets the account even when the revoke call fails offline', async () => {
    const g = await connected();
    g.fetch.mockImplementation(async () => {
      throw new Error('offline');
    });
    await disconnectGoogle();
    await expect(getGoogleAccount()).resolves.toBeNull();
  });
});

describe('tokens', () => {
  it('refreshes the access token when it is not in memory', async () => {
    const g = await connected();
    forgetGoogleAccessToken();
    await ensureFolder();
    expect(g.tokens.refreshCalls).toBe(1);
    await ensureFolder();
    expect(g.tokens.refreshCalls).toBe(1);
  });

  it('retries once with a fresh token after a 401', async () => {
    const g = await connected();
    g.tokens.expireNext = true;
    await expect(ensureFolder()).resolves.toMatch(/^file-/);
    expect(g.tokens.refreshCalls).toBe(1);
  });

  it('forgets an account whose access was revoked, and says how to fix it', async () => {
    const g = await connected();
    forgetGoogleAccessToken();
    g.tokens.rejectRefresh = true;
    await expect(ensureFolder()).rejects.toThrow('Connect your Google account again');
    await expect(getGoogleAccount()).resolves.toBeNull();
  });

  it('keeps the account when the token server has another problem', async () => {
    const g = await connected();
    forgetGoogleAccessToken();
    const real = g.fetch.getMockImplementation()!;
    g.fetch.mockImplementation(async (url, init) => (url.includes('/token') ? { ok: false, status: 503, text: async () => 'busy' } : real(url, init)));
    await expect(ensureFolder()).rejects.toThrow('HTTP 503');
    await expect(getGoogleAccount()).resolves.not.toBeNull();
  });

  it('says so when Google takes too long', async () => {
    await connected();
    global.fetch = jest.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    jest.useFakeTimers();
    try {
      const p = ensureFolder();
      const check = expect(p).rejects.toThrow('www.googleapis.com did not answer in time');
      await jest.advanceTimersByTimeAsync(31000);
      await check;
    } finally {
      jest.useRealTimers();
    }
  });

  it('passes on other network errors', async () => {
    await connected();
    global.fetch = jest.fn(async () => {
      throw new Error('The Internet connection appears to be offline.');
    }) as unknown as typeof fetch;
    await expect(ensureFolder()).rejects.toThrow('appears to be offline');
  });
});

describe('Drive files', () => {
  it('creates the GuardBox folder once and reuses it', async () => {
    const g = await connected();
    const id = await ensureFolder();
    expect(g.folder()).toMatchObject({ id, name: 'GuardBox' });
    await expect(ensureFolder()).resolves.toBe(id);
    expect([...g.files.values()].filter((f) => f.name === 'GuardBox')).toHaveLength(1);
  });

  it('makes the folder again if the user deleted it', async () => {
    const g = await connected();
    const first = await ensureFolder();
    g.files.get(first)!.trashed = true;
    await expect(ensureFolder()).resolves.not.toBe(first);
  });

  it('uploads, lists newest first, updates, downloads and deletes', async () => {
    const g = await connected();
    const a = await createFile('a.json', '{"a":1}', 'backup');
    const b = await createFile('b.json', '{"b":2}', 'backup');
    await createFile('sync.json', '{}', 'sync');
    expect(g.files.get(a.id)).toMatchObject({ parents: [g.folder()!.id], appProperties: { guardbox: 'backup' }, mimeType: 'application/json' });
    expect((await listGuardBoxFiles('backup')).map((f) => f.name)).toEqual(['b.json', 'a.json']);
    await updateFile(b.id, '{"b":3}');
    await expect(downloadFile(b.id)).resolves.toBe('{"b":3}');
    await deleteDriveBackup(a.id);
    expect((await listDriveBackups()).map((f) => f.id)).toEqual([b.id]);
  });

  it('shows Drive’s own error message', async () => {
    await connected();
    await expect(downloadFile('missing')).rejects.toThrow('File not found.');
  });

  it('falls back to the status code when the error has no message', async () => {
    const g = await connected();
    const real = g.fetch.getMockImplementation()!;
    g.fetch.mockImplementation(async (url, init) => (url.includes('/drive/') ? { ok: false, status: 500, json: async () => { throw new Error('html'); } } : real(url, init)));
    await expect(ensureFolder()).rejects.toThrow('Google Drive HTTP 500');
  });

  it('names backups by date and time', () => {
    expect(backupFileName(new Date('2026-11-28T09:05:00.000Z'))).toBe('GuardBox-backup-2026-11-28-0905.json');
  });
});

describe('Drive backups', () => {
  it('uploads only ciphertext that opens with the passphrase', async () => {
    const g = await connected();
    const data = { ...emptyData(), holdings: [makeHolding({ name: 'Beach house' })], settings: { ...emptyData().settings, finnhubKey: 'secret-key' } };
    const file = await backupToDrive(data, 'long enough pass');
    expect(file.name).toMatch(/^GuardBox-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    const stored = g.files.get(file.id)!.content;
    expect(stored).not.toContain('Beach house');
    expect(stored).not.toContain('secret-key');
    expect((await decryptBackup(stored, 'long enough pass')).data.holdings[0].name).toBe('Beach house');
    await expect(openDriveBackup(file.id, 'long enough pass')).resolves.toMatchObject({ app: 'GuardBox' });
    await expect(openDriveBackup(file.id, 'wrong passphrase')).rejects.toThrow('Wrong passphrase');
  }, 20000);

  it('will not upload with a short passphrase', async () => {
    const g = await connected();
    await expect(backupToDrive(emptyData(), 'short')).rejects.toThrow('at least 8');
    expect(g.files.size).toBe(0);
  });

  it('will not open a file that is not an encrypted backup', async () => {
    await connected();
    const plain = await createFile('plain.json', JSON.stringify(toBackup(emptyData())), 'backup');
    await expect(openDriveBackup(plain.id, 'whatever pass')).rejects.toThrow('not an encrypted GuardBox backup');
  });
});

describe('Google Drive sync', () => {
  it('pull finds nothing before the first upload', async () => {
    await connected();
    await expect(gdriveProvider.pull({})).resolves.toBeNull();
  });

  it('push creates one sync file, then updates it in place', async () => {
    const g = await connected();
    const first = JSON.parse(await encryptBackup(toBackup(emptyData()), 'long enough pass', FAST));
    await gdriveProvider.push({}, first);
    await gdriveProvider.push({}, { ...first, iv: 'changed' });
    const syncFiles = [...g.files.values()].filter((f) => f.appProperties?.guardbox === 'sync');
    expect(syncFiles).toHaveLength(1);
    expect(syncFiles[0].name).toBe('GuardBox-sync.json');
    await expect(gdriveProvider.pull({})).resolves.toMatchObject({ iv: 'changed' });
  });

  it('syncs end to end encrypted through syncNow', async () => {
    const g = await connected();
    seedStore({ holdings: [makeHolding({ name: 'Savings' })], settings: { ...emptyData().settings, syncProvider: 'gdrive' }, modifiedAt: '2026-11-28T00:00:00.000Z' });
    await setSecret('sync.gdrive', JSON.stringify({ passphrase: 'long enough pass' }));
    await expect(syncNow('auto')).resolves.toEqual({ kind: 'pushed' });
    const synced = [...g.files.values()].find((f) => f.appProperties?.guardbox === 'sync')!;
    expect(synced.content).not.toContain('Savings');
    useStore.getState().resetAll();
    useStore.getState().updateSettings({ syncProvider: 'gdrive' });
    await expect(syncNow('pull')).resolves.toEqual({ kind: 'pulled' });
    expect(useStore.getState().data.holdings[0].name).toBe('Savings');
  }, 20000);

  it('stops sync with a clear message when Google is not connected', async () => {
    seedStore({ settings: { ...emptyData().settings, syncProvider: 'gdrive' } });
    await setSecret('sync.gdrive', JSON.stringify({ passphrase: 'long enough pass' }));
    await expect(syncNow('auto')).rejects.toThrow('Connect your Google account first.');
    expect(useStore.getState().data.settings.lastSyncError).toBe('Connect your Google account first.');
  });
});
