import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import KpiCard from '../components/kpi/KpiCard';
import ChartCard from '../components/charts/ChartCard';
import SimpleBarChart from '../components/charts/SimpleBarChart';
import { getSessionsWithCostInRange } from '../lib/api/analytics';
import { formatKwh, formatDuration, formatPriceDkkKwh, formatPercent } from '../lib/format';
import { toDanishDate } from '../lib/timezone';

export default function Analytics() {
  const { data: sessions, isLoading } = useQuery({ queryKey: ['all-sessions-cost'], queryFn: () => getSessionsWithCostInRange() });
  const valid = useMemo(() => (sessions ?? []).filter((s) => s.energy_kwh > 0), [sessions]);

  const hourBuckets = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, sessions: 0, kwh: 0, costSum: 0, priceSum: 0, priceCount: 0 }));
    for (const s of valid) {
      const hour = toDanishDate(s.started_at).hour;
      buckets[hour].sessions += 1;
      buckets[hour].kwh += s.energy_kwh;
      if (s.cost?.avg_price_dkk_kwh != null) {
        buckets[hour].priceSum += s.cost.avg_price_dkk_kwh;
        buckets[hour].priceCount += 1;
      }
    }
    return buckets;
  }, [valid]);

  const peakHour = [...hourBuckets].sort((a, b) => b.sessions - a.sessions)[0];
  const withPrice = hourBuckets.filter((b) => b.priceCount > 0).map((b) => ({ ...b, avgPrice: b.priceSum / b.priceCount }));
  const cheapestHour = withPrice.length ? [...withPrice].sort((a, b) => a.avgPrice - b.avgPrice)[0] : null;
  const priciestHour = withPrice.length ? [...withPrice].sort((a, b) => b.avgPrice - a.avgPrice)[0] : null;

  const avgSessionKwh = valid.length ? valid.reduce((s, r) => s + r.energy_kwh, 0) / valid.length : 0;
  const avgSessionDuration = valid.length ? valid.reduce((s, r) => s + r.duration_minutes, 0) / valid.length : 0;

  // % of energy charged while price was in the top quartile of all sampled prices.
  const allPrices = valid.map((s) => s.cost?.avg_price_dkk_kwh).filter((p): p is number => p != null).sort((a, b) => a - b);
  const p75 = allPrices.length ? allPrices[Math.floor(allPrices.length * 0.75)] : null;
  const expensiveKwh = p75 != null ? valid.filter((s) => (s.cost?.avg_price_dkk_kwh ?? 0) >= p75).reduce((s, r) => s + r.energy_kwh, 0) : 0;
  const totalKwh = valid.reduce((s, r) => s + r.energy_kwh, 0);
  const expensiveShare = totalKwh > 0 ? (expensiveKwh / totalKwh) * 100 : 0;

  const hourChartData = hourBuckets.map((b) => ({ hour: `${String(b.hour).padStart(2, '0')}`, Sessions: b.sessions, kWh: Math.round(b.kwh * 10) / 10 }));
  const priceByHourData = withPrice.map((b) => ({ hour: `${String(b.hour).padStart(2, '0')}`, 'Avg price': Math.round(b.avgPrice * 100) / 100 }));

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Secondary insights into charging behaviour" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Most common charging hour" value={peakHour ? `${String(peakHour.hour).padStart(2, '0')}:00` : '—'} sublabel={peakHour ? `${peakHour.sessions} sessions` : undefined} />
        <KpiCard label="Cheapest hour to charge" value={cheapestHour ? `${String(cheapestHour.hour).padStart(2, '0')}:00` : '—'} sublabel={cheapestHour ? formatPriceDkkKwh(cheapestHour.avgPrice) : undefined} />
        <KpiCard label="Most expensive hour to charge" value={priciestHour ? `${String(priciestHour.hour).padStart(2, '0')}:00` : '—'} sublabel={priciestHour ? formatPriceDkkKwh(priciestHour.avgPrice) : undefined} />
        <KpiCard label="Charging in top-quartile price" value={formatPercent(expensiveShare)} sublabel="of total kWh" />
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <KpiCard label="Average session size" value={formatKwh(avgSessionKwh)} />
        <KpiCard label="Average session duration" value={formatDuration(avgSessionDuration)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <ChartCard title="Peak charging hours" subtitle="Number of sessions started, by hour of day (local time)">
          <SimpleBarChart data={hourChartData} xKey="hour" series={[{ key: 'Sessions', label: 'Sessions' }]} valueFormatter={(v) => `${v}`} />
        </ChartCard>
        <ChartCard title="Average spot price by hour" subtitle="DKK/kWh, all sessions">
          <SimpleBarChart data={priceByHourData} xKey="hour" series={[{ key: 'Avg price', label: 'Avg price (DKK/kWh)' }]} valueFormatter={(v) => v.toFixed(2)} />
        </ChartCard>
      </div>

      {!isLoading && valid.length === 0 && <p className="text-sm text-ink-muted mt-6">No sessions with cost data yet.</p>}
    </div>
  );
}
