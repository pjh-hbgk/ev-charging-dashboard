import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Wallet, Gauge, Users as UsersIcon, ShieldCheck } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import KpiCard from '../components/kpi/KpiCard';
import ChartCard from '../components/charts/ChartCard';
import SimpleBarChart from '../components/charts/SimpleBarChart';
import SimpleLineChart from '../components/charts/SimpleLineChart';
import { getSessionsWithCostInRange, computeMonthlyTotals, computeUserTotals, computeDataQuality } from '../lib/api/analytics';
import { listUsers } from '../lib/api/users';
import { formatDkk, formatKwh, formatPriceDkkKwh, formatPercent, MONTH_NAMES } from '../lib/format';
import { toDanishDate } from '../lib/timezone';
import { DateTime } from 'luxon';

export default function Dashboard() {
  const now = DateTime.now().setZone('Europe/Copenhagen');
  const yearStartISO = now.startOf('year').toUTC().toISO()!;
  const monthStartISO = now.startOf('month').toUTC().toISO()!;
  const nextMonthISO = now.startOf('month').plus({ months: 1 }).toUTC().toISO()!;

  const { data: ytdSessions, isLoading } = useQuery({
    queryKey: ['dashboard-ytd', yearStartISO],
    queryFn: () => getSessionsWithCostInRange(yearStartISO),
  });
  const { data: users } = useQuery({ queryKey: ['users-active'], queryFn: () => listUsers() });

  const thisMonth = useMemo(() => (ytdSessions ?? []).filter((s) => s.started_at >= monthStartISO && s.started_at < nextMonthISO), [ytdSessions, monthStartISO, nextMonthISO]);

  const ytd = ytdSessions ?? [];
  const ytdKwh = ytd.reduce((s, r) => s + r.energy_kwh, 0);
  const ytdCost = ytd.reduce((s, r) => s + (r.cost?.total_cost_dkk ?? 0), 0);

  const monthKwh = thisMonth.reduce((s, r) => s + r.energy_kwh, 0);
  const monthCost = thisMonth.reduce((s, r) => s + (r.cost?.total_cost_dkk ?? 0), 0);
  const monthAvgPrice = monthKwh > 0 ? monthCost / monthKwh : null;
  const activeUsersThisMonth = new Set(thisMonth.map((s) => s.user_id)).size;

  const monthlyTotals = useMemo(() => computeMonthlyTotals(ytd), [ytd]);
  const userTotals = useMemo(() => computeUserTotals(ytd), [ytd]);
  const quality = useMemo(() => computeDataQuality(ytd), [ytd]);

  const userNameById = new Map((users ?? []).map((u) => [u.id, u.name]));

  const monthlyChartData = monthlyTotals.map((m) => ({
    month: `${MONTH_NAMES[m.month - 1].slice(0, 3)}`,
    kWh: Math.round(m.kwh * 10) / 10,
    Cost: Math.round(m.cost * 100) / 100,
    'Avg price': m.avgPrice ? Math.round(m.avgPrice * 100) / 100 : 0,
  }));

  const userCostData = userTotals.map((u) => ({ user: userNameById.get(u.userId) ?? 'Unknown', Cost: Math.round(u.cost * 100) / 100, kWh: Math.round(u.kwh * 10) / 10 }));

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`Overview as of ${toDanishDate(new Date().toISOString()).toFormat('dd-MM-yyyy HH:mm')}`} />

      {!isLoading && ytd.length === 0 && (
        <div className="card p-6 mb-6 text-sm">
          No charging sessions yet. Head to <Link to="/imports" className="text-series-1 underline">Data Management</Link> to upload an Excel export, or load demo data to explore the dashboard.
        </div>
      )}

      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">This month</h2>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <KpiCard label="Charging sessions" value={String(thisMonth.length)} icon={Zap} />
        <KpiCard label="Total consumption" value={formatKwh(monthKwh)} icon={Gauge} />
        <KpiCard label="Total cost" value={formatDkk(monthCost)} icon={Wallet} />
        <KpiCard label="Avg. price / kWh" value={formatPriceDkkKwh(monthAvgPrice)} />
        <KpiCard label="Active users" value={String(activeUsersThisMonth)} icon={UsersIcon} />
      </div>

      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">Year to date</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Total kWh" value={formatKwh(ytdKwh)} icon={Gauge} />
        <KpiCard label="Total cost" value={formatDkk(ytdCost)} icon={Wallet} />
        <KpiCard label="Sessions" value={String(ytd.length)} icon={Zap} />
        <KpiCard
          label="Data quality"
          value={formatPercent(quality.percentComplete)}
          sublabel={`${quality.total - quality.complete} sessions flagged`}
          icon={ShieldCheck}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <ChartCard title="Monthly electricity consumption" subtitle="kWh per month, year to date">
          <SimpleBarChart data={monthlyChartData} xKey="month" series={[{ key: 'kWh', label: 'kWh' }]} valueFormatter={(v) => `${v}`} />
        </ChartCard>
        <ChartCard title="Monthly charging cost" subtitle="DKK per month, year to date">
          <SimpleBarChart data={monthlyChartData} xKey="month" series={[{ key: 'Cost', label: 'Cost (DKK)' }]} valueFormatter={(v) => formatDkk(v, { decimals: 0 })} />
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <ChartCard title="Cost per user" subtitle="Year to date, DKK">
          <SimpleBarChart data={userCostData} xKey="user" series={[{ key: 'Cost', label: 'Cost (DKK)' }]} valueFormatter={(v) => formatDkk(v, { decimals: 0 })} />
        </ChartCard>
        <ChartCard title="Average charging price" subtitle="DKK/kWh by month">
          <SimpleLineChart data={monthlyChartData} xKey="month" series={[{ key: 'Avg price', label: 'Avg price (DKK/kWh)' }]} valueFormatter={(v) => v.toFixed(2)} />
        </ChartCard>
      </div>

      <ChartCard title="Consumption per user" subtitle="Year to date, kWh" height={240}>
        <SimpleBarChart data={userCostData} xKey="user" series={[{ key: 'kWh', label: 'kWh' }]} valueFormatter={(v) => `${v}`} />
      </ChartCard>
    </div>
  );
}
