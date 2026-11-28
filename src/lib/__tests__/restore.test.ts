import { encryptBackup } from '../backupCrypto';
import { needsPassphrase, openEncryptedBackup, openPlainBackup } from '../restore';
import { toBackup } from '../store';
import { makeData, makeHolding } from '../../test/factories';

const KDF = { N: 2 ** 10, r: 8, p: 1 };
const sampleBackup = () => toBackup(makeData({ holdings: [makeHolding({ name: 'Flat', value: 7 })] }));

describe('restore helpers', () => {
  it('opens a plain backup and reports it needs no passphrase', () => {
    const text = JSON.stringify(sampleBackup());
    expect(needsPassphrase(text)).toBe(false);
    const backup = openPlainBackup(text);
    expect(backup.app).toBe('GuardBox');
    expect(backup.data.holdings[0].name).toBe('Flat');
  });

  it('rejects text that is not a GuardBox backup', () => {
    expect(() => openPlainBackup('{"hello":1}')).toThrow();
    expect(() => openPlainBackup('not json')).toThrow();
  });

  it('detects an encrypted backup and decrypts it with the passphrase', async () => {
    const backup = sampleBackup();
    const text = await encryptBackup(backup, 'a strong passphrase', KDF);
    expect(needsPassphrase(text)).toBe(true);
    const opened = await openEncryptedBackup(text, 'a strong passphrase');
    expect(opened.data.holdings[0].name).toBe('Flat');
  });

  it('fails to decrypt with the wrong passphrase', async () => {
    const text = await encryptBackup(sampleBackup(), 'the right one', KDF);
    await expect(openEncryptedBackup(text, 'the wrong one')).rejects.toThrow();
  });
});
