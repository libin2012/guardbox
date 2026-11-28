import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { decryptBackup, isEncryptedBackup } from './backupCrypto';
import { parseBackup } from './store';
import type { BackupFile } from './types';

/**
 * Shared backup-restore helpers, used by both the "Restore from File…" button in
 * Backup & sync and the restore-backup screen that opens when the user taps a
 * `.gbox` file. Keeping the plain/encrypted decision in one place means both
 * entry points behave identically.
 */

/** Read a backup file's text, whether it lives at a native URI or a web blob URL. */
export async function readBackupText(uri: string): Promise<string> {
  if (Platform.OS === 'web') return (await fetch(uri)).text();
  return new File(uri).text();
}

/** True when the backup text is passphrase-protected and must be decrypted first. */
export function needsPassphrase(text: string): boolean {
  return isEncryptedBackup(text);
}

/** Parse a plain (unencrypted) GuardBox backup. Throws if the text is not one. */
export function openPlainBackup(text: string): BackupFile {
  return parseBackup(text);
}

/** Decrypt an encrypted GuardBox backup with the passphrase. */
export function openEncryptedBackup(text: string, passphrase: string): Promise<BackupFile> {
  return decryptBackup(text, passphrase);
}
