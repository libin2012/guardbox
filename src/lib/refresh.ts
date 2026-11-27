import { fetchFxRates, refreshPrices } from './prices';
import { useStore } from './store';

let inFlight: Promise<string[]> | null = null;

/** Refresh FX rates and live prices. Returns human-readable errors (empty when all good). */
export function refreshAll(): Promise<string[]> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const errors: string[] = [];
    try {
      useStore.getState().setFx(await fetchFxRates());
    } catch (e) {
      errors.push(`Exchange rates: ${(e as Error).message}`);
    }
    const { data, applyPrices } = useStore.getState();
    const typeOf = (h: { categoryId: string }) => data.categories.find((c) => c.id === h.categoryId)?.type;
    const r = await refreshPrices(data.holdings, typeOf, data.settings, data.fx);
    applyPrices(r.prices);
    return [...errors, ...r.errors];
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Refresh if the last FX update is older than `maxAgeMs`. */
export async function refreshIfStale(maxAgeMs = 60 * 60 * 1000): Promise<void> {
  const updated = useStore.getState().data.fx.updatedAt;
  if (updated && Date.now() - new Date(updated).getTime() < maxAgeMs) return;
  await refreshAll().catch(() => undefined);
}
