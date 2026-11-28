/**
 * Google Drive sync: one encrypted file, GuardBox-sync.json, in the GuardBox
 * folder of the user's Drive. Sign-in is shared with Drive backups (src/lib/google.ts).
 */
import { parseSyncPayload } from '../backupCrypto';
import { createFile, downloadFile, listGuardBoxFiles, SYNC_FILE_NAME, updateFile } from '../google';
import { SyncProvider } from './types';

export const gdriveProvider: SyncProvider = {
  id: 'gdrive',
  label: 'Google Drive',
  description: 'Keeps an encrypted copy in a GuardBox folder in your Google Drive.',
  fields: [],
  async push(_cfg, payload) {
    const text = JSON.stringify(payload);
    const [existing] = await listGuardBoxFiles('sync');
    if (existing) await updateFile(existing.id, text);
    else await createFile(SYNC_FILE_NAME, text, 'sync');
  },
  async pull() {
    const [existing] = await listGuardBoxFiles('sync');
    return existing ? parseSyncPayload(await downloadFile(existing.id)) : null;
  },
};
