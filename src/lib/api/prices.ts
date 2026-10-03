import { supabase } from '../supabaseClient';
import type { PriceIntervalBound } from '../timezone';

/** Load cached spot-price intervals overlapping a UTC range, whatever their resolution (60min or 15min). Paginated to avoid Supabase's default 1000-row cap. */
export async function getCachedPriceIntervals(priceArea: string, fromISO: string, toISO: string): Promise<PriceIntervalBound[]> {
  const PAGE_SIZE = 1000;
  const all: PriceIntervalBound[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('electricity_prices')
      .select('interval_start, interval_end, price_dkk_kwh')
      .eq('price_area', priceArea)
      .lt('interval_start', toISO)
      .gt('interval_end', fromISO)
      .order('interval_start')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      all.push({
        start: row.interval_start as string,
        end: row.interval_end as string,
        price: Number(row.price_dkk_kwh),
      });
    }
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export async function upsertPrices(
  priceArea: string,
  rows: Array<{ startISO: string; endISO: string; priceDkkKwh: number; source: string; includesVat: boolean }>
) {
  if (rows.length === 0) return;
  const payload = rows.map((r) => ({
    price_area: priceArea,
    interval_start: r.startISO,
    interval_end: r.endISO,
    price_dkk_kwh: r.priceDkkKwh,
    source: r.source,
    includes_vat: r.includesVat,
    retrieved_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('electricity_prices').upsert(payload, { onConflict: 'price_area,interval_start' });
  if (error) throw error;
}

export async function getPriceMeta(priceArea: string) {
  const { data, error } = await supabase
    .from('electricity_prices')
    .select('source, includes_vat, retrieved_at, interval_start, interval_end')
    .eq('price_area', priceArea)
    .order('retrieved_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPriceCacheRange(priceArea: string): Promise<{ earliest: string | null; latest: string | null; count: number }> {
  const { count } = await supabase
    .from('electricity_prices')
    .select('id', { count: 'exact', head: true })
    .eq('price_area', priceArea);
  const { data: earliestRow } = await supabase
    .from('electricity_prices')
    .select('interval_start')
    .eq('price_area', priceArea)
    .order('interval_start', { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: latestRow } = await supabase
    .from('electricity_prices')
    .select('interval_end')
    .eq('price_area', priceArea)
    .order('interval_end', { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    earliest: (earliestRow?.interval_start as string) ?? null,
    latest: (latestRow?.interval_end as string) ?? null,
    count: count ?? 0,
  };
}

export async function countMissingPriceSessions(): Promise<number> {
  const { count, error } = await supabase
    .from('v_session_latest_cost')
    .select('session_id', { count: 'exact', head: true })
    .eq('price_missing', true);
  if (error) throw error;
  return count ?? 0;
}
