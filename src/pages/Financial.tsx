import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { Download } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import DataTable, { type Column } from '../components/tables/DataTable';
import Badge from '../components/common/Badge';
import { listUsers } from '../lib/api/users';
import { getSessionsWithCostInRange, monthKey } from '../lib/api/analytics';
import { listInvoiceStatuses, setInvoiceStatus } from '../lib/api/invoices';
import { formatDkk, formatKwh, MONTH_NAMES } from '../lib/format';
import { exportSheetsToExcel } from '../lib/export/excel';
import type { InvoiceStatusValue } from '../lib/types';

interface Row {
  userId: string;
  userName: string;
  year: number;
  month: number;
  sessions: number;
  kwh: number;
  spotCost: number;
  additionalCost: number;
  totalCost: number;
  status: InvoiceStatusValue;
}

const STATUS_TONE: Record<InvoiceStatusValue, 'neutral' | 'warning' | 'good' | 'serious'> = {
  not_invoiced: 'neutral',
  ready: 'warning',
  invoiced: 'serious',
  paid: 'good',
};
const STATUS_LABEL: Record<InvoiceStatusValue, string> = {
  not_invoiced: 'Not invoiced',
  ready: 'Ready for invoicing',
  invoiced: 'Invoiced',
  paid: 'Paid',
};

export default function Financial() {
  const now = DateTime.now().setZone('Europe/Copenhagen');
  const [year, setYear] = useState(now.year);
  const [userFilter, setUserFilter] = useState('all');
  const qc = useQueryClient();

  const { data: users } = useQuery({ queryKey: ['users-active'], queryFn: () => listUsers({ includeInactive: true }) });
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['financial-sessions', year],
    queryFn: () => getSessionsWithCostInRange(DateTime.fromObject({ year }).startOf('year').toUTC().toISO()!, DateTime.fromObject({ year: year + 1 }).startOf('year').toUTC().toISO()!),
  });
  const { data: invoiceStatuses } = useQuery({ queryKey: ['invoice-status', year], queryFn: () => listInvoiceStatuses(year) });

  const userNameById = new Map((users ?? []).map((u) => [u.id, u.name]));
  const statusByKey = new Map((invoiceStatuses ?? []).map((s) => [`${s.user_id}-${s.month}`, s.status]));

  const rows: Row[] = useMemo(() => {
    const map = new Map<string, Row>();
    for (const s of sessions ?? []) {
      const mk = monthKey(s.started_at);
      const [, monthStr] = mk.split('-');
      const key = `${s.user_id}-${mk}`;
      if (!map.has(key)) {
        map.set(key, {
          userId: s.user_id,
          userName: userNameById.get(s.user_id) ?? 'Unknown',
          year,
          month: Number(monthStr),
          sessions: 0,
          kwh: 0,
          spotCost: 0,
          additionalCost: 0,
          totalCost: 0,
          status: statusByKey.get(`${s.user_id}-${Number(monthStr)}`) ?? 'not_invoiced',
        });
      }
      const r = map.get(key)!;
      r.sessions += 1;
      r.kwh += s.energy_kwh;
      r.spotCost += s.cost?.spot_cost_dkk ?? 0;
      r.additionalCost += (s.cost?.grid_cost_dkk ?? 0) + (s.cost?.tax_cost_dkk ?? 0) + (s.cost?.supplier_cost_dkk ?? 0) + (s.cost?.other_cost_dkk ?? 0) + (s.cost?.vat_cost_dkk ?? 0);
      r.totalCost += s.cost?.total_cost_dkk ?? 0;
    }
    let list = Array.from(map.values());
    if (userFilter !== 'all') list = list.filter((r) => r.userId === userFilter);
    return list.sort((a, b) => (a.month - b.month) || a.userName.localeCompare(b.userName));
  }, [sessions, userFilter, userNameById, statusByKey, year]);

  async function updateStatus(row: Row, status: InvoiceStatusValue) {
    await setInvoiceStatus(row.userId, row.year, row.month, status, row.totalCost);
    qc.invalidateQueries({ queryKey: ['invoice-status', year] });
  }

  const columns: Column<Row>[] = [
    { key: 'user', header: 'User', render: (r) => r.userName, sortValue: (r) => r.userName },
    { key: 'month', header: 'Month', render: (r) => MONTH_NAMES[r.month - 1], sortValue: (r) => r.month },
    { key: 'sessions', header: 'Sessions', render: (r) => String(r.sessions), sortValue: (r) => r.sessions, align: 'right' },
    { key: 'kwh', header: 'kWh', render: (r) => formatKwh(r.kwh), sortValue: (r) => r.kwh, align: 'right' },
    { key: 'spot', header: 'Spot Cost', render: (r) => formatDkk(r.spotCost), sortValue: (r) => r.spotCost, align: 'right' },
    { key: 'additional', header: 'Additional Costs', render: (r) => formatDkk(r.additionalCost), sortValue: (r) => r.additionalCost, align: 'right' },
    { key: 'total', header: 'Total Amount', render: (r) => <strong>{formatDkk(r.totalCost)}</strong>, sortValue: (r) => r.totalCost, align: 'right' },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <select
          value={r.status}
          onChange={(e) => updateStatus(r, e.target.value as InvoiceStatusValue)}
          onClick={(e) => e.stopPropagation()}
          className="input w-auto py-1 text-xs"
        >
          {(Object.keys(STATUS_LABEL) as InvoiceStatusValue[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      ),
    },
    { key: 'badge', header: '', render: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
  ];

  const years = Array.from({ length: 8 }, (_, i) => now.year - 5 + i);
  const grandTotal = rows.reduce((s, r) => s + r.totalCost, 0);

  return (
    <div>
      <PageHeader
        title="Financial Overview"
        subtitle="Basis for invoicing users — one row per user per month"
        action={
          <div className="flex gap-2">
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="input w-auto">
              <option value="all">All users</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input w-auto">
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              className="btn-secondary"
              onClick={() =>
                exportSheetsToExcel(
                  [{ name: `Financial ${year}`, rows: rows.map((r) => ({ User: r.userName, Month: MONTH_NAMES[r.month - 1], Sessions: r.sessions, kWh: r.kwh, 'Spot Cost': r.spotCost, 'Additional Costs': r.additionalCost, 'Total Amount': r.totalCost, Status: STATUS_LABEL[r.status] })) }],
                  `financial-overview-${year}.xlsx`
                )
              }
            >
              <Download className="h-4 w-4" /> Export Excel
            </button>
          </div>
        }
      />
      <div className="card p-4 mb-4 text-sm flex justify-between">
        <span>Total across {rows.length} user-months</span>
        <strong>{formatDkk(grandTotal)}</strong>
      </div>
      <div className="card p-5">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => `${r.userId}-${r.month}`}
          searchable={false}
          defaultSortKey="month"
          emptyMessage={isLoading ? 'Loading…' : 'No sessions for this year.'}
        />
      </div>
    </div>
  );
}
