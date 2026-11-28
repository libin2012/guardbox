import type { ThemeMode } from './types';

export type ColorScheme = 'light' | 'dark';

/**
 * Automatic (time-based) dark window: dark from 18:00 up to 06:00. Inclusive of
 * the start hour, exclusive of the end hour, so 6 PM–5:59 AM is dark and 6 AM
 * onwards is light.
 */
export const NIGHT_START = 18; // 6 PM
export const NIGHT_END = 6; // 6 AM

/** Whether the automatic schedule considers the given moment "night" (dark). */
export function isNight(date: Date = new Date(), start = NIGHT_START, end = NIGHT_END): boolean {
  const h = date.getHours();
  // window wraps past midnight, so night is hour >= start OR hour < end
  return h >= start || h < end;
}

/**
 * Resolve the effective colour scheme from the user's preference. `system` is
 * the OS setting (defaulting to light when unknown), `auto` uses the clock.
 */
export function resolveScheme(mode: ThemeMode, systemScheme: ColorScheme | null | undefined, night: boolean): ColorScheme {
  switch (mode) {
    case 'light':
      return 'light';
    case 'dark':
      return 'dark';
    case 'auto':
      return night ? 'dark' : 'light';
    case 'system':
    default:
      return systemScheme === 'dark' ? 'dark' : 'light';
  }
}

/** Human-readable labels for the appearance picker. */
export const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  system: 'Match iOS',
  light: 'Light',
  dark: 'Dark',
  auto: 'Automatic',
};
