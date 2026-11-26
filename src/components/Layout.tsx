import { ReactNode } from 'react';
import { Layout as AntLayout, Menu, Tooltip, Button, Tag } from 'antd';
import {
  DashboardOutlined, ClusterOutlined, LogoutOutlined,
  ThunderboltFilled, ApiOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { BRAND } from '@/brand';

const { Header, Content } = AntLayout;

const items = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/tenants', icon: <ClusterOutlined />, label: 'Ambientes' },
  { key: '/api-keys', icon: <ApiOutlined />, label: 'API' },
];

export function Layout({ children }: { children?: ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, logout } = useAuth();

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Header style={{
        display: 'flex', alignItems: 'center', gap: 16,
        borderBottom: '1px solid var(--border)', padding: '0 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => nav('/dashboard')}>
          <ThunderboltFilled style={{ fontSize: 18, color: 'var(--accent)' }} />
          <span className="mono" style={{ fontWeight: 700, letterSpacing: '0.18em', fontSize: 15 }}>
            {BRAND.name.toUpperCase()}
          </span>
          <Tag style={{ marginInlineStart: 4 }} className="mono">OPERACIÓN</Tag>
        </div>

        <Menu
          mode="horizontal" selectedKeys={[loc.pathname]}
          items={items} onClick={({ key }) => nav(key)}
          style={{ flex: 1, minWidth: 200, background: 'transparent', borderBottom: 'none' }}
        />

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>
              {user.username}
            </span>
            <Tooltip title="Cerrar sesión de la consola">
              <Button size="small" icon={<LogoutOutlined />} onClick={() => logout()} />
            </Tooltip>
          </div>
        )}
      </Header>
      <Content style={{ padding: '20px 24px', maxWidth: 1280, width: '100%', margin: '0 auto' }}>
        {children ?? <Outlet />}
      </Content>
    </AntLayout>
  );
}
