import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Onboarding } from '../Onboarding';
import { useStore } from '../../lib/store';
import { resetAppState, seedStore } from '../../test/helpers';

const nameField = () => screen.getByLabelText('Full name');
const emailField = () => screen.getByLabelText('Email address');
const pressContinue = () => fireEvent.press(screen.getByText('Continue'));

beforeEach(async () => {
  await resetAppState();
  seedStore();
});

describe('Onboarding', () => {
  it('asks for name and email only', async () => {
    await render(<Onboarding onDone={jest.fn()} />);
    expect(screen.getByText('Welcome to GuardBox')).toBeOnTheScreen();
    expect(nameField()).toBeOnTheScreen();
    expect(emailField()).toBeOnTheScreen();
    expect(screen.queryByLabelText('Mobile number')).not.toBeOnTheScreen();
  });

  it('shows no errors before you interact', async () => {
    await render(<Onboarding onDone={jest.fn()} />);
    expect(screen.queryByText('Enter your full name')).not.toBeOnTheScreen();
    expect(screen.queryByText('Enter your email address')).not.toBeOnTheScreen();
  });

  it('will not continue with empty fields and says why', async () => {
    const onDone = jest.fn();
    await render(<Onboarding onDone={onDone} />);
    await pressContinue();
    expect(screen.getByText('Enter your full name')).toBeOnTheScreen();
    expect(screen.getByText('Enter your email address')).toBeOnTheScreen();
    expect(useStore.getState().data.profile).toBeUndefined();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('requires a valid email even when the name is fine', async () => {
    await render(<Onboarding onDone={jest.fn()} />);
    await fireEvent.changeText(nameField(), 'Asha Rao');
    await fireEvent.changeText(emailField(), 'asha@');
    await pressContinue();
    expect(screen.queryByText('Enter your full name')).not.toBeOnTheScreen();
    expect(screen.getByText('Enter a valid email address')).toBeOnTheScreen();
    expect(useStore.getState().data.profile).toBeUndefined();
  });

  it('shows a field error once you leave the field', async () => {
    await render(<Onboarding onDone={jest.fn()} />);
    await fireEvent(nameField(), 'blur');
    expect(screen.getByText('Enter your full name')).toBeOnTheScreen();
    expect(screen.queryByText('Enter your email address')).not.toBeOnTheScreen();
  });

  it('saves a cleaned-up profile and then finishes', async () => {
    const onDone = jest.fn();
    await render(<Onboarding onDone={onDone} />);
    await fireEvent.changeText(nameField(), '  Asha   Rao ');
    await fireEvent.changeText(emailField(), ' Asha@Example.COM ');
    await pressContinue();
    expect(useStore.getState().data.profile).toMatchObject({ fullName: 'Asha Rao', email: 'asha@example.com' });
    expect(useStore.getState().data.profile).not.toHaveProperty('mobile');
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  it('saves only once if Continue is pressed twice', async () => {
    const setProfile = jest.spyOn(useStore.getState(), 'setProfile');
    await render(<Onboarding onDone={jest.fn()} />);
    await fireEvent.changeText(nameField(), 'Asha Rao');
    await fireEvent.changeText(emailField(), 'asha@example.com');
    await pressContinue();
    await pressContinue();
    expect(setProfile).toHaveBeenCalledTimes(1);
    setProfile.mockRestore();
  });
});
