import Constants from 'expo-constants';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, View } from 'react-native';
import { Option, OptionSheet } from '../../components/OptionSheet';
import { Avatar } from '../../components/ProfileForm';
import { space, useTheme } from '../../components/theme';
import { Button, Card, Divider, Field, Row, Screen, SectionTitle, T, ToggleRow } from '../../components/ui';
import { CURRENCIES } from '../../lib/defaults';
import { refreshAll } from '../../lib/refresh';
import { authenticateBiometric, biometricLabel, clearPasscode, hasPasscode } from '../../lib/security';
import { useStore } from '../../lib/store';
import { getProvider } from '../../lib/sync';
import { describeReminder, ensureNotificationPermission, scheduleEpfReminder } from '../../lib/epf/reminder';
import { EpfReminderSettings, ReminderFrequency } from '../../lib/types';

const PF_FREQUENCY: Option[] = [
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every 3 months' },
];
const PF_DAYS: Option[] = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Day ${i + 1}` }));
const PF_HOURS: Option[] = Array.from({ length: 15 }, (_, i) => {
  const h = i + 7;
  return { value: String(h), label: new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) };
});

const AUTO_LOCK: Option[] = [
  { value: '0', label: 'Immediately' },
  { value: '30', label: 'After 30 seconds' },
  { value: '60', label: 'After 1 minute' },
  { value: '300', label: 'After 5 minutes' },
  { value: '900', label: 'After 15 minutes' },
];

export default function Settings() {
  const t = useTheme();
  const data = useStore((s) => s.data);
  const { updateSettings, resetAll } = useStore.getState();
  const s = data.settings;
  const profile = data.profile;
  const [picker, setPicker] = useState<'currency' | 'autolock' | 'pfFreq' | 'pfDay' | 'pfHour' | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [finnhub, setFinnhub] = useState(s.finnhubKey ?? '');
  const [coingecko, setCoingecko] = useState(s.coingeckoKey ?? '');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    biometricLabel().then(setBio).catch(() => setBio(null));
  }, []);

  const currencyOptions = useMemo<Option[]>(() => CURRENCIES.map((c) => ({ value: c.code, label: c.code, subtitle: c.name })), []);

  const toggleLock = async (on: boolean) => {
    if (on) {
      if (!(await hasPasscode())) return router.push('/passcode?mode=enable');
      updateSettings({ lockEnabled: true });
    } else {
      await clearPasscode();
      updateSettings({ lockEnabled: false, biometricsEnabled: false });
    }
  };

  const toggleBio = async (on: boolean) => {
    if (on && !(await authenticateBiometric().catch(() => false))) return;
    updateSettings({ biometricsEnabled: on });
  };

  const provider = getProvider(s.syncProvider);

  const setReminder = async (patch: Partial<EpfReminderSettings>) => {
    const next = { ...s.epfReminder, ...patch };
    if (patch.enabled && !(await ensureNotificationPermission())) {
      Alert.alert('Notifications are off', 'Allow notifications for GuardBox in the iOS Settings app to get PF reminders.');
      return;
    }
    updateSettings({ epfReminder: next, epfReminderAsked: true });
    scheduleEpfReminder(next).catch((e) => Alert.alert('Could not set the reminder', String(e?.message ?? e)));
  };
  const pf = s.epfReminder;

  return (
    <Screen>
      <SectionTitle>Profile</SectionTitle>
      <Card style={{ paddingVertical: space(3) }}>
        <Pressable onPress={() => router.push('/profile')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(3), opacity: pressed ? 0.6 : 1 })} accessibilityRole="button" accessibilityLabel="Edit profile">
          <Avatar name={profile?.fullName} size={52} />
          <View style={{ flex: 1 }}>
            <T weight="700" size={17} numberOfLines={1}>{profile?.fullName ?? 'Your profile'}</T>
            <T size={13} muted numberOfLines={1}>{profile?.email ?? 'Add your name and email'}</T>
            {profile?.mobile ? <T size={13} muted numberOfLines={1}>{profile.mobile}</T> : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
        </Pressable>
      </Card>

      <SectionTitle>General</SectionTitle>
      <Card style={{ paddingVertical: space(1) }}>
        <Row icon="globe-outline" title="Main currency" subtitle="Totals and charts are shown in this currency" right={<T weight="700">{s.baseCurrency}</T>} chevron onPress={() => setPicker('currency')} />
        <Divider />
        <ToggleRow icon="eye-off-outline" title="Hide amounts" subtitle="Mask balances on screen" value={s.hideAmounts} onChange={(v) => updateSettings({ hideAmounts: v })} />
      </Card>

      <SectionTitle>Security</SectionTitle>
      <Card style={{ paddingVertical: space(1) }}>
        <ToggleRow icon="lock-closed-outline" title="Passcode lock" subtitle="Ask for a passcode when opening GuardBox" value={s.lockEnabled} onChange={toggleLock} />
        {s.lockEnabled ? (
          <>
            <Divider />
            {bio ? <><ToggleRow icon={bio.includes('Face') ? 'scan-outline' : 'finger-print'} title={`Unlock with ${bio}`} value={s.biometricsEnabled} onChange={toggleBio} /><Divider /></> : null}
            <Row icon="timer-outline" title="Auto-lock" right={<T muted>{AUTO_LOCK.find((o) => o.value === String(s.autoLockSeconds))?.label ?? `${s.autoLockSeconds}s`}</T>} chevron onPress={() => setPicker('autolock')} />
            <Divider />
            <Row icon="keypad-outline" title="Change passcode" chevron onPress={() => router.push('/passcode?mode=change')} />
          </>
        ) : null}
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card style={{ paddingVertical: space(1) }}>
        <Row icon="pricetags-outline" title="Categories" subtitle="Add or rename asset and liability types" chevron onPress={() => router.push('/categories')} />
        <Divider />
        <Row icon="cloud-upload-outline" title="Backup & sync" subtitle={provider ? `${provider.label}${s.lastSyncAt ? ` · last ${new Date(s.lastSyncAt).toLocaleString()}` : ''}` : 'Stored on this device only'} chevron onPress={() => router.push('/sync')} />
      </Card>

      <SectionTitle>Provident fund (EPF)</SectionTitle>
      <Card style={{ paddingVertical: space(1) }}>
        <Row icon="document-text-outline" title="Import EPF passbook" subtitle="Read the PDF from UMANG or the EPFO portal, on this device" chevron onPress={() => router.push('/epf-import')} />
        <Divider />
        <ToggleRow icon="notifications-outline" title="Update reminder" subtitle={describeReminder(pf)} value={pf.enabled} onChange={(v) => setReminder({ enabled: v })} />
        {pf.enabled ? (
          <>
            <Divider />
            <Row title="Repeat" right={<T muted>{PF_FREQUENCY.find((o) => o.value === pf.frequency)?.label}</T>} chevron onPress={() => setPicker('pfFreq')} />
            <Divider />
            <Row title="Day of month" right={<T muted>{pf.day}</T>} chevron onPress={() => setPicker('pfDay')} />
            <Divider />
            <Row title="Time" right={<T muted>{PF_HOURS.find((o) => o.value === String(pf.hour))?.label ?? `${pf.hour}:00`}</T>} chevron onPress={() => setPicker('pfHour')} />
          </>
        ) : null}
      </Card>

      <SectionTitle>Live prices</SectionTitle>
      <Card style={{ gap: space(3) }}>
        <T size={13} muted>Crypto (CoinGecko), gold and exchange rates update for free with no setup. Stocks use free Stooq quotes; add a free Finnhub key for faster US quotes.</T>
        <Field label="Finnhub API key (optional, free)" value={finnhub} onChangeText={setFinnhub} onEndEditing={() => updateSettings({ finnhubKey: finnhub.trim() || undefined })} autoCapitalize="none" autoCorrect={false} placeholder="finnhub.io → free key" />
        <Field label="CoinGecko demo key (optional, free)" value={coingecko} onChangeText={setCoingecko} onEndEditing={() => updateSettings({ coingeckoKey: coingecko.trim() || undefined })} autoCapitalize="none" autoCorrect={false} placeholder="Only if you hit rate limits" />
        <Button
          title="Refresh prices now"
          icon="refresh"
          variant="secondary"
          loading={refreshing}
          onPress={async () => {
            updateSettings({ finnhubKey: finnhub.trim() || undefined, coingeckoKey: coingecko.trim() || undefined });
            setRefreshing(true);
            const errors = await refreshAll();
            setRefreshing(false);
            Alert.alert(errors.length ? 'Updated with some issues' : 'Prices updated', errors.join('\n') || undefined);
          }}
        />
        {data.fx.updatedAt ? <T size={12} muted>Exchange rates updated {new Date(data.fx.updatedAt).toLocaleString()}</T> : <T size={12} muted>Using built-in approximate exchange rates until the first refresh.</T>}
      </Card>

      <SectionTitle>Danger zone</SectionTitle>
      <Card>
        <Button
          title="Erase all data"
          variant="danger"
          icon="trash-outline"
          onPress={() =>
            Alert.alert('Erase all data?', 'All items, history and custom categories on this device will be deleted. Cloud backups are not touched.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Erase', style: 'destructive', onPress: resetAll },
            ])
          }
        />
      </Card>
      <T size={12} muted style={{ textAlign: 'center' }}>GuardBox {Constants.expoConfig?.version ?? ''} · Your data stays on your device unless you turn on sync.</T>

      <OptionSheet visible={picker === 'currency'} title="Main currency" options={currencyOptions} value={s.baseCurrency} onSelect={(c) => updateSettings({ baseCurrency: c })} onClose={() => setPicker(null)} searchable />
      <OptionSheet visible={picker === 'pfFreq'} title="Repeat" options={PF_FREQUENCY} value={pf.frequency} onSelect={(v) => setReminder({ frequency: v as ReminderFrequency })} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === 'pfDay'} title="Day of month" options={PF_DAYS} value={String(pf.day)} onSelect={(v) => setReminder({ day: Number(v) })} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === 'pfHour'} title="Time" options={PF_HOURS} value={String(pf.hour)} onSelect={(v) => setReminder({ hour: Number(v) })} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === 'autolock'} title="Auto-lock" options={AUTO_LOCK} value={String(s.autoLockSeconds)} onSelect={(v) => updateSettings({ autoLockSeconds: Number(v) })} onClose={() => setPicker(null)} />
    </Screen>
  );
}
