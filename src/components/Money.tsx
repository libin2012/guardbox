import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
import { formatMoney } from '../lib/money';
import { useStore } from '../lib/store';
import { T } from './ui';

/** Amount that respects the "hide amounts" privacy setting. */
export function Money({ amount, currency, size, weight, style, compact, muted }: { amount: number; currency?: string; size?: number; weight?: TextStyle['fontWeight']; style?: StyleProp<TextStyle>; compact?: boolean; muted?: boolean }) {
  const hidden = useStore((s) => s.data.settings.hideAmounts);
  const base = useStore((s) => s.data.settings.baseCurrency);
  return (
    <T size={size} weight={weight} style={style} muted={muted}>
      {formatMoney(amount, currency ?? base, { hidden, compact })}
    </T>
  );
}
