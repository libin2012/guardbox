import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Option, OptionSheet, SelectField } from '../../components/OptionSheet';
import { space, useTheme } from '../../components/theme';
import { Button, Card, Field, Screen, Segmented, T, ToggleRow } from '../../components/ui';
import { CURRENCIES } from '../../lib/defaults';
import { convert, formatMoney, parseAmount } from '../../lib/money';
import { CoinResult, fetchCryptoUSD, fetchGoldUSDPerOz, fetchStock, searchCoins, stockQuoteCurrency, supportsLivePrice } from '../../lib/prices';
import { GRAMS_PER_TROY_OZ } from '../../lib/calc';
import { useStore } from '../../lib/store';
import { GoldUnit, Kind } from '../../lib/types';

export default function EditHolding() {
  const t = useTheme();
  const params = useLocalSearchParams<{ id?: string; kind?: Kind }>();
  const data = useStore((s) => s.data);
  const { addHolding, updateHolding } = useStore.getState();
  const existing = data.holdings.find((h) => h.id === params.id);
  const kind: Kind = existing?.kind ?? (params.kind === 'liability' ? 'liability' : 'asset');
  const categories = data.categories.filter((c) => c.kind === kind);

  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? categories[0]?.id);
  const [name, setName] = useState(existing?.name ?? '');
  const [currency, setCurrency] = useState(existing?.currency ?? data.settings.baseCurrency);
  const [valueText, setValueText] = useState(existing && existing.mode === 'manual' ? String(existing.value) : '');
  const [mode, setMode] = useState<'manual' | 'quantity'>(existing?.mode ?? 'manual');
  const [qtyText, setQtyText] = useState(existing?.quantity != null ? String(existing.quantity) : '');
  const [symbol, setSymbol] = useState(existing?.symbol ?? '');
  const [coinLabel, setCoinLabel] = useState(existing?.symbol ?? '');
  const [goldUnit, setGoldUnit] = useState<GoldUnit>(existing?.goldUnit ?? 'g');
  const [autoPrice, setAutoPrice] = useState(existing?.autoPrice ?? true);
  const [priceText, setPriceText] = useState(existing?.unitPrice != null ? String(+existing.unitPrice.toFixed(4)) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [picker, setPicker] = useState<'category' | 'currency' | 'coin' | null>(null);
  const [fetching, setFetching] = useState(false);
  const [coinQuery, setCoinQuery] = useState('');
  const [coinResults, setCoinResults] = useState<CoinResult[]>([]);
  const [searching, setSearching] = useState(false);

  const category = data.categories.find((c) => c.id === categoryId);
  const type = category?.type;
  const live = !!type && supportsLivePrice(type);

  useEffect(() => {
    if (!live && mode === 'quantity') setMode('manual');
    if (live && !existing) setMode('quantity');
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  // debounced coin search
  useEffect(() => {
    if (picker !== 'coin' || coinQuery.trim().length < 2) return;
    const h = setTimeout(async () => {
      setSearching(true);
      try {
        setCoinResults(await searchCoins(coinQuery, data.settings));
      } catch {
        setCoinResults([]);
      }
      setSearching(false);
    }, 400);
    return () => clearTimeout(h);
  }, [coinQuery, picker, data.settings]);

  const fetchPrice = async (): Promise<number | null> => {
    if (!type) return null;
    setFetching(true);
    try {
      let p: number | null = null;
      if (type === 'crypto' && symbol) {
        const usd = (await fetchCryptoUSD([symbol], data.settings))[symbol];
        p = usd != null ? convert(usd, 'USD', currency, data.fx) : null;
      } else if (type === 'gold') {
        const oz = await fetchGoldUSDPerOz(data.settings);
        p = convert(goldUnit === 'g' ? oz / GRAMS_PER_TROY_OZ : oz, 'USD', currency, data.fx);
      } else if (type === 'stock' && symbol) {
        const q = await fetchStock(symbol, data.settings);
        p = convert(q.price, q.currency, currency, data.fx);
      }
      if (p == null) throw new Error('No price found');
      setPriceText(String(+p.toFixed(4)));
      return p;
    } catch (e) {
      Alert.alert('Could not fetch price', `${(e as Error).message}. You can turn off automatic price and type it in.`);
      return null;
    } finally {
      setFetching(false);
    }
  };

  const save = async () => {
    if (!category) return Alert.alert('Pick a category');
    const finalName = name.trim() || (type === 'crypto' && coinLabel ? coinLabel : type === 'stock' && symbol ? symbol.toUpperCase() : category.name);
    const base = { name: finalName, kind, categoryId: category.id, currency, notes: notes.trim() || undefined };
    if (mode === 'quantity') {
      const quantity = parseAmount(qtyText);
      if (quantity == null) return Alert.alert('Enter a quantity');
      if (type !== 'gold' && !symbol.trim()) return Alert.alert(type === 'crypto' ? 'Choose a coin' : 'Enter a ticker symbol');
      let unitPrice = parseAmount(priceText);
      if (autoPrice && unitPrice == null) unitPrice = await fetchPrice();
      if (unitPrice == null) return Alert.alert('Enter a unit price', 'Or turn on automatic price.');
      const fields = { ...base, mode, quantity, unitPrice, symbol: symbol.trim() || undefined, goldUnit: type === 'gold' ? goldUnit : undefined, autoPrice, value: quantity * unitPrice, priceUpdatedAt: new Date().toISOString() };
      if (existing) updateHolding(existing.id, fields);
      else addHolding(fields);
    } else {
      const value = parseAmount(valueText);
      if (value == null) return Alert.alert('Enter a value');
      const fields = { ...base, mode, value: Math.abs(value), quantity: undefined, unitPrice: undefined, symbol: undefined, autoPrice: undefined };
      if (existing) updateHolding(existing.id, fields);
      else addHolding(fields);
    }
    router.back();
  };

  const categoryOptions: Option[] = categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon as never, color: c.color }));
  const currencyOptions: Option[] = useMemo(() => CURRENCIES.map((c) => ({ value: c.code, label: c.code, subtitle: c.name })), []);
  const qty = parseAmount(qtyText);
  const unit = parseAmount(priceText);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: existing ? 'Edit' : kind === 'asset' ? 'New asset' : 'New liability', headerRight: () => <Button title="Save" variant="ghost" onPress={save} style={{ paddingVertical: 0 }} /> }} />
      <Screen>
        <Card style={{ gap: space(4) }}>
          <SelectField label="Category" valueLabel={category?.name ?? 'Choose'} onPress={() => setPicker('category')} />
          <Field label="Name" value={name} onChangeText={setName} placeholder={kind === 'asset' ? 'e.g. Savings account' : 'e.g. Car loan'} />
          <SelectField label="Currency" valueLabel={`${currency} · ${CURRENCIES.find((c) => c.code === currency)?.name ?? ''}`} onPress={() => setPicker('currency')} />
        </Card>

        {live ? (
          <Segmented options={[{ value: 'quantity', label: type === 'gold' ? 'By weight' : 'By quantity' }, { value: 'manual', label: 'Total value' }]} value={mode} onChange={setMode} />
        ) : null}

        {mode === 'quantity' && live ? (
          <Card style={{ gap: space(4) }}>
            {type === 'crypto' ? (
              <SelectField label="Coin" valueLabel={coinLabel || 'Search coins…'} onPress={() => setPicker('coin')} />
            ) : type === 'stock' ? (
              <Field
                label="Ticker"
                value={symbol}
                onChangeText={(s) => setSymbol(s.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="AAPL, VOD.UK, SAP.DE"
                hint={`US tickers work as-is. Add a market suffix for others (.UK, .DE, .JP, .HK). Quoted in ${symbol ? stockQuoteCurrency(symbol).replace('GBX', 'GBP') : 'USD'}.`}
              />
            ) : (
              <View style={{ gap: space(1.5) }}>
                <T size={13} muted weight="600">Unit</T>
                <Segmented options={[{ value: 'g', label: 'Grams' }, { value: 'oz', label: 'Troy ounces' }]} value={goldUnit} onChange={(u) => { setGoldUnit(u); setPriceText(''); }} />
              </View>
            )}
            <Field label={type === 'gold' ? `Weight (${goldUnit})` : 'Quantity'} value={qtyText} onChangeText={setQtyText} keyboardType="decimal-pad" placeholder="0" />
            <ToggleRow title="Automatic price" subtitle={type === 'stock' ? 'Free quotes from Stooq / Finnhub' : type === 'crypto' ? 'Free prices from CoinGecko' : 'Free spot price (24k)'} value={autoPrice} onChange={setAutoPrice} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(3) }}>
              <View style={{ flex: 1 }}>
                <Field label={`Price per ${type === 'gold' ? goldUnit : 'unit'} (${currency})`} value={priceText} onChangeText={setPriceText} keyboardType="decimal-pad" placeholder="0" editable={!autoPrice} />
              </View>
              {autoPrice ? <Button title="Fetch" variant="secondary" icon="refresh" loading={fetching} onPress={fetchPrice} /> : null}
            </View>
            {qty != null && unit != null ? <T muted>Value: {formatMoney(qty * unit, currency)}</T> : null}
          </Card>
        ) : (
          <Card style={{ gap: space(4) }}>
            <Field
              label={kind === 'asset' ? 'Current value' : 'Amount owed'}
              value={valueText}
              onChangeText={setValueText}
              keyboardType="decimal-pad"
              placeholder="0"
              hint={type === 'property' || type === 'vehicle' ? 'Update this whenever you get a new valuation. Each update is kept in the history chart.' : undefined}
            />
          </Card>
        )}

        <Card>
          <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
        </Card>
        <Button title={existing ? 'Save changes' : 'Add'} icon="checkmark" onPress={save} />
      </Screen>

      <OptionSheet visible={picker === 'category'} title="Category" options={categoryOptions} value={categoryId} onSelect={setCategoryId} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === 'currency'} title="Currency" options={currencyOptions} value={currency} onSelect={(c) => { setCurrency(c); setPriceText(''); }} onClose={() => setPicker(null)} searchable />
      <CoinSearch
        visible={picker === 'coin'}
        query={coinQuery}
        setQuery={setCoinQuery}
        results={coinResults}
        searching={searching}
        onClose={() => setPicker(null)}
        onPick={(c) => {
          setSymbol(c.id);
          setCoinLabel(`${c.name} (${c.symbol.toUpperCase()})`);
          if (!name) setName(c.name);
          setPriceText('');
          setPicker(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function CoinSearch({ visible, query, setQuery, results, searching, onClose, onPick }: { visible: boolean; query: string; setQuery: (s: string) => void; results: CoinResult[]; searching: boolean; onClose: () => void; onPick: (c: CoinResult) => void }) {
  const t = useTheme();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, padding: space(4), gap: space(3) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T size={18} weight="700">Find a coin</T>
          <Button title="Close" variant="ghost" onPress={onClose} style={{ paddingVertical: 0 }} />
        </View>
        <TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Bitcoin, ETH, Solana…" placeholderTextColor={t.textMuted} autoCorrect={false} autoCapitalize="none" style={{ backgroundColor: t.cardAlt, color: t.text, borderRadius: 10, padding: space(3), fontSize: 16 }} />
        {searching ? <ActivityIndicator color={t.brand} /> : null}
        <FlatList
          data={results}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={!searching && query.length >= 2 ? <T muted>No coins found (or CoinGecko is unreachable).</T> : undefined}
          renderItem={({ item }) => (
            <Pressable onPress={() => onPick(item)} style={{ paddingVertical: space(3), borderBottomWidth: 0.5, borderColor: t.border }}>
              <T weight="600">{item.name} <T muted>{item.symbol.toUpperCase()}</T></T>
              <T size={12} muted>{item.id}</T>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}
