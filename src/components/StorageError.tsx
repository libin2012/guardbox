import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VaultErrorCode } from '../lib/vault';
import { space, useTheme } from './theme';
import { Button, T } from './ui';

const COPY: Record<VaultErrorCode, { title: string; body: string }> = {
  tampered: {
    title: 'Your data failed a security check',
    body: 'The data saved on this iPhone was changed outside GuardBox, or was damaged. To keep you safe, GuardBox has not opened it or changed it.',
  },
  'key-missing': {
    title: 'The key for your data is missing',
    body: 'Your data is encrypted with a key kept in this iPhone’s Keychain, and that key is not here. This can happen after moving to a new phone from a device backup, because the key never leaves the phone it was made on.',
  },
  corrupt: {
    title: 'Your saved data can’t be read',
    body: 'The data saved on this iPhone is damaged. GuardBox has not changed it.',
  },
  unavailable: {
    title: 'GuardBox can’t reach the Keychain',
    body: 'The iOS Keychain did not answer, so your encrypted data could not be opened. Make sure the phone is unlocked, then try again.',
  },
};

/** Shown instead of the app when saved data exists but cannot be opened safely. */
export function StorageError({ code, onRetry, onErase }: { code: VaultErrorCode; onRetry: () => Promise<void>; onErase: () => Promise<void> }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const { title, body } = COPY[code];

  const retry = async () => {
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };

  const erase = () =>
    Alert.alert('Erase and start again?', 'This deletes the unreadable data on this iPhone. You can then restore a backup file or download from cloud sync in Settings > Backup & sync. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive', onPress: () => void onErase() },
    ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center', padding: space(6), gap: space(5) }}>
      <View style={{ alignItems: 'center', gap: space(3) }}>
        <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: 'rgba(229,72,77,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="warning-outline" size={34} color={t.negative} />
        </View>
        <T size={22} weight="700" style={{ textAlign: 'center' }}>{title}</T>
        <T muted style={{ textAlign: 'center' }}>{body}</T>
        <T muted size={13} style={{ textAlign: 'center' }}>If you have a backup file or use cloud sync, you can erase and restore from it.</T>
      </View>
      <View style={{ gap: space(3) }}>
        <Button title="Try again" icon="refresh" onPress={retry} loading={busy} />
        <Button title="Erase and start again" variant="danger" icon="trash-outline" onPress={erase} />
      </View>
    </SafeAreaView>
  );
}
