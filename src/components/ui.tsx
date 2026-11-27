import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { radius, space, useTheme } from './theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Screen({ children, ...rest }: ScrollViewProps & { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: space(4), paddingBottom: space(24), gap: space(4) }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: radius.md, padding: space(4), borderWidth: StyleSheet.hairlineWidth, borderColor: t.border }, style]}>{children}</View>;
}

export function T({ children, style, muted, size = 15, weight, numberOfLines }: { children: React.ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; size?: number; weight?: TextStyle['fontWeight']; numberOfLines?: number }) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: muted ? t.textMuted : t.text, fontSize: size, fontWeight: weight }, style]}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space(2) }}>
      <T size={13} muted weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {children}
      </T>
      {right}
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; icon?: IconName; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.brand : variant === 'danger' ? t.negative : variant === 'secondary' ? t.cardAlt : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'ghost' ? t.brand : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        { backgroundColor: bg, borderRadius: radius.sm, paddingVertical: space(3), paddingHorizontal: space(4), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2), opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, style, ...input }: TextInputProps & { label: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: space(1.5) }}>
      <T size={13} muted weight="600">{label}</T>
      <TextInput
        placeholderTextColor={t.textMuted}
        style={[{ backgroundColor: t.cardAlt, color: t.text, borderRadius: radius.sm, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 16 }, style]}
        {...input}
      />
      {hint ? <T size={12} muted>{hint}</T> : null}
    </View>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.cardAlt, borderRadius: radius.sm, padding: 3 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ flex: 1, paddingVertical: space(2), borderRadius: radius.sm - 3, backgroundColor: active ? t.card : 'transparent', alignItems: 'center' }}>
            <Text style={{ color: active ? t.text : t.textMuted, fontWeight: active ? '700' : '500', fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ icon, iconColor, title, subtitle, right, onPress, chevron }: { icon?: IconName; iconColor?: string; title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; chevron?: boolean }) {
  const t = useTheme();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) }}>
      {icon ? (
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: (iconColor ?? t.brand) + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={19} color={iconColor ?? t.brand} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T weight="600" numberOfLines={1}>{title}</T>
        {subtitle ? <T size={13} muted numberOfLines={1}>{subtitle}</T> : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={t.textMuted} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>{content}</Pressable> : content;
}

export function ToggleRow({ title, subtitle, value, onChange, icon }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; icon?: IconName }) {
  const t = useTheme();
  return <Row icon={icon} title={title} subtitle={subtitle} right={<Switch value={value} onValueChange={onChange} trackColor={{ true: t.brand, false: t.border }} />} />;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: React.ReactNode }) {
  const t = useTheme();
  return (
    <Card style={{ alignItems: 'center', gap: space(2), paddingVertical: space(8) }}>
      <Ionicons name={icon} size={36} color={t.brand} />
      <T weight="700" size={17}>{title}</T>
      <T muted style={{ textAlign: 'center' }}>{body}</T>
      {action}
    </Card>
  );
}
