import { emptyData } from '../lib/defaults';
import { AppData, Holding, Profile } from '../lib/types';

let seq = 0;

/** A holding with sensible defaults; override only what the test cares about. */
export function makeHolding(p: Partial<Holding> = {}): Holding {
  seq += 1;
  return {
    id: `h-test-${seq}`,
    name: `Holding ${seq}`,
    kind: 'asset',
    categoryId: 'cat-cash',
    currency: 'USD',
    mode: 'manual',
    value: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    history: [],
    ...p,
  };
}

export function makeProfile(p: Partial<Profile> = {}): Profile {
  return { fullName: 'Asha Rao', email: 'asha@example.com', updatedAt: '2026-01-01T00:00:00.000Z', ...p };
}

export function makeData(p: Partial<AppData> = {}): AppData {
  return { ...emptyData(), ...p };
}

/** Simple fixed rates (units per USD) so expected numbers are easy to work out by hand. */
export const FX = { rates: { USD: 1, EUR: 0.9, GBP: 0.8, INR: 84, AED: 3.6725 } };
