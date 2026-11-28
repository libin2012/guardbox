import { useSyncExternalStore } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { isNight, resolveScheme, type ColorScheme } from '../lib/appearance';
import { useStore } from '../lib/store';

/**
 * GuardBox V2 palette — derived from the frosted-shield + marigold-coin icons.
 *
 * `brand` is the primary/CTA colour and is mode-aware on purpose: Slate Navy in
 * light, Marigold in dark (matching the icon's two backgrounds). `gold` is the
 * marigold accent, and `positive`/`negative` are the semantic gain/loss colours.
 * `onBrand` is the text/icon colour that sits on top of a `brand` fill.
 * The hero banner stays dark in both themes, so it has its own light-on-dark
 * `heroPositive`/`heroNegative`.
 */
export const light = {
  // brand & accent
  brand: '#232A3B', // Slate Navy — primary fill & CTAs
  brandSoft: 'rgba(35,42,59,0.10)',
  onBrand: '#FFFFFF',
  gold: '#F4B828', // Marigold Coin
  positive: '#006D44', // net-worth up on light surfaces
  negative: '#C0353A',
  // surfaces
  bg: '#F4F6FA',
  card: '#FFFFFF',
  cardAlt: '#EDF1F8',
  text: '#131C2B',
  textMuted: '#575E71',
  border: '#DDE3EE',
  // dark hero banner (dark in both themes)
  hero: '#232A3B',
  heroText: '#FFFFFF',
  heroMuted: '#A4ABC0',
  heroPositive: '#62DD9E',
  heroNegative: '#FF8A8D',
};

export const dark: typeof light = {
  // brand & accent
  brand: '#F9BD2D', // Marigold CTA
  brandSoft: 'rgba(249,189,45,0.16)',
  onBrand: '#261900',
  gold: '#F9BD2D',
  positive: '#62DD9E',
  negative: '#FF6B6E',
  // surfaces
  bg: '#0A1323', // Obsidian Vault
  card: '#17202F',
  cardAlt: '#212A3A', // Elevated Card
  text: '#DAE2F8',
  textMuted: '#8990A5',
  border: '#2C3546',
  // dark hero banner
  hero: '#212A3A',
  heroText: '#FFFFFF',
  heroMuted: '#8990A5',
  heroPositive: '#62DD9E',
  heroNegative: '#FF8A8D',
};

export type Theme = typeof light;

/**
 * Shared minute ticker for the 'auto' (time-based) theme. One interval is kept
 * alive for the whole app (and only while something subscribes). It also fires
 * when the app returns to the foreground, so the scheme is correct on resume.
 * `useSyncExternalStore` re-renders consumers only when the night value flips,
 * so the per-minute tick is a cheap boolean compare, not an app-wide re-render.
 */
const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;

function emitTick() {
  tickListeners.forEach((l) => l());
}

function subscribeTick(listener: () => void): () => void {
  tickListeners.add(listener);
  if (tickListeners.size === 1) {
    tickTimer = setInterval(emitTick, 60_000);
    appStateSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') emitTick();
    });
  }
  return () => {
    tickListeners.delete(listener);
    if (tickListeners.size === 0) {
      if (tickTimer) clearInterval(tickTimer);
      tickTimer = null;
      appStateSub?.remove();
      appStateSub = null;
    }
  };
}

const getNightSnapshot = () => isNight();

/** The colour scheme the app should use right now, honouring the user's preference. */
export function useScheme(): ColorScheme {
  const mode = useStore((s) => s.data.settings.themeMode);
  const system = useColorScheme();
  const night = useSyncExternalStore(subscribeTick, getNightSnapshot, getNightSnapshot);
  return resolveScheme(mode ?? 'auto', system, night);
}

export function useTheme(): Theme {
  return useScheme() === 'dark' ? dark : light;
}

export const radius = { sm: 10, md: 16, lg: 24 };
export const space = (n: number) => n * 4;
