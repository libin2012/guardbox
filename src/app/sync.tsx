import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { space, useTheme } from '../components/theme';
import { Button, Card, Divider, Field, Row, Screen, SectionTitle, T, ToggleRow } from '../components/ui';
import { parseBackup, toBackup, useStore } from '../lib/store';
import { getProvider, loadConfig, PROVIDERS, ProviderConfig, saveConfig, syncNow } from '../lib/sync';
import { SyncProviderId } from '../lib/types';

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
      await saveConfig(provider.id, cfg);
      updateSettings({ syncProvider: provider.id, lastSyncAt: undefined, lastSyncError: undefined });
      await doSync('auto');
    });

  const doSync = async (mode: 'auto' | 'push' | 'pull') => {
    const r = await syncNow(mode);
    if (r.kind === 'conflict') {
      Alert.alert('Both copies changed', 'Your phone and the cloud both have changes since the last sync. Which one do you want to keep?', [
        { text: 'Keep this phone', onPress: () => run('Upload', () => syncNow('push').then(() => undefined)) },
        { text: 'Use cloud copy', style: 'destructive', onPress: () => run('Download', async () => { restoreBackup(r.remote); updateSettings({ lastSyncAt: new Date().toISOString() }); }) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      Alert.alert('Sync complete', r.kind === 'pushed' ? 'Uploaded your data.' : r.kind === 'pulled' ? 'Downloaded the cloud copy.' : 'Everything is up to date.');
    }
  };

  const exportFile = () =>
    run('Export', async () => {
      const json = JSON.stringify(toBackup(data), null, 2);
      const name = `GuardBox-backup-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        a.download = name;
        a.click();
        return;
      }
      const file = new File(Paths.cache, name);
      if (file.exists) file.delete();
      file.create();
      await file.write(json);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save GuardBox backup' });
    });

  const importFile = () =>
    run('Import', async () => {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const text = Platform.OS === 'web' ? await (await fetch(r.assets[0].uri)).text() : await new File(r.assets[0].uri).text();
      const backup = parseBackup(text);
      Alert.alert('Restore this backup?', `${backup.data.holdings.length} items from ${new Date(backup.exportedAt).toLocaleString()}. This replaces the data on this device.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: () => restoreBackup(backup) },
      ]);
    });

  return (
    <Screen>
      <Card style={{ gap: space(2) }}>
        <T weight="700">Your data lives on this device</T>
        <T muted size={13}>Everything is stored locally. Turn on a cloud provider below to back up and sync between devices. Provider passwords and keys are kept in the iOS Keychain, never in backups.</T>
      </Card>

      <SectionTitle>Backup file</SectionTitle>
      <Card style={{ gap: space(3) }}>
        <T muted size={13}>Export a backup file and save it to iCloud Drive, Google Drive or anywhere in the Files app. Works on every build, no setup.</T>
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

      {provider && provider.fields.length ? (
        <Card style={{ gap: space(3) }}>
          <T weight="700">{provider.label} settings</T>
          {provider.fields.map((f) => (
            <Field key={f.key} label={f.label} value={cfg[f.key] ?? ''} placeholder={f.placeholder} secureTextEntry={f.secure} autoCapitalize="none" autoCorrect={false} onChangeText={(v) => setCfg((c) => ({ ...c, [f.key]: v }))} />
          ))}
          <T size={12} muted>See SYNC_SETUP.md in the project for the 5-minute console setup.</T>
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
