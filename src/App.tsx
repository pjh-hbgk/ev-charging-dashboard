import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth';
import { isSupabaseConfigured } from './lib/supabaseClient';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MonthlyOverview from './pages/MonthlyOverview';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import ChargingSessions from './pages/ChargingSessions';
import SessionDetail from './pages/SessionDetail';
import Financial from './pages/Financial';
import Analytics from './pages/Analytics';
import YearOverYear from './pages/YearOverYear';
import UserComparison from './pages/UserComparison';
import Imports from './pages/Imports';
import ElectricityPrices from './pages/ElectricityPrices';
import Settings from './pages/Settings';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (!isSupabaseConfigured) return <>{children}</>; // allow browsing the UI in an unconfigured dev preview
  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-ink-muted">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/monthly" element={<MonthlyOverview />} />
                      <Route path="/users" element={<Users />} />
                      <Route path="/users/:id" element={<UserDetail />} />
                      <Route path="/sessions" element={<ChargingSessions />} />
                      <Route path="/sessions/:id" element={<SessionDetail />} />
                      <Route path="/financial" element={<Financial />} />
                      <Route path="/analytics" element={<Analytics />} />
                      <Route path="/year-over-year" element={<YearOverYear />} />
                      <Route path="/comparison" element={<UserComparison />} />
                      <Route path="/imports" element={<Imports />} />
                      <Route path="/prices" element={<ElectricityPrices />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Layout>
                </RequireAuth>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
