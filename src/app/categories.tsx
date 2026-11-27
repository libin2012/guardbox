import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Option, OptionSheet, SelectField } from '../components/OptionSheet';
import { space, useTheme } from '../components/theme';
import { Button, Card, Divider, Field, IconName, Row, Screen, SectionTitle, Segmented, T } from '../components/ui';
import { useStore } from '../lib/store';
import { Category, HoldingType, Kind } from '../lib/types';

const COLORS = ['#2BB673', '#3D8BFD', '#8B5CF6', '#F59E0B', '#14B8A6', '#D4AF37', '#EF4444', '#F97316', '#EC4899', '#64748B', '#06B6D4', '#84CC16'];
const ICONS: IconName[] = ['wallet-outline', 'cash-outline', 'business-outline', 'trending-up-outline', 'logo-bitcoin', 'home-outline', 'diamond-outline', 'car-outline', 'briefcase-outline', 'school-outline', 'airplane-outline', 'gift-outline', 'card-outline', 'document-text-outline', 'key-outline', 'medkit-outline', 'cube-outline', 'leaf-outline'];

const BEHAVIOURS: Record<Kind, Option[]> = {
  asset: [
    { value: 'other_asset', label: 'Manual value', subtitle: 'You type the value (savings, pension, art…)' },
    { value: 'bank', label: 'Bank account' },
    { value: 'cash', label: 'Cash' },
    { value: 'stock', label: 'Stocks / funds', subtitle: 'Quantity × free live price' },
    { value: 'crypto', label: 'Crypto', subtitle: 'Quantity × free live price' },
    { value: 'gold', label: 'Gold', subtitle: 'Weight × free spot price' },
    { value: 'property', label: 'Property' },
    { value: 'vehicle', label: 'Vehicle' },
  ],
  liability: [
    { value: 'other_liability', label: 'Manual amount' },
    { value: 'loan', label: 'Loan' },
    { value: 'mortgage', label: 'Mortgage' },
    { value: 'credit_card', label: 'Credit card' },
  ],
};

export default function Categories() {
  const t = useTheme();
  const data = useStore((s) => s.data);
  const [kind, setKind] = useState<Kind>('asset');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const list = data.categories.filter((c) => c.kind === kind);

  return (
    <Screen>
      <Segmented options={[{ value: 'asset', label: 'Assets' }, { value: 'liability', label: 'Liabilities' }]} value={kind} onChange={setKind} />
      <Card style={{ paddingVertical: space(1) }}>
        {list.map((c, i) => (
          <View key={c.id}>
            <Row icon={c.icon as IconName} iconColor={c.color} title={c.name} subtitle={`${data.holdings.filter((h) => h.categoryId === c.id).length} items`} chevron onPress={() => setEditing(c)} />
            {i < list.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </Card>
      <Button title="New category" icon="add" onPress={() => setEditing('new')} />
      {editing ? <CategoryEditor kind={kind} category={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

function CategoryEditor({ kind, category, onClose }: { kind: Kind; category?: Category; onClose: () => void }) {
  const t = useTheme();
  const { addCategory, updateCategory, deleteCategory } = useStore.getState();
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? COLORS[0]);
  const [icon, setIcon] = useState<IconName>((category?.icon as IconName) ?? ICONS[0]);
  const [type, setType] = useState<HoldingType>(category?.type ?? (kind === 'asset' ? 'other_asset' : 'other_liability'));
  const [pick, setPick] = useState(false);

  const save = () => {
    if (!name.trim()) return Alert.alert('Enter a name');
    if (category) updateCategory(category.id, { name: name.trim(), color, icon, type });
    else addCategory({ name: name.trim(), color, icon, type, kind });
    onClose();
  };

  const remove = () => {
    if (!category) return;
    if (!deleteCategory(category.id)) return Alert.alert('Category in use', 'Move or delete its items first.');
    onClose();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <Screen>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T size={18} weight="700">{category ? 'Edit category' : 'New category'}</T>
            <Pressable onPress={onClose}><Ionicons name="close-circle" size={28} color={t.textMuted} /></Pressable>
          </View>
          <Card style={{ gap: space(4) }}>
            <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Pension" />
            <SelectField label="Works like" valueLabel={BEHAVIOURS[kind].find((b) => b.value === type)?.label ?? type} onPress={() => setPick(true)} />
          </Card>
          <SectionTitle>Colour</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
            {COLORS.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c, borderWidth: 3, borderColor: c === color ? t.text : 'transparent' }} />
            ))}
          </View>
          <SectionTitle>Icon</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
            {ICONS.map((i) => (
              <Pressable key={i} onPress={() => setIcon(i)} style={{ width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: i === icon ? color + '33' : t.cardAlt }}>
                <Ionicons name={i} size={22} color={i === icon ? color : t.textMuted} />
              </Pressable>
            ))}
          </View>
          <Button title="Save" icon="checkmark" onPress={save} />
          {category ? <Button title="Delete category" variant="ghost" onPress={remove} /> : null}
        </Screen>
        <OptionSheet visible={pick} title="Works like" options={BEHAVIOURS[kind]} value={type} onSelect={(v) => setType(v as HoldingType)} onClose={() => setPick(false)} />
      </SafeAreaView>
    </Modal>
  );
}
