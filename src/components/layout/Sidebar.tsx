import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, Users, Zap, Receipt, BarChart3,
  UploadCloud, Gauge, Settings, TrendingUp, GitCompareArrows, LogOut, X,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../lib/auth';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/monthly', label: 'Monthly Overview', icon: CalendarDays },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/sessions', label: 'Charging Sessions', icon: Zap },
  { to: '/financial', label: 'Financial Overview', icon: Receipt },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/year-over-year', label: 'Year over Year', icon: TrendingUp },
  { to: '/comparison', label: 'User Comparison', icon: GitCompareArrows },
  { to: '/imports', label: 'Data Management', icon: UploadCloud },
  { to: '/prices', label: 'Electricity Prices', icon: Gauge },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signOut } = useAuth();
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={onClose} />}
      <aside
        className={clsx(
          'fixed lg:sticky top-0 z-40 h-screen w-64 shrink-0 bg-surface dark:bg-surface-dark border-r border-line-hair dark:border-line-dhair flex flex-col transition-transform',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-line-hair dark:border-line-dhair">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-series-1 flex items-center justify-center shrink-0">
              <Zap className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">EV Charging</div>
              <div className="text-xs text-ink-muted">Dashboard</div>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-ink-muted"><X className="h-5 w-5" /></button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-series-1/10 text-series-1'
                    : 'text-ink-secondary dark:text-ink-dsecondary hover:bg-black/5 dark:hover:bg-white/5'
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-line-hair dark:border-line-dhair">
          <button onClick={signOut} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-secondary dark:text-ink-dsecondary hover:bg-black/5 dark:hover:bg-white/5 w-full">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
