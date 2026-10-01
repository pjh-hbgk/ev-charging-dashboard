import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DemoBanner() {
  const { data } = useQuery({
    queryKey: ['demo-active'],
    queryFn: async () => {
      const { count } = await supabase.from('charging_sessions').select('id', { count: 'exact', head: true }).eq('is_demo', true);
      return (count ?? 0) > 0;
    },
    staleTime: 60_000,
  });

  if (!data) return null;

  return (
    <div className="bg-status-warning/15 border-b border-status-warning/30 text-sm px-4 py-2 flex items-center justify-center gap-2 text-center">
      <AlertTriangle className="h-4 w-4 text-status-warning shrink-0" />
      <span className="font-semibold tracking-wide">DEMO DATA ACTIVE</span>
      <span className="text-ink-secondary dark:text-ink-dsecondary hidden sm:inline">
        — the figures below include example data.
      </span>
      <Link to="/imports" className="underline font-medium ml-1 shrink-0">Manage in Data Management →</Link>
    </div>
  );
}
