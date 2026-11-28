# How GuardBox protects your data

GuardBox has no server. Everything stays on your iPhone unless you turn on a backup or sync.

## On the device

| What | Where | Protection |
|---|---|---|
| Holdings, history, categories, snapshots, profile, settings (including Finnhub / CoinGecko keys), cached prices and FX rates | AsyncStorage, one entry (`guardbox:data:v1`) | **AES-256-GCM**, random per-install 256-bit key, fresh 96-bit IV on every save. Plus iOS Data Protection on the app's files. |
| The data key | iOS Keychain (`guardbox.datakey.v1`) | `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: readable only while the phone is unlocked, never synced to iCloud Keychain, never restored to another phone. |
| Passcode | iOS Keychain | Salted, iterated SHA-256 hash. |
| Sync provider credentials | iOS Keychain | Never in backups. |

GCM is authenticated encryption: if a single byte of the saved data is changed, GuardBox refuses to open it and shows a warning instead of loading altered numbers. It never overwrites data it could not open; you choose to try again or to erase and restore from a backup.

Data saved by versions before encryption is read once, re-saved encrypted, and the plain-text copy is replaced in the same write. If that write fails, the plain-text copy is kept and the next save tries again, so nothing is lost.

Crypto code: [`@noble/ciphers`](https://github.com/paulmillr/noble-ciphers) (AES-GCM) and [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) (scrypt): audited, dependency-free TypeScript. Random bytes come from the OS (`expo-crypto`, `SecRandomCopyBytes` on iOS). See `src/lib/vault.ts` and `src/lib/backupCrypto.ts`.

## Backups

- **Backup file (Export)**: you can protect it with a passphrase. The key is derived with scrypt (N = 2^16, r = 8, p = 1, random salt) and the file is sealed with AES-256-GCM; the scrypt settings are authenticated too. A forgotten passphrase cannot be recovered. A plain export is still possible and is readable by anyone who gets the file. The temporary copy is deleted from the app's cache after sharing.
- **Cloud sync (iCloud, Firebase, Supabase, AWS)**: **end-to-end encrypted.** Turning sync on needs an encryption passphrase (8+ characters), kept in the Keychain with the provider settings. Before upload the backup is sealed on the phone exactly like a passphrase backup file (scrypt + AES-256-GCM), so the provider only stores ciphertext and never sees the passphrase. The scrypt key is derived once per passphrase and kept in memory, and every upload still gets a fresh IV. Use the same passphrase on every device.
  - A cloud copy that fails to decrypt (wrong passphrase, or changed by someone with access to your cloud account) stops the sync with an error. Nothing on the phone changes and the cloud copy is not overwritten automatically.
  - A plain copy uploaded by an older version is replaced by an encrypted one on the next sync. If that plain copy changed since your last sync, GuardBox asks before using it, because anyone with access to the storage could have written it.
  - What the provider can still see: that you use GuardBox, the size of your backup and when you sync.
  - Forgetting the passphrase means the cloud copy cannot be opened. Your phone's data is unaffected: set a new passphrase and upload again.

## Limits (please read)

- **A fully compromised phone is out of scope.** On a jailbroken phone, or with malware running as GuardBox, an attacker can read the key from the Keychain or read data from the app's memory while it is open. Encryption at rest protects against reading the app's files from a backup, a lost phone that is locked, or a tool that copies the app's sandbox; it cannot protect against someone who controls the running app.
- **Tamper detection is not tamper prevention.** Someone with access to the files can still delete or damage them. GuardBox will notice and tell you, but it cannot bring the data back: keep a backup.
- **Moving to a new iPhone:** because the key is device-only, restoring a device backup to a new phone brings the encrypted data but not the key. GuardBox will say the key is missing. Use an exported backup file or cloud sync to move your data.
- **Rollback:** an attacker with file access could put back an older, genuine copy of your data. It would open normally.
- **Web preview** (`npm run web`) keeps the key in `localStorage` next to the data, so it offers no real protection. The web preview is for development only.
