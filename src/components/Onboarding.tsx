import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInputInstance, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProfileErrors, toProfile, validateProfile } from '../lib/profile';
import { useStore } from '../lib/store';
import { animateLayout, FormField, haptic, useEntrance, useShake } from './ProfileForm';
import { space, useTheme } from './theme';
import { Button, T } from './ui';

/**
 * First-launch profile screen. It sits on top of the app (which is already
 * mounted underneath), cannot be dismissed, and on success saves the profile
 * and dissolves away to reveal the dashboard.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const setProfile = useStore((s) => s.setProfile);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState<{ fullName?: boolean; email?: boolean }>({});
  const [submitted, setSubmitted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const nameRef = useRef<TextInputInstance>(null);
  const emailRef = useRef<TextInputInstance>(null);
  const nameShake = useShake();
  const emailShake = useShake();
  const enter = useEntrance(4);
  const exit = useRef(new Animated.Value(1)).current;

  // raise the keyboard once the entrance has settled, so the two animations don't fight
  useEffect(() => {
    const timer = setTimeout(() => nameRef.current?.focus(), 550);
    return () => clearTimeout(timer);
  }, []);

  // Android back must not skip onboarding
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const all = validateProfile({ fullName, email });
  const errors: ProfileErrors = {
    fullName: submitted || touched.fullName ? all.fullName : undefined,
    email: submitted || touched.email ? all.email : undefined,
  };
  const shownKey = `${errors.fullName ?? ''}|${errors.email ?? ''}`;
  const lastShown = useRef(shownKey);
  if (lastShown.current !== shownKey) {
    lastShown.current = shownKey;
    animateLayout();
  }

  const submit = async () => {
    if (leaving) return;
    setSubmitted(true);
    const profile = toProfile({ fullName, email });
    if (!profile) {
      haptic('error');
      if (all.fullName) nameShake.shake();
      if (all.email) emailShake.shake();
      if (all.email && !all.fullName) emailRef.current?.focus();
      return;
    }
    setLeaving(true);
    Keyboard.dismiss();
    setProfile(profile);
    haptic('success');
    const reduce = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
    Animated.timing(exit, { toValue: 0, duration: reduce ? 180 : 420, easing: Easing.bezier(0.33, 0, 0.2, 1), useNativeDriver: true }).start(() => onDone());
  };

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: t.bg,
          opacity: exit,
          transform: [{ scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }],
        },
      ]}
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityViewIsModal
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, padding: space(6), paddingTop: space(14), gap: space(6) }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={[{ gap: space(4) }, enter[0]]}>
              <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield-checkmark" size={34} color={t.brand} />
              </View>
            </Animated.View>
            <Animated.View style={[{ gap: space(2) }, enter[1]]}>
              <T size={30} weight="800">Welcome to GuardBox</T>
              <T muted size={16}>Let's set up your profile. It stays on this iPhone and is only used inside the app.</T>
            </Animated.View>
            <Animated.View style={[{ gap: space(4) }, enter[2]]}>
              <FormField
                ref={nameRef}
                label="Full name"
                icon="person-outline"
                value={fullName}
                onChangeText={setFullName}
                onBlur={() => setTouched((x) => ({ ...x, fullName: true }))}
                error={errors.fullName}
                shakeStyle={nameShake.style}
                placeholder="Your full name"
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => emailRef.current?.focus()}
                editable={!leaving}
              />
              <FormField
                ref={emailRef}
                label="Email address"
                icon="mail-outline"
                value={email}
                onChangeText={setEmail}
                onBlur={() => setTouched((x) => ({ ...x, email: true }))}
                error={errors.email}
                shakeStyle={emailShake.style}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="done"
                onSubmitEditing={submit}
                editable={!leaving}
              />
            </Animated.View>
            <View style={{ flex: 1 }} />
            <Animated.View style={[{ gap: space(3) }, enter[3]]}>
              <Button title="Continue" onPress={submit} disabled={leaving} style={{ paddingVertical: space(4) }} />
              <T size={12} muted style={{ textAlign: 'center' }}>You can add a mobile number and change these later in Settings → Profile.</T>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Animated.View>
  );
}
