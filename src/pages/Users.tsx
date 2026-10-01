import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import DataTable, { type Column } from '../components/tables/DataTable';
import Badge from '../components/common/Badge';
import { listUsers } from '../lib/api/users';
import { getSessionsWithCostInRange, computeUserTotals } from '../lib/api/analytics';
import { formatDkk, formatKwh, formatPriceDkkKwh } from '../lib/format';
import type { AppUser } from '../lib/types';

interface Row {
  user: AppUser;
  sessions: number;
  kwh: number;
  cost: number;
  avgPrice: number | null;
}

export default function Users() {
  const navigate = useNavigate();
  const [showInactive, setShowInactive] = useState(false);
  const { data: users, isLoading: usersLoading } = useQuery({ queryKey: ['users', showInactive], queryFn: () => listUsers({ includeInactive: showInactive }) });
  const { data: sessions, isLoading: sessionsLoading } = useQuery({ queryKey: ['all-sessions-cost'], queryFn: () => getSessionsWithCostInRange() });

  const rows: Row[] = useMemo(() => {
    const totals = computeUserTotals(sessions ?? []);
    const byId = new Map(totals.map((t) => [t.userId, t]));
    return (users ?? []).map((u) => {
      const t = byId.get(u.id);
      return { user: u, sessions: t?.sessions ?? 0, kwh: t?.kwh ?? 0, cost: t?.cost ?? 0, avgPrice: t?.avgPrice ?? null };
    });
  }, [users, sessions]);

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'User',
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{r.user.name}</span>
          {!r.user.active && <Badge tone="neutral">Inactive</Badge>}
          {r.user.is_demo && <Badge tone="warning">Demo</Badge>}
        </div>
      ),
      sortValue: (r) => r.user.name,
    },
    { key: 'customer', header: 'Customer #', render: (r) => r.user.customer_number ?? '—' },
    { key: 'sessions', header: 'Sessions', render: (r) => String(r.sessions), sortValue: (r) => r.sessions, align: 'right' },
    { key: 'kwh', header: 'Total kWh', render: (r) => formatKwh(r.kwh), sortValue: (r) => r.kwh, align: 'right' },
    { key: 'cost', header: 'Total Cost', render: (r) => formatDkk(r.cost), sortValue: (r) => r.cost, align: 'right' },
    { key: 'avg', header: 'Avg DKK/kWh', render: (r) => formatPriceDkkKwh(r.avgPrice), sortValue: (r) => r.avgPrice ?? 0, align: 'right' },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Everyone who has charged on this charger"
        action={
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        }
      />
      <div className="card p-5">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.user.id}
          searchFn={(r, q) => r.user.name.toLowerCase().includes(q)}
          searchPlaceholder="Search users…"
          defaultSortKey="kwh"
          onRowClick={(r) => navigate(`/users/${r.user.id}`)}
          emptyMessage={usersLoading || sessionsLoading ? 'Loading…' : 'No users yet.'}
        />
      </div>
    </div>
  );
}
