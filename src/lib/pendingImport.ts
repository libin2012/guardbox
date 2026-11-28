import { create } from 'zustand';

/**
 * Holds a file the OS asked GuardBox to open (a tapped `.gbox` backup) until the
 * app is unlocked and past onboarding, so a file open can never bypass the
 * passcode. `+native-intent.tsx` calls `request()` when the app launches from a
 * file; the root layout watches `uri` and routes to the restore screen, which
 * calls `take()` to claim it exactly once.
 */
interface PendingImportState {
  uri: string | null;
  request: (uri: string) => void;
  /** Return the pending uri (if any) and clear it, so it is handled only once. */
  take: () => string | null;
  clear: () => void;
}

export const usePendingImport = create<PendingImportState>((set, get) => ({
  uri: null,
  request: (uri) => set({ uri }),
  take: () => {
    const { uri } = get();
    if (uri) set({ uri: null });
    return uri;
  },
  clear: () => set({ uri: null }),
}));

/**
 * Whether an inbound deep-link path looks like a local file we should offer to
 * restore (a file:// or content:// URL, or anything ending in `.gbox`). The path
 * handed to redirectSystemPath is not guaranteed to be a clean URL, so this stays
 * deliberately forgiving.
 */
export function isIncomingFile(path: string): boolean {
  return /^file:\/\//i.test(path) || /^content:\/\//i.test(path) || /\.gbox(\?|$)/i.test(path);
}
