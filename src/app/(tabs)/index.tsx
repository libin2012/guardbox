import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { Donut, LineChart } from '../../components/charts';
import { Money } from '../../components/Money';
import { radius, space, useTheme } from '../../components/theme';
import { Button, Card, Empty, Row, Screen, SectionTitle, T } from '../../components/ui';
import { breakdown, change, netWorthSeries, Range, RANGES, SeriesPoint, totals } from '../../lib/calc';
import { formatMoney, formatPercent } from '../../lib/money';
import { refreshAll } from '../../lib/refresh';
import { useStore } from '../../lib/store';


export default function Overview() {
  const t = useTheme();
  const data = useStore((s) => s.data);
  const updateSettings = useStore((s) => s.updateSettings);
  const base = data.settings.baseCurrency;
  const hidden = data.settings.hideAmounts;
  const [range, setRange] = useState<Range>('3M');
  const [scrub, setScrub] = useState<SeriesPoint | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const tot = useMemo(() => totals(data.holdings, base, data.fx), [data, base]);
  const series = useMemo(() => netWorthSeries(data, range, base), [data, range, base]);
  const delta = change(series);
  const assetSlices = useMemo(() => breakdown(data, 'asset', base), [data, base]);

  const onRefresh = async () => {
    setRefreshing(true);
    setErrors(await refreshAll());
    setRefreshing(false);
  };

  const shown = scrub?.value ?? tot.netWorth;
  const up = (delta?.abs ?? 0) >= 0;

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.brand} />}>
      <View style={{ backgroundColor: t.hero, borderRadius: radius.lg, padding: space(5), gap: space(2) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T size={14} style={{ color: t.heroMuted }} weight="600">
            {scrub ? new Date(scrub.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Net worth'}
          </T>
          <Pressable onPress={() => updateSettings({ hideAmounts: !hidden })} accessibilityLabel={hidden ? 'Show amounts' : 'Hide amounts'} hitSlop={10}>
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={t.heroMuted} />
          </Pressable>
        </View>
        <T size={36} weight="800" style={{ color: t.heroText }}>{formatMoney(shown, base, { hidden })}</T>
        {delta && !scrub ? (
          <T size={14} weight="600" style={{ color: up ? '#4ADE9B' : '#FF8A8D' }}>
            {hidden ? '••••' : `${up ? '▲' : '▼'} ${formatMoney(Math.abs(delta.abs), base)} (${formatPercent(delta.pct)})`}  ·  {RANGES.find((r) => r.value === range)?.label}
          </T>
        ) : null}
        <View style={{ marginHorizontal: -space(2), marginTop: space(2) }}>
          <LineChart data={series} height={150} color="#4ADE9B" onScrub={setScrub} />
        </View>
        <View style={{ flexDirection: 'row', gap: space(1), marginTop: space(1) }}>
          {RANGES.map((r) => (
            <Pressable key={r.value} onPress={() => setRange(r.value)} style={{ flex: 1, alignItems: 'center', paddingVertical: space(1.5), borderRadius: 8, backgroundColor: r.value === range ? 'rgba(255,255,255,0.14)' : 'transparent' }}>
              <T size={13} weight="700" style={{ color: r.value === range ? t.heroText : t.heroMuted }}>{r.label}</T>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: space(3) }}>
        <Card style={{ flex: 1, gap: space(1) }}>
          <T size={13} muted weight="600">Assets</T>
          <Money amount={tot.assets} size={18} weight="700" style={{ color: t.positive }} />
        </Card>
        <Card style={{ flex: 1, gap: space(1) }}>
          <T size={13} muted weight="600">Liabilities</T>
          <Money amount={tot.liabilities} size={18} weight="700" style={{ color: t.negative }} />
        </Card>
      </View>

      {errors.length ? (
        <Card style={{ borderColor: t.negative }}>
          <T weight="600" style={{ color: t.negative }}>Some prices could not be updated</T>
          {errors.slice(0, 4).map((e) => <T key={e} size={13} muted>{e}</T>)}
        </Card>
      ) : null}

      {data.holdings.length === 0 ? (
        <Empty
          icon="shield-checkmark-outline"
          title="Start tracking your wealth"
          body="Add your cash, bank accounts, investments, property and loans to see your net worth in one place."
          action={<Button title="Add your first item" icon="add" onPress={() => router.push('/holding/edit?kind=asset')} style={{ marginTop: space(2) }} />}
        />
      ) : (
        <>
          <SectionTitle>Asset allocation</SectionTitle>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space(4) }}>
            <Donut slices={assetSlices.map((s) => ({ value: s.value, color: s.category.color }))} size={130} thickness={18}>
              <T size={12} muted>{assetSlices.length} types</T>
            </Donut>
            <View style={{ flex: 1, gap: space(2) }}>
              {assetSlices.slice(0, 5).map((s) => (
                <View key={s.category.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.category.color }} />
                  <T size={13} style={{ flex: 1 }} numberOfLines={1}>{s.category.name}</T>
                  <T size={13} weight="700">{(s.share * 100).toFixed(0)}%</T>
                </View>
              ))}
            </View>
          </Card>

          <SectionTitle right={<Button title="See all" variant="ghost" onPress={() => router.push('/holdings')} style={{ paddingVertical: 0 }} />}>Largest items</SectionTitle>
          <Card style={{ paddingVertical: space(1) }}>
            {[...data.holdings]
              .map((h) => ({ h, v: totals([h], base, data.fx) }))
              .sort((a, b) => Math.abs(b.v.netWorth) - Math.abs(a.v.netWorth))
              .slice(0, 5)
              .map(({ h, v }) => {
                const cat = data.categories.find((c) => c.id === h.categoryId);
                return (
                  <Row key={h.id} icon={(cat?.icon as never) ?? 'cube-outline'} iconColor={cat?.color} title={h.name} subtitle={cat?.name} onPress={() => router.push(`/holding/${h.id}`)} right={<Money amount={v.netWorth} weight="700" style={{ color: h.kind === 'liability' ? t.negative : t.text }} />} />
                );
              })}
          </Card>
          <T size={12} muted style={{ textAlign: 'center' }}>
            Pull down to refresh prices and exchange rates{data.fx.updatedAt ? ` · rates from ${new Date(data.fx.updatedAt).toLocaleString()}` : ''}
          </T>
        </>
      )}
      <View style={{ height: space(2) }} />
      {data.holdings.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: space(3) }}>
          <Button title="Add asset" icon="add-circle-outline" onPress={() => router.push('/holding/edit?kind=asset')} style={{ flex: 1 }} />
          <Button title="Add liability" icon="remove-circle-outline" variant="secondary" onPress={() => router.push('/holding/edit?kind=liability')} style={{ flex: 1 }} />
        </View>
      ) : null}
    </Screen>
  );
}

