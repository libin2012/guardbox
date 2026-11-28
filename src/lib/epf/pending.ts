import { create } from 'zustand';

/**
 * A request to open the EPF import screen that arrived from outside the app
 * (a PDF shared to GuardBox, or a tap on the reminder). It is held here until
 * the app is loaded and unlocked, so the passcode lock is never bypassed.
 */
interface PendingImport {
  pending: { file?: string } | null;
  request(file?: string): void;
  take(): { file?: string } | null;
}

export const usePendingImport = create<PendingImport>((set, get) => ({
  pending: null,
  request(file) {
    set({ pending: { file } });
  },
  take() {
    const p = get().pending;
    if (p) set({ pending: null });
    return p;
  },
}));

/** True for links that point at a local file (what iOS sends for "Open in GuardBox"). */
export function isIncomingFile(url: string): boolean {
  return /^file:\/\//i.test(url) || /\.pdf(?:$|\?)/i.test(url);
}
