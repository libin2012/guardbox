import { File, Paths } from 'expo-file-system';
import { extractPdfText } from '../../../modules/epf-pdf';
import { useStore } from '../store';
import { EpfDetails, Holding } from '../types';
import { EpfPassbook, epfValue, parseFirstMatch } from './parse';

export const PF_CATEGORY_ID = 'cat-pf';

export type ReadOutcome =
  | { kind: 'ok'; passbook: EpfPassbook; usedPassword?: string }
  | { kind: 'password_required' }
  | { kind: 'wrong_password' };

/** UANs we already know, to try silently as the PDF password (UMANG often uses the UAN). */
export function knownUans(holdings: Holding[]): string[] {
  const set = new Set<string>();
  for (const h of holdings) if (h.epf?.uan) set.add(h.epf.uan);
  return [...set];
}

/** Read and parse a passbook PDF entirely on the device. */
export async function readPassbook(uri: string, password?: string): Promise<ReadOutcome> {
  const candidates = password ? [password] : [undefined, ...knownUans(useStore.getState().data.holdings)];
  for (const pw of candidates) {
    const res = await extractPdfText(uri, pw);
    if (res.status === 'ok') {
      const lines = res.pages.map((p) => p.join('\n')).join('\n');
      return { kind: 'ok', passbook: parseFirstMatch([lines, res.text]), usedPassword: pw };
    }
    if (password) return { kind: res.status };
  }
  return { kind: 'password_required' };
}

/** PF holdings, best match for this passbook first. */
export function matchingPfHoldings(holdings: Holding[], p: Pick<EpfPassbook, 'memberId' | 'uan'>): Holding[] {
  const pf = holdings.filter((h) => h.categoryId === PF_CATEGORY_ID || h.epf);
  const score = (h: Holding) => (p.memberId && h.epf?.memberId === p.memberId ? 2 : p.uan && h.epf?.uan === p.uan ? 1 : 0);
  return pf.sort((a, b) => score(b) - score(a));
}

/** The holding to update without asking: same member ID, or same UAN when it is the only one. */
export function autoTarget(holdings: Holding[], p: Pick<EpfPassbook, 'memberId' | 'uan'>): Holding | undefined {
  if (p.memberId) {
    const m = holdings.find((h) => h.epf?.memberId === p.memberId);
    if (m) return m;
  }
  if (p.uan) {
    const byUan = holdings.filter((h) => h.epf?.uan === p.uan && (!p.memberId || !h.epf?.memberId));
    if (byUan.length === 1) return byUan[0];
  }
  return undefined;
}

export interface EpfForm {
  name: string;
  epf: Omit<EpfDetails, 'importedAt'>;
}

/** Create or update the PF asset; recording the new value adds a point to its history. */
export function saveEpf(form: EpfForm, targetId: string | null): string {
  const store = useStore.getState();
  const epf: EpfDetails = { ...form.epf, importedAt: new Date().toISOString() };
  const value = epfValue({ employee: epf.employeeShare, employer: epf.employerShare, pension: epf.pensionShare }, epf.includePension);
  if (targetId && store.data.holdings.some((h) => h.id === targetId)) {
    store.updateHolding(targetId, { name: form.name, value, mode: 'manual', epf });
    return targetId;
  }
  return store.addHolding({
    name: form.name,
    kind: 'asset',
    categoryId: PF_CATEGORY_ID,
    currency: 'INR',
    mode: 'manual',
    value,
    epf,
  });
}

/**
 * Remove our copy of an imported PDF so the passbook does not linger on the
 * phone: the share-sheet copy in Documents/Inbox, or the picker's cache copy.
 */
export function discardIncoming(uri: string | undefined) {
  if (!uri) return;
  try {
    const inApp = uri.includes('/Inbox/') || uri.startsWith(Paths.cache.uri) || uri.includes('/Caches/');
    if (!inApp) return;
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // best effort
  }
}
