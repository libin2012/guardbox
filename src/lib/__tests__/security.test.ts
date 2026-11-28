import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { authenticateBiometric, biometricLabel, clearPasscode, getSecret, hasPasscode, passcodeLength, setPasscode, setSecret, useLock, verifyPasscode } from '../security';

const LA = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

beforeEach(async () => {
  await clearPasscode();
});

describe('passcode', () => {
  it('starts with no passcode and a default length of 6', async () => {
    expect(await hasPasscode()).toBe(false);
    expect(await passcodeLength()).toBe(6);
    expect(await verifyPasscode('123456')).toBe(false);
  });

  it('verifies the right code and rejects others', async () => {
    await setPasscode('4321');
    expect(await hasPasscode()).toBe(true);
    expect(await passcodeLength()).toBe(4);
    expect(await verifyPasscode('4321')).toBe(true);
    expect(await verifyPasscode('1234')).toBe(false);
    expect(await verifyPasscode('43210')).toBe(false);
  });

  it('never stores the code itself, and salts each one', async () => {
    await setPasscode('111111');
    const first = (SecureStore as any).__items.get('guardbox.passcode.v1') as string;
    expect(first).not.toContain('111111');
    await setPasscode('111111');
    const second = (SecureStore as any).__items.get('guardbox.passcode.v1') as string;
    expect(JSON.parse(second).salt).not.toBe(JSON.parse(first).salt);
    expect(await verifyPasscode('111111')).toBe(true);
  });

  it('stores it in the keychain for this device only', async () => {
    await setPasscode('000000');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('guardbox.passcode.v1', expect.any(String), { keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' });
  });

  it('can be removed', async () => {
    await setPasscode('000000');
    await clearPasscode();
    expect(await hasPasscode()).toBe(false);
  });
});

describe('Face ID and Touch ID', () => {
  it('names Face ID on iPhones with face recognition', async () => {
    LA.supportedAuthenticationTypesAsync.mockResolvedValueOnce([LA.AuthenticationType.FACIAL_RECOGNITION]);
    expect(await biometricLabel()).toBe('Face ID');
  });

  it('names Touch ID on fingerprint devices', async () => {
    LA.supportedAuthenticationTypesAsync.mockResolvedValueOnce([LA.AuthenticationType.FINGERPRINT]);
    expect(await biometricLabel()).toBe('Touch ID');
  });

  it('falls back to a generic name', async () => {
    LA.supportedAuthenticationTypesAsync.mockResolvedValueOnce([LA.AuthenticationType.IRIS]);
    expect(await biometricLabel()).toBe('Biometrics');
  });

  it('is unavailable without hardware or enrolment', async () => {
    LA.hasHardwareAsync.mockResolvedValueOnce(false);
    expect(await biometricLabel()).toBeNull();
    LA.isEnrolledAsync.mockResolvedValueOnce(false);
    expect(await biometricLabel()).toBeNull();
  });

  it('asks the system without falling back to the device passcode', async () => {
    LA.authenticateAsync.mockResolvedValueOnce({ success: true });
    expect(await authenticateBiometric()).toBe(true);
    expect(LA.authenticateAsync).toHaveBeenCalledWith(expect.objectContaining({ disableDeviceFallback: true, cancelLabel: 'Use passcode' }));
    LA.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
    expect(await authenticateBiometric()).toBe(false);
  });
});

describe('secrets and lock state', () => {
  it('stores and clears sync secrets', async () => {
    await setSecret('sync.aws', '{"a":1}');
    expect(await getSecret('sync.aws')).toBe('{"a":1}');
    await setSecret('sync.aws', '');
    expect(await getSecret('sync.aws')).toBeNull();
  });

  it('locks and unlocks', () => {
    useLock.getState().unlock();
    expect(useLock.getState().locked).toBe(false);
    useLock.getState().lock();
    expect(useLock.getState().locked).toBe(true);
  });
});
