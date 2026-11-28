import { router, Stack, useNavigation, usePreventRemove } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Pressable, ScrollView, TextInputInstance, View } from 'react-native';
import { animateLayout, Avatar, FormField, haptic, useEntrance, useShake } from '../components/ProfileForm';
import { space, useTheme } from '../components/theme';
import { Button, Card, T } from '../components/ui';
import { cleanEmail, cleanName, ProfileErrors, toProfile, validateProfile } from '../lib/profile';
import { useStore } from '../lib/store';

export default function ProfileScreen() {
  const t = useTheme();
  const profile = useStore((s) => s.data.profile);
  const setProfile = useStore((s) => s.setProfile);
  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [mobile, setMobile] = useState(profile?.mobile ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof ProfileErrors, boolean>>>({});
  const navigation = useNavigation();
  const [saved, setSaved] = useState(false);
  const emailRef = useRef<TextInputInstance>(null);
  const mobileRef = useRef<TextInputInstance>(null);
  const shakes = { fullName: useShake(), email: useShake(), mobile: useShake() };
  const enter = useEntrance(3, 60);

  const dirty =
    cleanName(fullName) !== (profile?.fullName ?? '') ||
    cleanEmail(email) !== (profile?.email ?? '') ||
    mobile.trim().replace(/\s+/g, ' ') !== (profile?.mobile ?? '');

  // a field shows its error once you leave it, or when you press Save
  const all = validateProfile({ fullName, email, mobile });
  const show = (k: keyof ProfileErrors) => (submitted || touched[k] ? all[k] : undefined);
  const errors: ProfileErrors = { fullName: show('fullName'), email: show('email'), mobile: show('mobile') };
  const blur = (k: keyof ProfileErrors) => () => setTouched((x) => ({ ...x, [k]: true }));
  const shownKey = `${errors.fullName ?? ''}|${errors.email ?? ''}|${errors.mobile ?? ''}`;
  const lastShown = useRef(shownKey);
  if (lastShown.current !== shownKey) {
    lastShown.current = shownKey;
    animateLayout();
  }

  const save = () => {
    setSubmitted(true);
    const next = toProfile({ fullName, email, mobile });
    if (!next) {
      haptic('error');
      (Object.keys(all) as (keyof typeof shakes)[]).forEach((k) => shakes[k].shake());
      return;
    }
    setProfile(next);
    haptic('success');
    setSaved(true);
  };

  // leave once the save has re-rendered with dirty=false, so the guard below lets us go
  useEffect(() => {
    if (saved && !dirty) router.back();
  }, [saved, dirty]);

  usePreventRemove(dirty && !saved, ({ data }) => {
    Alert.alert('Discard changes?', 'Your profile edits have not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={save} disabled={!dirty} hitSlop={10} accessibilityRole="button" accessibilityLabel="Save profile">
              <T weight="700" style={{ color: dirty ? t.brand : t.textMuted }}>Save</T>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: t.bg }}
        contentContainerStyle={{ padding: space(4), paddingBottom: space(16), gap: space(4) }}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Animated.View style={[{ alignItems: 'center', gap: space(2), paddingVertical: space(2) }, enter[0]]}>
          <Avatar name={fullName || profile?.fullName} size={88} />
          <T size={20} weight="700" numberOfLines={1}>{cleanName(fullName) || 'Your name'}</T>
          <T muted numberOfLines={1}>{cleanEmail(email) || 'you@example.com'}</T>
        </Animated.View>

        <Animated.View style={enter[1]}>
          <Card style={{ gap: space(4) }}>
            <FormField
              label="Full name"
              icon="person-outline"
              value={fullName}
              onChangeText={setFullName}
              onBlur={blur('fullName')}
              error={errors.fullName}
              shakeStyle={shakes.fullName.style}
              placeholder="Your full name"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
            <FormField
              ref={emailRef}
              label="Email address"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              onBlur={blur('email')}
              error={errors.email}
              shakeStyle={shakes.email.style}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => mobileRef.current?.focus()}
            />
            <FormField
              ref={mobileRef}
              label="Mobile number"
              optional
              icon="call-outline"
              value={mobile}
              onChangeText={setMobile}
              onBlur={blur('mobile')}
              error={errors.mobile}
              shakeStyle={shakes.mobile.style}
              placeholder="+91 98765 43210"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="done"
              onSubmitEditing={save}
            />
          </Card>
        </Animated.View>

        <Animated.View style={[{ gap: space(3) }, enter[2]]}>
          <Button title="Save changes" icon="checkmark" onPress={save} disabled={!dirty} />
          <View style={{ paddingHorizontal: space(2) }}>
            <T size={12} muted style={{ textAlign: 'center' }}>
              Name and email are required. Your profile is stored on this device and included in your backups. There is no account and nothing is verified.
            </T>
          </View>
        </Animated.View>
      </ScrollView>
    </>
  );
}
