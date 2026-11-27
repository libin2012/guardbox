import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { Money } from '../../components/Money';
import { space, useTheme } from '../../components/theme';
import { Card, Divider, Empty, Row, Screen, Segmented, T } from '../../components/ui';
import { holdingValue, totals } from '../../lib/calc';
import { convert, formatMoney } from '../../lib/money';
import { refreshAll } from '../../lib/refresh';
import { useStore } from '../../lib/store';
import { Kind } from '../../lib/types';

export default function Holdings() {
  const t = useTheme();
  const data = useStore((s) => s.data);
  const base = data.settings.baseCurrency;
  const hidden = data.settings.hideAmounts;
  const [kind, setKind] = useState<Kind>('asset');
  const [refreshing, setRefreshing] = useState(false);

  const groups = useMemo(() => {
    return data.categories
      .filter((c) => c.kind === kind)
      .map((c) => {
        const items = data.holdings.filter((h) => h.categoryId === c.id);
        return { category: c, items, total: totals(items, base, data.fx)[kind === 'asset' ? 'assets' : 'liabilities'] };
      })
      .filter((g) => g.items.length > 0)
      .sort((a, b) => b.total - a.total);
  }, [data, kind, base]);

  const total = groups.reduce((s, g) => s + g.total, 0);

  return (
    <View style={{ flex: 1 }}>
      <Screen
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={t.brand}
            onRefresh={async () => {
              setRefreshing(true);
              await refreshAll();
              setRefreshing(false);
            }}
          />
        }
      >
        <Segmented options={[{ value: 'asset', label: 'Assets' }, { value: 'liability', label: 'Liabilities' }]} value={kind} onChange={setKind} />
        <View style={{ alignItems: 'center', gap: space(1), paddingVertical: space(2) }}>
          <T muted size={13} weight="600">{kind === 'asset' ? 'Total assets' : 'Total liabilities'}</T>
          <Money amount={total} size={30} weight="800" style={{ color: kind === 'asset' ? t.text : t.negative }} />
        </View>
        {groups.length === 0 ? (
          <Empty
            icon={kind === 'asset' ? 'wallet-outline' : 'document-text-outline'}
            title={kind === 'asset' ? 'No assets yet' : 'No liabilities'}
            body={kind === 'asset' ? 'Tap + to add cash, a bank account, stocks, crypto, property or gold.' : 'Add loans, a mortgage or credit card balances to see your true net worth.'}
          />
        ) : (
          groups.map((g) => (
            <Card key={g.category.id} style={{ paddingVertical: space(2) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), paddingVertical: space(1) }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: g.category.color }} />
                <T weight="700" style={{ flex: 1 }}>{g.category.name}</T>
                <Money amount={g.total} weight="700" />
              </View>
              <Divider />
              {g.items.map((h) => {
                const own = holdingValue(h);
                const sub =
                  h.mode === 'quantity' && h.quantity != null
                    ? `${h.quantity} ${h.symbol?.toUpperCase() ?? (h.goldUnit === 'g' ? 'g' : 'oz')}${h.unitPrice ? ` @ ${formatMoney(h.unitPrice, h.currency, { hidden })}` : ''}`
                    : h.currency !== base
                      ? formatMoney(own, h.currency, { hidden })
                      : h.notes || undefined;
                return (
                  <Row
                    key={h.id}
                    icon={g.category.icon as never}
                    iconColor={g.category.color}
                    title={h.name}
                    subtitle={sub}
                    onPress={() => router.push(`/holding/${h.id}`)}
                    right={<Money amount={convert(own, h.currency, base, data.fx)} weight="600" />}
                  />
                );
              })}
            </Card>
          ))
        )}
      </Screen>
      <Pressable
        accessibilityLabel={kind === 'asset' ? 'Add asset' : 'Add liability'}
        onPress={() => router.push(`/holding/edit?kind=${kind}`)}
        style={({ pressed }) => ({ position: 'absolute', right: space(5), bottom: space(6), width: 58, height: 58, borderRadius: 29, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 })}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}
