import { describe, it, expect } from 'vitest';
import { allocateSessionCost, applyCostModel, ArrayPriceIntervalSource } from '../cost/costEngine';
import { parseLocalToUTC } from '../timezone';
import type { CostComponent } from '../types';
import type { PriceIntervalBound } from '../timezone';

function iso(local: string) {
  return parseLocalToUTC(local).iso;
}

describe('allocateSessionCost — hourly resolution (pre-Oct-2025 market data)', () => {
  it('allocates cost proportionally across an hour-crossing session', () => {
    // Local 22:35 -> 01:10 (Jan, CET/UTC+1) => UTC 21:35 -> 00:10.
    // UTC hour buckets touched: 21:00 (25min), 22:00 (60min), 23:00 (60min), 00:00-next-day (10min)
    const start = iso('2026-01-10 22:35');
    const end = iso('2026-01-11 01:10');
    const intervals: PriceIntervalBound[] = [
      { start: '2026-01-10T21:00:00.000Z', end: '2026-01-10T22:00:00.000Z', price: 1.0 },
      { start: '2026-01-10T22:00:00.000Z', end: '2026-01-10T23:00:00.000Z', price: 2.0 },
      { start: '2026-01-10T23:00:00.000Z', end: '2026-01-11T00:00:00.000Z', price: 3.0 },
      { start: '2026-01-11T00:00:00.000Z', end: '2026-01-11T01:00:00.000Z', price: 4.0 },
    ];
    const result = allocateSessionCost({
      startedAtISO: start,
      endedAtISO: end,
      energyKwh: 15.5, // 155 minutes total -> 0.1 kWh/min, clean proportional math
      prices: new ArrayPriceIntervalSource(intervals),
    });
    expect(result.totalAllocatedKwh).toBeCloseTo(15.5, 2);
    expect(result.anyPriceMissing).toBe(false);
    // seg1: 25min*0.1=2.5kwh @1.0 => 2.5
    // seg2: 60min*0.1=6.0kwh @2.0 => 12.0
    // seg3: 60min*0.1=6.0kwh @3.0 => 18.0
    // seg4: 10min*0.1=1.0kwh @4.0 => 4.0
    // total => 36.5
    expect(result.totalSpotCostDkk).toBeCloseTo(36.5, 2);
  });

  it('flags missing prices instead of silently costing zero', () => {
    const start = iso('2026-01-10 10:00');
    const end = iso('2026-01-10 11:00');
    const result = allocateSessionCost({
      startedAtISO: start,
      endedAtISO: end,
      energyKwh: 10,
      prices: new ArrayPriceIntervalSource([]),
    });
    expect(result.anyPriceMissing).toBe(true);
    expect(result.intervals[0].spotCostDkk).toBeNull();
  });

  it('flags a partial gap when only part of the session has cached prices', () => {
    const start = iso('2026-01-10 10:00');
    const end = iso('2026-01-10 12:00');
    const intervals: PriceIntervalBound[] = [
      { start: '2026-01-10T09:00:00.000Z', end: '2026-01-10T10:00:00.000Z', price: 1.0 },
    ];
    const result = allocateSessionCost({
      startedAtISO: start,
      endedAtISO: end,
      energyKwh: 10,
      prices: new ArrayPriceIntervalSource(intervals),
    });
    expect(result.anyPriceMissing).toBe(true);
  });
});

describe('allocateSessionCost — 15-minute resolution (current ENTSO-E MTU standard)', () => {
  it('allocates cost across quarter-hour price intervals', () => {
    const start = iso('2026-06-01 10:00');
    const end = iso('2026-06-01 11:00');
    const startUTC = new Date(start);
    const q = (n: number) => new Date(startUTC.getTime() + n * 15 * 60000).toISOString();
    const intervals: PriceIntervalBound[] = [
      { start: q(0), end: q(1), price: 1.0 },
      { start: q(1), end: q(2), price: 2.0 },
      { start: q(2), end: q(3), price: 3.0 },
      { start: q(3), end: q(4), price: 4.0 },
    ];
    const result = allocateSessionCost({
      startedAtISO: start,
      endedAtISO: end,
      energyKwh: 4, // 1kWh per 15-min interval
      prices: new ArrayPriceIntervalSource(intervals),
    });
    expect(result.intervals.length).toBe(4);
    expect(result.totalSpotCostDkk).toBeCloseTo(1 + 2 + 3 + 4, 4);
    expect(result.anyPriceMissing).toBe(false);
  });
});

describe('applyCostModel', () => {
  const components: CostComponent[] = [
    {
      id: '1', key: 'grid_tariff', label: 'Grid tariff', component_type: 'fixed_dkk_kwh',
      value_dkk_kwh: 0.6, percentage: null, time_schedule: null,
      applies_to_models: ['C_full'], enabled: true, sort_order: 1, updated_at: '',
    },
    {
      id: '2', key: 'electricity_tax', label: 'Electricity tax', component_type: 'fixed_dkk_kwh',
      value_dkk_kwh: 0.9, percentage: null, time_schedule: null,
      applies_to_models: ['C_full'], enabled: true, sort_order: 2, updated_at: '',
    },
    {
      id: '3', key: 'ok_surcharge', label: 'OK supplier surcharge', component_type: 'percentage',
      value_dkk_kwh: null, percentage: 5, time_schedule: null,
      applies_to_models: ['C_full'], enabled: true, sort_order: 3, updated_at: '',
    },
  ];

  it('model A is spot only, no VAT', () => {
    const alloc = { intervals: [], totalSpotCostDkk: 10, anyPriceMissing: false, totalAllocatedKwh: 5, avgSpotPriceDkkKwh: 2 };
    const r = applyCostModel({ model: 'A_spot', spotAllocation: alloc, energyKwh: 5, sessionStartISO: iso('2026-01-01 12:00'), components, vatRatePercent: 25 });
    expect(r.totalCostDkk).toBe(10);
    expect(r.vatCostDkk).toBe(0);
  });

  it('model B adds VAT on spot only', () => {
    const alloc = { intervals: [], totalSpotCostDkk: 10, anyPriceMissing: false, totalAllocatedKwh: 5, avgSpotPriceDkkKwh: 2 };
    const r = applyCostModel({ model: 'B_spot_vat', spotAllocation: alloc, energyKwh: 5, sessionStartISO: iso('2026-01-01 12:00'), components, vatRatePercent: 25 });
    expect(r.totalCostDkk).toBe(12.5);
  });

  it('model C adds all components + VAT on top of everything', () => {
    const alloc = { intervals: [], totalSpotCostDkk: 10, anyPriceMissing: false, totalAllocatedKwh: 5, avgSpotPriceDkkKwh: 2 };
    const r = applyCostModel({ model: 'C_full', spotAllocation: alloc, energyKwh: 5, sessionStartISO: iso('2026-01-01 12:00'), components, vatRatePercent: 25 });
    // spot 10 + grid 0.6*5=3 + tax 0.9*5=4.5 + ok 5%*10=0.5 = 18, vat 25% = 4.5, total 22.5
    expect(r.gridCostDkk).toBe(3);
    expect(r.taxCostDkk).toBe(4.5);
    expect(r.supplierCostDkk).toBe(0.5);
    expect(r.totalCostDkk).toBeCloseTo(22.5, 4);
  });
});
