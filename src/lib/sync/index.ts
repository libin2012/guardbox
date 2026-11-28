import { forgetPassphraseKey, isEncryptedBackup, openBackup, sealBackup, SyncPayload } from '../backupCrypto';
import { useStore, toBackup } from '../store';
import { getSecret, setSecret } from '../security';
import { BackupFile, SyncProviderId } from '../types';
import { awsProvider } from './aws';
import { firebaseProvider } from './firebase';
import { gdriveProvider } from './gdrive';
import { icloudProvider } from './icloud';
import { supabaseProvider } from './supabase';
import { ProviderConfig, SyncProvider } from './types';

export const PROVIDERS: SyncProvider[] = [icloudProvider, gdriveProvider, firebaseProvider, supabaseProvider, awsProvider];

export function getProvider(id: SyncProviderId): SyncProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export async function loadConfig(id: SyncProviderId): Promise<ProviderConfig> {
  const raw = await getSecret(`sync.${id}`);
  return raw ? (JSON.parse(raw) as ProviderConfig) : {};
}

export async function saveConfig(id: SyncProviderId, cfg: ProviderConfig): Promise<void> {
  forgetPassphraseKey();
  await setSecret(`sync.${id}`, JSON.stringify(cfg));
}

/**
 * Every provider also gets this field. Uploads are encrypted on the phone with
 * it (scrypt + AES-256-GCM, like passphrase backups), so the provider only ever
 * stores ciphertext. It is kept in the keychain with the provider settings.
 */
export const PASSPHRASE_FIELD = { key: 'passphrase', label: 'Encryption passphrase', placeholder: 'At least 8 characters', secure: true } as const;

function passphraseOf(cfg: ProviderConfig): string {
  const p = cfg[PASSPHRASE_FIELD.key] ?? '';
  if (!p) throw new Error('Set an encryption passphrase in Backup & sync. Your data is encrypted on this phone before upload; use the same passphrase on every device.');
  return p;
}

async function seal(data: Parameters<typeof toBackup>[0], passphrase: string): Promise<SyncPayload> {
  return sealBackup(toBackup(data), passphrase, { reuseKey: true });
}

/** Decrypt a downloaded copy. Copies uploaded by older versions are plain. */
async function open(payload: SyncPayload, passphrase: string): Promise<{ backup: BackupFile; plain: boolean }> {
  if (isEncryptedBackup(payload)) return { backup: await openBackup(payload, passphrase, 'cloud'), plain: false };
  return { backup: payload, plain: true };
}

export type SyncOutcome =
  | { kind: 'pushed' }
  | { kind: 'pulled' }
  | { kind: 'up-to-date' }
  /** `unencrypted`: the cloud copy is plain, from an older version, so it is never taken without asking */
  | { kind: 'conflict'; remote: BackupFile; unencrypted?: boolean };

/**
 * Two-way sync with last-writer detection:
 *  - only local changed since last sync  -> push
 *  - only remote changed since last sync -> pull
 *  - both changed                        -> conflict (the UI asks which copy to keep)
 * Uploads are end-to-end encrypted. A cloud copy that fails to decrypt stops the
 * sync with an error and is never overwritten automatically. A plain copy left
 * by an older version is replaced by an encrypted one, but if it changed since
 * the last sync the user is asked first.
 */
export async function syncNow(mode: 'auto' | 'push' | 'pull' = 'auto'): Promise<SyncOutcome> {
  const { data, updateSettings, restoreBackup } = useStore.getState();
  const provider = getProvider(data.settings.syncProvider);
  if (!provider) throw new Error('Choose a sync provider first.');
  const cfg = await loadConfig(provider.id);

  try {
    const passphrase = passphraseOf(cfg);
    let outcome: SyncOutcome;
    if (mode === 'push') {
      await provider.push(cfg, await seal(data, passphrase));
      outcome = { kind: 'pushed' };
    } else {
      const payload = await provider.pull(cfg);
      const opened = payload ? await open(payload, passphrase) : null;
      const remote = opened?.backup ?? null;
      const last = data.settings.lastSyncAt ?? '';
      const localChanged = data.modifiedAt > last;
      const remoteChanged = !!remote && remote.exportedAt > last;
      if (mode === 'pull') {
        if (!remote) throw new Error('No backup found in the cloud yet.');
        restoreBackup(remote);
        outcome = { kind: 'pulled' };
      } else if (opened?.plain && remoteChanged) {
        // never take unencrypted cloud data silently: anyone with access to the bucket could have written it
        return { kind: 'conflict', remote: opened.backup, unencrypted: true };
      } else if (!remote || opened?.plain || (localChanged && !remoteChanged)) {
        await provider.push(cfg, await seal(useStore.getState().data, passphrase));
        outcome = { kind: 'pushed' };
      } else if (remoteChanged && !localChanged) {
        restoreBackup(remote);
        outcome = { kind: 'pulled' };
      } else if (remoteChanged && localChanged) {
        return { kind: 'conflict', remote };
      } else {
        outcome = { kind: 'up-to-date' };
      }
    }
    updateSettings({ lastSyncAt: new Date().toISOString(), lastSyncError: undefined });
    return outcome;
  } catch (e) {
    updateSettings({ lastSyncError: (e as Error).message });
    throw e;
  }
}

export type { ProviderConfig, SyncPayload, SyncProvider };
