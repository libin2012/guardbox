import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { PinDots, PinPad } from '../components/PinPad';
import { space, useTheme } from '../components/theme';
import { Segmented, T } from '../components/ui';
import { passcodeLength, setPasscode, useLock, verifyPasscode } from '../lib/security';
import { useStore } from '../lib/store';

type Step = 'current' | 'new' | 'confirm';

export default function PasscodeScreen() {
  const t = useTheme();
  const { mode } = useLocalSearchParams<{ mode?: 'enable' | 'change' }>();
  const [step, setStep] = useState<Step>(mode === 'change' ? 'current' : 'new');
  const [len, setLen] = useState<'4' | '6'>('6');
  const [code, setCode] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentLen, setCurrentLen] = useState(6);
  useEffect(() => {
    passcodeLength().then(setCurrentLen);
  }, []);

  const target = step === 'current' ? currentLen : Number(len);

  const fail = (msg: string) => {
    setError(msg);
    setTimeout(() => setCode(''), 350);
  };

  const onDigit = async (d: string) => {
    if (code.length >= target) return;
    const next = code + d;
    setCode(next);
    setError(null);
    if (next.length < target) return;
    if (step === 'current') {
      if (await verifyPasscode(next)) {
        setStep('new');
        setCode('');
      } else fail('Wrong passcode');
    } else if (step === 'new') {
      setFirst(next);
      setStep('confirm');
      setCode('');
    } else {
      if (next !== first) {
        setStep('new');
        setFirst('');
        return fail("Passcodes didn't match. Try again.");
      }
      await setPasscode(next);
      useStore.getState().updateSettings({ lockEnabled: true });
      useLock.getState().unlock();
      router.back();
    }
  };

  const title = step === 'current' ? 'Enter current passcode' : step === 'new' ? 'Choose a passcode' : 'Confirm passcode';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', gap: space(8), padding: space(4) }}>
      <View style={{ alignItems: 'center', gap: space(2) }}>
        <T size={20} weight="700">{title}</T>
        <T muted style={{ color: error ? t.negative : t.textMuted }}>{error ?? 'Keep it private. It never leaves this device.'}</T>
      </View>
      {step === 'new' ? (
        <View style={{ width: 220 }}>
          <Segmented options={[{ value: '4', label: '4 digits' }, { value: '6', label: '6 digits' }]} value={len} onChange={(v) => { setLen(v); setCode(''); }} />
        </View>
      ) : null}
      <PinDots length={target} filled={code.length} error={!!error} />
      <PinPad onDigit={onDigit} onDelete={() => setCode((c) => c.slice(0, -1))} />
    </View>
  );
}
