import { supabase } from '../supabaseClient';
import type { CostModel, DataQualityFlag, SessionWithCost } from '../types';

export interface SessionFilters {
  userId?: string;
  fromISO?: string;
  toISO?: string;
  isDemo?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'started_at' | 'total_cost_dkk' | 'energy_kwh';
  sortDir?: 'asc' | 'desc';
}

/** Fetch existing dedup keys (optionally scoped to a charger) for duplicate detection during import. */
export async function getExistingDedupKeys(): Promise<Set<string>> {
  const { data, error } = await supabase.from('charging_sessions').select('dedup_key');
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.dedup_key as string));
}

export async function listSessionsWithCost(filters: SessionFilters = {}): Promise<{ rows: SessionWithCost[]; count: number }> {
  let q = supabase.from('v_session_latest_cost').select('*', { count: 'exact' });
  if (filters.userId) q = q.eq('user_id', filters.userId);
  if (filters.fromISO) q = q.gte('started_at', filters.fromISO);
  if (filters.toISO) q = q.lt('started_at', filters.toISO);
  if (filters.isDemo !== undefined) q = q.eq('is_demo', filters.isDemo);

  const sortBy = filters.sortBy ?? 'started_at';
  q = q.order(sortBy, { ascending: filters.sortDir === 'asc' });

  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw error;
  const rows = (data ?? []).map(rowToSessionWithCost);
  return { rows, count: count ?? rows.length };
}

export async function getSessionWithCost(id: string): Promise<SessionWithCost | null> {
  const { data, error } = await supabase.from('v_session_latest_cost').select('*').eq('session_id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToSessionWithCost(data) : null;
}

export async function getSessionCostBreakdown(sessionId: string, calculationVersion: number) {
  const { data, error } = await supabase
    .from('session_cost_breakdown')
    .select('*')
    .eq('session_id', sessionId)
    .eq('calculation_version', calculationVersion)
    .order('interval_start');
  if (error) throw error;
  return data;
}

function rowToSessionWithCost(row: Record<string, unknown>): SessionWithCost {
  return {
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
  };
}

export interface NewSessionInput {
  source_session_id: string | null;
  dedup_key: string;
  user_id: string;
  charger_id: string;
  card_label: string | null;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  energy_kwh: number;
  source_import_id: string;
  is_demo: boolean;
  data_quality_flags: string[];
}

export async function insertSessions(sessions: NewSessionInput[]): Promise<string[]> {
  if (sessions.length === 0) return [];
  const { data, error } = await supabase.from('charging_sessions').insert(sessions).select('id');
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

export async function deleteDemoSessions() {
  const { error } = await supabase.from('charging_sessions').delete().eq('is_demo', true);
  if (error) throw error;
}

export async function deleteSessionsByImport(importId: string) {
  const { error } = await supabase.from('charging_sessions').delete().eq('source_import_id', importId);
  if (error) throw error;
}
