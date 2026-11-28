import * as LocalAuthentication from 'expo-local-authentication';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { LockScreen, PrivacyCover } from '../LockScreen';
import { clearPasscode, setPasscode, useLock } from '../../lib/security';
import { emptyData } from '../../lib/defaults';
import { resetAppState, seedStore } from '../../test/helpers';

const LA = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

/** Let the screen's startup effects (passcode length, Face ID check) finish. */
async function settle() {
  await act(async () => undefined);
}

async function typeCode(code: string) {
  for (const d of code) {
    // digits are plain text keys on the pad
    await fireEvent.press(screen.getByText(d));
  }
}

function seedLock(biometricsEnabled: boolean) {
  seedStore({ settings: { ...emptyData().settings, lockEnabled: true, biometricsEnabled } });
}

beforeEach(async () => {
  await resetAppState();
  await clearPasscode();
  await setPasscode('1234');
});

describe('LockScreen', () => {
  it('asks for the passcode with one dot per digit', async () => {
    seedLock(false);
    await render(<LockScreen />);
    expect(screen.getByText('GuardBox is locked')).toBeOnTheScreen();
    expect(screen.getByText('Enter your passcode')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByText('0')).toBeOnTheScreen());
  });

  it('unlocks with the right passcode', async () => {
    seedLock(false);
    await render(<LockScreen />);
    await settle();
    await typeCode('1234');
    await waitFor(() => expect(useLock.getState().locked).toBe(false));
  });

  it('stays locked and says so on a wrong passcode', async () => {
    seedLock(false);
    await render(<LockScreen />);
    await settle();
    await typeCode('9999');
    expect(await screen.findByText('Wrong passcode, try again')).toBeOnTheScreen();
    expect(useLock.getState().locked).toBe(true);
  });

  it('lets you delete a digit before it checks', async () => {
    seedLock(false);
    await render(<LockScreen />);
    await settle();
    await typeCode('129');
    await fireEvent.press(screen.getByLabelText('Delete'));
    await typeCode('34');
    await waitFor(() => expect(useLock.getState().locked).toBe(false));
  });

  it('does not offer Face ID when it is turned off', async () => {
    seedLock(false);
    await render(<LockScreen />);
    await settle();
    expect(screen.queryByLabelText('Face ID')).toBeNull();
    expect(LA.authenticateAsync).not.toHaveBeenCalled();
  });

  it('tries Face ID straight away when it is turned on', async () => {
    seedLock(true);
    LA.authenticateAsync.mockResolvedValueOnce({ success: true });
    await render(<LockScreen />);
    await waitFor(() => expect(useLock.getState().locked).toBe(false));
    expect(LA.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('falls back to the passcode when Face ID is cancelled, and offers a retry button', async () => {
    seedLock(true);
    LA.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
    await render(<LockScreen />);
    const retry = await screen.findByLabelText('Face ID');
    expect(useLock.getState().locked).toBe(true);
    LA.authenticateAsync.mockResolvedValueOnce({ success: true });
    await fireEvent.press(retry);
    await waitFor(() => expect(useLock.getState().locked).toBe(false));
  });

  it('stays locked if Face ID throws', async () => {
    seedLock(true);
    LA.authenticateAsync.mockRejectedValueOnce(new Error('not available'));
    await render(<LockScreen />);
    await settle();
    expect(useLock.getState().locked).toBe(true);
  });

  it('labels the button Touch ID on fingerprint devices', async () => {
    seedLock(true);
    LA.supportedAuthenticationTypesAsync.mockResolvedValueOnce([LA.AuthenticationType.FINGERPRINT]);
    await render(<LockScreen />);
    expect(await screen.findByLabelText('Touch ID')).toBeOnTheScreen();
  });
});

describe('PrivacyCover', () => {
  it('renders without showing any amounts', async () => {
    await render(<PrivacyCover />);
    expect(screen.queryByText(/\d/)).toBeNull();
  });
});
