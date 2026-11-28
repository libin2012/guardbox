import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { LineChart } from '../../components/charts';
import { Money } from '../../components/Money';
import { space, useTheme } from '../../components/theme';
import { Button, Card, Divider, Empty, Row, Screen, SectionTitle, Segmented, T } from '../../components/ui';
import { change, holdingSeries, holdingValue, Range, RANGES, SeriesPoint } from '../../lib/calc';
import { parseDay } from '../../lib/dates';
import { convert, formatMoney, formatPercent } from '../../lib/money';
import { useStore } from '../../lib/store';

export default function HoldingDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useStore((s) => s.data);
  const deleteHolding = useStore((s) => s.deleteHolding);
  const h = data.holdings.find((x) => x.id === id);
  const [range, setRange] = useState<Range>('ALL');
  const [scrub, setScrub] = useState<SeriesPoint | null>(null);
  const series = useMemo(() => (h ? holdingSeries(h, range) : []), [h, range]);

  if (!h) return <Screen><Empty icon="help-circle-outline" title="Not found" body="This item was deleted." /></Screen>;

  const cat = data.categories.find((c) => c.id === h.categoryId);
  const base = data.settings.baseCurrency;
  const hidden = data.settings.hideAmounts;
  const value = holdingValue(h);
  const delta = change(series);
  const good = h.kind === 'asset' ? (delta?.abs ?? 0) >= 0 : (delta?.abs ?? 0) <= 0;

  const confirmDelete = () =>
    Alert.alert('Delete item?', `“${h.name}” and its history will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteHolding(h.id); router.back(); } },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: h.name }} />
      <View style={{ gap: space(1) }}>
        <T muted weight="600">{cat?.name}{h.kind === 'liability' ? ' · owed' : ''}</T>
        <T size={32} weight="800">{formatMoney(scrub?.value ?? value, h.currency, { hidden })}</T>
        {h.currency !== base && !scrub ? <Money amount={convert(value, h.currency, base, data.fx)} muted /> : null}
        {scrub ? <T muted>{new Date(scrub.t).toLocaleDateString()}</T> : delta ? (
          <T weight="600" style={{ color: good ? t.positive : t.negative }}>
            {hidden ? '••••' : `${delta.abs >= 0 ? '+' : '−'}${formatMoney(Math.abs(delta.abs), h.currency)} (${formatPercent(delta.pct)})`}
          </T>
        ) : null}
      </View>
      <Card style={{ gap: space(3) }}>
        <LineChart data={series} height={170} color={h.kind === 'liability' ? t.negative : cat?.color} onScrub={setScrub} />
        <Segmented options={RANGES} value={range} onChange={setRange} />
      </Card>

      <Card style={{ paddingVertical: space(1) }}>
        {h.mode === 'quantity' ? (
          <>
            <Row title="Quantity" right={<T weight="600">{h.quantity} {h.goldUnit ?? ''}</T>} />
            <Divider />
            <Row title="Unit price" subtitle={h.autoPrice !== false ? 'Updated automatically' : 'Manual'} right={<T weight="600">{formatMoney(h.unitPrice ?? 0, h.currency, { hidden })}</T>} />
            {h.symbol ? (<><Divider /><Row title={cat?.type === 'crypto' ? 'Coin' : 'Ticker'} right={<T weight="600">{h.symbol.toUpperCase()}</T>} /></>) : null}
            {h.priceUpdatedAt ? (<><Divider /><Row title="Price updated" right={<T muted>{new Date(h.priceUpdatedAt).toLocaleString()}</T>} /></>) : null}
          </>
        ) : (
          <Row title="Currency" right={<T weight="600">{h.currency}</T>} />
        )}
        {h.notes ? (<><Divider /><Row title="Notes" subtitle={h.notes} /></>) : null}
      </Card>

      {h.epf || h.categoryId === 'cat-pf' ? (
        <>
          <SectionTitle>EPF passbook</SectionTitle>
          {h.epf ? (
            <Card style={{ paddingVertical: space(1) }}>
              <Row title="Employee share" right={<T weight="600">{formatMoney(h.epf.employeeShare, h.currency, { hidden })}</T>} />
              <Divider />
              <Row title="Employer share" right={<T weight="600">{formatMoney(h.epf.employerShare, h.currency, { hidden })}</T>} />
              <Divider />
              <Row title="Pension (EPS)" subtitle={h.epf.includePension ? 'Counted in net worth' : 'Not counted in net worth'} right={<T weight="600">{formatMoney(h.epf.pensionShare, h.currency, { hidden })}</T>} />
              {h.epf.asOf ? (<><Divider /><Row title="Balance as on" right={<T muted>{parseDay(h.epf.asOf).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</T>} /></>) : null}
              {h.epf.uan ? (<><Divider /><Row title="UAN" right={<T muted>{hidden ? '••••' + h.epf.uan.slice(-4) : h.epf.uan}</T>} /></>) : null}
              {h.epf.memberId ? (<><Divider /><Row title="Member ID" right={<T muted numberOfLines={1}>{h.epf.memberId}</T>} /></>) : null}
            </Card>
          ) : null}
          <Button title="Import new passbook" icon="document-text-outline" variant="secondary" onPress={() => router.push({ pathname: '/epf-import', params: { holding: h.id } })} />
        </>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space(3) }}>
        <Button title="Edit" icon="create-outline" onPress={() => router.push(`/holding/edit?id=${h.id}`)} style={{ flex: 1 }} />
        <Button title="Delete" icon="trash-outline" variant="secondary" onPress={confirmDelete} style={{ flex: 1 }} />
      </View>

      <SectionTitle>Value history</SectionTitle>
      <Card style={{ paddingVertical: space(1) }}>
        {[...h.history].reverse().slice(0, 60).map((p, i, arr) => (
          <View key={p.date}>
            <Row title={parseDay(p.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} right={<T weight="600">{formatMoney(p.value, h.currency, { hidden })}</T>} />
            {i < arr.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </Card>
    </Screen>
  );
}
