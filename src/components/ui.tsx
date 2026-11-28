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

// ---------- iOS grouped lists (Settings-app style) ----------

/** Width of a list icon tile plus the gap after it: separators start where the text starts, as on iOS. */
const LIST_ICON = 30;
const LIST_PAD = space(4);

/**
 * An inset grouped section: small caps header, rounded group, footnote below.
 * Children are separated by hairlines inset to the text, like iOS Settings.
 */
export function ListSection({ header, footer, children, inset = true }: { header?: string; footer?: React.ReactNode; children: React.ReactNode; inset?: boolean }) {
  const t = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: space(1.5) }}>
      {header ? (
        <T size={13} muted style={{ textTransform: 'uppercase', letterSpacing: 0.3, paddingHorizontal: LIST_PAD }}>
          {header}
        </T>
      ) : null}
      <View style={{ backgroundColor: t.card, borderRadius: radius.sm, overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: inset ? LIST_PAD + LIST_ICON + space(3) : LIST_PAD }} /> : null}
            {row}
          </View>
        ))}
      </View>
      {footer ? (
        typeof footer === 'string' ? (
          <T size={13} muted style={{ paddingHorizontal: LIST_PAD, lineHeight: 18 }}>
            {footer}
          </T>
        ) : (
          <View style={{ paddingHorizontal: LIST_PAD }}>{footer}</View>
        )
      ) : null}
    </View>
  );
}

/** A coloured rounded-square icon tile, as in iOS Settings. */
export function IconTile({ name, color, size = LIST_ICON }: { name: IconName; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.23, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size * 0.58} color="#fff" />
    </View>
  );
}

export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  detail,
  accessory,
  onPress,
  tint,
  destructive,
  loading,
  disabled,
  right,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  /** grey value on the right, before the accessory */
  detail?: string;
  accessory?: 'chevron' | 'check' | 'none';
  onPress?: () => void;
  /** an action row: the title takes the tint colour */
  tint?: boolean;
  destructive?: boolean;
  loading?: boolean;
  disabled?: boolean;
  right?: React.ReactNode;
}) {
  const t = useTheme();
  const titleColor = destructive ? t.negative : tint ? t.brand : t.text;
  const body = (pressed: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 44, paddingVertical: space(2.5), paddingHorizontal: LIST_PAD, backgroundColor: pressed ? t.cardAlt : 'transparent', opacity: disabled ? 0.45 : 1 }}>
      {icon ? <IconTile name={icon} color={iconColor ?? t.brand} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: titleColor, fontSize: 16 }}>{title}</Text>
        {subtitle ? <T size={13} muted numberOfLines={2}>{subtitle}</T> : null}
      </View>
      {detail ? <T muted size={16} numberOfLines={1} style={{ maxWidth: '45%' }}>{detail}</T> : null}
      {right}
      {loading ? <ActivityIndicator color={t.textMuted} /> : null}
      {!loading && accessory === 'check' ? <Ionicons name="checkmark" size={20} color={t.brand} accessibilityLabel="Selected" /> : null}
      {!loading && accessory === 'chevron' ? <Ionicons name="chevron-forward" size={17} color={t.textMuted} /> : null}
    </View>
  );
  if (!onPress) return body(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!(disabled || loading), selected: accessory === 'check' }} onPress={onPress} disabled={disabled || loading}>
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

export function ListSwitch({ title, subtitle, value, onChange, icon, iconColor }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; icon?: IconName; iconColor?: string }) {
  const t = useTheme();
  return <ListRow icon={icon} iconColor={iconColor} title={title} subtitle={subtitle} right={<Switch accessibilityLabel={title} value={value} onValueChange={onChange} trackColor={{ true: t.brand, false: t.border }} />} />;
}

/** A form row inside a ListSection: a small label above a full-width input, so long labels and placeholders never wrap. */
export function ListInput({ label, style, ...input }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: LIST_PAD, paddingTop: space(2.5), paddingBottom: space(1) }}>
      <T size={13} muted numberOfLines={1}>{label}</T>
      <TextInput accessibilityLabel={label} placeholderTextColor={t.textMuted} style={[{ color: t.text, fontSize: 17, paddingVertical: space(2) }, style]} {...input} />
    </View>
  );
}
