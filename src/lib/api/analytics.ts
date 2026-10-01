import { supabase } from '../supabaseClient';
import type { CostModel, DataQualityFlag, SessionWithCost } from '../types';
import { toDanishDate } from '../timezone';

/** Fetch ALL sessions (with their latest cost) in a UTC range — used by dashboard/analytics pages that aggregate in-memory. */
export async function getSessionsWithCostInRange(fromISO?: string, toISO?: string): Promise<SessionWithCost[]> {
  let q = supabase.from('v_session_latest_cost').select('*').order('started_at');
  if (fromISO) q = q.gte('started_at', fromISO);
  if (toISO) q = q.lt('started_at', toISO);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.session_id as string,
    source_session_id: null,
    dedup_key: '',
    user_id: row.user_id as string,
    charger_id: row.charger_id as string,
    card_label: null,
    started_at: row.started_at as string,
    ended_at: row.ended_at as string,
    duration_minutes: row.duration_minutes as number,
    energy_kwh: Number(row.energy_kwh),
    energy_source: row.energy_source as 'session_total' | 'interval_actual',
    source_import_id: null,
    is_demo: row.is_demo as boolean,
    data_quality_flags: ((row.data_quality_flags as string[]) ?? []) as DataQualityFlag[],
    created_at: '',
    cost: row.calculation_version
      ? {
          calculation_version: row.calculation_version as number,
          cost_model: row.cost_model as CostModel,
          spot_cost_dkk: Number(row.spot_cost_dkk ?? 0),
          supplier_cost_dkk: Number(row.supplier_cost_dkk ?? 0),
          grid_cost_dkk: Number(row.grid_cost_dkk ?? 0),
          tax_cost_dkk: Number(row.tax_cost_dkk ?? 0),
          vat_cost_dkk: Number(row.vat_cost_dkk ?? 0),
          other_cost_dkk: Number(row.other_cost_dkk ?? 0),
          total_cost_dkk: Number(row.total_cost_dkk ?? 0),
          avg_price_dkk_kwh: row.avg_price_dkk_kwh !== null ? Number(row.avg_price_dkk_kwh) : null,
          price_missing: Boolean(row.price_missing),
          calculated_at: row.calculated_at as string,
        }
      : undefined,
  }));
}

export function monthKey(isoUTC: string): string {
  const dt = toDanishDate(isoUTC);
  return `${dt.year}-${String(dt.month).padStart(2, '0')}`;
}

export interface MonthlyTotal {
  monthKey: string;
  year: number;
  month: number;
  sessions: number;
  kwh: number;
  cost: number;
  avgPrice: number | null;
}

export function computeMonthlyTotals(sessions: SessionWithCost[]): MonthlyTotal[] {
  const map = new Map<string, MonthlyTotal>();
  for (const s of sessions) {
    const key = monthKey(s.started_at);
    const dt = toDanishDate(s.started_at);
    if (!map.has(key)) map.set(key, { monthKey: key, year: dt.year, month: dt.month, sessions: 0, kwh: 0, cost: 0, avgPrice: null });
    const m = map.get(key)!;
    m.sessions += 1;
    m.kwh += s.energy_kwh;
    m.cost += s.cost?.total_cost_dkk ?? 0;
  }
  const list = Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  for (const m of list) m.avgPrice = m.kwh > 0 ? m.cost / m.kwh : null;
  return list;
}

export interface UserTotal {
  userId: string;
  sessions: number;
  kwh: number;
  cost: number;
  avgPrice: number | null;
}

export function computeUserTotals(sessions: SessionWithCost[]): UserTotal[] {
  const map = new Map<string, UserTotal>();
  for (const s of sessions) {
    if (!map.has(s.user_id)) map.set(s.user_id, { userId: s.user_id, sessions: 0, kwh: 0, cost: 0, avgPrice: null });
    const u = map.get(s.user_id)!;
    u.sessions += 1;
    u.kwh += s.energy_kwh;
    u.cost += s.cost?.total_cost_dkk ?? 0;
  }
  const list = Array.from(map.values());
  for (const u of list) u.avgPrice = u.kwh > 0 ? u.cost / u.kwh : null;
  return list.sort((a, b) => b.kwh - a.kwh);
}

export interface DataQualitySummary {
  total: number;
  complete: number;
  percentComplete: number;
  flaggedCounts: Record<string, number>;
  priceMissingCount: number;
}

export function computeDataQuality(sessions: SessionWithCost[]): DataQualitySummary {
  const flaggedCounts: Record<string, number> = {};
  let complete = 0;
  let priceMissingCount = 0;
  for (const s of sessions) {
    const hasFlags = s.data_quality_flags.length > 0;
    const priceMissing = s.cost?.price_missing ?? true;
    if (priceMissing) priceMissingCount++;
    if (!hasFlags && !priceMissing) complete++;
    for (const f of s.data_quality_flags) flaggedCounts[f] = (flaggedCounts[f] ?? 0) + 1;
  }
  return {
    total: sessions.length,
    complete,
    percentComplete: sessions.length > 0 ? (complete / sessions.length) * 100 : 100,
    flaggedCounts,
    priceMissingCount,
  };
}
