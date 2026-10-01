import { supabase } from '../supabaseClient';
import { getAppSettings, bumpCalculationVersion, listCostComponents } from '../api/settings';
import { getCachedPriceIntervals } from '../api/prices';
import { allocateSessionCost, applyCostModel, ArrayPriceIntervalSource } from './costEngine';
import type { ChargingSession } from '../types';

export interface RecalculateProgress {
  processed: number;
  total: number;
}

export interface RecalculateSummary {
  calculationVersion: number;
  sessionsProcessed: number;
  sessionsPriceMissing: number;
  totalCostDkk: number;
}

/**
 * Recalculates cost for every charging session using the current
 * settings/cost-component configuration, writing a NEW calculation
 * version (session data itself is never touched — see session_costs /
 * session_cost_breakdown, which keep every prior version for audit).
 */
export async function recalculateAllCosts(onProgress?: (p: RecalculateProgress) => void): Promise<RecalculateSummary> {
  const settings = await getAppSettings();
  const components = await listCostComponents();
  const version = await bumpCalculationVersion();

  const { data: sessions, error } = await supabase
    .from('charging_sessions')
    .select('id, started_at, ended_at, energy_kwh')
    .order('started_at');
  if (error) throw error;
  const list = (sessions ?? []) as Pick<ChargingSession, 'id' | 'started_at' | 'ended_at' | 'energy_kwh'>[];
  if (list.length === 0) {
    return { calculationVersion: version, sessionsProcessed: 0, sessionsPriceMissing: 0, totalCostDkk: 0 };
  }

  const minStart = list.reduce((m, s) => (s.started_at < m ? s.started_at : m), list[0].started_at);
  const maxEnd = list.reduce((m, s) => (s.ended_at > m ? s.ended_at : m), list[0].ended_at);
  const priceIntervals = await getCachedPriceIntervals(settings.price_area, minStart, maxEnd);
  const priceSource = new ArrayPriceIntervalSource(priceIntervals);

  let processed = 0;
  let priceMissingCount = 0;
  let totalCost = 0;

  const BATCH = 100;
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    const breakdownRows: Array<Record<string, unknown>> = [];
    const costRows: Array<Record<string, unknown>> = [];

    for (const session of batch) {
      const allocation = allocateSessionCost({
        startedAtISO: session.started_at,
        endedAtISO: session.ended_at,
        energyKwh: Number(session.energy_kwh),
        prices: priceSource,
      });
      const full = applyCostModel({
        model: settings.default_cost_model,
        spotAllocation: allocation,
        energyKwh: Number(session.energy_kwh),
        sessionStartISO: session.started_at,
        components,
        vatRatePercent: settings.vat_rate_percent,
      });

      if (allocation.anyPriceMissing) priceMissingCount++;
      totalCost += full.totalCostDkk;

      for (const iv of allocation.intervals) {
        breakdownRows.push({
          session_id: session.id,
          interval_start: iv.intervalStartISO,
          interval_end: iv.intervalEndISO,
          allocated_kwh: iv.allocatedKwh,
          allocation_method: 'proportional_duration',
          spot_price_dkk_kwh: iv.spotPriceDkkKwh,
          price_missing: iv.priceMissing,
          spot_cost_dkk: iv.spotCostDkk,
          calculation_version: version,
        });
      }

      costRows.push({
        session_id: session.id,
        calculation_version: version,
        cost_model: settings.default_cost_model,
        spot_cost_dkk: full.spotCostDkk,
        supplier_cost_dkk: full.supplierCostDkk,
        grid_cost_dkk: full.gridCostDkk,
        tax_cost_dkk: full.taxCostDkk,
        vat_cost_dkk: full.vatCostDkk,
        other_cost_dkk: full.otherCostDkk,
        total_cost_dkk: full.totalCostDkk,
        avg_price_dkk_kwh: full.avgPriceDkkKwh,
        price_missing: allocation.anyPriceMissing,
      });
    }

    const { error: bErr } = await supabase.from('session_cost_breakdown').insert(breakdownRows);
    if (bErr) throw bErr;
    const { error: cErr } = await supabase.from('session_costs').insert(costRows);
    if (cErr) throw cErr;

    processed += batch.length;
    onProgress?.({ processed, total: list.length });
  }

  return {
    calculationVersion: version,
    sessionsProcessed: processed,
    sessionsPriceMissing: priceMissingCount,
    totalCostDkk: Math.round(totalCost * 100) / 100,
  };
}
