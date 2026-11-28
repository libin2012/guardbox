import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { parseSyncPayload } from '../backupCrypto';
import { SyncProvider } from './types';

const FILE = 'guardbox-backup.json';

type CloudStore = typeof import('react-native-cloud-store');

function cloud(): CloudStore {
  if (Platform.OS !== 'ios') throw new Error('iCloud is only available on iPhone and iPad.');
  if (!Constants.expoConfig?.extra?.iCloudEnabled) {
    throw new Error('This build has iCloud turned off. Rebuild with ENABLE_ICLOUD=1 (needs a paid Apple Developer account), or use Export backup to save a file to iCloud Drive.');
  }
  // required lazily so Android and Expo Go builds never touch the native module
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-cloud-store') as CloudStore;
}

async function filePath(c: CloudStore): Promise<string> {
  if (!(await c.isICloudAvailable())) throw new Error('iCloud is not available. Sign in to iCloud and allow GuardBox under Settings > Apple Account > iCloud.');
  const container = await c.getDefaultICloudContainerPath();
  if (!container) throw new Error('No iCloud container found for this build.');
  const dir = `${container}/Documents`;
  if (!(await c.exist(dir))) await c.createDir(dir);
  return `${dir}/${FILE}`;
}

export const icloudProvider: SyncProvider = {
  id: 'icloud',
  label: 'iCloud',
  description: 'Saves your backup in your private iCloud Drive. No account setup needed.',
  fields: [],
  async push(_cfg, payload) {
    const c = cloud();
    await c.writeFile(await filePath(c), JSON.stringify(payload), { override: true });
  },
  async pull() {
    const c = cloud();
    const path = await filePath(c);
    if (!(await c.exist(path))) return null;
    try {
      await c.download(path);
    } catch {
      // already local
    }
    return parseSyncPayload(await c.readFile(path));
  },
};
