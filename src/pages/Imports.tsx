import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, DatabaseBackup, PlayCircle, Trash2, Eye } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import ImportWizard from '../components/import/ImportWizard';
import Badge from '../components/common/Badge';
import ConfirmDialog from '../components/common/ConfirmDialog';
import DataTable, { type Column } from '../components/tables/DataTable';
import { listImports, deleteImport, getImportRecords } from '../lib/api/imports';
import { formatDanish } from '../lib/timezone';
import { formatKwh } from '../lib/format';
import { recalculateAllCosts } from '../lib/cost/recalculate';
import { refreshElectricityPrices } from '../lib/priceService';
import { getAppSettings } from '../lib/api/settings';
import { loadDemoData } from '../lib/demo/loadDemoData';
import { deleteAllDemoData } from '../lib/demo/deleteDemoData';
import { exportSheetsToExcel } from '../lib/export/excel';
import { getSessionsWithCostInRange } from '../lib/api/analytics';
import { listUsers } from '../lib/api/users';
import type { ImportBatch, ImportRecord } from '../lib/types';

export default function Imports() {
  const qc = useQueryClient();
  const { data: imports } = useQuery({ queryKey: ['imports'], queryFn: listImports });
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [confirmDeleteImport, setConfirmDeleteImport] = useState<ImportBatch | null>(null);
  const [confirmDeleteDemo, setConfirmDeleteDemo] = useState(false);
  const [viewingImport, setViewingImport] = useState<ImportBatch | null>(null);
  const [importRecords, setImportRecords] = useState<ImportRecord[]>([]);

  function refreshAll() {
    qc.invalidateQueries();
  }

  async function handleRecalculate() {
    setBusyLabel('Recalculating electricity costs…');
    try {
      const result = await recalculateAllCosts((p) => setBusyLabel(`Recalculating… (${p.processed}/${p.total})`));
      alert(`Recalculated ${result.sessionsProcessed} sessions. ${result.sessionsPriceMissing} still missing prices.`);
      refreshAll();
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleRefreshPrices() {
    setBusyLabel('Refreshing electricity prices…');
    try {
      const settings = await getAppSettings();
      const now = new Date();
      const from = new Date(now.getFullYear(), 0, 1);
      const result = await refreshElectricityPrices(from.toISOString(), now.toISOString(), settings.price_area);
      alert(`Fetched ${result.fetched} price intervals for ${result.priceArea}.`);
      refreshAll();
    } catch (e) {
      alert(`Failed to refresh prices: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleLoadDemoData() {
    setBusyLabel('Loading demo data…');
    try {
      const result = await loadDemoData((label) => setBusyLabel(label));
      alert(`Loaded ${result.sessionsCreated} demo sessions.`);
      refreshAll();
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleDeleteDemoData() {
    setBusyLabel('Deleting demo data…');
    try {
      await deleteAllDemoData();
      setConfirmDeleteDemo(false);
      refreshAll();
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleExportBackup() {
    setBusyLabel('Building backup export…');
    try {
      const [sessions, users] = await Promise.all([getSessionsWithCostInRange(), listUsers({ includeInactive: true })]);
      const userNameById = new Map(users.map((u) => [u.id, u.name]));
      exportSheetsToExcel(
        [
          {
            name: 'Sessions',
            rows: sessions.map((s) => ({
              User: userNameById.get(s.user_id) ?? 'Unknown',
              Started: formatDanish(s.started_at),
              Ended: formatDanish(s.ended_at),
              kWh: s.energy_kwh,
              SpotCost: s.cost?.spot_cost_dkk ?? '',
              TotalCost: s.cost?.total_cost_dkk ?? '',
              Flags: s.data_quality_flags.join(', '),
              Demo: s.is_demo,
            })),
          },
          { name: 'Users', rows: users.map((u) => ({ Name: u.name, CustomerNumber: u.customer_number, Active: u.active, Demo: u.is_demo })) },
        ],
        `ev-dashboard-backup-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleDeleteImport(imp: ImportBatch) {
    setBusyLabel('Deleting import…');
    try {
      await deleteImport(imp.id);
      setConfirmDeleteImport(null);
      refreshAll();
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleViewRecords(imp: ImportBatch) {
    setViewingImport(imp);
    const records = await getImportRecords(imp.id);
    setImportRecords(records);
  }

  const columns: Column<ImportBatch>[] = [
    { key: 'date', header: 'Upload date', render: (r) => formatDanish(r.imported_at), sortValue: (r) => r.imported_at },
    { key: 'filename', header: 'Filename', render: (r) => <span className="flex items-center gap-2">{r.filename}{r.is_demo && <Badge tone="warning">Demo</Badge>}</span> },
    { key: 'period', header: 'Period', render: (r) => (r.date_from ? `${r.date_from} → ${r.date_to}` : '—') },
    { key: 'new', header: 'Imported', render: (r) => String(r.records_new), align: 'right' },
    { key: 'dup', header: 'Duplicates', render: (r) => String(r.records_duplicate), align: 'right' },
    { key: 'kwh', header: 'kWh', render: (r) => formatKwh(r.total_kwh_imported), align: 'right' },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex gap-2 justify-end">
          <button className="text-ink-muted hover:text-ink-primary" onClick={() => handleViewRecords(r)} title="View records"><Eye className="h-4 w-4" /></button>
          <button className="text-status-critical" onClick={() => setConfirmDeleteImport(r)} title="Delete import"><Trash2 className="h-4 w-4" /></button>
        </div>
      ),
      align: 'right',
    },
  ];

  return (
    <div>
      <PageHeader title="Data Management" subtitle="Import new files, manage price cache, and keep the dataset clean" />

      {busyLabel && <div className="card p-3 mb-4 text-sm text-series-1">{busyLabel}</div>}

      <h2 className="text-sm font-semibold mb-3">Upload Excel file</h2>
      <div className="mb-8"><ImportWizard onImported={refreshAll} /></div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <ActionButton icon={RefreshCw} label="Recalculate Costs" onClick={handleRecalculate} />
        <ActionButton icon={RefreshCw} label="Refresh Electricity Prices" onClick={handleRefreshPrices} />
        <ActionButton icon={DatabaseBackup} label="Export Backup" onClick={handleExportBackup} />
        <ActionButton icon={PlayCircle} label="Load Demo Data" onClick={handleLoadDemoData} />
      </div>

      <h2 className="text-sm font-semibold mb-3">Import history</h2>
      <div className="card p-5 mb-8">
        <DataTable columns={columns} rows={imports ?? []} rowKey={(r) => r.id} searchable={false} defaultSortKey="date" emptyMessage="No imports yet." />
      </div>

      {viewingImport && (
        <div className="card p-5 mb-8">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold">Records for {viewingImport.filename}</h3>
            <button className="text-xs text-ink-muted" onClick={() => setViewingImport(null)}>Close</button>
          </div>
          <table className="table-base w-full">
            <thead><tr><th>Row</th><th>Status</th><th>Data</th><th>Message</th></tr></thead>
            <tbody>
              {importRecords.map((r) => (
                <tr key={r.id}>
                  <td>{r.row_number}</td>
                  <td><Badge tone={r.status === 'error' ? 'critical' : r.status === 'duplicate' ? 'neutral' : r.status === 'review' ? 'warning' : 'good'}>{r.status}</Badge></td>
                  <td className="text-xs">{JSON.stringify(r.raw_data)}</td>
                  <td className="text-xs">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card p-5 border-status-critical/30">
        <h2 className="text-sm font-semibold text-status-critical mb-1">Danger zone</h2>
        <p className="text-xs text-ink-muted mb-3">Permanently remove all demo charging sessions, demo import batches, and demo-only users. Real imported data is never affected.</p>
        <button className="btn-danger" onClick={() => setConfirmDeleteDemo(true)}>Delete All Demo Data</button>
      </div>

      <ConfirmDialog
        open={!!confirmDeleteImport}
        title="Delete import?"
        message={<>This removes <strong>{confirmDeleteImport?.records_new}</strong> sessions imported from "{confirmDeleteImport?.filename}" and their calculated costs. This cannot be undone.</>}
        confirmLabel="Delete import"
        danger
        onConfirm={() => confirmDeleteImport && handleDeleteImport(confirmDeleteImport)}
        onCancel={() => setConfirmDeleteImport(null)}
        busy={!!busyLabel}
      />
      <ConfirmDialog
        open={confirmDeleteDemo}
        title="Delete all demo data?"
        message="This permanently deletes every demo charging session, the demo import batch, and any users/chargers that exist only for demo purposes. Real data you've imported is not affected."
        confirmLabel="Delete demo data"
        danger
        requireTypedConfirmation="DELETE DEMO DATA"
        onConfirm={handleDeleteDemoData}
        onCancel={() => setConfirmDeleteDemo(false)}
        busy={!!busyLabel}
      />
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: typeof RefreshCw; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card p-4 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03] flex items-center gap-3">
      <Icon className="h-4 w-4 text-series-1 shrink-0" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
