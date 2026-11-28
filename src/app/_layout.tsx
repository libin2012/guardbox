import 'react-native-url-polyfill/auto';
import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, AppStateStatus, Platform, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LockScreen, PrivacyCover } from '../components/LockScreen';
import { useTheme } from '../components/theme';
import { usePendingImport } from '../lib/epf/pending';
import { isEpfReminderResponse, scheduleEpfReminder } from '../lib/epf/reminder';
import { refreshIfStale } from '../lib/refresh';
import { hasPasscode, useLock } from '../lib/security';
import { onDataChanged, useStore } from '../lib/store';
import { syncNow } from '../lib/sync';

export default function RootLayout() {
  const scheme = useColorScheme();
  const t = useTheme();
  const ready = useStore((s) => s.ready);
  const load = useStore((s) => s.load);
  const lockEnabled = useStore((s) => s.data.settings.lockEnabled);
  const { locked, lock, unlock } = useLock();
  const [covered, setCovered] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    load().then(async () => {
      const s = useStore.getState().data.settings;
      // never lock someone out if the passcode was removed from the keychain
      if (!s.lockEnabled || !(await hasPasscode())) unlock();
      refreshIfStale();
      // keep the PF reminder in step with settings (e.g. after a restore)
      scheduleEpfReminder(s.epfReminder).catch(() => undefined);
    });
  }, [load, unlock]);

  // a tap on the PF reminder opens the import screen (held until unlocked)
  useEffect(() => {
    const handle = (res: Notifications.NotificationResponse | null) => {
      if (!isEpfReminderResponse(res)) return;
      usePendingImport.getState().request();
      Notifications.clearLastNotificationResponse();
    };
    if (Platform.OS === 'web') return;
    try {
      handle(Notifications.getLastNotificationResponse());
    } catch {
      // not available in this runtime
    }
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);

  // open the import screen for a shared PDF or reminder once the app is ready and unlocked
  const navReady = !!useRootNavigationState()?.key;
  const pending = usePendingImport((s) => s.pending);
  const unlocked = ready && !(lockEnabled && locked);
  useEffect(() => {
    if (!unlocked || !navReady || !pending) return;
    // let the stack finish mounting (it is replaced by the lock screen while locked)
    const timer = setTimeout(() => {
      const p = usePendingImport.getState().take();
      if (!p) return;
      router.push(p.file ? { pathname: '/epf-import', params: { file: p.file } } : '/epf-import');
    }, 100);
    return () => clearTimeout(timer);
  }, [unlocked, navReady, pending]);

  // lock after the app has been in the background longer than the auto-lock delay
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      const s = useStore.getState().data.settings;
      if (state === 'active') {
        setCovered(false);
        const away = backgroundedAt.current ? (Date.now() - backgroundedAt.current) / 1000 : 0;
        backgroundedAt.current = null;
        if (s.lockEnabled && away >= s.autoLockSeconds) lock();
        refreshIfStale();
      } else {
        setCovered(s.lockEnabled);
        if (state === 'background' && backgroundedAt.current == null) backgroundedAt.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [lock]);

  // optional auto sync, debounced after edits
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onDataChanged(() => {
      const s = useStore.getState().data.settings;
      if (!s.autoSync || s.syncProvider === 'none') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => syncNow('auto').catch(() => undefined), 5000);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const navTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={{ ...navTheme, colors: { ...navTheme.colors, background: t.bg, card: t.card, primary: t.brand, text: t.text, border: t.border } }}>
        <StatusBar style="auto" />
        {!ready ? (
          <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={t.brand} />
          </View>
        ) : lockEnabled && locked ? (
          <LockScreen />
        ) : (
          <>
            <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerTintColor: t.brand, headerTitleStyle: { color: t.text } }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="holding/edit" options={{ presentation: 'modal', title: 'Holding' }} />
              <Stack.Screen name="holding/[id]" options={{ title: '' }} />
              <Stack.Screen name="categories" options={{ title: 'Categories' }} />
              <Stack.Screen name="sync" options={{ title: 'Backup & sync' }} />
              <Stack.Screen name="passcode" options={{ presentation: 'modal', title: 'Passcode' }} />
              <Stack.Screen name="epf-import" options={{ title: 'EPF passbook' }} />
            </Stack>
            {covered ? <PrivacyCover /> : null}
          </>
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
