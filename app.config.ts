import type { ExpoConfig } from 'expo/config';

/**
 * iCloud needs a paid Apple Developer account (the iCloud capability is not
 * available to free "Personal Team" signing). Build with ENABLE_ICLOUD=1 to
 * turn on the iCloud Documents entitlement. Without it the app still works and
 * "Export backup" can save a file into iCloud Drive through the Files app.
 */
const enableICloud = process.env.ENABLE_ICLOUD === '1';
const bundleId = process.env.IOS_BUNDLE_ID ?? 'com.guardbox.app';
const iCloudContainer = process.env.ICLOUD_CONTAINER ?? `iCloud.${bundleId}`;

const plugins: ExpoConfig['plugins'] = [
  'expo-router',
  'expo-secure-store',
  'expo-sharing',
  'expo-font',
  [
    'expo-local-authentication',
    { faceIDPermission: 'GuardBox uses Face ID to keep your finances private.' },
  ],
];

if (enableICloud) {
  plugins.push([
    'react-native-cloud-store',
    {
      iCloud: {
        kv: { enabled: false },
        documents: [
          { containerId: iCloudContainer, enabled: true, visible: true, visibleName: 'GuardBox' },
        ],
      },
    },
  ]);
}

const config: ExpoConfig = {
  name: 'GuardBox',
  slug: 'guardbox',
  scheme: 'guardbox',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: false,
    infoPlist: {
      NSFaceIDUsageDescription: 'GuardBox uses Face ID to keep your finances private.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: bundleId,
    adaptiveIcon: {
      backgroundColor: '#0B1A2B',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  web: { favicon: './assets/favicon.png' },
  plugins,
  extra: { iCloudEnabled: enableICloud, iCloudContainer },
};

export default config;
