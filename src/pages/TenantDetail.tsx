import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App, Button, Card, Descriptions, Form, Input, Modal, Popconfirm, Select,
  Space, Switch, Table, Tabs, Tag, Tooltip, Typography,
} from 'antd';
import {
  ArrowLeftOutlined, KeyOutlined, LockOutlined, PlusOutlined,
  ThunderboltOutlined, UnlockOutlined, UserAddOutlined,
} from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { superApi, TenantUser, ROLES_TENANT, APP_PRINCIPAL_URL } from '@/api/super';
import { CheckDraw } from '@/components/CheckDraw';
import { PLAN_COLORS } from '@/pages/Dashboard';

const { Title, Text } = Typography;

export default function TenantDetail() {
  const { id } = useParams();
  const orgId = Number(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { message } = App.useApp();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['super-tenant', orgId],
    queryFn: () => superApi.tenant(orgId), enabled: !!orgId,
  });
  const { data: productos } = useQuery({
    queryKey: ['super-tenant-productos', orgId],
    queryFn: () => superApi.productos(orgId), enabled: !!orgId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['super-tenant', orgId] });
    qc.invalidateQueries({ queryKey: ['super-tenants'] });
    qc.invalidateQueries({ queryKey: ['super-tenant-productos', orgId] });
  };
  const onError = (e: any) => message.error(e.response?.data?.msg || 'Error');

  // ── Plan / estado ──
  const [tagPulse, setTagPulse] = useState(0);
  const patchTenant = useMutation({
    mutationFn: (cambios: Parameters<typeof superApi.patchTenant>[1]) => superApi.patchTenant(orgId, cambios),
    onSuccess: (r) => { message.success(r.msg); setTagPulse(Date.now()); invalidate(); },
    onError,
  });

  const cambiarPlan = (plan: string) => {
    Modal.confirm({
      title: `¿Cambiar el plan de ${tenant?.nombre} a "${plan}"?`,
      content: 'Se notifica a los admins del ambiente. El cobro real se gestiona por Flow.',
      onOk: () => patchTenant.mutateAsync({ plan }),
    });
  };

  // ── Productos ──
  const patchProducto = useMutation({
    mutationFn: ({ pid, habilitado }: { pid: number; habilitado: boolean }) =>
      superApi.patchProducto(orgId, pid, habilitado),
    onSuccess: (r) => { message.success(r.msg); invalidate(); },
    onError,
  });

  // ── Usuarios ──
  const [invitarOpen, setInvitarOpen] = useState(false);
  const [form] = Form.useForm();

  const crearUsuario = useMutation({
    mutationFn: (v: { nombre: string; email: string; rol: string; cargo?: string }) =>
      superApi.crearUsuario(orgId, v),
    onSuccess: (r) => {
      if (r.reset_url) {
        Modal.success({
          className: 'tt-success',
          icon: <CheckDraw />,
          title: r.msg,
          content: (
            <div>
              <p>Link de activación (el usuario define su contraseña al entrar):</p>
              <Text code copyable style={{ wordBreak: 'break-all' }}>
                {APP_PRINCIPAL_URL}{r.reset_url}
              </Text>
            </div>
          ),
        });
      } else {
        message.success(r.msg);
      }
      form.resetFields(); setInvitarOpen(false); invalidate();
    },
    onError,
  });

  const patchUsuario = useMutation({
    mutationFn: ({ uid, cambios }: { uid: number; cambios: Parameters<typeof superApi.patchUsuario>[2] }) =>
      superApi.patchUsuario(orgId, uid, cambios),
    onSuccess: (r) => { message.success(r.msg); invalidate(); },
    onError,
  });

  const resetPassword = useMutation({
    mutationFn: (uid: number) => superApi.resetPassword(orgId, uid),
    onSuccess: (r) => {
      Modal.info({
        title: r.email_enviado ? 'Correo enviado y link generado' : 'Link generado',
        content: (
          <div>
            {r.email_enviado
              ? <p>Enviamos el correo de restablecimiento. Como respaldo, este link también sirve:</p>
              : <p>No pudimos enviar el correo (SMTP sin configurar). Entrega este link manualmente:</p>}
            <Text code copyable style={{ wordBreak: 'break-all' }}>
              {APP_PRINCIPAL_URL}{r.reset_url}
            </Text>
          </div>
        ),
      });
    },
    onError,
  });

  const impersonar = useMutation({
    mutationFn: (usuarioId?: number) => superApi.impersonate(orgId, usuarioId),
    onSuccess: (r) => {
      const url = `${APP_PRINCIPAL_URL}/impersonate?token=${encodeURIComponent(r.token)}`;
      const vent = window.open(url, '_blank', 'noopener');
      if (!vent) {
        // Pop-up bloqueado: entregar el link para abrir/copiar manualmente
        // (válido pocos segundos; reintentar si expira).
        Modal.info({
          title: 'Ventana emergente bloqueada',
          content: (
            <div>
              <p>Tu navegador bloqueó la ventana. Abre este enlace ahora (expira en {r.expira_en}s):</p>
              <Text code copyable style={{ wordBreak: 'break-all' }}>{url}</Text>
            </div>
          ),
        });
      } else {
        message.info(`Sesión de soporte como ${r.usuario.username} (link válido ${r.expira_en}s)`);
      }
    },
    onError,
  });

  if (!tenant) {
    return <Card loading={isLoading}>Cargando ambiente…</Card>;
  }

  const usuariosCols = [
    { title: 'Usuario', dataIndex: 'username', render: (v: string, u: TenantUser) => (
      <span>
        {u.nombre_completo} <span className="mono" style={{ color: 'var(--text-2)' }}>({v})</span>
        {u.rol === 'SuperAdmin' && <Tooltip title="Cuenta de plataforma (TitanStudio): no modificable.">
          <Tag color="purple" style={{ marginInlineStart: 6 }}>plataforma</Tag></Tooltip>}
      </span>
    ) },
    { title: 'Email', dataIndex: 'email', render: (v: string, u: TenantUser) => (
      <span>{v} {!u.email_verificado && <Tooltip title="Email sin verificar."><Tag>sin verificar</Tag></Tooltip>}</span>
    ) },
    { title: 'Rol', dataIndex: 'rol', width: 120, render: (r: string) => <Tag className="mono">{r}</Tag> },
    { title: 'Estado', dataIndex: 'activo', width: 110, render: (a: boolean, u: TenantUser) => (
      <Tooltip title={u.bloqueado_hasta ? `Bloqueado por intentos fallidos hasta ${u.bloqueado_hasta}` : undefined}>
        {a ? <Tag color="success">activo</Tag> : <Tag color="error">inactivo</Tag>}
      </Tooltip>
    ) },
    {
      title: 'Acciones', key: 'acc', width: 250,
      render: (_v: unknown, u: TenantUser) => (
        u.rol === 'SuperAdmin' ? <Text type="secondary">—</Text> : (
          <Space>
            <Tooltip title={`Entrar como ${u.username} en la app del cliente (sesión de soporte de 60 min, queda en bitácora).`}>
              <Button size="small" icon={<ThunderboltOutlined />}
                loading={impersonar.isPending && impersonar.variables === u.id}
                onClick={() => impersonar.mutate(u.id)}>
                Entrar como
              </Button>
            </Tooltip>
            <Tooltip title="Generar link de restablecimiento de contraseña.">
              <Button size="small" icon={<KeyOutlined />}
                loading={resetPassword.isPending && resetPassword.variables === u.id}
                onClick={() => resetPassword.mutate(u.id)} />
            </Tooltip>
            {u.bloqueado_hasta ? (
              <Tooltip title="Desbloquear (limpia intentos fallidos).">
                <Button size="small" icon={<UnlockOutlined />}
                  onClick={() => patchUsuario.mutate({ uid: u.id, cambios: { desbloquear: true } })} />
              </Tooltip>
            ) : (
              <Tooltip title={u.activo ? 'Desactivar acceso' : 'Reactivar acceso'}>
                <Button size="small" danger={u.activo} icon={u.activo ? <LockOutlined /> : <UnlockOutlined />}
                  onClick={() => patchUsuario.mutate({ uid: u.id, cambios: { activo: !u.activo } })} />
              </Tooltip>
            )}
          </Space>
        )
      ),
    },
  ];

  return (
    <div className="fade-in">
      <Space style={{ marginBottom: 12 }}>
        <Button className="tt-press" icon={<ArrowLeftOutlined />} onClick={() => nav('/tenants')} />
        <Title level={4} style={{ margin: 0 }}>{tenant.nombre}</Title>
        <Tag key={`plan-${tagPulse}`} color={PLAN_COLORS[tenant.plan] ?? 'default'}
          className={`mono ${tagPulse ? 'tt-tag-pulse' : ''}`}>{tenant.plan}</Tag>
        {!tenant.activo && <Tag key={`sus-${tagPulse}`} color="error"
          className={tagPulse ? 'tt-tag-pulse' : ''}>suspendido</Tag>}
      </Space>

      <Tabs
        items={[
          {
            key: 'datos', label: 'Datos',
            children: (
              <Card>
                <Descriptions column={{ xs: 1, md: 2 }} size="small">
                  <Descriptions.Item label="RUT">{tenant.rut ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="País">{tenant.pais ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Industria">{tenant.industria ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Email">{tenant.email ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Alta">
                    <span className="mono">{tenant.created_at?.slice(0, 10) ?? '—'}</span>
                  </Descriptions.Item>
                  <Descriptions.Item label="Onboarding">
                    {tenant.onboarding_completado ? 'completado' : 'pendiente'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Métricas">
                    <Tooltip title="Usuarios / riesgos / activos / controles activos del tenant.">
                      <span className="mono">
                        {tenant.metricas.usuarios} usuarios · {tenant.metricas.riesgos} riesgos ·{' '}
                        {tenant.metricas.activos} activos · {tenant.metricas.controles} controles
                      </span>
                    </Tooltip>
                  </Descriptions.Item>
                  <Descriptions.Item label="Último acceso">
                    <span className="mono">{tenant.ultimo_acceso?.replace('T', ' ').slice(0, 16) ?? '—'}</span>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            ),
          },
          {
            key: 'plan', label: 'Plan y productos',
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size={14}>
                <Card title="Plan comercial" styles={{ header: { borderBottom: 'none' } }}>
                  <Space wrap>
                    <Tooltip title="Plan de facturación (trial/básico/pro/empresa). Los admins del ambiente reciben una notificación del cambio.">
                      <Select value={tenant.plan} style={{ width: 160 }}
                        onChange={cambiarPlan}
                        options={['trial', 'basico', 'pro', 'empresa'].map((p) => ({ value: p, label: p }))} />
                    </Tooltip>
                    <Tooltip title="Extiende el período de prueba 14 días desde su vencimiento actual.">
                      <Popconfirm title="¿Extender el trial 14 días?" onConfirm={() => patchTenant.mutate({ extender_trial_dias: 14 })}>
                        <Button icon={<PlusOutlined />}>Extender trial +14d</Button>
                      </Popconfirm>
                    </Tooltip>
                    <Tooltip title={tenant.activo
                      ? 'Suspende el acceso de todo el ambiente (sus admins reciben notificación).'
                      : 'Reactiva el acceso del ambiente.'}>
                      <Button danger={tenant.activo}
                        onClick={() => Modal.confirm({
                          title: tenant.activo ? `¿Suspender a ${tenant.nombre}?` : `¿Reactivar a ${tenant.nombre}?`,
                          content: tenant.activo
                            ? 'Sus usuarios no podrán iniciar sesión hasta reactivarlo.'
                            : 'El ambiente vuelve a quedar operativo.',
                          okButtonProps: { danger: tenant.activo },
                          onOk: () => patchTenant.mutateAsync({ activo: !tenant.activo }),
                        })}>
                        {tenant.activo ? 'Suspender ambiente' : 'Reactivar ambiente'}
                      </Button>
                    </Tooltip>
                    {tenant.trial_hasta && (
                      <Text type="secondary" className="mono">
                        trial hasta {tenant.trial_hasta}
                        {tenant.trial_restante_dias != null && tenant.plan === 'trial'
                          ? ` (${tenant.trial_restante_dias}d)` : ''}
                      </Text>
                    )}
                  </Space>
                </Card>

                <Card title="Productos normativos contratados" styles={{ header: { borderBottom: 'none' } }}
                  extra={<Tooltip title="Un producto deshabilitado impide cargar su marco en '¿Qué me aplica?' (403). El cambio queda en bitácora y notifica a los admins si se desactiva.">
                    <Text type="secondary">?</Text>
                  </Tooltip>}>
                  {(productos ?? []).map((p) => (
                    <div key={p.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 0', borderBottom: '1px solid var(--border-subtle)',
                    }}>
                      <div>
                        <Text strong>{p.nombre}</Text>{' '}
                        <Tag className="mono">{p.codigo}</Tag>
                        <div style={{ color: 'var(--text-2)', fontSize: 12 }}>{p.descripcion}</div>
                      </div>
                      <Switch checked={p.habilitado} checkedChildren="incluido" unCheckedChildren="no contratado"
                        loading={patchProducto.isPending && patchProducto.variables?.pid === p.id}
                        onChange={(habilitado) => patchProducto.mutate({ pid: p.id, habilitado })} />
                    </div>
                  ))}
                </Card>
              </Space>
            ),
          },
          {
            key: 'usuarios', label: `Usuarios (${tenant.usuarios.length})`,
            children: (
              <Card>
                <Space style={{ marginBottom: 12 }}>
                  <Tooltip title="Crea el usuario y genera un link de activación para entregar (mismo flujo de invitación del admin del ambiente).">
                    <Button type="primary" icon={<UserAddOutlined />} onClick={() => setInvitarOpen(true)}>
                      Crear usuario
                    </Button>
                  </Tooltip>
                  <Tooltip title="Sesión de soporte como el primer admin del ambiente, para demos y asistencia. Queda en bitácora.">
                    <Button icon={<ThunderboltOutlined />} loading={impersonar.isPending}
                      onClick={() => impersonar.mutate(undefined)}>
                      Entrar como admin
                    </Button>
                  </Tooltip>
                </Space>
                <Table<TenantUser> rowKey="id" size="small" pagination={false}
                  dataSource={tenant.usuarios} columns={usuariosCols} />
              </Card>
            ),
          },
        ]}
      />

      <Modal title="Crear usuario del ambiente" open={invitarOpen} onCancel={() => setInvitarOpen(false)}
        confirmLoading={crearUsuario.isPending}
        onOk={() => form.validateFields().then((v) => crearUsuario.mutate(v))}
        okText="Crear e invitar">
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre completo" rules={[{ required: true }]}>
            <Input placeholder="Nombre y apellido" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="usuario@empresa.cl" />
          </Form.Item>
          <Form.Item name="rol" label="Rol" initialValue="Usuario" rules={[{ required: true }]}>
            <Select options={ROLES_TENANT.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item name="cargo" label="Cargo (opcional)">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
