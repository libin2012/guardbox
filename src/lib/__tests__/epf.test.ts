import { describe, expect, it as test } from '@jest/globals';
import { epfValue, parseFirstMatch, parsePassbook, tokenize } from '../epf/parse';

const HEADER = `Employees' Provident Fund Organisation, India
Member Passbook
Establishment ID/Name  MHBAN0012345000 / ACME SOFTWARE PRIVATE LIMITED
Member ID/Name  MHBAN00123450000067890 / RAVI KUMAR
UAN  101234567890
Date of Birth 01/01/1990`;

const TABLE_HEAD = `Wage Month Transaction Date Transaction Type Particulars EPF Wages EPS Wages Employee Share Employer Share Pension Share`;

/** A closed year: the closing balance row is the answer. */
const CLOSED_YEAR = `${HEADER}
${TABLE_HEAD}
OB Int. Updated upto 31/03/2024 2,10,500 70,250 0
Apr-2024 15/05/2024 CR Cont. For Due-Month 042024 50,000 15,000 6,000 4,751 1,249
May-2024 14/06/2024 CR Cont. For Due-Month 052024 50,000 15,000 6,000 4,751 1,249
Total Contributions for the year [ 2025 ] 6,00,000 1,80,000 72,000 57,012 14,988
Total Transfer-Ins for the year [ 2025 ] 0 0 0
Total Withdrawals for the year [ 2025 ] 0 0 0
Int. Updated upto 31/03/2025 20,145.50 7,040 0
Closing Balance as on 31/03/2025 3,02,645.50 1,34,302 14,988`;

/** The current year has started: no closing row after the newest opening row. */
const RUNNING_YEAR = `${HEADER}
${TABLE_HEAD}
OB Int. Updated upto 31/03/2025 3,02,645 1,34,302 0
Apr-2025 15/05/2025 CR Cont. For Due-Month 042025 60,000 15,000 7,200 5,951 1,249
May-2025 16/06/2025 CR Cont. For Due-Month 052025 60,000 15,000 7,200 5,951 1,249
Total Contributions for the year [ 2026 ] 1,20,000 30,000 14,400 11,902 2,498
Total Transfer-Ins for the year [ 2026 ] 10,000 5,000 0
Total Withdrawals for the year [ 2026 ] 2,000 1,000 0`;

describe('EPF passbook parser', () => {
  test('reads the closing balance of a finished year', () => {
    const r = parsePassbook(CLOSED_YEAR);
    expect(r.ok).toBe(true);
    expect(r.method).toBe('closing');
    expect(r.balance).toEqual({ employee: 302645.5, employer: 134302, pension: 14988 });
    expect(r.asOf).toBe('2025-03-31');
    expect(r.uan).toBe('101234567890');
    expect(r.memberId).toBe('MHBAN00123450000067890');
    expect(r.memberName).toBe('RAVI KUMAR');
    expect(r.establishment).toBe('ACME SOFTWARE PRIVATE LIMITED');
  });

  test('adds up a year that is still running', () => {
    const r = parsePassbook(RUNNING_YEAR);
    expect(r.ok).toBe(true);
    expect(r.method).toBe('computed');
    expect(r.balance).toEqual({
      employee: 302645 + 14400 + 10000 - 2000,
      employer: 134302 + 11902 + 5000 - 1000,
      pension: 2498,
    });
    expect(r.asOf).toBe('2025-06-16');
  });

  test('multi-year passbook uses the newest year, whatever the order', () => {
    const older = CLOSED_YEAR.replace(HEADER, '');
    const both = `${HEADER}\n${RUNNING_YEAR.replace(HEADER, '')}\n${older}`;
    const r = parsePassbook(both);
    expect(r.method).toBe('computed');
    expect(r.balance?.employee).toBe(302645 + 14400 + 10000 - 2000);
  });

  test('handles every cell on its own line (column split extraction)', () => {
    const split = CLOSED_YEAR.split(/\s+(?=\d)|(?<=\d)\s+/).join('\n');
    const r = parsePassbook(split);
    expect(r.ok).toBe(true);
    expect(r.balance).toEqual({ employee: 302645.5, employer: 134302, pension: 14988 });
  });

  test('bilingual caption between label and amounts', () => {
    const r = parsePassbook(`${HEADER}\nClosing Balance as on 31/03/2025 / अंतिम शेष 1,00,000 50,000 20,000`);
    expect(r.balance).toEqual({ employee: 100000, employer: 50000, pension: 20000 });
  });

  test('falls back to monthly rows when no yearly total exists', () => {
    const r = parsePassbook(`${HEADER}
OB Int. Updated upto 31/03/2025 1,000 500 0
Apr-2025 15/05/2025 CR Cont. For Due-Month 042025 15,000 15,000 1,800 551 1,249
May-2025 15/06/2025 CR Cont. For Due-Month 052025 15,000 15,000 1,800 551 1,249`);
    expect(r.balance).toEqual({ employee: 4600, employer: 1602, pension: 2498 });
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  test('fails cleanly on unrelated text, keeping metadata', () => {
    const r = parsePassbook(`${HEADER}\nSomething else entirely 12 34`);
    expect(r.ok).toBe(false);
    expect(r.balance).toBeUndefined();
    expect(r.uan).toBe('101234567890');
  });

  test('parseFirstMatch tries the next layout when the first fails', () => {
    const r = parseFirstMatch(['garbage', CLOSED_YEAR]);
    expect(r.ok).toBe(true);
    expect(parseFirstMatch(['', '  ']).ok).toBe(false);
  });

  test('Indian digit grouping and dates are tokenised correctly', () => {
    const toks = tokenize('Closing Balance as on 31/03/2025 12,34,567.89 (1,000)');
    expect(toks).toEqual([
      { k: 'label', v: 'closing' },
      { k: 'date', v: '2025-03-31' },
      { k: 'num', v: 1234567.89 },
      { k: 'num', v: -1000 },
    ]);
  });

  test('value counts pension only when asked', () => {
    const s = { employee: 100, employer: 50, pension: 25 };
    expect(epfValue(s, false)).toBe(150);
    expect(epfValue(s, true)).toBe(175);
  });
});
