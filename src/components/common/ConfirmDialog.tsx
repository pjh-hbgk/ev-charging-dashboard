import { useState } from 'react';
import { X } from 'lucide-react';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  requireTypedConfirmation,
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  requireTypedConfirmation?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [typed, setTyped] = useState('');
  if (!open) return null;
  const canConfirm = !requireTypedConfirmation || typed === requireTypedConfirmation;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6 bg-surface dark:bg-surface-dark">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onCancel}><X className="h-4 w-4 text-ink-muted" /></button>
        </div>
        <div className="text-sm text-ink-secondary dark:text-ink-dsecondary mb-4">{message}</div>
        {requireTypedConfirmation && (
          <div className="mb-4">
            <label className="label mb-1 block">
              Type <span className="font-mono text-ink-primary dark:text-ink-dprimary">{requireTypedConfirmation}</span> to confirm
            </label>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className="input" autoFocus />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button onClick={onConfirm} disabled={!canConfirm || busy} className={danger ? 'btn-danger' : 'btn-primary'}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
