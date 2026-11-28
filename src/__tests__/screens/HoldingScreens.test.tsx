import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import Overview from '../../app/(tabs)/index';
import Holdings from '../../app/(tabs)/holdings';
import Insights from '../../app/(tabs)/insights';
import HoldingDetail from '../../app/holding/[id]';
import EditHolding from '../../app/holding/edit';
import { emptyData } from '../../lib/defaults';
import { dayKey } from '../../lib/dates';
import { useStore } from '../../lib/store';
import { FX, makeHolding } from '../../test/factories';
import { json, mockFetch, resetAppState, seedStore } from '../../test/helpers';

jest.mock('expo-router', () => jest.requireActual('../../test/expoRouterMock'));
const { router, setParams } = jest.requireMock<typeof import('../../test/expoRouterMock')>('expo-router');

const state = () => useStore.getState().data;
let alert: jest.SpyInstance;

beforeEach(async () => {
  await resetAppState();
  setParams({});
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => alert.mockRestore());

function seedPortfolio() {
  seedStore({
    fx: FX,
    holdings: [
      makeHolding({ id: 'flat', name: 'Flat', categoryId: 'cat-property', value: 200000 }),
      makeHolding({ id: 'acct', name: 'Savings', categoryId: 'cat-bank', value: 9000, currency: 'EUR', notes: 'Rainy day' }),
      makeHolding({ id: 'btc', name: 'Bitcoin', categoryId: 'cat-crypto', mode: 'quantity', quantity: 0.5, unitPrice: 60000, symbol: 'bitcoin', value: 30000 }),
      makeHolding({ id: 'mort', name: 'Home loan', kind: 'liability', categoryId: 'cat-mortgage', value: 150000 }),
    ],
  });
}

describe('Overview (dashboard)', () => {
  it('invites you to add a first item when empty', async () => {
    seedStore();
    await render(<Overview />);
    expect(screen.getByText('Start tracking your wealth')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Add your first item'));
    expect(router.push).toHaveBeenCalledWith('/holding/edit?kind=asset');
  });

  it('shows net worth, assets and liabilities in the base currency', async () => {
    seedPortfolio();
    await render(<Overview />);
    expect(screen.getByText('$90,000')).toBeOnTheScreen();
    expect(screen.getByText('$240,000')).toBeOnTheScreen();
    expect(screen.getByText('$150,000')).toBeOnTheScreen();
    expect(screen.getByText('Asset allocation')).toBeOnTheScreen();
  });

  it('lists the largest items and opens one', async () => {
    seedPortfolio();
    await render(<Overview />);
    await fireEvent.press(screen.getByText('Flat'));
    expect(router.push).toHaveBeenCalledWith('/holding/flat');
  });

  it('hides amounts with the eye button', async () => {
    seedPortfolio();
    await render(<Overview />);
    await fireEvent.press(screen.getByLabelText('Hide amounts'));
    expect(state().settings.hideAmounts).toBe(true);
    expect(screen.queryByText('$90,000')).not.toBeOnTheScreen();
    expect(screen.getAllByText('••••••').length).toBeGreaterThan(0);
  });

  it('follows the main currency setting', async () => {
    seedPortfolio();
    useStore.getState().updateSettings({ baseCurrency: 'EUR' });
    // (set before render, so no act() needed)
    await render(<Overview />);
    expect(screen.getByText('€81,000')).toBeOnTheScreen();
  });
});

describe('Holdings list', () => {
  it('groups assets by category with totals', async () => {
    seedPortfolio();
    await render(<Holdings />);
    expect(screen.getByText('Total assets')).toBeOnTheScreen();
    expect(screen.getByText('Property')).toBeOnTheScreen();
    expect(screen.getByText('Bank accounts')).toBeOnTheScreen();
    expect(screen.getByText('0.5 BITCOIN @ $60,000')).toBeOnTheScreen();
    expect(screen.getByText('€9,000')).toBeOnTheScreen();
    expect(screen.queryByText('Home loan')).not.toBeOnTheScreen();
  });

  it('switches to liabilities and adds the right kind', async () => {
    seedPortfolio();
    await render(<Holdings />);
    await fireEvent.press(screen.getByText('Liabilities'));
    expect(screen.getByText('Home loan')).toBeOnTheScreen();
    expect(screen.getByText('Total liabilities')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Add liability'));
    expect(router.push).toHaveBeenCalledWith('/holding/edit?kind=liability');
  });

  it('shows an empty state', async () => {
    seedStore();
    await render(<Holdings />);
    expect(screen.getByText('No assets yet')).toBeOnTheScreen();
  });
});

describe('Insights', () => {
  it('renders with and without data', async () => {
    seedStore();
    const { unmount } = await render(<Insights />);
    await unmount();
    seedPortfolio();
    await render(<Insights />);
    expect(screen.getAllByText(/Property/).length).toBeGreaterThan(0);
  });
});

describe('Holding detail', () => {
  it('shows the value, history and details', async () => {
    seedPortfolio();
    setParams({ id: 'acct' });
    await render(<HoldingDetail />);
    expect(screen.getByText('€9,000')).toBeOnTheScreen();
    expect(screen.getByText('$10,000')).toBeOnTheScreen();
    expect(screen.getByText('Rainy day')).toBeOnTheScreen();
  });

  it('shows quantity, unit price and coin for live-priced items', async () => {
    seedPortfolio();
    setParams({ id: 'btc' });
    await render(<HoldingDetail />);
    expect(screen.getByText('Quantity')).toBeOnTheScreen();
    expect(screen.getByText('BITCOIN')).toBeOnTheScreen();
    expect(screen.getByText('Updated automatically')).toBeOnTheScreen();
  });

  it('deletes after confirming', async () => {
    seedPortfolio();
    setParams({ id: 'flat' });
    await render(<HoldingDetail />);
    await fireEvent.press(screen.getByText('Delete'));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Delete')!.onPress!());
    expect(state().holdings.find((h) => h.id === 'flat')).toBeUndefined();
    expect(router.back).toHaveBeenCalled();
  });

  it('opens the editor', async () => {
    seedPortfolio();
    setParams({ id: 'flat' });
    await render(<HoldingDetail />);
    await fireEvent.press(screen.getByText('Edit'));
    expect(router.push).toHaveBeenCalledWith('/holding/edit?id=flat');
  });

  it('copes with a deleted item', async () => {
    seedStore();
    setParams({ id: 'gone' });
    await render(<HoldingDetail />);
    expect(screen.getByText('Not found')).toBeOnTheScreen();
  });
});

describe('Add and edit a holding', () => {
  const pickCategory = async (name: string) => {
    await fireEvent.press(screen.getByText('Cash'));
    await fireEvent.press(screen.getByText(name));
  };

  it('adds a manual asset in the main currency', async () => {
    seedStore({ settings: { ...emptyData().settings, baseCurrency: 'INR' } });
    setParams({ kind: 'asset' });
    await render(<EditHolding />);
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Savings account'), 'Wallet');
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '1,250.50');
    await fireEvent.press(screen.getByText('Add'));
    expect(state().holdings).toHaveLength(1);
    expect(state().holdings[0]).toMatchObject({ name: 'Wallet', kind: 'asset', categoryId: 'cat-cash', currency: 'INR', mode: 'manual', value: 1250.5 });
    expect(state().holdings[0].history).toEqual([{ date: dayKey(), value: 1250.5 }]);
    expect(router.back).toHaveBeenCalled();
  });

  it('adds a liability, stored as a positive amount', async () => {
    seedStore();
    setParams({ kind: 'liability' });
    await render(<EditHolding />);
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '-500');
    await fireEvent.press(screen.getByText('Add'));
    expect(state().holdings[0]).toMatchObject({ kind: 'liability', categoryId: 'cat-loan', name: 'Loans', value: 500 });
  });

  it('will not save without a value', async () => {
    seedStore();
    await render(<EditHolding />);
    await fireEvent.press(screen.getByText('Add'));
    expect(alert).toHaveBeenCalledWith('Enter a value');
    expect(state().holdings).toEqual([]);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('adds a stock by quantity and fetches its live price', async () => {
    seedStore({ fx: FX });
    mockFetch(() => ({ ok: true, status: 200, text: async () => 'Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-11-27,22:00:00,1,1,1,200,1\n' }));
    await render(<EditHolding />);
    await pickCategory('Stocks & ETFs');
    await fireEvent.changeText(screen.getByPlaceholderText('AAPL, VOD.UK, SAP.DE'), 'aapl');
    await fireEvent.changeText(screen.getAllByPlaceholderText('0')[0], '3');
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() => expect(state().holdings).toHaveLength(1));
    expect(state().holdings[0]).toMatchObject({ name: 'AAPL', mode: 'quantity', symbol: 'AAPL', quantity: 3, unitPrice: 200, value: 600, autoPrice: true });
  });

  it('asks for a ticker before saving a stock', async () => {
    seedStore();
    await render(<EditHolding />);
    await pickCategory('Stocks & ETFs');
    await fireEvent.changeText(screen.getAllByPlaceholderText('0')[0], '3');
    await fireEvent.press(screen.getByText('Add'));
    expect(alert).toHaveBeenCalledWith('Enter a ticker symbol');
  });

  it('adds gold by weight with a typed price when auto price is off', async () => {
    seedStore();
    await render(<EditHolding />);
    await pickCategory('Gold');
    expect(screen.getByText('By weight')).toBeOnTheScreen();
    const [weight] = screen.getAllByPlaceholderText('0');
    await fireEvent.changeText(weight, '10');
    await fireEvent(screen.getByRole('switch'), 'valueChange', false);
    await fireEvent.changeText(screen.getAllByPlaceholderText('0')[1], '80');
    expect(screen.getByText('Value: $800.00')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Add'));
    expect(state().holdings[0]).toMatchObject({ categoryId: 'cat-gold', goldUnit: 'g', quantity: 10, unitPrice: 80, value: 800, autoPrice: false });
  });

  it('tells you when a live price cannot be fetched', async () => {
    seedStore();
    mockFetch(() => json({}, 500));
    await render(<EditHolding />);
    await pickCategory('Gold');
    await fireEvent.changeText(screen.getAllByPlaceholderText('0')[0], '1');
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not fetch price', expect.any(String)));
    expect(state().holdings).toEqual([]);
  });

  it('edits an existing holding in place', async () => {
    seedPortfolio();
    setParams({ id: 'acct' });
    await render(<EditHolding />);
    expect(screen.getByDisplayValue('Savings')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('9000')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByDisplayValue('9000'), '9500');
    await fireEvent.press(screen.getByText('Save changes'));
    const h = state().holdings.find((x) => x.id === 'acct')!;
    expect(h).toMatchObject({ value: 9500, currency: 'EUR', name: 'Savings' });
    expect(state().holdings).toHaveLength(4);
  });
});
