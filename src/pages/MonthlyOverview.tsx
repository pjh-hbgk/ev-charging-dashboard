import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import KpiCard from '../components/kpi/KpiCard';
import DataTable, { type Column } from '../components/tables/DataTable';
import { getSessionsWithCostInRange, computeUserTotals, type UserTotal } from '../lib/api/analytics';
import { listUsers } from '../lib/api/users';
import { formatDkk, formatKwh, formatPriceDkkKwh, MONTH_NAMES } from '../lib/format';
import { exportUserTotalsToCsv } from '../lib/export/csv';
import { Download } from 'lucide-react';
import type { SessionWithCost } from '../lib/types';

export default function MonthlyOverview() {
  const now = DateTime.now().setZone('Europe/Copenhagen');
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const navigate = useNavigate();

  const rangeStart = DateTime.fromObject({ year, month, day: 1 }, { zone: 'Europe/Copenhagen' }).startOf('day');
  const rangeEnd = rangeStart.plus({ months: 1 });

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['monthly-sessions', year, month],
    queryFn: () => getSessionsWithCostInRange(rangeStart.toUTC().toISO()!, rangeEnd.toUTC().toISO()!),
  });
  const { data: users } = useQuery({ queryKey: ['users-active'], queryFn: () => listUsers() });

  const userTotals = useMemo(() => computeUserTotals(sessions ?? []), [sessions]);
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.name]));

  const totalKwh = userTotals.reduce((s, u) => s + u.kwh, 0);
  const totalCost = userTotals.reduce((s, u) => s + u.cost, 0);
  const avgPrice = totalKwh > 0 ? totalCost / totalKwh : null;
  const topUser = [...userTotals].sort((a, b) => b.kwh - a.kwh)[0];
  const mostExpensiveSession = (sessions ?? []).reduce<SessionWithCost | undefined>(
    (max, s) => ((s.cost?.total_cost_dkk ?? 0) > (max?.cost?.total_cost_dkk ?? -1) ? s : max),
    undefined
  );

  const years = Array.from({ length: 8 }, (_, i) => now.year - 5 + i);

  const columns: Column<UserTotal>[] = [
    { key: 'user', header: 'User', render: (r) => userNameById.get(r.userId) ?? 'Unknown', sortValue: (r) => userNameById.get(r.userId) ?? '' },
    { key: 'sessions', header: 'Sessions', render: (r) => String(r.sessions), sortValue: (r) => r.sessions, align: 'right' },
    { key: 'kwh', header: 'kWh', render: (r) => formatKwh(r.kwh), sortValue: (r) => r.kwh, align: 'right' },
    { key: 'cost', header: 'Total Cost', render: (r) => formatDkk(r.cost), sortValue: (r) => r.cost, align: 'right' },
    { key: 'avg', header: 'Avg DKK/kWh', render: (r) => formatPriceDkkKwh(r.avgPrice), sortValue: (r) => r.avgPrice ?? 0, align: 'right' },
  ];

  return (
    <div>
      <PageHeader
        title="Monthly Overview"
        subtitle="One row per user for the selected month"
        action={
          <div className="flex gap-2">
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input w-auto">
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input w-auto">
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              className="btn-secondary"
              onClick={() => exportUserTotalsToCsv(userTotals, userNameById, `monthly-overview-${year}-${String(month).padStart(2, '0')}.csv`)}
            >
              <Download className="h-4 w-4" /> Export
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total consumption" value={formatKwh(totalKwh)} />
        <KpiCard label="Total cost" value={formatDkk(totalCost)} />
        <KpiCard label="Average price" value={formatPriceDkkKwh(avgPrice)} />
        <KpiCard label="Highest-consuming user" value={topUser ? userNameById.get(topUser.userId) ?? '—' : '—'} sublabel={topUser ? formatKwh(topUser.kwh) : undefined} />
      </div>

      {mostExpensiveSession && (
        <div className="card p-4 mb-6 text-sm flex items-center justify-between">
          <span>
            Most expensive session: <strong>{userNameById.get(mostExpensiveSession.user_id) ?? 'Unknown'}</strong> —{' '}
            {formatDkk(mostExpensiveSession.cost?.total_cost_dkk)}
          </span>
          <Link to={`/sessions/${mostExpensiveSession.id}`} className="text-series-1 underline">View session</Link>
        </div>
      )}

      <div className="card p-5">
        <DataTable
          columns={columns}
          rows={userTotals}
          rowKey={(r) => r.userId}
          searchable={false}
          onRowClick={(r) => navigate(`/users/${r.userId}?year=${year}&month=${month}`)}
          emptyMessage={isLoading ? 'Loading…' : 'No sessions for this month.'}
        />
      </div>
    </div>
  );
}
