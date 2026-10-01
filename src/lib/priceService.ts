// Client-side wrapper around the price-fetching Netlify function.
// Kept as a thin, clearly separated service so the underlying source can
// change (see netlify/functions/fetch-prices.ts) without touching callers.

export interface RefreshPricesResult {
  priceArea: string;
  fetched: number;
  cached: number;
  rangeStart: string;
  rangeEnd: string;
}

export async function refreshElectricityPrices(startISO: string, endISO: string, priceArea = 'DK2'): Promise<RefreshPricesResult> {
  const url = `/.netlify/functions/fetch-prices?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&priceArea=${encodeURIComponent(priceArea)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to refresh electricity prices: ${res.status} ${body}`);
  }
  return res.json();
}
