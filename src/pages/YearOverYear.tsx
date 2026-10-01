import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import PageHeader from '../components/common/PageHeader';
import ChartCard from '../components/charts/ChartCard';
import SimpleLineChart from '../components/charts/SimpleLineChart';
import KpiCard from '../components/kpi/KpiCard';
import { getSessionsWithCostInRange, computeMonthlyTotals } from '../lib/api/analytics';
import { formatDkk, formatKwh, formatPriceDkkKwh, MONTH_NAMES } from '../lib/format';

export default function YearOverYear() {
  const now = DateTime.now().setZone('Europe/Copenhagen');
  const [yearA, setYearA] = useState(now.year - 1);
  const [yearB, setYearB] = useState(now.year);

  const { data: sessions, isLoading } = useQuery({ queryKey: ['all-sessions-cost'], queryFn: () => getSessionsWithCostInRange() });
  const monthly = useMemo(() => computeMonthlyTotals(sessions ?? []), [sessions]);

  const years = Array.from(new Set(monthly.map((m) => m.year))).sort();
  const dataByMonth = MONTH_NAMES.map((name, i) => {
    const m = i + 1;
    const a = monthly.find((x) => x.year === yearA && x.month === m);
    const b = monthly.find((x) => x.year === yearB && x.month === m);
    return {
      month: name.slice(0, 3),
      [`${yearA} kWh`]: a ? Math.round(a.kwh * 10) / 10 : 0,
      [`${yearB} kWh`]: b ? Math.round(b.kwh * 10) / 10 : 0,
      [`${yearA} Cost`]: a ? Math.round(a.cost * 100) / 100 : 0,
      [`${yearB} Cost`]: b ? Math.round(b.cost * 100) / 100 : 0,
      [`${yearA} Avg price`]: a?.avgPrice ? Math.round(a.avgPrice * 100) / 100 : 0,
      [`${yearB} Avg price`]: b?.avgPrice ? Math.round(b.avgPrice * 100) / 100 : 0,
    };
  });

  const totalsFor = (year: number) => monthly.filter((m) => m.year === year).reduce((acc, m) => ({ kwh: acc.kwh + m.kwh, cost: acc.cost + m.cost, sessions: acc.sessions + m.sessions }), { kwh: 0, cost: 0, sessions: 0 });
  const totalA = totalsFor(yearA);
  const totalB = totalsFor(yearB);

  return (
    <div>
      <PageHeader
        title="Year over Year"
        subtitle="Compare two years side by side"
        action={
          <div className="flex gap-2">
            <select value={yearA} onChange={(e) => setYearA(Number(e.target.value))} className="input w-auto">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="self-center text-ink-muted text-sm">vs</span>
            <select value={yearB} onChange={(e) => setYearB(Number(e.target.value))} className="input w-auto">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <KpiCard label={`${yearA} total kWh`} value={formatKwh(totalA.kwh)} sublabel={`${totalA.sessions} sessions`} />
        <KpiCard label={`${yearB} total kWh`} value={formatKwh(totalB.kwh)} sublabel={`${totalB.sessions} sessions`} trend={totalA.kwh > 0 ? { direction: totalB.kwh >= totalA.kwh ? 'up' : 'down', label: `${(((totalB.kwh - totalA.kwh) / totalA.kwh) * 100).toFixed(0)}% vs ${yearA}` } : undefined} />
        <KpiCard label="Cost change" value={formatDkk(totalB.cost - totalA.cost)} sublabel={`${formatDkk(totalA.cost)} → ${formatDkk(totalB.cost)}`} />
      </div>

      <div className="grid gap-5">
        <ChartCard title="Monthly kWh" subtitle={`${yearA} vs ${yearB}`}>
          <SimpleLineChart data={dataByMonth} xKey="month" series={[{ key: `${yearA} kWh`, label: `${yearA}` }, { key: `${yearB} kWh`, label: `${yearB}` }]} valueFormatter={(v) => `${v}`} />
        </ChartCard>
        <ChartCard title="Monthly cost" subtitle={`${yearA} vs ${yearB}, DKK`}>
          <SimpleLineChart data={dataByMonth} xKey="month" series={[{ key: `${yearA} Cost`, label: `${yearA}` }, { key: `${yearB} Cost`, label: `${yearB}` }]} valueFormatter={(v) => formatDkk(v, { decimals: 0 })} />
        </ChartCard>
        <ChartCard title="Average electricity price" subtitle={`${yearA} vs ${yearB}, DKK/kWh`}>
          <SimpleLineChart data={dataByMonth} xKey="month" series={[{ key: `${yearA} Avg price`, label: `${yearA}` }, { key: `${yearB} Avg price`, label: `${yearB}` }]} valueFormatter={(v) => formatPriceDkkKwh(v)} />
        </ChartCard>
      </div>
      {!isLoading && monthly.length === 0 && <p className="text-sm text-ink-muted mt-6">No data yet.</p>}
    </div>
  );
}
