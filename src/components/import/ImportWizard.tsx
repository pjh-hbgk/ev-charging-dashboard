import { useState } from 'react';
import { UploadCloud, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { parseWorkbookFile } from '../../lib/import/excelParser';
import { buildImportPreview, type ImportPreview } from '../../lib/import/buildPreview';
import { getExistingDedupKeys } from '../../lib/api/sessions';
import { runImport } from '../../lib/import/runImport';
import { refreshElectricityPrices } from '../../lib/priceService';
import { recalculateAllCosts } from '../../lib/cost/recalculate';
import { getAppSettings } from '../../lib/api/settings';
import { QualityFlagBadge } from '../common/Badge';
import { formatDanish } from '../../lib/timezone';
import { formatKwh } from '../../lib/format';
import Badge from '../common/Badge';

type Stage = 'idle' | 'parsing' | 'preview' | 'importing' | 'done' | 'error';

export default function ImportWizard({ onImported }: { onImported: () => void }) {
  const [stage, setStage] = useState<Stage>('idle');
  const [filename, setFilename] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState('');
  const [resultSummary, setResultSummary] = useState<{ sessionsCreated: number; pricesFetched: number; missingPrices: number } | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  async function handleFile(file: File) {
    setStage('parsing');
    setError(null);
    setFilename(file.name);
    try {
      const parsed = await parseWorkbookFile(file);
      const existingKeys = await getExistingDedupKeys();
      const p = buildImportPreview(parsed, existingKeys);
      setPreview(p);
      setStage('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('error');
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setStage('importing');
    try {
      setProgressLabel('Creating users/chargers and inserting sessions…');
      const result = await runImport(preview, filename, isDemo);

      let pricesFetched = 0;
      if (preview.summary.dateFrom && preview.summary.dateTo) {
        setProgressLabel('Fetching electricity prices for this period…');
        const settings = await getAppSettings();
        const from = new Date(preview.summary.dateFrom);
        from.setDate(from.getDate() - 1);
        const to = new Date(preview.summary.dateTo);
        to.setDate(to.getDate() + 2);
        try {
          const priceResult = await refreshElectricityPrices(from.toISOString(), to.toISOString(), settings.price_area);
          pricesFetched = priceResult.fetched;
        } catch {
          // price fetch failures don't block the import — sessions will just be flagged price_missing
        }
      }

      setProgressLabel('Calculating electricity costs…');
      const calc = await recalculateAllCosts((p) => setProgressLabel(`Calculating electricity costs… (${p.processed}/${p.total})`));

      setResultSummary({ sessionsCreated: result.sessionsCreated, pricesFetched, missingPrices: calc.sessionsPriceMissing });
      setStage('done');
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('error');
    }
  }

  function reset() {
    setStage('idle');
    setPreview(null);
    setError(null);
    setResultSummary(null);
  }

  if (stage === 'idle') {
    return (
      <div className="card p-8 border-dashed border-2 border-line-hair dark:border-line-dhair text-center">
        <UploadCloud className="h-8 w-8 mx-auto text-ink-muted mb-3" />
        <p className="text-sm mb-1">Drop an Excel export here, or</p>
        <label className="btn-primary inline-flex cursor-pointer mt-2">
          Choose file
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </label>
        <label className="flex items-center justify-center gap-2 text-xs text-ink-muted mt-4">
          <input type="checkbox" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} />
          Import as demo data
        </label>
      </div>
    );
  }

  if (stage === 'parsing') return <div className="card p-8 text-center text-sm text-ink-muted">Reading {filename}…</div>;

  if (stage === 'error') {
    return (
      <div className="card p-6">
        <p className="text-sm text-status-critical mb-3">{error}</p>
        <button className="btn-secondary" onClick={reset}>Try another file</button>
      </div>
    );
  }

  if (stage === 'importing') {
    return <div className="card p-8 text-center text-sm text-ink-muted">{progressLabel || 'Importing…'}</div>;
  }

  if (stage === 'done' && resultSummary) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-5 w-5 text-status-good" />
          <h3 className="text-sm font-semibold">Import complete</h3>
        </div>
        <ul className="text-sm space-y-1 text-ink-secondary dark:text-ink-dsecondary">
          <li>{resultSummary.sessionsCreated} new sessions imported from {filename}</li>
          <li>{resultSummary.pricesFetched} electricity price intervals fetched/cached</li>
          {resultSummary.missingPrices > 0 && (
            <li className="text-status-serious">{resultSummary.missingPrices} sessions still have missing prices — see Data Quality on the Dashboard, or retry from Electricity Prices.</li>
          )}
        </ul>
        <button className="btn-primary mt-4" onClick={reset}>Import another file</button>
      </div>
    );
  }

  if (stage === 'preview' && preview) {
    const s = preview.summary;
    return (
      <div className="card p-6">
        <h3 className="text-sm font-semibold mb-1">Import preview — {filename}</h3>
        <p className="text-xs text-ink-muted mb-4">Sheet "{preview.sheetName}" · Review before confirming. Nothing is saved yet.</p>

        {preview.missingRequiredFields.length > 0 && (
          <div className="mb-4 flex items-center gap-2 text-sm text-status-critical">
            <AlertTriangle className="h-4 w-4" /> Could not detect required column(s): {preview.missingRequiredFields.join(', ')}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <SummaryStat label="Sessions found" value={String(preview.totalRowsFound)} />
          <SummaryStat label="Date range" value={s.dateFrom ? `${formatDanish(s.dateFrom, 'date')} – ${formatDanish(s.dateTo!, 'date')}` : '—'} />
          <SummaryStat label="Users" value={String(s.userCount)} />
          <SummaryStat label="Total kWh (new)" value={formatKwh(s.totalKwh)} />
          <SummaryStat label="New / Dup / Error / Review" value={`${s.newCount} / ${s.duplicateCount} / ${s.errorCount} / ${s.reviewCount}`} />
        </div>

        <div className="mb-4 text-xs">
          <span className="text-ink-muted">Column mapping detected: </span>
          {Object.values(preview.columnMapping).map((c) => (
            <Badge key={c.header} tone="neutral" className="mr-1 mb-1">{c.header} → {c.field}</Badge>
          ))}
        </div>

        <div className="max-h-80 overflow-y-auto border border-line-hair dark:border-line-dhair rounded-lg mb-4">
          <table className="table-base w-full">
            <thead className="sticky top-0 bg-surface dark:bg-surface-dark">
              <tr>
                <th>Row</th><th>User</th><th>Start</th><th>kWh</th><th>Status</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.rowNumber}>
                  <td>{r.rowNumber}</td>
                  <td>{r.userRaw ?? <span className="text-status-critical">missing</span>}</td>
                  <td>{r.startedAtISO ? formatDanish(r.startedAtISO) : <span className="text-status-critical">invalid</span>}</td>
                  <td>{r.energyKwh ?? '—'}</td>
                  <td>
                    <Badge tone={r.status === 'error' ? 'critical' : r.isDuplicateInDb || r.isDuplicateInFile ? 'neutral' : r.status === 'review' ? 'warning' : 'good'}>
                      {r.isDuplicateInDb || r.isDuplicateInFile ? 'Duplicate' : r.status === 'error' ? 'Error' : r.status === 'review' ? 'Review' : 'New'}
                    </Badge>
                  </td>
                  <td>{r.flags.map((f) => <QualityFlagBadge key={f} flag={f} />)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2">
          <button className="btn-secondary" onClick={reset}>Cancel</button>
          <button className="btn-primary" disabled={s.newCount === 0 || preview.missingRequiredFields.length > 0} onClick={confirmImport}>
            Confirm import ({s.newCount} new session{s.newCount === 1 ? '' : 's'})
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] p-3">
      <div className="text-xs text-ink-muted mb-1">{label}</div>
      <div className="text-sm font-semibold tabular">{value}</div>
    </div>
  );
}
