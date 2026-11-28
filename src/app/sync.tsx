import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { space, useTheme } from '../components/theme';
import { Button, Card, Divider, Field, Row, Screen, SectionTitle, T, ToggleRow } from '../components/ui';
import { checkPassphrase, decryptBackup, encryptBackup, isEncryptedBackup } from '../lib/backupCrypto';
import { parseBackup, toBackup, useStore } from '../lib/store';
import { getProvider, loadConfig, PASSPHRASE_FIELD, PROVIDERS, ProviderConfig, saveConfig, syncNow } from '../lib/sync';
import { BackupFile, SyncProviderId } from '../lib/types';

const ICONS: Record<string, any> = { icloud: 'cloud-outline', firebase: 'flame-outline', supabase: 'server-outline', aws: 'logo-amazon' };

export default function SyncScreen() {
  const t = useTheme();
  const data = useStore((s) => s.data);
  const { updateSettings, restoreBackup } = useStore.getState();
  const s = data.settings;
  const [selected, setSelected] = useState<SyncProviderId>(s.syncProvider);
  const [cfg, setCfg] = useState<ProviderConfig>({});
  const [busy, setBusy] = useState<string | null>(null);
  const provider = getProvider(selected);

  useEffect(() => {
    loadConfig(selected).then(setCfg);
  }, [selected]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      Alert.alert(`${label} failed`, (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const activate = () =>
    run('Save', async () => {
      if (!provider) {
        updateSettings({ syncProvider: 'none', autoSync: false });
        return;
      }
      const problem = checkPassphrase(cfg[PASSPHRASE_FIELD.key] ?? '');
      if (problem) throw new Error(`Encryption passphrase: ${problem}`);
      await saveConfig(provider.id, cfg);
      updateSettings({ syncProvider: provider.id, lastSyncAt: undefined, lastSyncError: undefined });
      await doSync('auto');
    });

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

  const askNewPassphrase = () =>
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
              { text: 'Export', onPress: (second?: string) => (second === first ? writeExport(first!) : Alert.alert('Passphrases do not match', 'Nothing was exported. Try again.')) },
            ], 'secure-text');
          },
        },
      ],
      'secure-text',
    );

  const exportFile = () => {
    // the web preview has no secure prompt; it exports plain JSON
    if (Platform.OS === 'web') return writeExport(null);
    Alert.alert('Protect this backup?', 'An encrypted backup can only be opened with your passphrase. A plain backup can be read by anyone who gets the file.', [
      { text: 'Encrypt with passphrase', onPress: askNewPassphrase },
      { text: 'Export without encryption', onPress: () => writeExport(null) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmRestore = (backup: BackupFile) =>
    Alert.alert('Restore this backup?', `${backup.data.holdings.length} items from ${new Date(backup.exportedAt).toLocaleString()}. This replaces the data on this device.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', style: 'destructive', onPress: () => restoreBackup(backup) },
    ]);

  const importFile = () =>
    run('Import', async () => {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const text = Platform.OS === 'web' ? await (await fetch(r.assets[0].uri)).text() : await new File(r.assets[0].uri).text();
      if (!isEncryptedBackup(text)) return confirmRestore(parseBackup(text));
      Alert.prompt('Enter the passphrase', 'This backup is encrypted.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open', onPress: (passphrase?: string) => run('Import', async () => confirmRestore(await decryptBackup(text, passphrase ?? ''))) },
      ], 'secure-text');
    });

  return (
    <Screen>
      <Card style={{ gap: space(2) }}>
        <T weight="700">Your data lives on this device</T>
        <T muted size={13}>Everything is stored locally and encrypted with AES-256 using a key kept in the iOS Keychain. Turn on a cloud provider below to back up and sync between devices. Provider passwords and keys are kept in the iOS Keychain, never in backups.</T>
      </Card>

      <SectionTitle>Backup file</SectionTitle>
      <Card style={{ gap: space(3) }}>
        <T muted size={13}>Export a backup file and save it to iCloud Drive, Google Drive or anywhere in the Files app. Protect it with a passphrase so only you can open it. Works on every build, no setup.</T>
        <View style={{ flexDirection: 'row', gap: space(3) }}>
          <Button title="Export" icon="share-outline" onPress={exportFile} loading={busy === 'Export'} style={{ flex: 1 }} />
          <Button title="Import" icon="download-outline" variant="secondary" onPress={importFile} loading={busy === 'Import'} style={{ flex: 1 }} />
        </View>
      </Card>

      <SectionTitle>Cloud sync</SectionTitle>
      <Card style={{ paddingVertical: space(1) }}>
        <Row icon="phone-portrait-outline" title="Off" subtitle="Keep data on this device only" right={selected === 'none' ? <T style={{ color: t.brand }} weight="700">✓</T> : null} onPress={() => setSelected('none')} />
        {PROVIDERS.map((p) => (
          <View key={p.id}>
            <Divider />
            <Row icon={ICONS[p.id]} title={p.label} subtitle={p.description} right={selected === p.id ? <T style={{ color: t.brand }} weight="700">✓</T> : null} onPress={() => setSelected(p.id)} />
          </View>
        ))}
      </Card>

      {provider ? (
        <Card style={{ gap: space(3) }}>
          <T weight="700">{provider.label} settings</T>
          {[...provider.fields, PASSPHRASE_FIELD].map((f) => (
            <Field key={f.key} label={f.label} value={cfg[f.key] ?? ''} placeholder={f.placeholder} secureTextEntry={f.secure} autoCapitalize="none" autoCorrect={false} onChangeText={(v) => setCfg((c) => ({ ...c, [f.key]: v }))} />
          ))}
          <T size={12} muted>Your data is encrypted on this phone with the passphrase before upload, so {provider.label} only stores scrambled data. Use the same passphrase on every device. It cannot be recovered if you forget it.</T>
          {provider.fields.length ? <T size={12} muted>See SYNC_SETUP.md in the project for the 5-minute console setup.</T> : null}
          {provider.signUp ? <Button title="Create account" variant="secondary" loading={busy === 'Sign up'} onPress={() => run('Sign up', async () => { await provider.signUp!(cfg); Alert.alert('Account created', 'Check your email if your project requires confirmation, then tap Save & sync.'); })} /> : null}
        </Card>
      ) : null}

      <Button title={selected === 'none' ? 'Turn off sync' : 'Save & sync now'} icon="checkmark" onPress={activate} loading={busy === 'Save'} disabled={selected === s.syncProvider && selected === 'none'} />

      {s.syncProvider !== 'none' && s.syncProvider === selected ? (
        <Card style={{ gap: space(3) }}>
          <ToggleRow icon="sync-outline" title="Sync automatically" subtitle="Upload a few seconds after each change" value={s.autoSync} onChange={(v) => updateSettings({ autoSync: v })} />
          <View style={{ flexDirection: 'row', gap: space(3) }}>
            <Button title="Upload" icon="cloud-upload-outline" variant="secondary" loading={busy === 'Upload'} onPress={() => run('Upload', () => doSync('push'))} style={{ flex: 1 }} />
            <Button title="Download" icon="cloud-download-outline" variant="secondary" loading={busy === 'Download'} onPress={() => Alert.alert('Replace this device’s data?', 'The cloud copy will overwrite what is on this phone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Download', style: 'destructive', onPress: () => run('Download', () => doSync('pull')) }])} style={{ flex: 1 }} />
          </View>
          <T size={12} muted>
            {s.lastSyncError ? `Last error: ${s.lastSyncError}` : s.lastSyncAt ? `Last synced ${new Date(s.lastSyncAt).toLocaleString()}` : 'Not synced yet'}
          </T>
        </Card>
      ) : null}
    </Screen>
  );
}
