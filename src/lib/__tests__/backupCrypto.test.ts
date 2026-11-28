import { decryptBackup, DEFAULT_KDF, encryptBackup, isEncryptedBackup } from '../backupCrypto';
import { emptyData } from '../defaults';
import { toBackup } from '../store';
import { makeHolding, makeProfile } from '../../test/factories';

// small scrypt cost so the suite stays fast; one test uses the real settings
const FAST = { N: 2 ** 10, r: 8, p: 1 };
const PASS = 'correct horse battery';
const backup = () => toBackup({ ...emptyData(), profile: makeProfile(), holdings: [makeHolding({ name: 'Villa', value: 750000 })] });

describe('passphrase-protected backups', () => {
  it('round-trips with the default (strong) scrypt settings', async () => {
    const b = backup();
    const text = await encryptBackup(b, PASS);
    const file = JSON.parse(text);
    expect(file.kdf).toMatchObject({ name: 'scrypt', N: DEFAULT_KDF.N, r: 8, p: 1 });
    expect(DEFAULT_KDF.N).toBeGreaterThanOrEqual(2 ** 16);
    expect(await decryptBackup(text, PASS)).toEqual(b);
  });

  it('hides everything inside the file', async () => {
    const text = await encryptBackup(backup(), PASS, FAST);
    for (const s of ['Villa', '750000', 'asha@example.com', 'holdings']) expect(text).not.toContain(s);
    expect(isEncryptedBackup(text)).toBe(true);
  });

  it('uses a new salt and IV for every export', async () => {
    const [a, b] = [JSON.parse(await encryptBackup(backup(), PASS, FAST)), JSON.parse(await encryptBackup(backup(), PASS, FAST))];
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.data.slice(0, 16)).not.toBe(b.data.slice(0, 16));
  });

  it('rejects a wrong passphrase', async () => {
    const text = await encryptBackup(backup(), PASS, FAST);
    await expect(decryptBackup(text, 'wrong passphrase')).rejects.toThrow('Wrong passphrase, or the file was changed after it was exported.');
  });

  it('detects a changed file', async () => {
    const file = JSON.parse(await encryptBackup(backup(), PASS, FAST));
    const bytes = file.data.split('');
    bytes[40] = bytes[40] === 'A' ? 'B' : 'A';
    await expect(decryptBackup(JSON.stringify({ ...file, data: bytes.join('') }), PASS)).rejects.toThrow(/Wrong passphrase/);
  });

  it('detects a changed salt or weakened settings (they are authenticated)', async () => {
    const file = JSON.parse(await encryptBackup(backup(), PASS, FAST));
    await expect(decryptBackup(JSON.stringify({ ...file, kdf: { ...file.kdf, N: 2 ** 9 } }), PASS)).rejects.toThrow(/Wrong passphrase/);
    await expect(decryptBackup(JSON.stringify({ ...file, kdf: { ...file.kdf, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' } }), PASS)).rejects.toThrow(/Wrong passphrase/);
  });

  it('refuses settings that would hang the phone', async () => {
    const file = JSON.parse(await encryptBackup(backup(), PASS, FAST));
    for (const kdf of [{ N: 2 ** 24 }, { N: 1000 }, { r: 64 }, { p: 0 }, { N: 1.5 }]) {
      await expect(decryptBackup(JSON.stringify({ ...file, kdf: { ...file.kdf, ...kdf } }), PASS)).rejects.toThrow('This backup asks for unsupported encryption settings.');
    }
  });

  it('refuses unknown formats', async () => {
    const file = JSON.parse(await encryptBackup(backup(), PASS, FAST));
    for (const bad of [{ ...file, encrypted: 2 }, { ...file, kdf: { ...file.kdf, name: 'argon2' } }, { ...file, data: 5 }, { ...file, kdf: undefined }]) {
      await expect(decryptBackup(JSON.stringify(bad), PASS)).rejects.toThrow(/newer version of GuardBox, or is damaged/);
    }
  });

  it('needs a passphrase of at least 8 characters', async () => {
    await expect(encryptBackup(backup(), 'short', FAST)).rejects.toThrow('Use at least 8 characters.');
  });

  it('treats the same passphrase typed with different Unicode forms as equal', async () => {
    const text = await encryptBackup(backup(), 'café au lait', FAST);
    expect((await decryptBackup(text, 'café au lait')).data.holdings).toHaveLength(1);
  });

  it('tells plain backups and other files apart', () => {
    expect(isEncryptedBackup(JSON.stringify(backup()))).toBe(false);
    expect(isEncryptedBackup('{oops')).toBe(false);
    expect(isEncryptedBackup('null')).toBe(false);
  });
});
