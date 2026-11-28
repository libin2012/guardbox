import { isIncomingFile, usePendingImport } from '../lib/epf/pending';

/**
 * iOS opens GuardBox with a file:// link when a PDF is shared to it
 * ("Open in GuardBox"). Keep the file for the import screen, which opens once
 * the app is unlocked, and don't try to route the file path itself.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    if (isIncomingFile(path)) {
      usePendingImport.getState().request(path);
      return initial ? '/' : null;
    }
    return path;
  } catch {
    return initial ? '/' : null;
  }
}
