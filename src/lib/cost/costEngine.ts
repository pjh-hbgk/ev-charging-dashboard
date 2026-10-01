import { splitByPriceIntervals, splitIntoHourIntervals, minutesBetween, type PriceIntervalBound } from '../timezone';
import type { CostComponent, CostModel, TimeScheduleEntry } from '../types';
import { DateTime } from 'luxon';

/**
 * Supplies the real electricity-price intervals (whatever resolution they
 * were published at — 60min historically, 15min under the current
 * ENTSO-E market-time-unit standard) that overlap a given [start, end)
 * UTC range. Cost allocation always segments against these actual
 * boundaries rather than an assumed fixed grid.
 */
export interface PriceIntervalSource {
  getIntervalsInRange(startISO: string, endISO: string): PriceIntervalBound[];
}

export class ArrayPriceIntervalSource implements PriceIntervalSource {
  constructor(private intervals: PriceIntervalBound[]) {}
  getIntervalsInRange(startISO: string, endISO: string): PriceIntervalBound[] {
    const s = new Date(startISO).getTime();
    const e = new Date(endISO).getTime();
    return this.intervals.filter((iv) => new Date(iv.end).getTime() > s && new Date(iv.start).getTime() < e);
  }
}

export interface IntervalAllocation {
  intervalStartISO: string;
  intervalEndISO: string;
  allocatedKwh: number;
  spotPriceDkkKwh: number | null;
  priceMissing: boolean;
  spotCostDkk: number | null;
}

export interface SessionAllocationResult {
  intervals: IntervalAllocation[];
  totalSpotCostDkk: number;
  anyPriceMissing: boolean;
  totalAllocatedKwh: number;
  avgSpotPriceDkkKwh: number | null;
}

/**
 * Allocate a session's total kWh across the real electricity-price
 * intervals it spans, weighted by the duration spent in each interval
 * (proportional allocation — clearly labeled as an estimate whenever the
 * source data only provides a session total rather than true interval-
 * level consumption).
 *
 * If the source data ever provides true interval-level consumption
 * instead of a session total, pass it via `actualIntervalKwh` and this
 * function uses it as-is (energy_source = 'interval_actual') instead of
 * estimating.
 */
export function allocateSessionCost(params: {
  startedAtISO: string;
  endedAtISO: string;
  energyKwh: number;
  prices: PriceIntervalSource;
  actualIntervalKwh?: Array<{ startISO: string; endISO: string; kwh: number }>;
}): SessionAllocationResult {
  const { startedAtISO, endedAtISO, energyKwh, prices, actualIntervalKwh } = params;

  const intervals: IntervalAllocation[] = [];
  let totalCost = 0;
  let anyMissing = false;
  let totalKwh = 0;

  if (actualIntervalKwh && actualIntervalKwh.length > 0) {
    const priceIntervals = prices.getIntervalsInRange(startedAtISO, endedAtISO);
    for (const seg of actualIntervalKwh) {
      const match = priceIntervals.find(
        (iv) => new Date(iv.start).getTime() <= new Date(seg.startISO).getTime() && new Date(iv.end).getTime() >= new Date(seg.endISO).getTime()
      );
      const price = match ? match.price : null;
      const missing = price === null;
      if (missing) anyMissing = true;
      const cost = missing ? null : seg.kwh * (price as number);
      if (cost !== null) totalCost += cost;
      totalKwh += seg.kwh;
      intervals.push({
        intervalStartISO: seg.startISO,
        intervalEndISO: seg.endISO,
        allocatedKwh: round4(seg.kwh),
        spotPriceDkkKwh: price,
        priceMissing: missing,
        spotCostDkk: cost === null ? null : round4(cost),
      });
    }
  } else {
    const priceIntervals = prices.getIntervalsInRange(startedAtISO, endedAtISO);
    // Fall back to an hourly display grid only when there's no price data
    // at all yet for this range (so we still show something segmented,
    // clearly all flagged missing) — otherwise segment against the real
    // interval boundaries, whatever their width.
    const segments =
      priceIntervals.length > 0
        ? splitByPriceIntervals(startedAtISO, endedAtISO, priceIntervals)
        : splitIntoHourIntervals(startedAtISO, endedAtISO).map((h) => ({ ...h, price: null as number | null }));

    const totalMinutes = segments.reduce((s, seg) => s + minutesBetween(seg.start, seg.end), 0);

    for (const seg of segments) {
      const segMinutes = minutesBetween(seg.start, seg.end);
      const share = totalMinutes > 0 ? segMinutes / totalMinutes : 0;
      const allocatedKwh = energyKwh * share;
      const missing = seg.price === null;
      if (missing) anyMissing = true;
      const cost = missing ? null : allocatedKwh * (seg.price as number);
      if (cost !== null) totalCost += cost;
      totalKwh += allocatedKwh;
      intervals.push({
        intervalStartISO: seg.start.toISO()!,
        intervalEndISO: seg.end.toISO()!,
        allocatedKwh: round4(allocatedKwh),
        spotPriceDkkKwh: seg.price,
        priceMissing: missing,
        spotCostDkk: cost === null ? null : round4(cost),
      });
    }
  }

  return {
    intervals,
    totalSpotCostDkk: round4(totalCost),
    anyPriceMissing: anyMissing,
    totalAllocatedKwh: round4(totalKwh),
    avgSpotPriceDkkKwh: totalKwh > 0 && !anyMissing ? round5(totalCost / totalKwh) : null,
  };
}

export interface ComponentBreakdown {
  key: string;
  label: string;
  amountDkk: number;
}

export interface FullCostResult {
  spotCostDkk: number;
  supplierCostDkk: number;
  gridCostDkk: number;
  taxCostDkk: number;
  vatCostDkk: number;
  otherCostDkk: number;
  totalCostDkk: number;
  avgPriceDkkKwh: number | null;
  componentBreakdown: ComponentBreakdown[];
}

/**
 * Apply configurable cost components (Settings → Electricity) on top of the
 * raw spot allocation, for a given cost model:
 *   A_spot      — spot price only, no VAT, no extras
 *   B_spot_vat  — spot price + VAT
 *   C_full      — spot + grid tariff + tax + supplier surcharge + other + VAT
 */
export function applyCostModel(params: {
  model: CostModel;
  spotAllocation: SessionAllocationResult;
  energyKwh: number;
  sessionStartISO: string;
  components: CostComponent[];
  vatRatePercent: number;
}): FullCostResult {
  const { model, spotAllocation, energyKwh, sessionStartISO, components, vatRatePercent } = params;
  const spot = spotAllocation.totalSpotCostDkk;
  const breakdown: ComponentBreakdown[] = [{ key: 'spot', label: 'Spot price', amountDkk: round4(spot) }];

  if (model === 'A_spot') {
    return {
      spotCostDkk: round4(spot),
      supplierCostDkk: 0,
      gridCostDkk: 0,
      taxCostDkk: 0,
      vatCostDkk: 0,
      otherCostDkk: 0,
      totalCostDkk: round4(spot),
      avgPriceDkkKwh: energyKwh > 0 ? round5(spot / energyKwh) : null,
      componentBreakdown: breakdown,
    };
  }

  let supplier = 0;
  let grid = 0;
  let tax = 0;
  let other = 0;

  const relevant = components.filter((c) => c.enabled && c.applies_to_models.includes(model));
  for (const c of relevant) {
    const amount = computeComponentAmount(c, { energyKwh, spotCostDkk: spot, sessionStartISO });
    breakdown.push({ key: c.key, label: c.label, amountDkk: round4(amount) });
    if (c.key.includes('grid')) grid += amount;
    else if (c.key.includes('tax')) tax += amount;
    else if (c.key.includes('ok_') || c.key.includes('supplier')) supplier += amount;
    else other += amount;
  }

  const preVat = spot + supplier + grid + tax + other;
  let vat = 0;
  if (model === 'B_spot_vat' || model === 'C_full') {
    vat = model === 'B_spot_vat' ? spot * (vatRatePercent / 100) : preVat * (vatRatePercent / 100);
    breakdown.push({ key: 'vat', label: `VAT (${vatRatePercent}%)`, amountDkk: round4(vat) });
  }

  const total = model === 'B_spot_vat' ? spot + vat : preVat + vat;

  return {
    spotCostDkk: round4(spot),
    supplierCostDkk: round4(supplier),
    gridCostDkk: round4(grid),
    taxCostDkk: round4(tax),
    vatCostDkk: round4(vat),
    otherCostDkk: round4(other),
    totalCostDkk: round4(total),
    avgPriceDkkKwh: energyKwh > 0 ? round5(total / energyKwh) : null,
    componentBreakdown: breakdown,
  };
}

function computeComponentAmount(
  c: CostComponent,
  ctx: { energyKwh: number; spotCostDkk: number; sessionStartISO: string }
): number {
  switch (c.component_type) {
    case 'fixed_dkk_kwh':
      return (c.value_dkk_kwh ?? 0) * ctx.energyKwh;
    case 'percentage':
      return ctx.spotCostDkk * ((c.percentage ?? 0) / 100);
    case 'time_dependent': {
      const schedule = c.time_schedule ?? [];
      const local = DateTime.fromISO(ctx.sessionStartISO, { zone: 'utc' }).setZone('Europe/Copenhagen');
      const hm = local.toFormat('HH:mm');
      const match = schedule.find((s: TimeScheduleEntry) => inRange(hm, s.from, s.to));
      return (match?.value ?? 0) * ctx.energyKwh;
    }
    default:
      return 0;
  }
}

function inRange(value: string, from: string, to: string): boolean {
  if (from <= to) return value >= from && value < to;
  // overnight range e.g. 22:00-06:00
  return value >= from || value < to;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
function round5(n: number): number {
  return Math.round(n * 100000) / 100000;
}
