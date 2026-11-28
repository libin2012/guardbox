import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import RestoreBackupScreen from '../../app/restore-backup';
import { encryptBackup } from '../../lib/backupCrypto';
import { usePendingImport } from '../../lib/pendingImport';
import { toBackup, useStore } from '../../lib/store';
import { makeData, makeHolding, makeProfile } from '../../test/factories';
import { resetAppState, seedStore } from '../../test/helpers';

jest.mock('expo-router', () => jest.requireActual('../../test/expoRouterMock'));
jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  class File {
    uri: string;
    constructor(dir: string, name?: string) {
      this.uri = name ? `${dir}/${name}` : dir;
    }
    async text() {
      return files.get(this.uri) ?? '';
    }
  }
  return { File, Paths: { cache: 'file:///cache' }, __files: files };
});

const { router } = jest.requireMock<typeof import('../../test/expoRouterMock')>('expo-router');
const { __files: files } = jest.requireMock<{ __files: Map<string, string> }>('expo-file-system');
const state = () => useStore.getState().data;
type AlertButton = { text: string; onPress?: (value?: string) => void };
let alert: jest.SpyInstance;
let prompt: jest.SpyInstance;

const backupText = () => JSON.stringify(toBackup(makeData({ holdings: [makeHolding({ name: 'Imported Flat', value: 9 })] })));

beforeEach(async () => {
  await resetAppState();
  usePendingImport.getState().clear();
  files.clear();
  router.replace.mockClear();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  prompt = jest.spyOn(Alert, 'prompt').mockImplementation(() => undefined);
});
afterEach(() => {
  alert.mockRestore();
  prompt.mockRestore();
});

describe('Restore backup screen', () => {
  it('restores a plain .gbox file after confirming', async () => {
    seedStore({ profile: makeProfile(), holdings: [makeHolding({ name: 'Old item' })] });
    files.set('file:///cache/incoming.gbox', backupText());
    usePendingImport.getState().request('file:///cache/incoming.gbox');

    await render(<RestoreBackupScreen />);
    expect(await screen.findByText('Restore this backup?')).toBeOnTheScreen();
    expect(screen.getByText('incoming.gbox')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Restore'));
    expect(state().holdings.map((h) => h.name)).toEqual(['Imported Flat']);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('decrypts an encrypted .gbox file with the passphrase', async () => {
    seedStore({ profile: makeProfile() });
    const backup = toBackup(makeData({ holdings: [makeHolding({ name: 'Secret Flat', value: 3 })] }));
    files.set('file:///cache/enc.gbox', await encryptBackup(backup, 'a strong passphrase', { N: 2 ** 10, r: 8, p: 1 }));
    usePendingImport.getState().request('file:///cache/enc.gbox');

    await render(<RestoreBackupScreen />);
    await screen.findByText('Restore this backup?');
    expect(screen.getByText(/encrypted/i)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Restore'));
    // the passphrase prompt fired; run its onPress with the correct passphrase
    const buttons = prompt.mock.calls.at(-1)![2] as AlertButton[];
    await act(async () => {
      await buttons.find((b) => b.text === 'Restore')!.onPress!('a strong passphrase');
    });
    expect(state().holdings.map((h) => h.name)).toEqual(['Secret Flat']);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('leaves immediately when there is no pending file', async () => {
    await render(<RestoreBackupScreen />);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });
});
