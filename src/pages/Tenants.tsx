import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  App, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table,
  Tag, Tooltip, Typography,
} from 'antd';
import { ReloadOutlined, SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { superApi, TenantListItem, ProductoTenant, APP_PRINCIPAL_URL } from '@/api/super';
import { CheckDraw } from '@/components/CheckDraw';
import { PLAN_COLORS } from '@/pages/Dashboard';

const { Title, Text } = Typography;

// Naming de negocio: un tenant (organización en el backend) es un "ambiente
// de cliente". Esta página lista y da de alta ambientes.
export default function Tenants() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { message } = App.useApp();

  const [q, setQ] = useState('');
  const [plan, setPlan] = useState<string | undefined>();
  const [estado, setEstado] = useState<string | undefined>();
  const [producto, setProducto] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [altaOpen, setAltaOpen] = useState(false);
  const [form] = Form.useForm();
  const planElegido = Form.useWatch('plan', form);

  const { data, isLoading } = useQuery({
    queryKey: ['super-tenants', { q, plan, estado, producto, page }],
    queryFn: () => superApi.tenants({
      q: q || undefined, plan, estado,
      producto_id: producto, page, per_page: 20,
    }),
  });

  // Catálogo de productos para el filtro
  const { data: productos } = useQuery({
    queryKey: ['super-productos-primero'],
    queryFn: async () => {
      const t = await superApi.tenants({ per_page: 1 });
      return t.items.length ? superApi.productos(t.items[0].id) : ([] as ProductoTenant[]);
    },
  });

  const extenderTrial = useMutation({
    mutationFn: (id: number) => superApi.patchTenant(id, { extender_trial_dias: 14 }),
    onSuccess: (r) => { message.success(r.msg); qc.invalidateQueries({ queryKey: ['super-tenants'] }); },
    onError: (e: any) => message.error(e.response?.data?.msg || 'Error'),
  });

  const cambiarEstado = useMutation({
    mutationFn: (t: TenantListItem) => superApi.patchTenant(t.id, { activo: !t.activo }),
    onSuccess: (r) => { message.success(r.msg); qc.invalidateQueries({ queryKey: ['super-tenants'] }); },
    onError: (e: any) => message.error(e.response?.data?.msg || 'Error'),
  });

  const confirmarEstado = (t: TenantListItem) => {
    const suspende = t.activo;
    Modal.confirm({
      title: suspende ? `¿Suspender el ambiente de ${t.nombre}?` : `¿Reactivar el ambiente de ${t.nombre}?`,
      content: suspende
        ? 'Sus usuarios no podrán iniciar sesión hasta reactivarlo. Se notifica a sus admins.'
        : 'El ambiente vuelve a quedar operativo. Se notifica a sus admins.',
      okText: suspende ? 'Suspender' : 'Reactivar',
      okButtonProps: { danger: suspende },
      onOk: () => cambiarEstado.mutateAsync(t),
    });
  };

  const crearAmbiente = useMutation({
    mutationFn: (v: { empresa: string; rut?: string; pais?: string; industria?: string;
                       plan: string; trial_dias: number; admin_nombre: string; admin_email: string }) =>
      superApi.crearAmbiente(v),
    onSuccess: (r) => {
      setAltaOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['super-tenants'] });
      Modal.success({
        title: r.msg,
        width: 560,
        className: 'tt-success',
        icon: <CheckDraw />,
        content: (
          <div>
            {r.reset_url ? (
              <>
                <p>Link de activación para el administrador (definirá su contraseña al entrar):</p>
                <Text code copyable style={{ wordBreak: 'break-all' }}>
                  {APP_PRINCIPAL_URL}{r.reset_url}
                </Text>
              </>
            ) : (
              <p>No pudimos generar el link de activación; usa "reset password" desde el detalle del ambiente.</p>
            )}
          </div>
        ),
        okText: 'Ver ambiente',
        onOk: () => nav(`/tenants/${r.tenant.id}`),
      });
    },
    onError: (e: any) => message.error(e.response?.data?.msg || 'Error al crear el ambiente'),
  });

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>Ambientes de clientes</Title>

      <Card className="fade-in" styles={{ body: { padding: 14 } }} style={{ marginBottom: 14 }}>
        <Space wrap>
          <Input
            allowClear prefix={<SearchOutlined />} placeholder="Buscar ambiente, RUT o email"
            style={{ width: 280 }} value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
          <Tooltip title="Filtra por el plan comercial actual (trial, básico, pro, empresa).">
            <Select allowClear placeholder="Plan" style={{ width: 130 }} value={plan}
              onChange={(v) => { setPlan(v); setPage(1); }}
              options={['trial', 'basico', 'pro', 'empresa'].map((p) => ({ value: p, label: p }))} />
          </Tooltip>
          <Tooltip title="Ambientes activos o suspendidos.">
            <Select allowClear placeholder="Estado" style={{ width: 140 }} value={estado}
              onChange={(v) => { setEstado(v); setPage(1); }}
              options={[{ value: 'activos', label: 'Activos' }, { value: 'suspendidos', label: 'Suspendidos' }]} />
          </Tooltip>
          <Tooltip title="Muestra solo ambientes con ese producto normativo habilitado.">
            <Select allowClear placeholder="Producto" style={{ width: 180 }} value={producto}
              onChange={(v) => { setProducto(v); setPage(1); }}
              options={(productos ?? []).map((p) => ({ value: p.id, label: p.nombre }))} />
          </Tooltip>
          <Tooltip title="Da de alta un ambiente nuevo con su administrador y link de activación (onboarding asistido: no requiere self-signup del cliente).">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAltaOpen(true)}>
              Nuevo ambiente
            </Button>
          </Tooltip>
        </Space>
      </Card>

      <Table<TenantListItem>
        rowKey="id" loading={isLoading}
        className="fade-in"
        rowClassName="tt-row-in"
        dataSource={data?.items ?? []}
        pagination={{
          current: page, pageSize: 20, total: data?.meta.total ?? 0,
          onChange: setPage, showSizeChanger: false,
          showTotal: (t) => `${t} ambientes`,
        }}
        onRow={(t) => ({ onClick: () => nav(`/tenants/${t.id}`), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: 'Ambiente', dataIndex: 'nombre',
            render: (v, t) => (
              <span>
                {v}
                {!t.activo && <Tooltip title="Ambiente suspendido: sus usuarios no pueden entrar.">
                  <Tag color="error" style={{ marginInlineStart: 8 }}>suspendido</Tag></Tooltip>}
              </span>
            ),
          },
          { title: 'Plan', dataIndex: 'plan', width: 110,
            render: (p: string) => <Tag color={PLAN_COLORS[p] ?? 'default'} className="mono">{p}</Tag> },
          {
            title: 'Trial', dataIndex: 'trial_hasta', width: 120,
            render: (v: string | null, t) => {
              if (!v || t.plan !== 'trial') return '—';
              const dias = t.trial_restante_dias ?? 0;
              return (
                <Tooltip title={`Vence el ${v}`}>
                  <span className="mono" style={{ color: dias <= 3 ? '#ff7875' : undefined }}>
                    {dias >= 0 ? `${dias}d` : 'vencido'}
                  </span>
                </Tooltip>
              );
            },
          },
          { title: 'Usuarios', dataIndex: ['metricas', 'usuarios'], width: 95, align: 'right',
            render: (v: number) => <span className="mono">{v}</span> },
          {
            title: 'Uso (R/A/C)', key: 'uso', width: 120, align: 'right',
            render: (_v, t) => (
              <Tooltip title={`Riesgos: ${t.metricas.riesgos} · Activos: ${t.metricas.activos} · Controles: ${t.metricas.controles}`}>
                <span className="mono" style={{ color: 'var(--text-2)' }}>
                  {t.metricas.riesgos}/{t.metricas.activos}/{t.metricas.controles}
                </span>
              </Tooltip>
            ),
          },
          {
            title: 'Acciones', key: 'acciones', width: 190,
            render: (_v, t) => (
              <Space onClick={(e) => e.stopPropagation()}>
                <Tooltip title="Extender el trial 14 días más.">
                  <Button size="small" className="tt-press" icon={<ReloadOutlined />}
                    loading={extenderTrial.isPending && extenderTrial.variables === t.id}
                    onClick={() => extenderTrial.mutate(t.id)} />
                </Tooltip>
                <Tooltip title={t.activo ? 'Suspender ambiente (bloquea acceso, notifica a admins)' : 'Reactivar ambiente'}>
                  <Button size="small" className="tt-press" danger={t.activo}
                    onClick={() => confirmarEstado(t)}>
                    {t.activo ? 'Suspender' : 'Reactivar'}
                  </Button>
                </Tooltip>
                <Link to={`/tenants/${t.id}`}>
                  <Button size="small" type="primary" ghost>Detalle</Button>
                </Link>
              </Space>
            ),
          },
        ]}
      />

      <Modal title="Nuevo ambiente de cliente" open={altaOpen} onCancel={() => setAltaOpen(false)}
        confirmLoading={crearAmbiente.isPending}
        onOk={() => form.validateFields().then((v) => crearAmbiente.mutate(v))}
        okText="Crear ambiente">
        <Form form={form} layout="vertical"
          initialValues={{ pais: 'Chile', plan: 'trial', trial_dias: 14 }}>
          <Form.Item name="empresa" label="Empresa / ambiente"
            rules={[{ required: true }]}
            tooltip="Nombre de la empresa cliente; será el identificador del ambiente en la plataforma.">
            <Input placeholder="AudySalud SpA" />
          </Form.Item>
          <Space wrap size={14}>
            <Form.Item name="rut" label="RUT (opcional)" style={{ minWidth: 160 }}>
              <Input placeholder="76.123.456-7" />
            </Form.Item>
            <Form.Item name="pais" label="País" initialValue="Chile" style={{ minWidth: 130 }}>
              <Input />
            </Form.Item>
            <Form.Item name="industria" label="Industria (opcional)" style={{ minWidth: 160 }}>
              <Input placeholder="Salud" />
            </Form.Item>
          </Space>
          <Space wrap size={14}>
            <Form.Item name="plan" label="Plan" initialValue="trial"
              tooltip="Plan comercial inicial. 'trial' regala los días de prueba.">
              <Select style={{ width: 130 }}
                options={['trial', 'basico', 'pro', 'empresa'].map((p) => ({ value: p, label: p }))} />
            </Form.Item>
            {planElegido === 'trial' && (
              <Form.Item name="trial_dias" label="Días de trial" initialValue={14}
                tooltip="Días de prueba desde hoy (1-365).">
                <InputNumber min={1} max={365} style={{ width: 110 }} />
              </Form.Item>
            )}
          </Space>
          <Form.Item name="admin_nombre" label="Administrador del ambiente" rules={[{ required: true }]}>
            <Input placeholder="Nombre y apellido del contacto" />
          </Form.Item>
          <Form.Item name="admin_email" label="Email del administrador" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="contacto@empresa.cl" />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            El administrador recibirá un link para definir su contraseña (rol AdminGRC).
            El ambiente arranca vacío: el onboarding de la app lo guía.
          </Text>
        </Form>
      </Modal>
    </div>
  );
}
