import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, space, useTheme } from './theme';
import { IconName, T } from './ui';

export interface Option {
  value: string;
  label: string;
  subtitle?: string;
  icon?: IconName;
  color?: string;
}

/** A searchable full-screen picker. */
export function OptionSheet({ visible, title, options, value, onSelect, onClose, searchable }: { visible: boolean; title: string; options: Option[]; value?: string; onSelect: (v: string) => void; onClose: () => void; searchable?: boolean }) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s) || o.value.toLowerCase().includes(s) || o.subtitle?.toLowerCase().includes(s)) : options;
  }, [q, options]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space(4) }}>
          <T size={18} weight="700">{title}</T>
          <Pressable onPress={onClose} accessibilityLabel="Close">
            <Ionicons name="close-circle" size={28} color={t.textMuted} />
          </Pressable>
        </View>
        {searchable ? (
          <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={t.textMuted} autoCorrect={false} style={{ marginHorizontal: space(4), marginBottom: space(2), backgroundColor: t.cardAlt, color: t.text, borderRadius: radius.sm, padding: space(3), fontSize: 16 }} />
        ) : null}
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.value}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: space(4), paddingBottom: space(10) }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onSelect(item.value);
                onClose();
              }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3), opacity: pressed ? 0.6 : 1, borderBottomWidth: 0.5, borderColor: t.border })}
            >
              {item.icon ? <Ionicons name={item.icon} size={20} color={item.color ?? t.brand} /> : null}
              <View style={{ flex: 1 }}>
                <T weight="600">{item.label}</T>
                {item.subtitle ? <T size={13} muted>{item.subtitle}</T> : null}
              </View>
              {item.value === value ? <Ionicons name="checkmark" size={20} color={t.brand} /> : null}
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

export function SelectField({ label, valueLabel, onPress }: { label: string; valueLabel: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: space(1.5) }}>
      <T size={13} muted weight="600">{label}</T>
      <Pressable onPress={onPress} style={{ backgroundColor: t.cardAlt, borderRadius: radius.sm, padding: space(3), flexDirection: 'row', alignItems: 'center' }}>
        <T style={{ flex: 1 }} size={16}>{valueLabel}</T>
        <Ionicons name="chevron-down" size={18} color={t.textMuted} />
      </Pressable>
    </View>
  );
}
