import { Form, Input, Button, App, Alert } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { BRAND } from '@/brand';
import { useState } from 'react';

export default function Login() {
  const { login, user, errorRol } = useAuth();
  const nav = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const onFinish = async (v: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(v.username, v.password);
      nav('/dashboard', { replace: true });
    } catch (e: any) {
      message.error(e.response?.data?.msg || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ width: 400 }}>
        <div className="rise" style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="mono" style={{ fontWeight: 700, letterSpacing: '0.22em', fontSize: 22 }}>
            {BRAND.name.toUpperCase()}
          </div>
          <div className="mono rise-1" style={{ marginTop: 6, fontSize: 11, color: 'var(--text-2)', letterSpacing: '0.12em' }}>
            {BRAND.sub} · {BRAND.company}
          </div>
        </div>

        <div className="metric-card rise-2" style={{ padding: 28 }}>
          {errorRol && (
            <Alert type="error" showIcon style={{ marginBottom: 14 }} message={errorRol} />
          )}
          <Form layout="vertical" onFinish={onFinish} size="large">
            <Form.Item name="username" label="Usuario" rules={[{ required: true }]}>
              <Input prefix={<UserOutlined />} placeholder="usuario o email" autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" label="Contraseña" rules={[{ required: true }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="contraseña" autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} style={{ fontWeight: 600 }}>
              Entrar a la consola
            </Button>
          </Form>
        </div>

        <div className="mono rise-3" style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: 'var(--text-2)', letterSpacing: '0.08em' }}>
          acceso restringido · exclusivo SuperAdmin · bitácora habilitada
        </div>
      </div>
    </div>
  );
}
