import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Donut, LineChart } from '../../components/charts';
import { Money } from '../../components/Money';
import { space, useTheme } from '../../components/theme';
import { Card, Screen, SectionTitle, Segmented, T } from '../../components/ui';
import { breakdown, change, netWorthSeries, Range, RANGES, SeriesPoint, totals } from '../../lib/calc';
import { formatMoney, formatPercent } from '../../lib/money';
import { useStore } from '../../lib/store';
import { Kind } from '../../lib/types';

type Field = 'net' | 'assets' | 'liabilities';

export default function Insights() {
  const t = useTheme();
  const data = useStore((s) => s.data);
  const base = data.settings.baseCurrency;
  const hidden = data.settings.hideAmounts;
  const [range, setRange] = useState<Range>('1Y');
  const [field, setField] = useState<Field>('net');
  const [kind, setKind] = useState<Kind>('asset');
  const [scrub, setScrub] = useState<SeriesPoint | null>(null);

  const series = useMemo(() => netWorthSeries(data, range, base, field), [data, range, base, field]);
  const delta = change(series);
  const slices = useMemo(() => breakdown(data, kind, base), [data, kind, base]);
  const tot = totals(data.holdings, base, data.fx);
  const ratio = tot.assets > 0 ? tot.liabilities / tot.assets : 0;
  const color = field === 'liabilities' ? t.negative : t.brand;
  const latest = series.length ? series[series.length - 1].value : 0;

  return (
    <Screen>
      <Segmented options={[{ value: 'net', label: 'Net worth' }, { value: 'assets', label: 'Assets' }, { value: 'liabilities', label: 'Debts' }]} value={field} onChange={setField} />
      <Card style={{ gap: space(2) }}>
        <T size={13} muted weight="600">{scrub ? new Date(scrub.t).toLocaleDateString() : 'Latest'}</T>
        <T size={26} weight="800">{formatMoney(scrub?.value ?? latest, base, { hidden })}</T>
        {delta && !scrub ? (
          <T size={13} weight="600" style={{ color: (field === 'liabilities' ? -delta.abs : delta.abs) >= 0 ? t.positive : t.negative }}>
            {hidden ? '••••' : `${delta.abs >= 0 ? '+' : '−'}${formatMoney(Math.abs(delta.abs), base)} (${formatPercent(delta.pct)}) over ${RANGES.find((r) => r.value === range)?.label}`}
          </T>
        ) : (
          <T size={13} muted>{series.length < 2 ? 'History builds up as you use GuardBox each day.' : ' '}</T>
        )}
        <LineChart data={series} height={200} color={color} onScrub={setScrub} />
        <Segmented options={RANGES} value={range} onChange={setRange} />
      </Card>

      <SectionTitle>Debt to asset ratio</SectionTitle>
      <Card style={{ gap: space(2) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T weight="700" size={20}>{(ratio * 100).toFixed(1)}%</T>
          <T muted size={13}>{ratio < 0.3 ? 'Healthy' : ratio < 0.6 ? 'Moderate' : 'High'}</T>
        </View>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: t.cardAlt, overflow: 'hidden' }}>
          <View style={{ width: `${Math.min(100, ratio * 100)}%`, height: '100%', backgroundColor: ratio < 0.3 ? t.positive : ratio < 0.6 ? t.gold : t.negative }} />
        </View>
      </Card>

      <SectionTitle>Breakdown</SectionTitle>
      <Segmented options={[{ value: 'asset', label: 'Assets' }, { value: 'liability', label: 'Liabilities' }]} value={kind} onChange={setKind} />
      <Card style={{ alignItems: 'center', gap: space(4) }}>
        <Donut slices={slices.map((s) => ({ value: s.value, color: s.category.color }))} size={190} thickness={26}>
          <T size={12} muted>{kind === 'asset' ? 'Assets' : 'Liabilities'}</T>
          <Money amount={kind === 'asset' ? tot.assets : tot.liabilities} weight="800" size={17} compact />
        </Donut>
        <View style={{ alignSelf: 'stretch', gap: space(3) }}>
          {slices.length === 0 ? <T muted style={{ textAlign: 'center' }}>Nothing here yet.</T> : null}
          {slices.map((s) => (
            <View key={s.category.id} style={{ gap: space(1) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.category.color }} />
                <T style={{ flex: 1 }} weight="600">{s.category.name}</T>
                <T muted size={13}>{(s.share * 100).toFixed(1)}%</T>
                <Money amount={s.value} weight="700" />
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: t.cardAlt, overflow: 'hidden' }}>
                <View style={{ width: `${s.share * 100}%`, height: '100%', backgroundColor: s.category.color }} />
              </View>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
