import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutAnimation, Platform, StyleSheet, Text, TextInput, TextInputInstance, TextInputProps, View } from 'react-native';
import { initials } from '../lib/profile';
import { radius, space, useTheme } from './theme';
import { IconName, T } from './ui';

/** All motion here runs on the native driver (opacity / transform only), so it stays smooth while JS is busy. */

export function haptic(kind: 'success' | 'error' | 'light') {
  if (Platform.OS === 'web') return;
  const p =
    kind === 'light'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
  p.catch(() => undefined);
}

/** Animate the next layout change (error text appearing, rows growing) with the iOS keyboard curve. */
export function animateLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
}

/** A short horizontal shake for a field that failed validation. */
export function useShake() {
  const x = useRef(new Animated.Value(0)).current;
  const shake = useCallback(() => {
    x.setValue(0);
    Animated.sequence(
      [10, -9, 7, -5, 3, 0].map((v) => Animated.timing(x, { toValue: v, duration: 45, easing: Easing.out(Easing.quad), useNativeDriver: true })),
    ).start();
  }, [x]);
  return { style: { transform: [{ translateX: x }] }, shake };
}

/**
 * Staggered fade-and-rise for `count` blocks on mount. Returns one animated
 * style per block.
 */
export function useEntrance(count: number, delay = 70) {
  const values = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(
      delay,
      values.map((v) => Animated.spring(v, { toValue: 1, damping: 18, stiffness: 140, mass: 0.9, useNativeDriver: true })),
    ).start();
  }, [values, delay]);
  return values.map((v) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  }));
}

export function Avatar({ name, size = 72 }: { name?: string; size?: number }) {
  const t = useTheme();
  const text = initials(name);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
      {text ? (
        <Text style={{ color: t.brand, fontSize: size * 0.38, fontWeight: '700' }} allowFontScaling={false}>
          {text}
        </Text>
      ) : (
        <Ionicons name="person" size={size * 0.46} color={t.brand} />
      )}
    </View>
  );
}

type FormFieldProps = TextInputProps & {
  label: string;
  icon: IconName;
  error?: string;
  optional?: boolean;
  ref?: React.Ref<TextInputInstance>;
  shakeStyle?: object;
};

/** Labelled input with an icon, focus ring and an inline error that eases in. */
export function FormField({ label, icon, error, optional, ref, shakeStyle, onFocus, onBlur, ...input }: FormFieldProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? t.negative : focused ? t.brand : 'transparent';
  return (
    <Animated.View style={[{ gap: space(1.5) }, shakeStyle]}>
      <View style={{ flexDirection: 'row', gap: space(1) }}>
        <T size={13} muted weight="600">{label}</T>
        {optional ? <T size={13} muted>(optional)</T> : null}
      </View>
      <View style={[styles.box, { backgroundColor: t.cardAlt, borderColor }]}>
        <Ionicons name={icon} size={18} color={error ? t.negative : focused ? t.brand : t.textMuted} />
        <TextInput
          ref={ref}
          placeholderTextColor={t.textMuted}
          style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: space(3.5) }}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          accessibilityLabel={label}
          accessibilityHint={error}
          {...input}
        />
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={14} color={t.negative} />
          <T size={12} style={{ color: t.negative }}>{error}</T>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: space(2.5), borderRadius: radius.sm, paddingHorizontal: space(3.5), borderWidth: 1.5 },
});
