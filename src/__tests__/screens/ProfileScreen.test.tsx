import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import ProfileScreen from '../../app/profile';
import { useStore } from '../../lib/store';
import { makeProfile } from '../../test/factories';
import { resetAppState, seedStore } from '../../test/helpers';

jest.mock('expo-router', () => jest.requireActual('../../test/expoRouterMock'));

const { router, usePreventRemove, useNavigation } = jest.requireMock<{
  router: { back: jest.Mock };
  usePreventRemove: jest.Mock;
  useNavigation: () => { dispatch: jest.Mock };
}>('expo-router');

const field = (label: string) => screen.getByLabelText(label);
const saveButton = () => screen.getByText('Save changes');
/** usePreventRemove's latest arguments: [shouldPrevent, callback]. */
const preventRemove = () => usePreventRemove.mock.calls.at(-1) as [boolean, (e: { data: { action: unknown } }) => void];

beforeEach(async () => {
  await resetAppState();
  seedStore({ profile: makeProfile({ mobile: '+91 98765 43210' }) });
});

describe('Profile screen', () => {
  it('shows the saved profile', async () => {
    await render(<ProfileScreen />);
    expect(field('Full name')).toHaveDisplayValue('Asha Rao');
    expect(field('Email address')).toHaveDisplayValue('asha@example.com');
    expect(field('Mobile number')).toHaveDisplayValue('+91 98765 43210');
    expect(screen.getByText('(optional)')).toBeOnTheScreen();
    expect(screen.getByText('AR')).toBeOnTheScreen();
  });

  it('cannot save until something changes', async () => {
    await render(<ProfileScreen />);
    expect(screen.getByLabelText('Save profile')).toBeDisabled();
    await fireEvent.changeText(field('Full name'), 'Asha R');
    expect(screen.getByLabelText('Save profile')).toBeEnabled();
  });

  it('ignores whitespace-only edits', async () => {
    await render(<ProfileScreen />);
    await fireEvent.changeText(field('Full name'), '  Asha   Rao ');
    expect(screen.getByLabelText('Save profile')).toBeDisabled();
  });

  it('saves edits and goes back', async () => {
    await render(<ProfileScreen />);
    await fireEvent.changeText(field('Full name'), 'Asha Menon');
    await fireEvent.changeText(field('Email address'), 'ASHA.MENON@example.com ');
    await fireEvent.press(saveButton());
    expect(useStore.getState().data.profile).toMatchObject({ fullName: 'Asha Menon', email: 'asha.menon@example.com', mobile: '+91 98765 43210' });
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  });

  it('saves from the header button too', async () => {
    await render(<ProfileScreen />);
    await fireEvent.changeText(field('Full name'), 'Asha Menon');
    await fireEvent.press(screen.getByLabelText('Save profile'));
    expect(useStore.getState().data.profile?.fullName).toBe('Asha Menon');
  });

  it('lets you leave the mobile number empty', async () => {
    await render(<ProfileScreen />);
    await fireEvent.changeText(field('Mobile number'), '');
    await fireEvent.press(saveButton());
    expect(useStore.getState().data.profile).not.toHaveProperty('mobile');
    expect(useStore.getState().data.profile?.email).toBe('asha@example.com');
  });

  it('adds a mobile number when there was none', async () => {
    seedStore({ profile: makeProfile() });
    await render(<ProfileScreen />);
    expect(field('Mobile number')).toHaveDisplayValue('');
    await fireEvent.changeText(field('Mobile number'), '(555) 123-4567');
    await fireEvent.press(saveButton());
    expect(useStore.getState().data.profile?.mobile).toBe('(555) 123-4567');
  });

  it('rejects an invalid mobile number', async () => {
    await render(<ProfileScreen />);
    await fireEvent.changeText(field('Mobile number'), '12345');
    await fireEvent.press(saveButton());
    expect(screen.getByText('Enter a valid mobile number')).toBeOnTheScreen();
    expect(useStore.getState().data.profile?.mobile).toBe('+91 98765 43210');
    expect(router.back).not.toHaveBeenCalled();
  });

  it.each([
    ['Full name', '', 'Enter your full name'],
    ['Email address', '', 'Enter your email address'],
    ['Email address', 'asha@example', 'Enter a valid email address'],
  ])('keeps %s required (%p)', async (label, value, message) => {
    await render(<ProfileScreen />);
    await fireEvent.changeText(field(label), value);
    await fireEvent.press(saveButton());
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(useStore.getState().data.profile).toEqual(makeProfile({ mobile: '+91 98765 43210' }));
  });

  it('shows an error when you leave a field', async () => {
    await render(<ProfileScreen />);
    await fireEvent.changeText(field('Email address'), 'nope');
    expect(screen.queryByText('Enter a valid email address')).not.toBeOnTheScreen();
    await fireEvent(field('Email address'), 'blur');
    expect(screen.getByText('Enter a valid email address')).toBeOnTheScreen();
  });

  it('asks before throwing away unsaved edits', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<ProfileScreen />);
    expect(preventRemove()[0]).toBe(false);
    await fireEvent.changeText(field('Full name'), 'Someone Else');
    expect(preventRemove()[0]).toBe(true);

    const action = { type: 'GO_BACK' };
    await act(async () => preventRemove()[1]({ data: { action } }));
    expect(alert).toHaveBeenCalledWith('Discard changes?', expect.any(String), expect.any(Array));
    const discard = (alert.mock.calls[0][2] as { text: string; onPress?: () => void }[]).find((b) => b.text === 'Discard')!;
    await act(async () => discard.onPress!());
    expect(useNavigation().dispatch).toHaveBeenCalledWith(action);
    alert.mockRestore();
  });

  it('does not ask after saving', async () => {
    await render(<ProfileScreen />);
    await fireEvent.changeText(field('Full name'), 'Asha Menon');
    await fireEvent.press(saveButton());
    expect(preventRemove()[0]).toBe(false);
  });
});
