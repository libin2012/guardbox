import * as DocumentPicker from 'expo-document-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { Option, OptionSheet } from '../components/OptionSheet';
import { space, useTheme } from '../components/theme';
import { Button, Card, Divider, Field, Row, Screen, SectionTitle, T, ToggleRow } from '../components/ui';
import { pdfReaderAvailable } from '../../modules/epf-pdf';
import { autoTarget, discardIncoming, matchingPfHoldings, readPassbook, saveEpf } from '../lib/epf/import';
import { EpfPassbook, epfValue } from '../lib/epf/parse';
import { ensureNotificationPermission, scheduleEpfReminder } from '../lib/epf/reminder';
import { formatMoney, parseAmount } from '../lib/money';
import { useStore } from '../lib/store';

type Phase =
  | { k: 'start' }
  | { k: 'reading' }
  | { k: 'password'; wrong: boolean }
  | { k: 'review'; passbook: EpfPassbook | null };

const NEW_ACCOUNT = '__new__';

function toDisplayDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fromDisplayDate(text: string): string | undefined | null {
  const s = text.trim();
  if (!s) return undefined;
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const amountText = (n?: number) => (n == null ? '' : String(n));

export default function EpfImport() {
  const t = useTheme();
  const params = useLocalSearchParams<{ file?: string; holding?: string }>();
  const holdings = useStore((s) => s.data.holdings);
  const hidden = useStore((s) => s.data.settings.hideAmounts);

  const [file, setFile] = useState<string | undefined>(params.file);
  const [phase, setPhase] = useState<Phase>({ k: 'start' });
  const [password, setPassword] = useState('');

  // review form
  const [target, setTarget] = useState<string>(NEW_ACCOUNT);
  const [name, setName] = useState('Provident Fund');
  const [uan, setUan] = useState('');
  const [memberId, setMemberId] = useState('');
  const [establishment, setEstablishment] = useState('');
  const [employee, setEmployee] = useState('');
  const [employer, setEmployer] = useState('');
  const [pension, setPension] = useState('');
  const [includePension, setIncludePension] = useState(false);
  const [asOf, setAsOf] = useState('');
  const [pickTarget, setPickTarget] = useState(false);
  const fileRef = useRef(file);
  fileRef.current = file;

  // never leave the passbook copy behind
  useEffect(() => () => discardIncoming(fileRef.current), []);

  const fillForm = useCallback(
    (p: EpfPassbook | null) => {
      const all = useStore.getState().data.holdings;
      const preferred = params.holding ? all.find((h) => h.id === params.holding) : undefined;
      const match = preferred ?? (p ? autoTarget(all, p) : undefined);
      setTarget(match?.id ?? NEW_ACCOUNT);
      setName(match?.name ?? (p?.establishment ? `PF · ${p.establishment}` : 'Provident Fund'));
      setUan(p?.uan ?? match?.epf?.uan ?? '');
      setMemberId(p?.memberId ?? match?.epf?.memberId ?? '');
      setEstablishment(p?.establishment ?? match?.epf?.establishment ?? '');
      setEmployee(amountText(p?.balance?.employee));
      setEmployer(amountText(p?.balance?.employer));
      setPension(amountText(p?.balance?.pension));
      setIncludePension(match?.epf?.includePension ?? false);
      setAsOf(toDisplayDate(p?.asOf));
      setPhase({ k: 'review', passbook: p });
    },
    [params.holding],
  );

  const read = useCallback(
    async (uri: string, pw?: string) => {
      setPhase({ k: 'reading' });
      try {
        const out = await readPassbook(uri, pw);
        if (out.kind === 'ok') {
          setPassword('');
          fillForm(out.passbook);
        } else {
          setPhase({ k: 'password', wrong: out.kind === 'wrong_password' });
        }
      } catch (e) {
        Alert.alert('Could not read the PDF', `${(e as Error).message}\n\nYou can enter the balance yourself.`);
        fillForm(null);
      }
    },
    [fillForm],
  );

  useEffect(() => {
    if (params.file) read(params.file);
  }, [params.file, read]);

  const choose = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'com.adobe.pdf'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    discardIncoming(file);
    setFile(r.assets[0].uri);
    read(r.assets[0].uri);
  };

  const targetOptions = useMemo<Option[]>(() => {
    const pf = matchingPfHoldings(holdings, { memberId, uan });
    return [
      ...pf.map((h) => ({ value: h.id, label: h.name, subtitle: h.epf?.memberId ?? 'Provident fund' })),
      { value: NEW_ACCOUNT, label: 'New PF account', subtitle: 'Create a new asset' },
    ];
  }, [holdings, memberId, uan]);

  const shares = { employee: parseAmount(employee) ?? NaN, employer: parseAmount(employer) ?? NaN, pension: parseAmount(pension || '0') ?? NaN };
  const valid = Number.isFinite(shares.employee) && Number.isFinite(shares.employer) && Number.isFinite(shares.pension);
  const total = valid ? epfValue(shares, includePension) : null;

  const save = async () => {
    if (!valid) return Alert.alert('Check the amounts', 'Enter the employee and employer balances as numbers.');
    const asOfIso = fromDisplayDate(asOf);
    if (asOfIso === null) return Alert.alert('Check the date', 'Use the format DD/MM/YYYY.');
    const id = saveEpf(
      {
        name: name.trim() || 'Provident Fund',
        epf: {
          uan: uan.trim() || undefined,
          memberId: memberId.trim().toUpperCase() || undefined,
          establishment: establishment.trim() || undefined,
          employeeShare: shares.employee,
          employerShare: shares.employer,
          pensionShare: shares.pension,
          includePension,
          asOf: asOfIso,
        },
      },
      target === NEW_ACCOUNT ? null : target,
    );
    discardIncoming(file);
    setFile(undefined);
    router.dismissTo(`/holding/${id}`);
    await offerReminder();
  };

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'EPF passbook' }} />

      {phase.k === 'start' ? (
        <>
          <Card style={{ gap: space(2) }}>
            <T weight="700">Update your PF balance from the passbook</T>
            <T muted size={13}>1. In UMANG, open EPFO → View Passbook, pick your member ID and download the PDF. Or download it from passbook.epfindia.gov.in.</T>
            <T muted size={13}>2. Tap Share on the PDF and choose GuardBox, or pick the file below.</T>
            <T muted size={13}>The PDF is read on this iPhone. It is never uploaded, and GuardBox deletes its copy after the import.</T>
          </Card>
          <Button title="Choose passbook PDF" icon="document-outline" onPress={choose} disabled={!pdfReaderAvailable} />
          {!pdfReaderAvailable ? <T size={12} muted>Reading PDFs needs the installed GuardBox app build (not Expo Go). You can still enter the balance yourself.</T> : null}
          <Button title="Enter balance manually" variant="ghost" onPress={() => fillForm(null)} />
        </>
      ) : null}

      {phase.k === 'reading' ? (
        <Card style={{ alignItems: 'center', paddingVertical: space(8) }}>
          <Button title="Reading passbook…" variant="ghost" loading onPress={() => undefined} />
        </Card>
      ) : null}

      {phase.k === 'password' ? (
        <Card style={{ gap: space(3) }}>
          <T weight="700">This PDF is password protected</T>
          <T muted size={13}>UMANG passbooks usually use your 12-digit UAN as the password. The password is only used to open the file and is not saved.</T>
          <Field
            label="PDF password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            placeholder="e.g. your UAN"
            onSubmitEditing={() => file && password && read(file, password)}
          />
          {phase.wrong ? <T size={13} style={{ color: t.negative }}>That password did not open the PDF. Try again.</T> : null}
          <Button title="Unlock" icon="lock-open-outline" disabled={!password} onPress={() => file && read(file, password)} />
          <Button title="Enter balance manually" variant="ghost" onPress={() => fillForm(null)} />
        </Card>
      ) : null}

      {phase.k === 'review' ? (
        <>
          {phase.passbook?.ok ? (
            <Card style={{ gap: space(1) }}>
              <T weight="700">Check the figures, then save</T>
              <T muted size={13}>
                {phase.passbook.method === 'closing'
                  ? `Read the closing balance${phase.passbook.asOf ? ` as on ${toDisplayDate(phase.passbook.asOf)}` : ''}.`
                  : 'This year is still open, so GuardBox added this year’s contributions to the opening balance. Interest is added by EPFO at year end.'}
              </T>
              {phase.passbook.warnings.map((w) => <T key={w} muted size={12}>{w}</T>)}
            </Card>
          ) : (
            <Card style={{ gap: space(1) }}>
              <T weight="700">{phase.passbook ? 'Couldn’t read the balance from this PDF' : 'Enter your PF balance'}</T>
              <T muted size={13}>
                {phase.passbook
                  ? 'The passbook layout wasn’t recognised. Fill in the totals from the PDF’s closing balance row (or the latest balance in UMANG).'
                  : 'Use the latest closing balance from your passbook.'}
              </T>
            </Card>
          )}

          <SectionTitle>Account</SectionTitle>
          <Card style={{ paddingVertical: space(1) }}>
            <Row icon="wallet-outline" title="Save to" right={<T weight="600" numberOfLines={1}>{targetOptions.find((o) => o.value === target)?.label}</T>} chevron onPress={() => setPickTarget(true)} />
          </Card>
          <Card style={{ gap: space(3) }}>
            <Field label="Name" value={name} onChangeText={setName} />
            <Field label="UAN" value={uan} onChangeText={setUan} keyboardType="number-pad" maxLength={12} />
            <Field label="Member ID" value={memberId} onChangeText={setMemberId} autoCapitalize="characters" autoCorrect={false} />
            <Field label="Employer" value={establishment} onChangeText={setEstablishment} />
          </Card>

          <SectionTitle>Balance (₹)</SectionTitle>
          <Card style={{ gap: space(3) }}>
            <Field label="Employee share" value={employee} onChangeText={setEmployee} keyboardType="decimal-pad" placeholder="0" />
            <Field label="Employer share" value={employer} onChangeText={setEmployer} keyboardType="decimal-pad" placeholder="0" />
            <Field label="Pension (EPS)" value={pension} onChangeText={setPension} keyboardType="decimal-pad" placeholder="0" hint="EPS builds your pension and usually can’t be withdrawn as cash." />
            <Divider />
            <ToggleRow title="Count pension in net worth" value={includePension} onChange={setIncludePension} />
            <Field label="Balance as on" value={asOf} onChangeText={setAsOf} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" />
          </Card>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T muted>PF value</T>
            <T size={20} weight="800">{total == null ? '—' : formatMoney(total, 'INR', { hidden })}</T>
          </View>
          <Button title={target === NEW_ACCOUNT ? 'Add PF account' : 'Update balance'} icon="checkmark" onPress={save} disabled={!valid} />
          {pdfReaderAvailable ? <Button title="Choose a different PDF" variant="ghost" onPress={choose} /> : null}
        </>
      ) : null}

      <OptionSheet visible={pickTarget} title="Save to" options={targetOptions} value={target} onSelect={setTarget} onClose={() => setPickTarget(false)} />
    </Screen>
  );
}

/** After the first import, offer the monthly reminder once. */
async function offerReminder() {
  const { data, updateSettings } = useStore.getState();
  if (data.settings.epfReminderAsked || data.settings.epfReminder.enabled) return;
  updateSettings({ epfReminderAsked: true });
  Alert.alert('Remind you to update PF?', 'GuardBox can remind you every month to download your new passbook. You can change this in Settings.', [
    { text: 'Not now', style: 'cancel' },
    {
      text: 'Remind me monthly',
      onPress: async () => {
        if (!(await ensureNotificationPermission())) {
          Alert.alert('Notifications are off', 'Allow notifications for GuardBox in the iOS Settings app to get reminders.');
          return;
        }
        const reminder = { ...useStore.getState().data.settings.epfReminder, enabled: true, frequency: 'monthly' as const };
        updateSettings({ epfReminder: reminder });
        await scheduleEpfReminder(reminder);
      },
    },
  ]);
}
