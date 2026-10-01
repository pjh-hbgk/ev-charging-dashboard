import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import DataTable, { type Column } from '../components/tables/DataTable';
import { QualityFlagBadge } from '../components/common/Badge';
import { getSessionsWithCostInRange } from '../lib/api/analytics';
import { listUsers } from '../lib/api/users';
import { formatDkk, formatKwh, formatPriceDkkKwh, formatDuration } from '../lib/format';
import { formatDanish } from '../lib/timezone';
import { exportSessionsToCsv } from '../lib/export/csv';
import type { SessionWithCost } from '../lib/types';

export default function ChargingSessions() {
  const navigate = useNavigate();
  const [userFilter, setUserFilter] = useState('all');
  const { data: sessions, isLoading } = useQuery({ queryKey: ['all-sessions-cost'], queryFn: () => getSessionsWithCostInRange() });
  const { data: users } = useQuery({ queryKey: ['users-active'], queryFn: () => listUsers({ includeInactive: true }) });

  const userNameById = new Map((users ?? []).map((u) => [u.id, u.name]));
  const filtered = useMemo(() => (sessions ?? []).filter((s) => userFilter === 'all' || s.user_id === userFilter), [sessions, userFilter]);

  const columns: Column<SessionWithCost>[] = [
    { key: 'user', header: 'User', render: (r) => userNameById.get(r.user_id) ?? 'Unknown', sortValue: (r) => userNameById.get(r.user_id) ?? '' },
    { key: 'date', header: 'Date', render: (r) => formatDanish(r.started_at, 'date'), sortValue: (r) => r.started_at },
    { key: 'start', header: 'Start', render: (r) => formatDanish(r.started_at, 'time') },
    { key: 'end', header: 'End', render: (r) => formatDanish(r.ended_at, 'time') },
    { key: 'duration', header: 'Duration', render: (r) => formatDuration(r.duration_minutes), sortValue: (r) => r.duration_minutes, align: 'right' },
    { key: 'kwh', header: 'kWh', render: (r) => formatKwh(r.energy_kwh), sortValue: (r) => r.energy_kwh, align: 'right' },
    { key: 'avgprice', header: 'Avg Price', render: (r) => formatPriceDkkKwh(r.cost?.avg_price_dkk_kwh ?? null), align: 'right' },
    { key: 'total', header: 'Total Cost', render: (r) => formatDkk(r.cost?.total_cost_dkk), sortValue: (r) => r.cost?.total_cost_dkk ?? 0, align: 'right' },
    {
      key: 'flags',
      header: 'Flags',
      render: (r) => (
        <>
          {r.data_quality_flags.map((f) => <QualityFlagBadge key={f} flag={f} />)}
          {r.cost?.price_missing && <QualityFlagBadge flag="price_missing" />}
        </>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Charging Sessions"
        subtitle={`${filtered.length} sessions`}
        action={
          <div className="flex gap-2">
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="input w-auto">
              <option value="all">All users</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <button className="btn-secondary" onClick={() => exportSessionsToCsv(filtered, userNameById, 'charging-sessions.csv')}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        }
      />
      <div className="card p-5">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          searchFn={(r, q) => (userNameById.get(r.user_id) ?? '').toLowerCase().includes(q)}
          searchPlaceholder="Search by user…"
          defaultSortKey="date"
          onRowClick={(r) => navigate(`/sessions/${r.id}`)}
          emptyMessage={isLoading ? 'Loading…' : 'No charging sessions yet.'}
        />
      </div>
    </div>
  );
}
