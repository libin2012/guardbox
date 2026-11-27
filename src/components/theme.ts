import { useColorScheme } from 'react-native';

const shared = {
  brand: '#1FA97A',
  brandSoft: 'rgba(31,169,122,0.14)',
  positive: '#1FA97A',
  negative: '#E5484D',
  gold: '#D4AF37',
};

export const light = {
  ...shared,
  bg: '#F3F5F8',
  card: '#FFFFFF',
  cardAlt: '#EEF1F5',
  text: '#0B1A2B',
  textMuted: '#5B6B7F',
  border: '#E1E6ED',
  hero: '#0B1A2B',
  heroText: '#FFFFFF',
  heroMuted: '#9FB0C4',
};

export const dark: typeof light = {
  ...shared,
  bg: '#070F1A',
  card: '#101C2B',
  cardAlt: '#17263A',
  text: '#ECF1F7',
  textMuted: '#8A9BB0',
  border: '#1E2E44',
  hero: '#0F2A23',
  heroText: '#FFFFFF',
  heroMuted: '#93B7A9',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { sm: 10, md: 16, lg: 24 };
export const space = (n: number) => n * 4;
