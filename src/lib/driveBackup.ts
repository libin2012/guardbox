/**
 * Passphrase-protected backups to Google Drive. Same format as backup files
 * (scrypt + AES-256-GCM, see backupCrypto.ts); Drive only ever stores ciphertext.
 */
import { checkPassphrase, decryptBackup, encryptBackup, isEncryptedBackup } from './backupCrypto';
import { backupFileName, createFile, deleteFile, downloadFile, DriveFile, listGuardBoxFiles } from './google';
import { toBackup } from './store';
import { AppData, BackupFile } from './types';

/** Encrypt the data with the passphrase and upload it as a new file. */
export async function backupToDrive(data: AppData, passphrase: string): Promise<DriveFile> {
  const problem = checkPassphrase(passphrase);
  if (problem) throw new Error(problem);
  return createFile(backupFileName(), await encryptBackup(toBackup(data), passphrase), 'backup');
}

/** Backups GuardBox saved to Drive, newest first. */
export function listDriveBackups(): Promise<DriveFile[]> {
  return listGuardBoxFiles('backup');
}

/** Download and decrypt one backup. Throws a readable error for a wrong passphrase or a damaged file. */
export async function openDriveBackup(id: string, passphrase: string): Promise<BackupFile> {
  const text = await downloadFile(id);
  if (!isEncryptedBackup(text)) throw new Error('This file is not an encrypted GuardBox backup.');
  return decryptBackup(text, passphrase);
}

export function deleteDriveBackup(id: string): Promise<void> {
  return deleteFile(id);
}
