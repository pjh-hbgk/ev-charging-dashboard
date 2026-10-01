import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import KpiCard from '../components/kpi/KpiCard';
import { QualityFlagBadge } from '../components/common/Badge';
import { getSessionWithCost, getSessionCostBreakdown } from '../lib/api/sessions';
import { getUser } from '../lib/api/users';
import { formatDkk, formatKwh, formatPriceDkkKwh, formatDuration } from '../lib/format';
import { formatDanish } from '../lib/timezone';

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: session, isLoading } = useQuery({ queryKey: ['session', id], queryFn: () => getSessionWithCost(id!), enabled: !!id });
  const { data: user } = useQuery({ queryKey: ['user', session?.user_id], queryFn: () => getUser(session!.user_id), enabled: !!session });
  const { data: breakdown } = useQuery({
    queryKey: ['session-breakdown', id, session?.cost?.calculation_version],
    queryFn: () => getSessionCostBreakdown(id!, session!.cost!.calculation_version),
    enabled: !!session?.cost,
  });

  if (isLoading || !session) return <div className="text-sm text-ink-muted">Loading session…</div>;

  const cost = session.cost;

  return (
    <div>
      <button onClick={() => navigate(-1)} className="text-sm text-ink-muted flex items-center gap-1 mb-3 hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <PageHeader
        title="Charging Session"
        subtitle={`${user?.name ?? 'Unknown user'} · ${formatDanish(session.started_at)} → ${formatDanish(session.ended_at, 'time')}`}
      />

      {(session.data_quality_flags.length > 0 || cost?.price_missing) && (
        <div className="mb-4">
          {session.data_quality_flags.map((f) => <QualityFlagBadge key={f} flag={f} />)}
          {cost?.price_missing && <QualityFlagBadge flag="price_missing" />}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Duration" value={formatDuration(session.duration_minutes)} />
        <KpiCard label="Total kWh" value={formatKwh(session.energy_kwh)} />
        <KpiCard label="Avg DKK/kWh" value={formatPriceDkkKwh(cost?.avg_price_dkk_kwh ?? null)} />
        <KpiCard label="Total cost" value={formatDkk(cost?.total_cost_dkk)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-3">Session details</h3>
          <dl className="text-sm space-y-2">
            <Row label="User" value={user?.name ?? '—'} />
            <Row label="Session ID" value={session.id} mono />
            <Row label="Charging start" value={formatDanish(session.started_at)} />
            <Row label="Charging end" value={formatDanish(session.ended_at)} />
            <Row label="Energy source" value={session.energy_source === 'interval_actual' ? 'Actual interval readings' : 'Session total (proportionally allocated)'} />
          </dl>
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-3">Cost breakdown</h3>
          <dl className="text-sm space-y-2">
            <Row label="Spot electricity cost" value={formatDkk(cost?.spot_cost_dkk)} />
            <Row label="Grid tariff" value={formatDkk(cost?.grid_cost_dkk)} />
            <Row label="Electricity tax" value={formatDkk(cost?.tax_cost_dkk)} />
            <Row label="Supplier surcharge (OK)" value={formatDkk(cost?.supplier_cost_dkk)} />
            <Row label="Other" value={formatDkk(cost?.other_cost_dkk)} />
            <Row label="VAT" value={formatDkk(cost?.vat_cost_dkk)} />
            <div className="border-t border-line-hair dark:border-line-dhair pt-2 mt-2">
              <Row label="Total calculated cost" value={formatDkk(cost?.total_cost_dkk)} bold />
            </div>
            <p className="text-xs text-ink-muted pt-1">
              Cost model: {cost?.cost_model ?? '—'} · Calculation v{cost?.calculation_version ?? '—'} · {cost ? formatDanish(cost.calculated_at) : ''}
            </p>
          </dl>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold mb-1">Detailed cost breakdown (auditable)</h3>
        <p className="text-xs text-ink-muted mb-3">
          The session is split across every electricity-price interval it overlaps. Energy is allocated proportionally to time spent
          in each interval{session.energy_source === 'interval_actual' ? '' : ' — this is an ESTIMATE based on session duration, since only a session total kWh was available'}.
        </p>
        <table className="table-base w-full">
          <thead>
            <tr>
              <th>Time interval</th>
              <th className="text-right">Allocated kWh</th>
              <th className="text-right">DK2 spot price</th>
              <th className="text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {(breakdown ?? []).map((row) => (
              <tr key={row.id}>
                <td>{formatDanish(row.interval_start, 'time')} – {formatDanish(row.interval_end, 'time')}</td>
                <td className="text-right">{formatKwh(row.allocated_kwh, 3)}</td>
                <td className="text-right">{row.price_missing ? <QualityFlagBadge flag="price_missing" /> : formatPriceDkkKwh(row.spot_price_dkk_kwh)}</td>
                <td className="text-right">{row.price_missing ? '—' : formatDkk(row.spot_cost_dkk)}</td>
              </tr>
            ))}
            {(!breakdown || breakdown.length === 0) && (
              <tr><td colSpan={4} className="text-center py-6 text-ink-muted">No cost breakdown available — run Recalculate on the Data Management page.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`text-right ${mono ? 'font-mono text-xs' : ''} ${bold ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
  );
}
