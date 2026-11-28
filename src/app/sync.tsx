import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { OptionSheet } from '../components/OptionSheet';
import { space, useTheme } from '../components/theme';
import { IconName, IconTile, ListInput, ListRow, ListSection, ListSwitch, T } from '../components/ui';
import { checkPassphrase, decryptBackup, encryptBackup, isEncryptedBackup } from '../lib/backupCrypto';
import { backupToDrive, listDriveBackups, openDriveBackup } from '../lib/driveBackup';
import { formatBytes, relativeTime } from '../lib/format';
import { connectGoogle, disconnectGoogle, DriveFile, getGoogleAccount, GoogleAccount, GoogleNotConnectedError } from '../lib/google';
import { parseBackup, toBackup, useStore } from '../lib/store';
import { getProvider, loadConfig, PASSPHRASE_FIELD, PROVIDERS, ProviderConfig, saveConfig, syncNow } from '../lib/sync';
import { BackupFile, SyncProviderId } from '../lib/types';

/** iOS system colours for the icon tiles. */
const GOOGLE_BLUE = '#4285F4';
const PROVIDER_ICONS: Record<SyncProviderId, { icon: IconName; color: string }> = {
  none: { icon: 'phone-portrait', color: '#8E8E93' },
  icloud: { icon: 'cloud', color: '#0A84FF' },
  gdrive: { icon: 'logo-google', color: GOOGLE_BLUE },
  firebase: { icon: 'flame', color: '#FF9500' },
  supabase: { icon: 'server', color: '#30B566' },
  aws: { icon: 'logo-amazon', color: '#FF9F0A' },
};

export default function SyncScreen() {
  const t = useTheme();
  const data = useStore((s) => s.data);
  const { updateSettings, restoreBackup } = useStore.getState();
  const s = data.settings;
  const [selected, setSelected] = useState<SyncProviderId>(s.syncProvider);
  const [cfg, setCfg] = useState<ProviderConfig>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [google, setGoogle] = useState<GoogleAccount | null>(null);
  const [driveBackups, setDriveBackups] = useState<DriveFile[] | null>(null);
  const provider = getProvider(selected);
  const active = getProvider(s.syncProvider);

  const refreshGoogle = useCallback(() => getGoogleAccount().then(setGoogle), []);
  useEffect(() => {
    refreshGoogle();
  }, [refreshGoogle]);

  useEffect(() => {
    loadConfig(selected).then(setCfg);
  }, [selected]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      if (e instanceof GoogleNotConnectedError) refreshGoogle();
      Alert.alert(`${label} failed`, (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // ---------- passphrases ----------

  /** Ask for a new passphrase twice, then call `then` with it. */
  const askNewPassphrase = (then: (passphrase: string) => void) =>
    Alert.prompt(
      'Choose a passphrase',
      'You will need it to restore this backup. GuardBox cannot recover a forgotten passphrase.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Next',
          onPress: (first?: string) => {
            const problem = checkPassphrase(first ?? '');
            if (problem) return Alert.alert('Passphrase too short', problem);
            Alert.prompt('Type it again', undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Continue', onPress: (second?: string) => (second === first ? then(first!) : Alert.alert('Passphrases do not match', 'Nothing was saved. Try again.')) },
            ], 'secure-text');
          },
        },
      ],
      'secure-text',
    );

  const askPassphrase = (then: (passphrase: string) => void) =>
    Alert.prompt('Enter the passphrase', 'This backup is encrypted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open', onPress: (passphrase?: string) => then(passphrase ?? '') },
    ], 'secure-text');

  const confirmRestore = (backup: BackupFile) =>
    Alert.alert('Restore this backup?', `${backup.data.holdings.length} items from ${new Date(backup.exportedAt).toLocaleString()}. This replaces the data on this device.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', style: 'destructive', onPress: () => restoreBackup(backup) },
    ]);

  // ---------- backup file ----------

  const writeExport = (passphrase: string | null) =>
    run('Export', async () => {
      const backup = toBackup(data);
      const text = passphrase ? await encryptBackup(backup, passphrase) : JSON.stringify(backup, null, 2);
      const name = `GuardBox-backup-${new Date().toISOString().slice(0, 10)}${passphrase ? '-encrypted' : ''}.json`;
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = name;
        a.click();
        return;
      }
      const file = new File(Paths.cache, name);
      if (file.exists) file.delete();
      file.create();
      await file.write(text);
      try {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save GuardBox backup' });
      } finally {
        // do not leave a copy in the app's cache once it has been shared
        if (file.exists) file.delete();
      }
    });

  const exportFile = () => {
    // the web preview has no secure prompt; it exports plain JSON
    if (Platform.OS === 'web') return writeExport(null);
    Alert.alert('Protect this backup?', 'An encrypted backup can only be opened with your passphrase. A plain backup can be read by anyone who gets the file.', [
      { text: 'Encrypt with passphrase', onPress: () => askNewPassphrase(writeExport) },
      { text: 'Export without encryption', onPress: () => writeExport(null) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const importFile = () =>
    run('Import', async () => {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const text = Platform.OS === 'web' ? await (await fetch(r.assets[0].uri)).text() : await new File(r.assets[0].uri).text();
      if (!isEncryptedBackup(text)) return confirmRestore(parseBackup(text));
      askPassphrase((passphrase) => run('Import', async () => confirmRestore(await decryptBackup(text, passphrase))));
    });

  // ---------- Google Drive ----------

  const connect = () =>
    run('Connect', async () => {
      const account = await connectGoogle();
      if (account) setGoogle(account);
    });

  const disconnect = () =>
    Alert.alert('Disconnect Google Drive?', `GuardBox will stop using ${google?.email ?? 'this Google account'} on this iPhone.${s.syncProvider === 'gdrive' ? ' Google Drive sync turns off.' : ''} Backups already in your Drive are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () =>
          run('Disconnect', async () => {
            await disconnectGoogle();
            if (s.syncProvider === 'gdrive') updateSettings({ syncProvider: 'none', autoSync: false });
            setGoogle(null);
          }),
      },
    ]);

  const backUpToDrive = () =>
    askNewPassphrase((passphrase) =>
      run('Back up', async () => {
        await backupToDrive(useStore.getState().data, passphrase);
        updateSettings({ lastDriveBackupAt: new Date().toISOString() });
        Alert.alert('Backed up to Google Drive', 'An encrypted backup was saved to the GuardBox folder in your Drive.');
      }),
    );

  const browseDrive = () =>
    run('Restore', async () => {
      const files = await listDriveBackups();
      if (!files.length) return Alert.alert('No backups yet', 'There are no GuardBox backups in your Google Drive. Tap Back Up Now to make one.');
      setDriveBackups(files);
    });

  const restoreFromDrive = (id: string) =>
    askPassphrase((passphrase) => run('Restore', async () => confirmRestore(await openDriveBackup(id, passphrase))));

  // ---------- sync ----------

  const doSync = async (mode: 'auto' | 'push' | 'pull') => {
    const r = await syncNow(mode);
    if (r.kind === 'conflict') {
      const message = r.unencrypted
        ? 'The cloud copy is not encrypted (it was uploaded by an older version of GuardBox, or by someone else) and changed since the last sync. Only use it if you know where it came from. Keeping this phone replaces it with an encrypted copy.'
        : 'Your phone and the cloud both have changes since the last sync. Which one do you want to keep?';
      Alert.alert(r.unencrypted ? 'Unencrypted cloud copy' : 'Both copies changed', message, [
        { text: 'Keep this phone', onPress: () => run('Upload', () => syncNow('push').then(() => undefined)) },
        { text: 'Use cloud copy', style: 'destructive', onPress: () => run('Download', async () => { restoreBackup(r.remote); updateSettings({ lastSyncAt: new Date().toISOString() }); }) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      Alert.alert('Sync complete', r.kind === 'pushed' ? 'Uploaded your data.' : r.kind === 'pulled' ? 'Downloaded the cloud copy.' : 'Everything is up to date.');
    }
  };

  const activate = () =>
    run('Save', async () => {
      if (!provider) {
        updateSettings({ syncProvider: 'none', autoSync: false });
        return;
      }
      if (provider.id === 'gdrive' && !google) throw new Error('Connect your Google account first.');
      const problem = checkPassphrase(cfg[PASSPHRASE_FIELD.key] ?? '');
      if (problem) throw new Error(`Encryption passphrase: ${problem}`);
      await saveConfig(provider.id, cfg);
      updateSettings({ syncProvider: provider.id, lastSyncAt: undefined, lastSyncError: undefined });
      await doSync('auto');
    });

  const confirmDownload = () =>
    Alert.alert('Replace this device’s data?', 'The cloud copy will overwrite what is on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Download', style: 'destructive', onPress: () => run('Download', () => doSync('pull')) },
    ]);

  // ---------- view ----------

  const syncStatus = !active ? 'Off' : s.lastSyncError ? 'Needs attention' : s.lastSyncAt ? `Synced ${relativeTime(s.lastSyncAt).toLowerCase()}` : 'Not synced yet';
  const syncSummary = active ? `${active.label} · ${syncStatus}` : 'Cloud sync is off';
  const driveFooter = `Backups are encrypted on this iPhone with a passphrase you choose, then saved to a GuardBox folder in your Drive. GuardBox can only see files it created.${s.lastDriveBackupAt ? ` Last backup: ${relativeTime(s.lastDriveBackupAt)}.` : ''}`;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: space(4), paddingBottom: space(24), gap: space(7) }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', gap: space(2), paddingTop: space(2) }}>
        <IconTile name="shield-checkmark" color={t.brand} size={52} />
        <T size={20} weight="700" style={{ marginTop: space(1) }}>Your data is encrypted</T>
        <T muted size={14} style={{ textAlign: 'center', lineHeight: 20, paddingHorizontal: space(4) }}>
          Stored on this iPhone with AES-256, using a key kept in the iOS Keychain. Backups and sync are end-to-end encrypted with your passphrase.
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5), backgroundColor: s.lastSyncError ? t.negative + '1F' : active ? t.brandSoft : t.cardAlt, borderRadius: 999, paddingHorizontal: space(3), paddingVertical: space(1.5), marginTop: space(1) }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.lastSyncError ? t.negative : active ? t.brand : t.textMuted }} />
          <T size={13} weight="600" style={{ color: s.lastSyncError ? t.negative : active ? t.brand : t.textMuted }}>{syncSummary}</T>
        </View>
      </View>

      <ListSection header="Google Drive" footer={driveFooter}>
        {google ? (
          <ListRow icon="logo-google" iconColor={GOOGLE_BLUE} title={google.email ?? 'Google account'} subtitle={google.name ? `${google.name} · Connected` : 'Connected'} />
        ) : (
          <ListRow icon="logo-google" iconColor={GOOGLE_BLUE} title="Connect Google Drive" subtitle="Back up to your own Google Drive" tint accessory="chevron" loading={busy === 'Connect'} onPress={connect} />
        )}
        {google ? <ListRow icon="cloud-upload" iconColor={GOOGLE_BLUE} title="Back Up Now" tint loading={busy === 'Back up'} onPress={backUpToDrive} /> : null}
        {google ? <ListRow icon="time" iconColor="#5E5CE6" title="Restore from Google Drive" accessory="chevron" loading={busy === 'Restore'} onPress={browseDrive} /> : null}
        {google ? <ListRow icon="log-out" iconColor={t.negative} title="Disconnect" destructive loading={busy === 'Disconnect'} onPress={disconnect} /> : null}
      </ListSection>

      <ListSection header="Backup file" footer="Save a backup to the Files app, iCloud Drive, AirDrop or any app. Protect it with a passphrase so only you can open it.">
        <ListRow icon="share" iconColor="#0A84FF" title="Export Backup…" accessory="chevron" loading={busy === 'Export'} onPress={exportFile} />
        <ListRow icon="folder-open" iconColor="#FF9F0A" title="Restore from File…" accessory="chevron" loading={busy === 'Import'} onPress={importFile} />
      </ListSection>

      <ListSection header="Cloud sync" footer="Sync keeps your devices up to date. Data is encrypted on this iPhone before upload, so the provider only stores scrambled data.">
        <ListRow icon={PROVIDER_ICONS.none.icon} iconColor={PROVIDER_ICONS.none.color} title="Off" subtitle="Keep data on this iPhone only" accessory={selected === 'none' ? 'check' : 'none'} onPress={() => setSelected('none')} />
        {PROVIDERS.map((p) => (
          <ListRow key={p.id} icon={PROVIDER_ICONS[p.id].icon} iconColor={PROVIDER_ICONS[p.id].color} title={p.label} subtitle={p.description} accessory={selected === p.id ? 'check' : 'none'} onPress={() => setSelected(p.id)} />
        ))}
      </ListSection>

      {provider ? (
        <ListSection
          header={`${provider.label} settings`}
          inset={false}
          footer={`Use the same passphrase on every device. It cannot be recovered if you forget it.${provider.fields.length ? ' See SYNC_SETUP.md for the 5-minute console setup.' : ''}`}
        >
          {provider.id === 'gdrive' ? <ListRow title="Google account" detail={google?.email ?? 'Not connected'} /> : null}
          {[...provider.fields, PASSPHRASE_FIELD].map((f) => (
            <ListInput key={f.key} label={f.label} value={cfg[f.key] ?? ''} placeholder={f.placeholder ?? 'Required'} secureTextEntry={f.secure} autoCapitalize="none" autoCorrect={false} onChangeText={(v) => setCfg((c) => ({ ...c, [f.key]: v }))} />
          ))}
        </ListSection>
      ) : null}

      <ListSection inset={false}>
        {provider?.signUp ? (
          <ListRow title="Create Account" tint loading={busy === 'Sign up'} onPress={() => run('Sign up', async () => { await provider.signUp!(cfg); Alert.alert('Account created', 'Check your email if your project requires confirmation, then tap Save & Sync Now.'); })} />
        ) : null}
        {provider?.id === 'gdrive' && !google ? <ListRow title="Connect Google Drive" tint loading={busy === 'Connect'} onPress={connect} /> : null}
        <ListRow
          title={selected === 'none' ? 'Turn Off Sync' : 'Save & Sync Now'}
          tint={selected !== 'none'}
          destructive={selected === 'none' && s.syncProvider !== 'none'}
          loading={busy === 'Save'}
          disabled={selected === 'none' && s.syncProvider === 'none'}
          onPress={activate}
        />
      </ListSection>

      {active && s.syncProvider === selected ? (
        <ListSection
          header="Sync"
          footer={
            s.lastSyncError ? (
              <T size={13} style={{ color: t.negative, lineHeight: 18 }}>Last error: {s.lastSyncError}</T>
            ) : (
              s.lastSyncAt ? `Last synced ${new Date(s.lastSyncAt).toLocaleString()}.` : 'Not synced yet.'
            )
          }
        >
          <ListSwitch icon="sync" iconColor={t.brand} title="Sync Automatically" subtitle="A few seconds after each change" value={s.autoSync} onChange={(v) => updateSettings({ autoSync: v })} />
          <ListRow icon="cloud-upload" iconColor="#0A84FF" title="Upload This iPhone’s Data" loading={busy === 'Upload'} onPress={() => run('Upload', () => doSync('push'))} />
          <ListRow icon="cloud-download" iconColor={t.negative} title="Replace with Cloud Copy" destructive loading={busy === 'Download'} onPress={confirmDownload} />
        </ListSection>
      ) : null}

      <OptionSheet
        visible={!!driveBackups}
        title="Google Drive backups"
        options={(driveBackups ?? []).map((f) => ({
          value: f.id,
          label: f.createdTime ? new Date(f.createdTime).toLocaleString() : f.name,
          subtitle: [f.name, formatBytes(f.size)].filter(Boolean).join(' · '),
          icon: 'document-lock-outline' as IconName,
          color: GOOGLE_BLUE,
        }))}
        onSelect={restoreFromDrive}
        onClose={() => setDriveBackups(null)}
      />
    </ScrollView>
  );
}
