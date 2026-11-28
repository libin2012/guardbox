import { formatBytes, relativeTime } from '../format';

describe('relativeTime', () => {
  const now = new Date(2026, 10, 28, 15, 0, 0);
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it.each([
    [undefined, 'Never'],
    ['not a date', 'Never'],
    [ago(20 * 1000), 'Just now'],
    [ago(5 * 60 * 1000), '5 min ago'],
    [ago(3 * 60 * 60 * 1000), '3 hr ago'],
    [new Date(2026, 10, 27, 9, 0).toISOString(), 'Yesterday'],
  ])('%s -> %s', (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });

  it('shows a date for older times, with the year only when it differs', () => {
    expect(relativeTime(new Date(2026, 10, 1).toISOString(), now)).not.toMatch(/2026/);
    expect(relativeTime(new Date(2025, 0, 1).toISOString(), now)).toMatch(/2025/);
  });
});

describe('formatBytes', () => {
  it.each([
    [undefined, ''],
    ['x', ''],
    [-1, ''],
    [512, '512 bytes'],
    ['1536', '1.5 KB'],
    [3 * 1024 * 1024, '3.0 MB'],
  ])('%p -> %p', (n, expected) => {
    expect(formatBytes(n as number | string | undefined)).toBe(expected);
  });
});
