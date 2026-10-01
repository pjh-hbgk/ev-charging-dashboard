import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import clsx from 'clsx';
import { getAppSettings, saveAppSettings, listCostComponents, upsertCostComponent, deleteCostComponent, DEFAULT_COST_COMPONENTS } from '../lib/api/settings';
import { listUsers, updateUser, mergeUsers } from '../lib/api/users';
import { recalculateAllCosts } from '../lib/cost/recalculate';
import type { AppSettingsValue, ComponentType, CostComponent, CostModel } from '../lib/types';
import { Plus, Trash2 } from 'lucide-react';

const TABS = ['Electricity', 'Cost Components', 'Dashboard', 'Users'] as const;

export default function Settings() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Electricity');
  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure electricity pricing, cost components, and users" />
      <div className="flex gap-1 mb-6 border-b border-line-hair dark:border-line-dhair">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px', tab === t ? 'border-series-1 text-series-1' : 'border-transparent text-ink-muted hover:text-ink-primary')}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Electricity' && <ElectricityTab />}
      {tab === 'Cost Components' && <CostComponentsTab />}
      {tab === 'Dashboard' && <DashboardTab />}
      {tab === 'Users' && <UsersTab />}
    </div>
  );
}

function ElectricityTab() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getAppSettings });
  const [form, setForm] = useState<AppSettingsValue | null>(null);
  const active = form ?? settings;
  if (!active) return null;

  async function save() {
    await saveAppSettings(active!);
    qc.invalidateQueries({ queryKey: ['settings'] });
    alert('Saved. Run "Recalculate Costs" from Data Management to apply to existing sessions.');
  }

  return (
    <div className="card p-6 max-w-xl space-y-4">
      <Field label="Price area">
        <select className="input" value={active.price_area} onChange={(e) => setForm({ ...active, price_area: e.target.value })}>
          <option value="DK1">DK1 — West Denmark</option>
          <option value="DK2">DK2 — East Denmark</option>
        </select>
      </Field>
      <Field label="Electricity price source">
        <select className="input" value={active.price_source} onChange={(e) => setForm({ ...active, price_source: e.target.value as AppSettingsValue['price_source'] })}>
          <option value="energidataservice">Energi Data Service (official, recommended)</option>
          <option value="manual">Manual entry</option>
          <option value="mock">Mock (testing only)</option>
        </select>
      </Field>
      <Field label="VAT rate (%)">
        <input type="number" step="0.1" className="input" value={active.vat_rate_percent} onChange={(e) => setForm({ ...active, vat_rate_percent: Number(e.target.value) })} />
      </Field>
      <Field label="Default cost model">
        <select className="input" value={active.default_cost_model} onChange={(e) => setForm({ ...active, default_cost_model: e.target.value as CostModel })}>
          <option value="A_spot">Model A — Spot price only</option>
          <option value="B_spot_vat">Model B — Spot price + VAT</option>
          <option value="C_full">Model C — Full estimated cost (spot + tariffs + tax + surcharge + VAT)</option>
        </select>
      </Field>
      <button className="btn-primary" onClick={save}>Save electricity settings</button>
    </div>
  );
}

function DashboardTab() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getAppSettings });
  const [form, setForm] = useState<AppSettingsValue | null>(null);
  const active = form ?? settings;
  if (!active) return null;

  async function save() {
    await saveAppSettings(active!);
    qc.invalidateQueries({ queryKey: ['settings'] });
  }

  return (
    <div className="card p-6 max-w-xl space-y-4">
      <Field label="Currency"><input className="input" value={active.currency} disabled /></Field>
      <Field label="Date format">
        <select className="input" value={active.date_format} onChange={(e) => setForm({ ...active, date_format: e.target.value })}>
          <option value="dd-MM-yyyy">DD-MM-YYYY</option>
          <option value="yyyy-MM-dd">YYYY-MM-DD</option>
        </select>
      </Field>
      <Field label="Time zone"><input className="input" value={active.timezone} disabled /></Field>
      <button className="btn-primary" onClick={save}>Save dashboard settings</button>
    </div>
  );
}

function CostComponentsTab() {
  const qc = useQueryClient();
  const { data: components } = useQuery({ queryKey: ['cost-components'], queryFn: listCostComponents });
  const [busy, setBusy] = useState(false);

  async function seedDefaults() {
    for (const c of DEFAULT_COST_COMPONENTS) await upsertCostComponent(c);
    qc.invalidateQueries({ queryKey: ['cost-components'] });
  }

  async function save(c: CostComponent) {
    await upsertCostComponent(c);
    qc.invalidateQueries({ queryKey: ['cost-components'] });
  }

  async function recalc() {
    setBusy(true);
    try {
      const result = await recalculateAllCosts();
      alert(`Recalculated ${result.sessionsProcessed} sessions.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-ink-muted">Used by Model C (full estimated cost). Model B applies VAT only; Model A ignores these entirely.</p>
        <div className="flex gap-2">
          {(!components || components.length === 0) && <button className="btn-secondary" onClick={seedDefaults}><Plus className="h-4 w-4" />Add defaults</button>}
          <button className="btn-primary" onClick={recalc} disabled={busy}>{busy ? 'Recalculating…' : 'Recalculate Costs'}</button>
        </div>
      </div>
      <div className="space-y-3">
        {(components ?? []).map((c) => <ComponentRow key={c.id} component={c} onSave={save} onDelete={async (id) => { await deleteCostComponent(id); qc.invalidateQueries({ queryKey: ['cost-components'] }); }} />)}
      </div>
    </div>
  );
}

function ComponentRow({ component, onSave, onDelete }: { component: CostComponent; onSave: (c: CostComponent) => void; onDelete: (id: string) => void }) {
  const [local, setLocal] = useState(component);
  return (
    <div className="card p-4 grid sm:grid-cols-6 gap-3 items-end">
      <div className="sm:col-span-2">
        <label className="label mb-1 block">Label</label>
        <input className="input" value={local.label} onChange={(e) => setLocal({ ...local, label: e.target.value })} />
      </div>
      <div>
        <label className="label mb-1 block">Type</label>
        <select className="input" value={local.component_type} onChange={(e) => setLocal({ ...local, component_type: e.target.value as ComponentType })}>
          <option value="fixed_dkk_kwh">Fixed DKK/kWh</option>
          <option value="percentage">Percentage of spot</option>
          <option value="time_dependent">Time dependent</option>
        </select>
      </div>
      {local.component_type === 'fixed_dkk_kwh' && (
        <div>
          <label className="label mb-1 block">DKK/kWh</label>
          <input type="number" step="0.001" className="input" value={local.value_dkk_kwh ?? 0} onChange={(e) => setLocal({ ...local, value_dkk_kwh: Number(e.target.value) })} />
        </div>
      )}
      {local.component_type === 'percentage' && (
        <div>
          <label className="label mb-1 block">Percentage</label>
          <input type="number" step="0.1" className="input" value={local.percentage ?? 0} onChange={(e) => setLocal({ ...local, percentage: Number(e.target.value) })} />
        </div>
      )}
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={local.enabled} onChange={(e) => setLocal({ ...local, enabled: e.target.checked })} />
        <label className="text-sm">Enabled</label>
      </div>
      <div className="flex gap-2 justify-end">
        <button className="btn-secondary" onClick={() => onSave(local)}>Save</button>
        <button className="text-status-critical" onClick={() => onDelete(component.id)}><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['users-all'], queryFn: () => listUsers({ includeInactive: true }) });
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');

  async function save(id: string, patch: Parameters<typeof updateUser>[1]) {
    await updateUser(id, patch);
    qc.invalidateQueries({ queryKey: ['users-all'] });
  }

  async function doMerge() {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) return;
    if (!confirm('Merge these users? All sessions move to the target user; the source user is deactivated.')) return;
    await mergeUsers(mergeSource, mergeTarget);
    qc.invalidateQueries();
    setMergeSource('');
    setMergeTarget('');
  }

  return (
    <div>
      <div className="space-y-3 mb-8">
        {(users ?? []).map((u) => (
          <div key={u.id} className="card p-4 grid sm:grid-cols-5 gap-3 items-end">
            <div>
              <label className="label mb-1 block">Name</label>
              <input className="input" defaultValue={u.name} onBlur={(e) => e.target.value !== u.name && save(u.id, { name: e.target.value })} />
            </div>
            <div>
              <label className="label mb-1 block">Customer #</label>
              <input className="input" defaultValue={u.customer_number ?? ''} onBlur={(e) => save(u.id, { customer_number: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label mb-1 block">Notes</label>
              <input className="input" defaultValue={u.notes ?? ''} onBlur={(e) => save(u.id, { notes: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={u.active} onChange={(e) => save(u.id, { active: e.target.checked })} />
              <label className="text-sm">Active</label>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5 max-w-xl">
        <h3 className="text-sm font-semibold mb-3">Merge duplicate users</h3>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="label mb-1 block">Merge from</label>
            <select className="input" value={mergeSource} onChange={(e) => setMergeSource(e.target.value)}>
              <option value="">Select user…</option>
              {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="label mb-1 block">Into</label>
            <select className="input" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
              <option value="">Select user…</option>
              {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={doMerge}>Merge</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label mb-1 block">{label}</label>
      {children}
    </div>
  );
}
