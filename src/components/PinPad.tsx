import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useTheme } from './theme';

export function PinDots({ length, filled, error }: { length: number; filled: number; error?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center' }}>
      {Array.from({ length }, (_, i) => (
        <View key={i} style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: error ? t.negative : t.brand, backgroundColor: i < filled ? (error ? t.negative : t.brand) : 'transparent' }} />
      ))}
    </View>
  );
}

export function PinPad({ onDigit, onDelete, extra }: { onDigit: (d: string) => void; onDelete: () => void; extra?: { icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; label: string } }) {
  const t = useTheme();
  const tap = (fn: () => void) => () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
    fn();
  };
  const key = (content: React.ReactNode, onPress?: () => void, label?: string) => (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress ? tap(onPress) : undefined}
      disabled={!onPress}
      style={({ pressed }) => ({ width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: onPress && typeof content === 'string' ? (pressed ? t.border : t.cardAlt) : 'transparent' })}
    >
      {typeof content === 'string' ? <Text style={{ fontSize: 30, color: t.text, fontWeight: '500' }}>{content}</Text> : content}
    </Pressable>
  );
  const rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']];
  return (
    <View style={{ gap: 14, alignItems: 'center' }}>
      {rows.map((r) => (
        <View key={r[0]} style={{ flexDirection: 'row', gap: 22 }}>
          {r.map((d) => <React.Fragment key={d}>{key(d, () => onDigit(d))}</React.Fragment>)}
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 22 }}>
        {extra ? key(<Ionicons name={extra.icon} size={30} color={t.brand} />, extra.onPress, extra.label) : key(null)}
        {key('0', () => onDigit('0'))}
        {key(<Ionicons name="backspace-outline" size={28} color={t.text} />, onDelete, 'Delete')}
      </View>
    </View>
  );
}
