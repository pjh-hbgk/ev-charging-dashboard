import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// =====================================================================
// Fetches and caches DK2 (or configured price-area) day-ahead electricity
// spot prices from Energi Data Service — Energinet's official open-data
// API (https://www.energidataservice.dk/), no API key required.
//
// Two datasets are used, because the underlying market resolution changed:
//   - "DayAheadPrices" (current): 15-minute settlement periods, fields
//     TimeUTC/TimeDK/PriceArea/DayAheadPriceDKK (DKK per MWh). Live since
//     the ENTSO-E-wide market-time-unit (MTU) harmonisation in autumn 2025.
//   - "Elspotprices" (legacy): hourly periods, fields HourUTC/HourDK/
//     PriceArea/SpotPriceDKK (DKK per MWh). Used for dates before the
//     cutover, where DayAheadPrices has no data.
// Both report price per MWh; we store DKK/kWh (÷1000) to match the app's
// unit throughout (electricity_prices.price_dkk_kwh).
//
// This function is deliberately isolated behind a stable interface (the
// request/response shape below) so the price SOURCE can be swapped later
// — e.g. for a different official source — without touching any caller.
// Set USE_MOCK_PRICE_SOURCE=true to return deterministic mock data
// instead of calling the live API (useful for local dev/CI).
// =====================================================================

const DAY_AHEAD_URL = 'https://api.energidataservice.dk/dataset/DayAheadPrices';
const ELSPOT_URL = 'https://api.energidataservice.dk/dataset/Elspotprices';

interface DayAheadRecord {
  TimeUTC: string;
  TimeDK: string;
  PriceArea: string;
  DayAheadPriceDKK: number;
}
interface ElspotRecord {
  HourUTC: string;
  HourDK: string;
  PriceArea: string;
  SpotPriceDKK: number;
}

function isoWithZ(s: string): string {
  // Energi Data Service returns naive ISO strings without a zone suffix
  // for the *UTC field ("2026-01-01T00:00:00") — they ARE already UTC.
  return s.endsWith('Z') ? s : `${s}Z`;
}

function toEdsParam(isoOrDate: string | Date): string {
  // Energi Data Service's start/end filter params must be formatted as
  // yyyy-MM-ddTHH:mm (no seconds, no 'Z') and are interpreted in Danish
  // local time, not UTC. A plain .toISOString() is rejected with a 400.
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value])) as Record<string, string>;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

async function fetchJson<T>(url: string): Promise<{ records: T[] }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Price API request failed: ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

function mockPrices(startISO: string, endISO: string, priceArea: string) {
  const rows: Array<{ startISO: string; endISO: string; priceDkkKwh: number; source: string; includesVat: boolean }> = [];
  let cursor = new Date(startISO);
  const end = new Date(endISO);
  let i = 0;
  while (cursor < end) {
    const next = new Date(cursor.getTime() + 60 * 60000);
    // deterministic pseudo-price with a day/night pattern, purely for local testing
    const hour = cursor.getUTCHours();
    const base = 0.6 + 0.35 * Math.sin(((hour - 6) / 24) * Math.PI * 2) + (hour >= 17 && hour <= 20 ? 0.4 : 0);
    rows.push({
      startISO: cursor.toISOString(),
      endISO: next.toISOString(),
      priceDkkKwh: Math.max(0.1, Math.round(base * 100) / 100),
      source: 'mock',
      includesVat: false,
    });
    cursor = next;
    i++;
    if (i > 24 * 400) break; // safety cap
  }
  return { rows, priceArea };
}

async function fetchLivePrices(startISO: string, endISO: string, priceArea: string) {
  const rows: Array<{ startISO: string; endISO: string; priceDkkKwh: number; source: string; includesVat: boolean }> = [];

  // Try the current 15-minute dataset first.
  const dayAheadUrl = `${DAY_AHEAD_URL}?start=${encodeURIComponent(toEdsParam(startISO))}&end=${encodeURIComponent(toEdsParam(endISO))}&filter=${encodeURIComponent(
    JSON.stringify({ PriceArea: [priceArea] })
  )}&sort=TimeUTC%20ASC&limit=20000`;
  const dayAhead = await fetchJson<DayAheadRecord>(dayAheadUrl);

  if (dayAhead.records.length > 0) {
    for (const r of dayAhead.records) {
      const start = new Date(isoWithZ(r.TimeUTC));
      const end = new Date(start.getTime() + 15 * 60000);
      rows.push({
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        priceDkkKwh: r.DayAheadPriceDKK / 1000,
        source: 'energidataservice_dayahead',
        includesVat: false,
      });
    }
  }

  // Determine if we still need legacy hourly data for the earlier part of the range.
  const coveredFrom = dayAhead.records.length > 0 ? new Date(isoWithZ(dayAhead.records[0].TimeUTC)) : new Date(endISO);
  if (coveredFrom > new Date(startISO)) {
    const elspotUrl = `${ELSPOT_URL}?start=${encodeURIComponent(toEdsParam(startISO))}&end=${encodeURIComponent(toEdsParam(coveredFrom))}&filter=${encodeURIComponent(
      JSON.stringify({ PriceArea: [priceArea] })
    )}&sort=HourUTC%20ASC&limit=20000`;
    try {
      const elspot = await fetchJson<ElspotRecord>(elspotUrl);
      for (const r of elspot.records) {
        const start = new Date(isoWithZ(r.HourUTC));
        const end = new Date(start.getTime() + 60 * 60000);
        rows.push({
          startISO: start.toISOString(),
          endISO: end.toISOString(),
          priceDkkKwh: r.SpotPriceDKK / 1000,
          source: 'energidataservice_elspot',
          includesVat: false,
        });
      }
    } catch {
      // Legacy dataset unreachable/deprecated — the gap simply stays
      // uncached; the cost engine will mark affected sessions price_missing.
    }
  }

  return { rows, priceArea };
}

export const handler: Handler = async (event) => {
  try {
    const params = event.queryStringParameters ?? {};
    const priceArea = params.priceArea ?? process.env.ELECTRICITY_PRICE_AREA ?? 'DK2';

    // When invoked without query params (e.g. the daily scheduled trigger
    // configured in netlify.toml), default to a rolling window so the
    // cache stays warm for "yesterday through the next couple of days"
    // without any manual action.
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 2 * 86400000);
    const defaultEnd = new Date(now.getTime() + 2 * 86400000);
    const startISO = params.start ?? defaultStart.toISOString();
    const endISO = params.end ?? defaultEnd.toISOString();

    const useMock = (process.env.USE_MOCK_PRICE_SOURCE ?? 'false').toLowerCase() === 'true';
    const { rows } = useMock ? mockPrices(startISO, endISO, priceArea) : await fetchLivePrices(startISO, endISO, priceArea);

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let cached = 0;
    if (supabaseUrl && serviceKey && rows.length > 0) {
      const supabase = createClient(supabaseUrl, serviceKey);
      const payload = rows.map((r) => ({
        price_area: priceArea,
        interval_start: r.startISO,
        interval_end: r.endISO,
        price_dkk_kwh: r.priceDkkKwh,
        source: r.source,
        includes_vat: r.includesVat,
        retrieved_at: new Date().toISOString(),
      }));
      // Upsert in chunks to stay well under request size limits.
      for (let i = 0; i < payload.length; i += 1000) {
        const chunk = payload.slice(i, i + 1000);
        const { error } = await supabase.from('electricity_prices').upsert(chunk, { onConflict: 'price_area,interval_start' });
        if (error) throw error;
        cached += chunk.length;
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceArea, fetched: rows.length, cached, rangeStart: startISO, rangeEnd: endISO }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) };
  }
};
