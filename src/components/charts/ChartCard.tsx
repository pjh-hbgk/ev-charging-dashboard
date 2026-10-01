import type { ReactNode } from 'react';

export default function ChartCard({ title, subtitle, action, children, height = 280 }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; height?: number }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}
