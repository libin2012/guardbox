import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { space, useTheme } from '../components/theme';
import { Button, Card, Screen, T } from '../components/ui';
import { usePendingImport } from '../lib/pendingImport';
import { needsPassphrase, openEncryptedBackup, openPlainBackup, readBackupText } from '../lib/restore';
import { useStore } from '../lib/store';
import type { BackupFile } from '../lib/types';

type Loaded =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; name: string; text: string; encrypted: boolean; backup?: BackupFile };

/** Shows the display name for a file uri (the last path segment, URL-decoded). */
function fileName(uri: string): string {
  try {
    const last = uri.split('/').pop() ?? uri;
    return decodeURIComponent(last.split('?')[0]) || 'backup.gbox';
  } catch {
    return 'backup.gbox';
  }
}

export default function RestoreBackupScreen() {
  const t = useTheme();
  const restoreBackup = useStore((s) => s.restoreBackup);
  const [state, setState] = useState<Loaded>({ phase: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const uri = usePendingImport.getState().take();
    if (!uri) {
      router.replace('/(tabs)');
      return;
    }
    let active = true;
    readBackupText(uri)
      .then((text) => {
        if (!active) return;
        const name = fileName(uri);
        if (needsPassphrase(text)) {
          setState({ phase: 'ready', name, text, encrypted: true });
        } else {
          setState({ phase: 'ready', name, text, encrypted: false, backup: openPlainBackup(text) });
        }
      })
      .catch(() => active && setState({ phase: 'error', message: 'This file could not be opened as a GuardBox backup.' }));
    return () => {
      active = false;
    };
  }, []);

  const finish = (backup: BackupFile) => {
    restoreBackup(backup);
    Alert.alert('Backup restored', `${backup.data.holdings.length} items are now on this iPhone.`);
    router.replace('/(tabs)');
  };

  const cancel = () => router.replace('/(tabs)');

  const restore = () => {
    if (state.phase !== 'ready') return;
    if (!state.encrypted && state.backup) return finish(state.backup);
    // encrypted: ask for the passphrase, then decrypt and restore
    Alert.prompt(
      'Enter the passphrase',
      'This backup is encrypted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async (passphrase?: string) => {
            setBusy(true);
            try {
              const backup = await openEncryptedBackup(state.text, passphrase ?? '');
              finish(backup);
            } catch {
              Alert.alert('Could not open the backup', 'Wrong passphrase, or the file was changed after it was exported.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
      'secure-text',
    );
  };

  return (
    <Screen>
      {state.phase === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space(10) }}>
          <ActivityIndicator color={t.brand} />
        </View>
      ) : state.phase === 'error' ? (
        <Card style={{ gap: space(3) }}>
          <T weight="700" size={18}>Can’t open this file</T>
          <T muted>{state.message}</T>
          <Button title="Close" variant="secondary" onPress={cancel} />
        </Card>
      ) : (
        <Card style={{ gap: space(3) }}>
          <T weight="700" size={18}>Restore this backup?</T>
          <T muted numberOfLines={1}>{state.name}</T>
          {state.encrypted ? (
            <T muted>This backup is encrypted. You’ll enter its passphrase to restore it.</T>
          ) : state.backup ? (
            <T muted>{state.backup.data.holdings.length} items from {new Date(state.backup.exportedAt).toLocaleString()}.</T>
          ) : null}
          <T style={{ color: t.negative }} weight="600">This replaces all data currently on this iPhone.</T>
          <Button title="Restore" variant="primary" icon="download-outline" loading={busy} onPress={restore} />
          <Button title="Cancel" variant="ghost" onPress={cancel} />
        </Card>
      )}
    </Screen>
  );
}
