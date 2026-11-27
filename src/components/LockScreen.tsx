import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../lib/store';
import { authenticateBiometric, biometricLabel, passcodeLength, useLock, verifyPasscode } from '../lib/security';
import { PinDots, PinPad } from './PinPad';
import { useTheme } from './theme';
import { T } from './ui';

export function LockScreen() {
  const t = useTheme();
  const unlock = useLock((s) => s.unlock);
  const biometricsEnabled = useStore((s) => s.data.settings.biometricsEnabled);
  const [code, setCode] = useState('');
  const [len, setLen] = useState(6);
  const [error, setError] = useState(false);
  const [bioLabel, setBioLabel] = useState<string | null>(null);

  const tryBiometric = useCallback(async () => {
    if (!biometricsEnabled) return;
    if (await authenticateBiometric().catch(() => false)) unlock();
  }, [biometricsEnabled, unlock]);

  useEffect(() => {
    passcodeLength().then(setLen);
    biometricLabel().then(setBioLabel);
    tryBiometric();
  }, [tryBiometric]);

  const onDigit = async (d: string) => {
    if (code.length >= len) return;
    const next = code + d;
    setError(false);
    setCode(next);
    if (next.length === len) {
      if (await verifyPasscode(next)) unlock();
      else {
        setError(true);
        setTimeout(() => setCode(''), 400);
      }
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center', alignItems: 'center', gap: 36 }}>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="shield-checkmark" size={34} color={t.brand} />
        </View>
        <T size={22} weight="700">GuardBox is locked</T>
        <T muted>{error ? 'Wrong passcode, try again' : 'Enter your passcode'}</T>
      </View>
      <PinDots length={len} filled={code.length} error={error} />
      <PinPad
        onDigit={onDigit}
        onDelete={() => setCode((c) => c.slice(0, -1))}
        extra={biometricsEnabled && bioLabel ? { icon: bioLabel.includes('Face') ? 'scan-outline' : 'finger-print', onPress: tryBiometric, label: bioLabel } : undefined}
      />
    </SafeAreaView>
  );
}

/** Covers the app in the app switcher so balances are not visible in screenshots. */
export function PrivacyCover() {
  const t = useTheme();
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="shield-checkmark" size={56} color={t.brand} />
    </View>
  );
}
