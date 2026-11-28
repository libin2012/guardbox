/**
 * Parser for the EPFO member passbook PDF (downloaded from the EPFO passbook
 * portal or UMANG). Works on the text that the device's PDF reader extracts,
 * so it has to cope with rows that come out on one line or split over several.
 *
 * The passbook lists, for each financial year:
 *   OB Int. Updated upto 31/03/2024        <employee> <employer> <pension>
 *   Cont. For Due-Month 042024 ...         <wages> <wages> <employee> <employer> <pension>
 *   Total Contributions for the year [2025] ...
 *   Total Transfer-Ins for the year [2025] ...
 *   Total Withdrawals for the year [2025] ...
 *   Int. Updated upto 31/03/2025           <employee> <employer> <pension>
 *   Closing Balance as on 31/03/2025       <employee> <employer> <pension>
 *
 * The last three amounts on each of these rows are the employee share,
 * employer share and pension (EPS) columns.
 */

export interface Shares {
  employee: number;
  employer: number;
  pension: number;
}

export interface EpfPassbook {
  /** true when the employee and employer balances were found */
  ok: boolean;
  uan?: string;
  memberId?: string;
  memberName?: string;
  establishment?: string;
  /** balance per column */
  balance?: Shares;
  /** yyyy-mm-dd the balance is valid for (closing date or last transaction) */
  asOf?: string;
  /**
   * closing: read from a "Closing Balance" row.
   * computed: the year is still running, so opening balance + contributions
   *           + transfers + interest - withdrawals.
   */
  method?: 'closing' | 'computed';
  warnings: string[];
}

type Tok =
  | { k: 'num'; v: number }
  | { k: 'date'; v: string }
  | { k: 'label'; v: Label }
  | { k: 'word'; v: string };

type Label = 'ob' | 'closing' | 'contrib' | 'transferIn' | 'withdrawal' | 'interest' | 'contRow';

/** Row labels, most specific first. Applied to the whole text before tokenising. */
const LABELS: [Label, RegExp][] = [
  ['ob', /\bOB\s*Int\.?\s*Updated\s*up\s*to\b|\bOpening\s+Balance(?:\s+as\s+on)?\b/gi],
  ['closing', /\bClosing\s+Balance(?:\s+as\s+on)?\b/gi],
  ['contrib', /\bTotal\s+Contributions?\s+for\s+the\s+year\b/gi],
  ['transferIn', /\bTotal\s+Transfer[\s-]*Ins?\s+for\s+the\s+year\b/gi],
  ['withdrawal', /\bTotal\s+Withdrawals?\s+for\s+the\s+year\b/gi],
  ['interest', /\bInt\.?\s*Updated\s*up\s*to\b/gi],
  ['contRow', /\bCont\.?\s*For\s*Due[\s-]*Month\s*\d{6}\b/gi],
];

const DATE_RE = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/g;
const NUM_RE = /^\(?-?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?\)?$/;

function parseNumber(s: string): number | null {
  const clean = s.replace(/^(?:₹|Rs\.?|INR)/i, '');
  if (!NUM_RE.test(clean)) return null;
  const neg = clean.startsWith('(') || clean.includes('-');
  const n = Number(clean.replace(/[(),-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function isoDate(d: string, m: string, y: string): string | null {
  const dd = Number(d);
  const mm = Number(m);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function tokenize(text: string): Tok[] {
  let s = ` ${text} `;
  // year markers such as "[2025]" or "[ 2025 ]" belong to the label, not the amounts
  s = s.replace(/\[\s*\d{4}(?:\s*-\s*\d{2,4})?\s*\]/g, ' ');
  // "Total Contributions for the year 2025" without brackets
  s = s.replace(/(for\s+the\s+year)\s+\d{4}(?:\s*-\s*\d{2,4})?(?=\s)/gi, '$1');
  s = s.replace(DATE_RE, (all, d, m, y) => {
    const iso = isoDate(d, m, y);
    return iso ? ` \u0001D${iso} ` : all;
  });
  LABELS.forEach(([name, re]) => {
    s = s.replace(re, ` \u0001L${name} `);
  });
  const out: Tok[] = [];
  for (const raw of s.split(/\s+/)) {
    if (!raw) continue;
    if (raw.startsWith('\u0001D')) out.push({ k: 'date', v: raw.slice(2) });
    else if (raw.startsWith('\u0001L')) out.push({ k: 'label', v: raw.slice(2) as Label });
    else {
      const n = parseNumber(raw);
      out.push(n == null ? { k: 'word', v: raw } : { k: 'num', v: n });
    }
  }
  return out;
}

interface Row {
  label: Label;
  date?: string;
  shares: Shares;
  index: number;
}

/** For each label, read the amounts that follow it. */
function readRows(toks: Tok[]): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.k !== 'label') continue;
    let j = i + 1;
    let date: string | undefined;
    let skipped = 0;
    // skip the rest of the label: "as on", a date, a Hindi caption, a slash...
    while (j < toks.length && toks[j].k !== 'num' && toks[j].k !== 'label' && skipped < 12) {
      const tj = toks[j];
      if (tj.k === 'date' && !date) date = tj.v;
      j++;
      skipped++;
    }
    const nums: number[] = [];
    while (j < toks.length) {
      const tj = toks[j];
      if (tj.k === 'num') nums.push(tj.v);
      else if (tj.k === 'date' && nums.length === 0) date = date ?? tj.v;
      else break;
      j++;
    }
    if (nums.length >= 2) {
      const tail = nums.length >= 3 ? nums.slice(-3) : [...nums, 0];
      rows.push({ label: t.v, date, shares: { employee: tail[0], employer: tail[1], pension: tail[2] }, index: i });
    }
  }
  return rows;
}

const add = (a: Shares, b: Shares, sign = 1): Shares => ({
  employee: a.employee + sign * b.employee,
  employer: a.employer + sign * b.employer,
  pension: a.pension + sign * b.pension,
});
const ZERO: Shares = { employee: 0, employer: 0, pension: 0 };

function computeBalance(rows: Row[], toks: Tok[], warnings: string[]): Pick<EpfPassbook, 'balance' | 'asOf' | 'method'> {
  const closings = rows.filter((r) => r.label === 'closing');
  const obs = rows.filter((r) => r.label === 'ob');
  const latest = (list: Row[]) =>
    list.reduce<Row | undefined>((best, r) => (!best || (r.date ?? '') > (best.date ?? '') || ((r.date ?? '') === (best.date ?? '') && r.index > best.index) ? r : best), undefined);
  const lastClosing = latest(closings);
  const lastOb = latest(obs);

  // A year that has closed and no newer year has started.
  if (lastClosing && (!lastOb || (lastOb.date ?? '') < (lastClosing.date ?? '') || (!lastOb.date && lastOb.index < lastClosing.index))) {
    return { balance: lastClosing.shares, asOf: lastClosing.date, method: 'closing' };
  }

  if (!lastOb) {
    if (lastClosing) return { balance: lastClosing.shares, asOf: lastClosing.date, method: 'closing' };
    return {};
  }

  // The year is still running: opening balance plus what happened since.
  // The block runs from the opening row to the next opening or closing row.
  const after = rows.filter((r) => r.index > lastOb.index);
  const end = after.find((r) => r.label === 'ob' || r.label === 'closing');
  const block = after.filter((r) => !end || r.index < end.index);
  let bal = lastOb.shares;
  const totals = block.filter((r) => r.label === 'contrib');
  if (totals.length) {
    bal = add(bal, totals[totals.length - 1].shares);
  } else {
    const monthly = block.filter((r) => r.label === 'contRow');
    if (monthly.length) {
      bal = monthly.reduce((acc, r) => add(acc, r.shares), bal);
      warnings.push('No yearly total row was found, so monthly contributions were added up.');
    }
  }
  const tin = block.filter((r) => r.label === 'transferIn').pop();
  if (tin) bal = add(bal, tin.shares);
  const wd = block.filter((r) => r.label === 'withdrawal').pop();
  if (wd) bal = add(bal, { employee: Math.abs(wd.shares.employee), employer: Math.abs(wd.shares.employer), pension: Math.abs(wd.shares.pension) }, -1);
  const int = block.filter((r) => r.label === 'interest').pop();
  if (int) bal = add(bal, int.shares);

  // as-of date: the latest date that appears inside the block
  const lastTok = end ? end.index : toks.length;
  let asOf = lastOb.date;
  for (let i = lastOb.index; i < lastTok; i++) {
    const t = toks[i];
    if (t.k === 'date' && (!asOf || t.v > asOf)) asOf = t.v;
  }
  return { balance: bal, asOf, method: 'computed' };
}

function findMeta(text: string): Pick<EpfPassbook, 'uan' | 'memberId' | 'memberName' | 'establishment'> {
  const flat = text.replace(/\r/g, '');
  const uan = flat.match(/\bUAN\b[^\d\n]{0,20}(\d{12})\b/i)?.[1];
  // Member ID: state(2) + office(3) + establishment(7) + extension(3) + account(7)
  const memberIdRe = /\b([A-Z]{5}\d{7}[0-9A-Z]{3}\d{7})\b/;
  const memberId = flat.match(/Member\s*Id[^A-Z\n]{0,30}([A-Z]{5}\d{7}[0-9A-Z]{3}\d{7})/i)?.[1] ?? flat.match(memberIdRe)?.[1];
  let memberName: string | undefined;
  if (memberId) {
    const m = flat.match(new RegExp(`${memberId}\\s*[/|:-]?\\s*([A-Za-z][A-Za-z .']{1,60})`));
    memberName = m?.[1]?.trim().replace(/\s+/g, ' ');
  }
  const est = flat.match(/Establishment\s*Id\s*\/?\s*Name[^A-Z\n]{0,10}[A-Z]{5}\d{7,10}\s*[/|:-]?\s*([^\n]{2,80})/i)?.[1];
  const establishment = est?.replace(/\s+/g, ' ').trim();
  return { uan, memberId, memberName: memberName || undefined, establishment: establishment || undefined };
}

export function parsePassbook(text: string): EpfPassbook {
  const warnings: string[] = [];
  const meta = findMeta(text);
  const toks = tokenize(text);
  const rows = readRows(toks);
  const { balance, asOf, method } = computeBalance(rows, toks, warnings);
  const sane = !!balance && balance.employee >= 0 && balance.employer >= 0 && balance.employee + balance.employer > 0;
  if (balance && !sane) warnings.push('The amounts found did not look like a valid balance.');
  if (!balance) warnings.push('No opening or closing balance row was found.');
  return { ok: sane, ...meta, balance: sane ? balance : undefined, asOf: sane ? asOf : undefined, method: sane ? method : undefined, warnings };
}

/**
 * Try each text layout the PDF reader produced (line by line first, then the
 * plain page text) and keep the first one that parses.
 */
export function parseFirstMatch(texts: string[]): EpfPassbook {
  let best: EpfPassbook | null = null;
  for (const t of texts) {
    if (!t.trim()) continue;
    const r = parsePassbook(t);
    if (r.ok) return r;
    // keep metadata from a failed attempt so the review form is still prefilled
    if (!best || (!best.uan && r.uan)) best = r;
  }
  return best ?? { ok: false, warnings: ['The PDF had no readable text. It may be a scanned image.'] };
}

/** Value GuardBox counts for the PF asset. EPS (pension) is optional because it is not a withdrawable balance. */
export function epfValue(s: Shares, includePension: boolean): number {
  return Math.round((s.employee + s.employer + (includePension ? s.pension : 0)) * 100) / 100;
}
