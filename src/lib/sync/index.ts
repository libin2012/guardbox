import { useStore, toBackup } from '../store';
import { getSecret, setSecret } from '../security';
import { BackupFile, SyncProviderId } from '../types';
import { awsProvider } from './aws';
import { firebaseProvider } from './firebase';
import { icloudProvider } from './icloud';
import { supabaseProvider } from './supabase';
import { ProviderConfig, SyncProvider } from './types';

export const PROVIDERS: SyncProvider[] = [icloudProvider, firebaseProvider, supabaseProvider, awsProvider];

export function getProvider(id: SyncProviderId): SyncProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export async function loadConfig(id: SyncProviderId): Promise<ProviderConfig> {
  const raw = await getSecret(`sync.${id}`);
  return raw ? (JSON.parse(raw) as ProviderConfig) : {};
}

export async function saveConfig(id: SyncProviderId, cfg: ProviderConfig): Promise<void> {
  await setSecret(`sync.${id}`, JSON.stringify(cfg));
}

export type SyncOutcome =
  | { kind: 'pushed' }
  | { kind: 'pulled' }
  | { kind: 'up-to-date' }
  | { kind: 'conflict'; remote: BackupFile };

/**
 * Two-way sync with last-writer detection:
 *  - only local changed since last sync  -> push
 *  - only remote changed since last sync -> pull
 *  - both changed                        -> conflict (the UI asks which copy to keep)
 */
export async function syncNow(mode: 'auto' | 'push' | 'pull' = 'auto'): Promise<SyncOutcome> {
  const { data, updateSettings, restoreBackup } = useStore.getState();
  const provider = getProvider(data.settings.syncProvider);
  if (!provider) throw new Error('Choose a sync provider first.');
  const cfg = await loadConfig(provider.id);

  try {
    let outcome: SyncOutcome;
    if (mode === 'push') {
      await provider.push(cfg, toBackup(data));
      outcome = { kind: 'pushed' };
    } else {
      const remote = await provider.pull(cfg);
      const last = data.settings.lastSyncAt ?? '';
      const localChanged = data.modifiedAt > last;
      const remoteChanged = !!remote && remote.exportedAt > last;
      if (mode === 'pull') {
        if (!remote) throw new Error('No backup found in the cloud yet.');
        restoreBackup(remote);
        outcome = { kind: 'pulled' };
      } else if (!remote || (localChanged && !remoteChanged)) {
        await provider.push(cfg, toBackup(useStore.getState().data));
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

export type { ProviderConfig, SyncProvider };
