import clsx from 'clsx';

const STATUS_STYLES: Record<string, string> = {
  good: 'bg-status-good/15 text-status-good',
  warning: 'bg-status-warning/20 text-[#8a5a00]',
  serious: 'bg-status-serious/20 text-[#8a3a17]',
  critical: 'bg-status-critical/15 text-status-critical',
  neutral: 'bg-black/5 dark:bg-white/10 text-ink-secondary dark:text-ink-dsecondary',
};

export default function Badge({ children, tone = 'neutral', className }: { children: React.ReactNode; tone?: keyof typeof STATUS_STYLES; className?: string }) {
  return <span className={clsx('badge', STATUS_STYLES[tone], className)}>{children}</span>;
}

const FLAG_LABELS: Record<string, string> = {
  zero_kwh: 'Zero kWh',
  negative_kwh: 'Negative kWh',
  missing_user: 'Missing user',
  missing_start: 'Missing start',
  missing_end: 'Missing end',
  end_before_start: 'End before start',
  very_short_session: 'Very short',
  very_large_session: 'Unusually large',
  unknown_user_id: 'Unknown user ID',
  price_missing: 'Price missing',
  duplicate_session: 'Duplicate',
};

export function QualityFlagBadge({ flag }: { flag: string }) {
  const critical = ['negative_kwh', 'missing_user', 'missing_start', 'missing_end', 'end_before_start'];
  return (
    <Badge tone={critical.includes(flag) ? 'critical' : 'warning'} className="mr-1 mb-1">
      {FLAG_LABELS[flag] ?? flag}
    </Badge>
  );
}
