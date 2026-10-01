import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import KpiCard from '../components/kpi/KpiCard';
import Badge from '../components/common/Badge';
import { getPriceMeta, getPriceCacheRange, countMissingPriceSessions } from '../lib/api/prices';
import { getAppSettings } from '../lib/api/settings';
import { refreshElectricityPrices } from '../lib/priceService';
import { recalculateAllCosts } from '../lib/cost/recalculate';
import { formatDanish } from '../lib/timezone';
import { formatPriceDkkKwh } from '../lib/format';

export default function ElectricityPrices() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getAppSettings });
  const { data: meta } = useQuery({ queryKey: ['price-meta', settings?.price_area], queryFn: () => getPriceMeta(settings!.price_area), enabled: !!settings });
  const { data: range } = useQuery({ queryKey: ['price-range', settings?.price_area], queryFn: () => getPriceCacheRange(settings!.price_area), enabled: !!settings });
  const { data: missingCount } = useQuery({ queryKey: ['missing-prices'], queryFn: countMissingPriceSessions });

  async function handleRefresh(from?: string, to?: string) {
    if (!settings) return;
    setBusy('Fetching electricity prices…');
    try {
      const fromISO = from ? new Date(from).toISOString() : new Date(new Date().getFullYear(), 0, 1).toISOString();
      const toISO = to ? new Date(new Date(to).getTime() + 86400000).toISOString() : new Date().toISOString();
      const result = await refreshElectricityPrices(fromISO, toISO, settings.price_area);
      alert(`Fetched ${result.fetched} price intervals.`);
      qc.invalidateQueries();
    } catch (e) {
      alert(`Failed to fetch prices: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleRetryMissing() {
    setBusy('Retrying missing prices…');
    try {
      await handleRefresh();
      await recalculateAllCosts();
      qc.invalidateQueries();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="Electricity Prices" subtitle="DK2 day-ahead spot price cache — Energi Data Service" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Price area" value={settings?.price_area ?? '—'} />
        <KpiCard label="Data source" value={meta?.source ?? '—'} />
        <KpiCard label="Includes VAT" value={meta ? (meta.includes_vat ? 'Yes' : 'No (spot only)') : '—'} />
        <KpiCard label="Unit" value="DKK/kWh" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <KpiCard label="Cache range" value={range?.earliest ? `${formatDanish(range.earliest, 'date')} → ${formatDanish(range.latest!, 'date')}` : 'No data cached yet'} />
        <KpiCard label="Cached intervals" value={String(range?.count ?? 0)} />
        <KpiCard
          label="Sessions missing prices"
          value={String(missingCount ?? 0)}
          sublabel={meta ? `Last updated ${formatDanish(meta.retrieved_at)}` : undefined}
        />
      </div>

      {(missingCount ?? 0) > 0 && (
        <div className="card p-4 mb-6 flex items-center justify-between border-status-serious/30">
          <span className="text-sm">Some sessions are missing electricity prices and are not silently costed at zero.</span>
          <button className="btn-secondary" onClick={handleRetryMissing} disabled={!!busy}>Retry fetching missing prices</button>
        </div>
      )}

      <div className="card p-5">
        <h3 className="text-sm font-semibold mb-3">Manually refresh a date range</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label mb-1 block">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input w-auto" />
          </div>
          <div>
            <label className="label mb-1 block">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input w-auto" />
          </div>
          <button className="btn-primary" disabled={!!busy} onClick={() => handleRefresh(fromDate || undefined, toDate || undefined)}>
            {busy ?? 'Fetch prices'}
          </button>
        </div>
        <p className="text-xs text-ink-muted mt-3">
          Uses Energi Data Service's <Badge tone="neutral">DayAheadPrices</Badge> dataset (15-minute resolution, live since the
          ENTSO-E market-time-unit harmonisation) with automatic fallback to the legacy hourly <Badge tone="neutral">Elspotprices</Badge> dataset
          for dates before that cutover. No API key required.
        </p>
      </div>

      {settings && (
        <p className="text-xs text-ink-muted mt-6">
          Example current price context: costs are computed in DKK/kWh — e.g. {formatPriceDkkKwh(1.5)} is a typical mid-range DK2 spot price.
          Configure VAT and additional cost components on the <a href="/settings" className="underline">Settings</a> page.
        </p>
      )}
    </div>
  );
}
