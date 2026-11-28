import { EncryptedBackupFile, forgetPassphraseKey, openBackup, sealBackup } from '../backupCrypto';
import { emptyData } from '../defaults';
import { toBackup, useStore } from '../store';
import { awsProvider } from '../sync/aws';
import { firebaseProvider } from '../sync/firebase';
import { icloudProvider } from '../sync/icloud';
import { getProvider, loadConfig, PROVIDERS, saveConfig, SyncPayload, syncNow } from '../sync';
import { supabaseProvider } from '../sync/supabase';
import { errorMessage, required } from '../sync/types';
import { BackupFile } from '../types';
import { makeHolding } from '../../test/factories';
import { json, mockFetch, resetAppState, seedStore, text } from '../../test/helpers';

const store = () => useStore.getState();

beforeEach(async () => {
  jest.useFakeTimers();
  await resetAppState();
  jest.restoreAllMocks();
});
afterEach(() => jest.useRealTimers());

function remoteBackup(exportedAt: string, name = 'From cloud'): BackupFile {
  return { ...toBackup({ ...emptyData(), holdings: [makeHolding({ name })], modifiedAt: exportedAt }), exportedAt };
}

const PASS = 'sync passphrase 1';
const FAST = { N: 2 ** 10, r: 8, p: 1 };

/** What another device running this version would have uploaded. */
const encrypted = (b: BackupFile, passphrase = PASS) => sealBackup(b, passphrase, { params: FAST });

/** Use the iCloud provider slot with a fake cloud we control. Plain BackupFiles stand for uploads by older versions. */
function fakeCloud(remote: SyncPayload | null) {
  const push = jest.spyOn(icloudProvider, 'push').mockResolvedValue();
  const pull = jest.spyOn(icloudProvider, 'pull').mockResolvedValue(remote);
  return { push, pull };
}

/** Decrypt what syncNow uploaded. */
const uploaded = (push: jest.SpyInstance, call = 0) => openBackup(push.mock.calls[call][1] as EncryptedBackupFile, PASS, 'file');

async function seedSynced(opts: { lastSyncAt: string; modifiedAt: string }, passphrase: string | null = PASS) {
  seedStore({
    holdings: [makeHolding({ name: 'On phone' })],
    modifiedAt: opts.modifiedAt,
    settings: { ...emptyData().settings, syncProvider: 'icloud', lastSyncAt: opts.lastSyncAt },
  });
  await saveConfig('icloud', passphrase ? { passphrase } : {});
}

describe('providers', () => {
  it('offers iCloud, Google Drive, Firebase, Supabase and AWS', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['icloud', 'gdrive', 'firebase', 'supabase', 'aws']);
    expect(getProvider('none')).toBeUndefined();
    expect(getProvider('aws')?.label).toBe('AWS');
  });

  it('keeps provider settings in the keychain', async () => {
    expect(await loadConfig('firebase')).toEqual({});
    await saveConfig('firebase', { apiKey: 'k', projectId: 'p' });
    expect(await loadConfig('firebase')).toEqual({ apiKey: 'k', projectId: 'p' });
  });

  it('lists missing required fields', () => {
    const fields = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', optional: true }, { key: 'c', label: 'C' }];
    expect(() => required({ a: 'x', c: ' ' }, fields)).toThrow('Missing: C');
    expect(() => required({ a: 'x', c: 'y' }, fields)).not.toThrow();
  });

  it('pulls readable messages out of provider errors', () => {
    expect(errorMessage({ error: { message: 'INVALID_PASSWORD' } })).toBe('INVALID_PASSWORD');
    expect(errorMessage({ error_description: 'Invalid login' })).toBe('Invalid login');
    expect(errorMessage({ msg: 'm' })).toBe('m');
    expect(errorMessage({ error: 'plain' })).toBe('plain');
    expect(errorMessage(null)).toBeUndefined();
  });

  it('explains that iCloud is off in this build', async () => {
    await expect(icloudProvider.pull({})).rejects.toThrow(/iCloud turned off/);
  });
});

describe('syncNow', () => {
  it('needs a provider', async () => {
    seedStore();
    await expect(syncNow()).rejects.toThrow('Choose a sync provider first.');
  });

  it('uploads when the cloud is empty', async () => {
    await seedSynced({ lastSyncAt: '', modifiedAt: '2026-01-01T00:00:00.000Z' });
    const cloud = fakeCloud(null);
    expect(await syncNow()).toEqual({ kind: 'pushed' });
    expect((await uploaded(cloud.push)).data.holdings[0].name).toBe('On phone');
    expect(store().data.settings.lastSyncAt).toBeTruthy();
  });

  it('uploads when only the phone changed', async () => {
    await seedSynced({ lastSyncAt: '2026-01-02T00:00:00.000Z', modifiedAt: '2026-01-03T00:00:00.000Z' });
    const cloud = fakeCloud(await encrypted(remoteBackup('2026-01-01T00:00:00.000Z')));
    expect(await syncNow()).toEqual({ kind: 'pushed' });
    expect(cloud.push).toHaveBeenCalled();
  });

  it('downloads when only the cloud changed', async () => {
    await seedSynced({ lastSyncAt: '2026-01-02T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' });
    const cloud = fakeCloud(await encrypted(remoteBackup('2026-01-03T00:00:00.000Z')));
    expect(await syncNow()).toEqual({ kind: 'pulled' });
    expect(cloud.push).not.toHaveBeenCalled();
    expect(store().data.holdings[0].name).toBe('From cloud');
  });

  it('reports a conflict when both changed and changes nothing', async () => {
    await seedSynced({ lastSyncAt: '2026-01-02T00:00:00.000Z', modifiedAt: '2026-01-03T00:00:00.000Z' });
    const remote = remoteBackup('2026-01-04T00:00:00.000Z');
    const cloud = fakeCloud(await encrypted(remote));
    expect(await syncNow()).toEqual({ kind: 'conflict', remote });
    expect(cloud.push).not.toHaveBeenCalled();
    expect(store().data.holdings[0].name).toBe('On phone');
    expect(store().data.settings.lastSyncAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('does nothing when neither changed', async () => {
    await seedSynced({ lastSyncAt: '2026-01-05T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' });
    const cloud = fakeCloud(await encrypted(remoteBackup('2026-01-02T00:00:00.000Z')));
    expect(await syncNow()).toEqual({ kind: 'up-to-date' });
    expect(cloud.push).not.toHaveBeenCalled();
  });

  it('forces an upload or download when asked', async () => {
    await seedSynced({ lastSyncAt: '2026-01-05T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' });
    const cloud = fakeCloud(await encrypted(remoteBackup('2026-01-02T00:00:00.000Z')));
    expect(await syncNow('push')).toEqual({ kind: 'pushed' });
    expect(cloud.pull).not.toHaveBeenCalled();
    expect(await syncNow('pull')).toEqual({ kind: 'pulled' });
    expect(store().data.holdings[0].name).toBe('From cloud');
  });

  it('cannot download from an empty cloud', async () => {
    await seedSynced({ lastSyncAt: '', modifiedAt: '' });
    fakeCloud(null);
    await expect(syncNow('pull')).rejects.toThrow('No backup found in the cloud yet.');
  });

  it('records the last error and clears it after a good sync', async () => {
    await seedSynced({ lastSyncAt: '', modifiedAt: '2026-01-01T00:00:00.000Z' });
    jest.spyOn(icloudProvider, 'pull').mockRejectedValueOnce(new Error('offline'));
    await expect(syncNow()).rejects.toThrow('offline');
    expect(store().data.settings.lastSyncError).toBe('offline');
    fakeCloud(null);
    await syncNow();
    expect(store().data.settings.lastSyncError).toBeUndefined();
  });
});

describe('end-to-end encryption of sync', () => {
  beforeEach(() => forgetPassphraseKey());

  it('uploads only ciphertext, which opens with the passphrase', async () => {
    await seedSynced({ lastSyncAt: '', modifiedAt: '2026-01-01T00:00:00.000Z' });
    const cloud = fakeCloud(null);
    await syncNow('push');
    const payload = cloud.push.mock.calls[0][1];
    expect(payload).toMatchObject({ app: 'GuardBox', encrypted: 1, kdf: { name: 'scrypt', N: 2 ** 16 } });
    expect(JSON.stringify(payload)).not.toContain('On phone');
    expect((await uploaded(cloud.push)).data.holdings[0].name).toBe('On phone');
  });

  it('runs scrypt once per passphrase, with a fresh IV for every upload', async () => {
    await seedSynced({ lastSyncAt: '', modifiedAt: '2026-01-01T00:00:00.000Z' });
    const cloud = fakeCloud(null);
    await syncNow('push');
    await syncNow('push');
    const [a, b] = [cloud.push.mock.calls[0][1] as EncryptedBackupFile, cloud.push.mock.calls[1][1] as EncryptedBackupFile];
    expect(a.kdf.salt).toBe(b.kdf.salt);
    expect(a.data.slice(0, 16)).not.toBe(b.data.slice(0, 16));
    // changing the settings starts over with a new salt
    await saveConfig('icloud', { passphrase: 'another passphrase' });
    await syncNow('push');
    expect((cloud.push.mock.calls[2][1] as EncryptedBackupFile).kdf.salt).not.toBe(a.kdf.salt);
  });

  it('needs a passphrase before anything is uploaded', async () => {
    await seedSynced({ lastSyncAt: '', modifiedAt: '2026-01-01T00:00:00.000Z' }, null);
    const cloud = fakeCloud(null);
    await expect(syncNow()).rejects.toThrow(/Set an encryption passphrase/);
    expect(cloud.pull).not.toHaveBeenCalled();
    expect(cloud.push).not.toHaveBeenCalled();
    expect(store().data.settings.lastSyncError).toMatch(/encryption passphrase/);
  });

  it('stops, changes nothing and never overwrites the cloud when the passphrase is wrong', async () => {
    await seedSynced({ lastSyncAt: '2026-01-02T00:00:00.000Z', modifiedAt: '2026-01-03T00:00:00.000Z' });
    const cloud = fakeCloud(await encrypted(remoteBackup('2026-01-01T00:00:00.000Z'), 'someone elses pass'));
    await expect(syncNow()).rejects.toThrow(/wrong sync passphrase, or it was changed by someone else/);
    expect(cloud.push).not.toHaveBeenCalled();
    expect(store().data.holdings[0].name).toBe('On phone');
  });

  it('detects a cloud copy that was changed by someone else', async () => {
    await seedSynced({ lastSyncAt: '2026-01-02T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' });
    const remote = await encrypted(remoteBackup('2026-01-03T00:00:00.000Z'));
    const chars = remote.data.split('');
    chars[30] = chars[30] === 'A' ? 'B' : 'A';
    const cloud = fakeCloud({ ...remote, data: chars.join('') });
    await expect(syncNow()).rejects.toThrow(/could not be opened/);
    await expect(syncNow('pull')).rejects.toThrow(/could not be opened/);
    expect(cloud.push).not.toHaveBeenCalled();
    expect(store().data.holdings[0].name).toBe('On phone');
  });

  it('replaces an unchanged plain copy from an older version with an encrypted one', async () => {
    await seedSynced({ lastSyncAt: '2026-01-05T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' });
    const cloud = fakeCloud(remoteBackup('2026-01-02T00:00:00.000Z'));
    expect(await syncNow()).toEqual({ kind: 'pushed' });
    expect(cloud.push.mock.calls[0][1]).toMatchObject({ encrypted: 1 });
    expect(store().data.holdings[0].name).toBe('On phone');
  });

  it('asks before taking a plain cloud copy that changed', async () => {
    await seedSynced({ lastSyncAt: '2026-01-02T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' });
    const remote = remoteBackup('2026-01-03T00:00:00.000Z');
    const cloud = fakeCloud(remote);
    expect(await syncNow()).toEqual({ kind: 'conflict', remote, unencrypted: true });
    expect(cloud.push).not.toHaveBeenCalled();
    expect(store().data.holdings[0].name).toBe('On phone');
    // an explicit download is the user's choice
    expect(await syncNow('pull')).toEqual({ kind: 'pulled' });
    expect(store().data.holdings[0].name).toBe('From cloud');
  });

  it('opens copies from another device that used the same passphrase', async () => {
    await seedSynced({ lastSyncAt: '2026-01-02T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' });
    fakeCloud(await sealBackup(remoteBackup('2026-01-03T00:00:00.000Z', 'From iPad'), PASS, { params: FAST }));
    expect(await syncNow()).toEqual({ kind: 'pulled' });
    expect(store().data.holdings[0].name).toBe('From iPad');
  });
});

describe('providers store encrypted payloads as they are', () => {
  it('Firebase round-trips an encrypted payload', async () => {
    const payload = await encrypted(remoteBackup('2026-01-01T00:00:00.000Z'));
    const f = mockFetch((url) => (url.includes('identitytoolkit') ? json({ idToken: 't', localId: 'u' }) : json({})));
    await firebaseProvider.push({ apiKey: 'a', projectId: 'p', email: 'e', password: 'pw' }, payload);
    const body = JSON.parse(f.mock.calls[1][1]!.body as string);
    expect(Date.parse(body.fields.updatedAt.timestampValue)).not.toBeNaN();
    const stored = body.fields.data.stringValue as string;
    expect(stored).not.toContain('From cloud');
    mockFetch((url) => (url.includes('identitytoolkit') ? json({ idToken: 't', localId: 'u' }) : json({ fields: { data: { stringValue: stored } } })));
    expect(await firebaseProvider.pull({ apiKey: 'a', projectId: 'p', email: 'e', password: 'pw' })).toEqual(payload);
  });

  it('AWS round-trips an encrypted payload', async () => {
    const payload = await encrypted(remoteBackup('2026-01-01T00:00:00.000Z'));
    mockFetch(() => text(JSON.stringify(payload)));
    const auth = { AuthenticationResult: { IdToken: 'id' } };
    mockFetch((url, init) => {
      const target = (init?.headers as Record<string, string> | undefined)?.['X-Amz-Target'];
      if (target?.endsWith('.InitiateAuth')) return json(auth);
      if (target?.endsWith('.GetId')) return json({ IdentityId: 'r:abc' });
      if (target?.endsWith('.GetCredentialsForIdentity')) return json({ Credentials: { AccessKeyId: 'A', SecretKey: 'S', SessionToken: 'T' } });
      return text(JSON.stringify(payload));
    });
    expect(await awsProvider.pull({ region: 'r', userPoolId: 'r_p', clientId: 'c', identityPoolId: 'r:p', bucket: 'b', email: 'e', password: 'pw' })).toEqual(payload);
  });
});

describe('Firebase over REST', () => {
  const cfg = { apiKey: 'AIza', projectId: 'proj', email: ' me@example.com ', password: 'pw' };

  it('signs in and stores the backup in the user\'s document', async () => {
    const f = mockFetch((url) => (url.includes('identitytoolkit') ? json({ idToken: 'tok', localId: 'uid1' }) : json({})));
    const backup = remoteBackup('2026-01-01T00:00:00.000Z');
    await firebaseProvider.push(cfg, backup);
    expect(JSON.parse(f.mock.calls[0][1]!.body as string)).toMatchObject({ email: 'me@example.com', password: 'pw' });
    const [url, init] = f.mock.calls[1];
    expect(url).toContain('/projects/proj/databases/(default)/documents/users/uid1/guardbox/backup');
    expect(init!.method).toBe('PATCH');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(JSON.parse(init!.body as string).fields.data.stringValue)).toEqual(backup);
  });

  it('reads the backup back, or null when there is none', async () => {
    const backup = remoteBackup('2026-01-01T00:00:00.000Z');
    mockFetch((url) => (url.includes('identitytoolkit') ? json({ idToken: 't', localId: 'u' }) : json({ fields: { data: { stringValue: JSON.stringify(backup) } } })));
    expect(await firebaseProvider.pull(cfg)).toEqual(backup);
    mockFetch((url) => (url.includes('identitytoolkit') ? json({ idToken: 't', localId: 'u' }) : json({}, 404)));
    expect(await firebaseProvider.pull(cfg)).toBeNull();
  });

  it('shows Firebase\'s own error message', async () => {
    mockFetch(() => json({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }, 400));
    await expect(firebaseProvider.pull(cfg)).rejects.toThrow('INVALID_LOGIN_CREDENTIALS');
  });

  it('checks required fields before any network call', async () => {
    const f = mockFetch(() => json({}));
    await expect(firebaseProvider.pull({ apiKey: 'x' })).rejects.toThrow(/^Missing: /);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('Supabase over REST', () => {
  const cfg = { url: 'https://xyz.supabase.co/', anonKey: 'anon', email: 'me@example.com', password: 'pw' };

  it('upserts the backup row for the signed-in user', async () => {
    const f = mockFetch((url) => (url.includes('/auth/v1/token') ? json({ access_token: 'at', user: { id: 'u1' } }) : json(null, 201)));
    const backup = remoteBackup('2026-01-01T00:00:00.000Z');
    await supabaseProvider.push(cfg, backup);
    expect(f.mock.calls[0][0]).toBe('https://xyz.supabase.co/auth/v1/token?grant_type=password');
    const [url, init] = f.mock.calls[1];
    expect(url).toBe('https://xyz.supabase.co/rest/v1/guardbox_backups?on_conflict=user_id');
    expect(JSON.parse(init!.body as string)).toEqual({ user_id: 'u1', data: backup, updated_at: backup.exportedAt });
  });

  it('pulls the row, or null when there is none', async () => {
    const backup = remoteBackup('2026-01-01T00:00:00.000Z');
    mockFetch((url) => (url.includes('/auth/') ? json({ access_token: 'at', user: { id: 'u1' } }) : json([{ data: backup }])));
    expect(await supabaseProvider.pull(cfg)).toEqual(backup);
    mockFetch((url) => (url.includes('/auth/') ? json({ access_token: 'at', user: { id: 'u1' } }) : json([])));
    expect(await supabaseProvider.pull(cfg)).toBeNull();
  });
});

describe('AWS (Cognito + S3)', () => {
  const cfg = { region: 'eu-west-1', userPoolId: 'eu-west-1_Pool', clientId: 'client', identityPoolId: 'eu-west-1:pool', bucket: 'my-bucket', email: 'me@example.com', password: 'pw' };

  function aws(s3: (url: string, init?: RequestInit) => Partial<Response>, auth: Record<string, unknown> = { AuthenticationResult: { IdToken: 'id-token' } }) {
    return mockFetch((url, init) => {
      const target = (init?.headers as Record<string, string> | undefined)?.['X-Amz-Target'];
      if (target?.endsWith('.InitiateAuth')) return json(auth);
      if (target?.endsWith('.GetId')) return json({ IdentityId: 'eu-west-1:abc' });
      if (target?.endsWith('.GetCredentialsForIdentity')) return json({ Credentials: { AccessKeyId: 'AKIA', SecretKey: 'secret', SessionToken: 'session' } });
      return s3(url, init);
    });
  }

  it('signs in through Cognito and uploads to the user\'s private S3 key', async () => {
    const f = aws(() => json({}));
    const backup = remoteBackup('2026-01-01T00:00:00.000Z');
    await awsProvider.push(cfg, backup);
    const auth = JSON.parse(f.mock.calls[0][1]!.body as string);
    expect(auth).toMatchObject({ AuthFlow: 'USER_PASSWORD_AUTH', ClientId: 'client', AuthParameters: { USERNAME: 'me@example.com', PASSWORD: 'pw' } });
    expect(JSON.parse(f.mock.calls[1][1]!.body as string).Logins).toEqual({ 'cognito-idp.eu-west-1.amazonaws.com/eu-west-1_Pool': 'id-token' });
    const [url, init] = f.mock.calls[3];
    expect(url).toContain('my-bucket');
    expect(url).toContain(encodeURIComponent('private/eu-west-1:abc/guardbox-backup.json').replace(/%2F/g, '/'));
    expect(url).toContain('X-Amz-Security-Token=session');
    expect(init!.method).toBe('PUT');
    expect(JSON.parse(init!.body as string)).toEqual(backup);
  });

  it('downloads the backup, and treats a missing object as no backup', async () => {
    const backup = remoteBackup('2026-01-01T00:00:00.000Z');
    aws(() => text(JSON.stringify(backup)));
    expect(await awsProvider.pull(cfg)).toEqual(backup);
    aws(() => text('<Error><Code>NoSuchKey</Code></Error>', 404));
    expect(await awsProvider.pull(cfg)).toBeNull();
    aws(() => text('<Error><Code>AccessDenied</Code></Error>', 403));
    expect(await awsProvider.pull(cfg)).toBeNull();
  });

  it('reports S3 and Cognito failures', async () => {
    aws(() => json({}, 500));
    await expect(awsProvider.push(cfg, remoteBackup('2026-01-01T00:00:00.000Z'))).rejects.toThrow('S3 upload failed (HTTP 500)');
    aws(() => json({}), { ChallengeName: 'NEW_PASSWORD_REQUIRED' });
    await expect(awsProvider.pull(cfg)).rejects.toThrow(/NEW_PASSWORD_REQUIRED/);
    mockFetch(() => json({ __type: 'NotAuthorizedException', message: 'Incorrect username or password.' }, 400));
    await expect(awsProvider.pull(cfg)).rejects.toThrow('Incorrect username or password.');
  });
});
