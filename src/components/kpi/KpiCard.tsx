import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

export default function KpiCard({
  label,
  value,
  sublabel,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon?: LucideIcon;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string };
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <span className="label">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-ink-muted" />}
      </div>
      <div className="mt-2 text-2xl font-semibold kpi-value tabular">{value}</div>
      {(sublabel || trend) && (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          {trend && (
            <span
              className={clsx(
                'font-medium',
                trend.direction === 'up' && 'text-status-good',
                trend.direction === 'down' && 'text-status-critical',
                trend.direction === 'flat' && 'text-ink-muted'
              )}
            >
              {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} {trend.label}
            </span>
          )}
          {sublabel && <span className="text-ink-muted">{sublabel}</span>}
        </div>
      )}
    </div>
  );
}
