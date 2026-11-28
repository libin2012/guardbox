import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import React from "react";
import { ColorValue, Pressable } from "react-native";
import { Avatar } from '../../components/ProfileForm';
import { useTheme } from '../../components/theme';
import { useStore } from '../../lib/store';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const tab = (icon: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={icon} size={size} color={color as string} />;
  };

export default function TabsLayout() {
  const t = useTheme();
  const name = useStore((s) => s.data.profile?.fullName);
  const profileButton = () => (
    <Pressable onPress={() => router.push('/profile')} hitSlop={8} style={({ pressed }) => ({ marginRight: 16, opacity: pressed ? 0.6 : 1 })} accessibilityRole="button" accessibilityLabel="Profile">
      <Avatar name={name} size={32} />
    </Pressable>
  );
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        headerStyle: { backgroundColor: t.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: t.text, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Overview', tabBarIcon: tab('pie-chart-outline'), headerRight: profileButton }} />
      <Tabs.Screen name="holdings" options={{ title: 'Wealth', tabBarIcon: tab('wallet-outline') }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: tab('stats-chart-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tab('settings-outline') }} />
    </Tabs>
  );
}
