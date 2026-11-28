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

/**
 * Google Drive backup and sync need an iOS OAuth client ID from your own Google
 * Cloud project (see SYNC_SETUP.md). Its reversed form is registered as a URL
 * scheme so Google's sign-in sheet can return to the app. Without it, the
 * Google Drive options explain how to set it up.
 */
const googleIosClientId = process.env.GOOGLE_IOS_CLIENT_ID?.trim() || undefined;
const googleScheme = googleIosClientId ? `com.googleusercontent.apps.${googleIosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}` : undefined;

const plugins: ExpoConfig['plugins'] = [
  'expo-router',
  'expo-secure-store',
  'expo-sharing',
  'expo-web-browser',
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
  scheme: googleScheme ? ['guardbox', googleScheme] : 'guardbox',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/iconlight.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: false,
    // Light/dark/tinted app icons (iOS 18+). Each is an opaque, full-bleed 1024² PNG.
    icon: {
      light: './assets/iconlight.png',
      dark: './assets/icondark.png',
      tinted: './assets/icontinted.png',
    },
    infoPlist: {
      NSFaceIDUsageDescription: 'GuardBox uses Face ID to keep your finances private.',
      ITSAppUsesNonExemptEncryption: false,
      // Own the .gbox backup type so tapping one offers to restore it in GuardBox.
      // The file is JSON, so the exported UTI conforms to public.json.
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'GuardBox Backup',
          CFBundleTypeRole: 'Editor',
          LSHandlerRank: 'Owner',
          LSItemContentTypes: ['com.guardbox.backup'],
        },
      ],
      UTExportedTypeDeclarations: [
        {
          UTTypeIdentifier: 'com.guardbox.backup',
          UTTypeDescription: 'GuardBox Backup',
          UTTypeConformsTo: ['public.json', 'public.data'],
          UTTypeTagSpecification: {
            'public.filename-extension': ['gbox'],
            'public.mime-type': ['application/json'],
          },
        },
      ],
    },
  },
  android: {
    package: bundleId,
    adaptiveIcon: {
      backgroundColor: '#0A1323',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // Open .gbox backups from the Files app, email attachments, etc.
    intentFilters: [
      {
        action: 'VIEW',
        category: ['DEFAULT', 'BROWSABLE'],
        data: [
          { scheme: 'content', mimeType: 'application/json' },
          { scheme: 'file', mimeType: 'application/json' },
          { scheme: 'content', pathPattern: '.*\\.gbox' },
          { scheme: 'file', pathPattern: '.*\\.gbox' },
        ],
      },
    ],
  },
  web: { favicon: './assets/favicon.png' },
  plugins,
  extra: { iCloudEnabled: enableICloud, iCloudContainer, googleIosClientId },
};

export default config;
