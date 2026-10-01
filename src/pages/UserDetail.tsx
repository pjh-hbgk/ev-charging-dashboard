import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import KpiCard from '../components/kpi/KpiCard';
import DataTable, { type Column } from '../components/tables/DataTable';
import ChartCard from '../components/charts/ChartCard';
import SimpleBarChart from '../components/charts/SimpleBarChart';
import { getUser } from '../lib/api/users';
import { getSessionsWithCostInRange, computeMonthlyTotals } from '../lib/api/analytics';
import { formatDkk, formatKwh, formatPriceDkkKwh, formatDuration, MONTH_NAMES } from '../lib/format';
import { formatDanish } from '../lib/timezone';
import { exportSessionsToCsv } from '../lib/export/csv';
import { exportUserStatementToPdf } from '../lib/export/pdf';
import type { SessionWithCost } from '../lib/types';
import { QualityFlagBadge } from '../components/common/Badge';

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data: user } = useQuery({ queryKey: ['user', id], queryFn: () => getUser(id!), enabled: !!id });
  const { data: allSessions, isLoading } = useQuery({
    queryKey: ['user-sessions', id],
    queryFn: () => getSessionsWithCostInRange(),
    enabled: !!id,
  });

  const userSessionsAll = useMemo(() => (allSessions ?? []).filter((s) => s.user_id === id), [allSessions, id]);
  const filtered = useMemo(() => {
    return userSessionsAll.filter((s) => {
      if (fromDate && s.started_at < new Date(fromDate).toISOString()) return false;
      if (toDate && s.started_at > new Date(new Date(toDate).getTime() + 86400000).toISOString()) return false;
      return true;
    });
  }, [userSessionsAll, fromDate, toDate]);

  const totalKwh = filtered.reduce((s, r) => s + r.energy_kwh, 0);
  const totalCost = filtered.reduce((s, r) => s + (r.cost?.total_cost_dkk ?? 0), 0);
  const avgPrice = totalKwh > 0 ? totalCost / totalKwh : null;
  const first = userSessionsAll[0];
  const last = userSessionsAll[userSessionsAll.length - 1];

  const monthly = useMemo(() => computeMonthlyTotals(userSessionsAll), [userSessionsAll]);
  const monthlyChart = monthly.map((m) => ({ month: `${MONTH_NAMES[m.month - 1].slice(0, 3)} '${String(m.year).slice(2)}`, kWh: Math.round(m.kwh * 10) / 10, Cost: Math.round(m.cost * 100) / 100 }));

  const byYear = new Map<number, number>();
  for (const m of monthly) byYear.set(m.year, (byYear.get(m.year) ?? 0) + m.kwh);
  const yoyChart = Array.from(byYear.entries()).sort((a, b) => a[0] - b[0]).map(([year, kwh]) => ({ year: String(year), kWh: Math.round(kwh * 10) / 10 }));

  const columns: Column<SessionWithCost>[] = [
    { key: 'date', header: 'Date', render: (r) => formatDanish(r.started_at, 'date'), sortValue: (r) => r.started_at },
    { key: 'start', header: 'Start', render: (r) => formatDanish(r.started_at, 'time') },
    { key: 'end', header: 'End', render: (r) => formatDanish(r.ended_at, 'time') },
    { key: 'duration', header: 'Duration', render: (r) => formatDuration(r.duration_minutes), sortValue: (r) => r.duration_minutes, align: 'right' },
    { key: 'kwh', header: 'kWh', render: (r) => formatKwh(r.energy_kwh), sortValue: (r) => r.energy_kwh, align: 'right' },
    { key: 'avgprice', header: 'Avg Spot Price', render: (r) => formatPriceDkkKwh(r.cost?.avg_price_dkk_kwh ?? null), align: 'right' },
    { key: 'spotcost', header: 'Spot Cost', render: (r) => formatDkk(r.cost?.spot_cost_dkk), sortValue: (r) => r.cost?.spot_cost_dkk ?? 0, align: 'right' },
    { key: 'total', header: 'Total Cost', render: (r) => formatDkk(r.cost?.total_cost_dkk), sortValue: (r) => r.cost?.total_cost_dkk ?? 0, align: 'right' },
    {
      key: 'flags', header: '', render: (r) => (r.data_quality_flags.length > 0 || r.cost?.price_missing ? <>{r.data_quality_flags.map((f) => <QualityFlagBadge key={f} flag={f} />)}{r.cost?.price_missing && <QualityFlagBadge flag="price_missing" />}</> : null),
    },
  ];

  if (!user) return <div className="text-sm text-ink-muted">Loading user…</div>;

  return (
    <div>
      <button onClick={() => navigate('/users')} className="text-sm text-ink-muted flex items-center gap-1 mb-3 hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> Back to users
      </button>
      <PageHeader
        title={user.name}
        subtitle={user.customer_number ? `Customer #${user.customer_number}` : user.external_user_id ?? undefined}
        action={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => exportSessionsToCsv(filtered, new Map([[user.id, user.name]]), `${user.name}-sessions.csv`)}>
              <Download className="h-4 w-4" /> CSV
            </button>
            <button
              className="btn-secondary"
              onClick={() =>
                exportUserStatementToPdf({
                  userName: user.name,
                  customerNumber: user.customer_number,
                  periodLabel: fromDate || toDate ? `${fromDate || '…'} – ${toDate || '…'}` : 'All time',
                  sessions: filtered,
                  filename: `${user.name}-statement.pdf`,
                })
              }
            >
              <FileText className="h-4 w-4" /> PDF statement
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Total sessions" value={String(filtered.length)} />
        <KpiCard label="Total kWh" value={formatKwh(totalKwh)} />
        <KpiCard label="Total cost" value={formatDkk(totalCost)} />
        <KpiCard label="Avg DKK/kWh" value={formatPriceDkkKwh(avgPrice)} />
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6 text-sm text-ink-muted">
        <div>First session: {first ? formatDanish(first.started_at) : '—'}</div>
        <div>Most recent: {last ? formatDanish(last.started_at) : '—'}</div>
      </div>

      <div className="card p-4 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="label mb-1 block">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input w-auto" />
        </div>
        <div>
          <label className="label mb-1 block">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input w-auto" />
        </div>
        {(fromDate || toDate) && (
          <button className="btn-secondary" onClick={() => { setFromDate(''); setToDate(''); }}>Clear filter</button>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        <ChartCard title="Consumption month by month" subtitle="kWh">
          <SimpleBarChart data={monthlyChart} xKey="month" series={[{ key: 'kWh', label: 'kWh' }]} valueFormatter={(v) => `${v}`} />
        </ChartCard>
        <ChartCard title="Cost month by month" subtitle="DKK">
          <SimpleBarChart data={monthlyChart} xKey="month" series={[{ key: 'Cost', label: 'Cost (DKK)' }]} valueFormatter={(v) => formatDkk(v, { decimals: 0 })} />
        </ChartCard>
      </div>
      {yoyChart.length > 1 && (
        <ChartCard title="Year-over-year comparison" subtitle="Total kWh per year" height={220}>
          <SimpleBarChart data={yoyChart} xKey="year" series={[{ key: 'kWh', label: 'kWh' }]} valueFormatter={(v) => `${v}`} />
        </ChartCard>
      )}

      <div className="card p-5 mt-6">
        <h3 className="text-sm font-semibold mb-3">Charging sessions</h3>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          searchable={false}
          defaultSortKey="date"
          onRowClick={(r) => navigate(`/sessions/${r.id}`)}
          emptyMessage={isLoading ? 'Loading…' : 'No sessions in this range.'}
        />
      </div>
      <p className="text-xs text-ink-muted mt-3">
        Manage this user (rename, merge duplicates, mark inactive) from <Link to="/settings" className="underline">Settings → Users</Link>.
      </p>
    </div>
  );
}
