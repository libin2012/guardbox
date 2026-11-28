import { isIncomingFile, usePendingImport } from '../lib/pendingImport';

/**
 * Expo Router hands every incoming deep link (including a file the OS opens in
 * GuardBox) to this function before navigating. When the link is a local file,
 * we stash it as a pending import and send the app to the home route; the restore
 * gate in the root layout then offers to restore it, but only once the app is
 * unlocked and past onboarding. All other links pass through untouched.
 *
 * This must never throw — a crash here would break every launch — so it is fully
 * guarded and falls back to the home route.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (isIncomingFile(path)) {
      usePendingImport.getState().request(path);
      return '/';
    }
    return path;
  } catch {
    return '/';
  }
}
