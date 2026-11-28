/**
 * Stand-in for expo-router in screen tests. Use it with
 *   jest.mock('expo-router', () => jest.requireActual('../../test/expoRouterMock'));
 * then assert on `router.push` / `router.back`, and set route params with `setParams`.
 * Stack.Screen renders its headerRight inline so header buttons can be pressed.
 */
import React from 'react';

export const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };

let params: Record<string, string | undefined> = {};
export function setParams(p: Record<string, string | undefined>) {
  params = p;
}
export const useLocalSearchParams = () => params;

const navigation = { dispatch: jest.fn() };
export const useNavigation = () => navigation;
export const usePreventRemove = jest.fn();

function Screen({ options }: { options?: { headerRight?: () => React.ReactNode } }) {
  return <>{options?.headerRight?.()}</>;
}
export const Stack = Object.assign(() => null, { Screen });
