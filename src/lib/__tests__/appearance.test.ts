import { isNight, NIGHT_END, NIGHT_START, resolveScheme } from '../appearance';

const at = (hour: number) => new Date(2026, 10, 28, hour, 0, 0);

describe('isNight', () => {
  it('is dark from 6 PM through to 6 AM', () => {
    expect(isNight(at(NIGHT_START))).toBe(true); // 18:00 exactly
    expect(isNight(at(20))).toBe(true);
    expect(isNight(at(23))).toBe(true);
    expect(isNight(at(0))).toBe(true); // midnight
    expect(isNight(at(5))).toBe(true);
  });

  it('is light during the day', () => {
    expect(isNight(at(NIGHT_END))).toBe(false); // 06:00 exactly -> light
    expect(isNight(at(9))).toBe(false);
    expect(isNight(at(12))).toBe(false);
    expect(isNight(at(17))).toBe(false); // 5 PM, just before the window
  });

  it('respects custom bounds', () => {
    expect(isNight(at(21), 22, 7)).toBe(false);
    expect(isNight(at(22), 22, 7)).toBe(true);
  });
});

describe('resolveScheme', () => {
  it('forces light or dark regardless of system or time', () => {
    expect(resolveScheme('light', 'dark', true)).toBe('light');
    expect(resolveScheme('dark', 'light', false)).toBe('dark');
  });

  it('follows the system scheme in system mode', () => {
    expect(resolveScheme('system', 'dark', false)).toBe('dark');
    expect(resolveScheme('system', 'light', true)).toBe('light');
    expect(resolveScheme('system', null, true)).toBe('light'); // unknown -> light
    expect(resolveScheme('system', undefined, false)).toBe('light');
  });

  it('uses the time of day in auto mode', () => {
    expect(resolveScheme('auto', 'light', true)).toBe('dark'); // night wins
    expect(resolveScheme('auto', 'dark', false)).toBe('light'); // day wins
  });
});
