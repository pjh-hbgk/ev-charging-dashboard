import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import ChartCard from '../components/charts/ChartCard';
import SimpleBarChart from '../components/charts/SimpleBarChart';
import { getSessionsWithCostInRange, computeUserTotals } from '../lib/api/analytics';
import { listUsers } from '../lib/api/users';
import { formatDkk, formatKwh, formatPercent } from '../lib/format';
import { seriesColor } from '../components/charts/palette';

export default function UserComparison() {
  const { data: sessions, isLoading } = useQuery({ queryKey: ['all-sessions-cost'], queryFn: () => getSessionsWithCostInRange() });
  const { data: users } = useQuery({ queryKey: ['users-active'], queryFn: () => listUsers({ includeInactive: true }) });

  const totals = useMemo(() => computeUserTotals(sessions ?? []), [sessions]);
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.name]));
  const totalKwh = totals.reduce((s, u) => s + u.kwh, 0);
  const totalCost = totals.reduce((s, u) => s + u.cost, 0);

  const kwhData = totals.map((u) => ({ user: userNameById.get(u.userId) ?? 'Unknown', kWh: Math.round(u.kwh * 10) / 10 }));
  const costData = totals.map((u) => ({ user: userNameById.get(u.userId) ?? 'Unknown', Cost: Math.round(u.cost * 100) / 100 }));

  return (
    <div>
      <PageHeader title="User Comparison" subtitle="Total annual consumption and cost, side by side" />

      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        <ChartCard title="Total consumption" subtitle="All-time kWh per user">
          <SimpleBarChart data={kwhData} xKey="user" series={[{ key: 'kWh', label: 'kWh' }]} valueFormatter={(v) => `${v}`} />
        </ChartCard>
        <ChartCard title="Total charging cost" subtitle="All-time DKK per user">
          <SimpleBarChart data={costData} xKey="user" series={[{ key: 'Cost', label: 'Cost (DKK)' }]} valueFormatter={(v) => formatDkk(v, { decimals: 0 })} />
        </ChartCard>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold mb-4">Share of total charger use</h3>
        <div className="space-y-3">
          {totals.map((u, i) => {
            const share = totalKwh > 0 ? (u.kwh / totalKwh) * 100 : 0;
            return (
              <div key={u.userId}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{userNameById.get(u.userId) ?? 'Unknown'}</span>
                  <span className="text-ink-muted tabular">{formatKwh(u.kwh)} · {formatPercent(share)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: seriesColor(i) }} />
                </div>
              </div>
            );
          })}
          {totals.length === 0 && <p className="text-sm text-ink-muted">{isLoading ? 'Loading…' : 'No data yet.'}</p>}
        </div>
        {totalKwh > 0 && (
          <p className="text-xs text-ink-muted mt-4">Total across all users: {formatKwh(totalKwh)} · {formatDkk(totalCost)}</p>
        )}
      </div>
    </div>
  );
}
