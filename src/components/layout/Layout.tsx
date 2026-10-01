import { useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import DemoBanner from './DemoBanner';

export default function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-surface-page dark:bg-surface-darkpage">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-line-hair dark:border-line-dhair flex items-center px-4 lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-ink-secondary">
            <Menu className="h-5 w-5" />
          </button>
        </header>
        <DemoBanner />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
