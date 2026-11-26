import { ReactNode, lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntdApp, Spin } from 'antd';
import esES from 'antd/locale/es_ES';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { Layout } from '@/components/Layout';
import { antdTheme, surfaceVars } from '@/theme/tokens';
import './index.css';

// Skin Titan fijo (negro/plata/azul): la consola se distingue del producto
const SKIN = 'titan' as const;
const MODE = 'dark' as const;

const Login = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Tenants = lazy(() => import('@/pages/Tenants'));
const TenantDetail = lazy(() => import('@/pages/TenantDetail'));
const ApiKeys = lazy(() => import('@/pages/ApiKeys'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const PageFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
    <Spin size="large" />
  </div>
);

function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageFallback />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function Themed() {
  useEffect(() => {
    const vars = surfaceVars(SKIN, MODE);
    Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  }, []);
  return (
    <ConfigProvider locale={esES} theme={antdTheme(SKIN, MODE)}>
      <AntdApp>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<RequireSuperAdmin><Outlet /></RequireSuperAdmin>}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/tenants" element={<Tenants />} />
                  <Route path="/tenants/:id" element={<TenantDetail />} />
                  <Route path="/api-keys" element={<ApiKeys />} />
                </Route>
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Themed />
    </QueryClientProvider>
  );
}
