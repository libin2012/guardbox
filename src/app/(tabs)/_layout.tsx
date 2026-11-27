import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/tabs';
import React from "react";
import { ColorValue } from "react-native";
import { useTheme } from '../../components/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const tab = (icon: IconName) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={icon} size={size} color={color as string} />;

export default function TabsLayout() {
  const t = useTheme();
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
      <Tabs.Screen name="index" options={{ title: 'Overview', tabBarIcon: tab('pie-chart-outline') }} />
      <Tabs.Screen name="holdings" options={{ title: 'Wealth', tabBarIcon: tab('wallet-outline') }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: tab('stats-chart-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tab('settings-outline') }} />
    </Tabs>
  );
}
