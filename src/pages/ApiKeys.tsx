import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App, Button, Card, Empty, Form, Input, DatePicker, Modal, Popconfirm,
  Space, Table, Tag, Tooltip, Typography,
} from 'antd';
import { PlusOutlined, KeyOutlined, ApiOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { superApi } from '@/api/super';

const { Title, Text } = Typography;

interface SuperApiKey {
  id: number;
  nombre: string;
  prefijo: string;
  ultima_vez_uso: string | null;
  expira: string | null;
  creada_por: string | null;
  es_mia: boolean;
  created_at: string | null;
}

/** API keys de plataforma: para que los agentes (automatizaciones, scripts,
 * asistentes) de cada socio operen la consola programáticamente con la misma
 * autoridad y trazabilidad que la GUI. Ver Superportal-API.md. */
export default function ApiKeys() {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [crearOpen, setCrearOpen] = useState(false);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['super-api-keys'],
    queryFn: () => superApi.apiKeys.list(),
  });

  const crear = useMutation({
    mutationFn: (v: { nombre: string; expira?: string }) => superApi.apiKeys.crear(v),
    onSuccess: (r) => {
      setCrearOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['super-api-keys'] });
      Modal.success({
        className: 'tt-success',
        icon: <KeyOutlined style={{ fontSize: 42, color: 'var(--accent)' }} />,
        title: r.msg,
        width: 560,
        content: (
          <div>
            <p>Tu agente autentica con este header (guárdala ahora, <b>no volverá a mostrarse</b>):</p>
            <Text code copyable style={{ wordBreak: 'break-all' }}>{r.clave}</Text>
            <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-2)' }}>
              Ejemplo: <code>curl -H "X-API-Key: …" https://dev-titantech.cumplisign.com/api/super/dashboard</code>
            </p>
          </div>
        ),
      });
    },
    onError: (e: any) => message.error(e.response?.data?.msg || 'Error al crear la API key'),
  });

  const revocar = useMutation({
    mutationFn: (id: number) => superApi.apiKeys.revocar(id),
    onSuccess: (r) => { message.success(r.msg); qc.invalidateQueries({ queryKey: ['super-api-keys'] }); },
    onError: (e: any) => message.error(e.response?.data?.msg || 'Error'),
  });

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>API de plataforma</Title>
      <Text type="secondary" style={{ fontSize: 13, display: 'block', maxWidth: 720, marginBottom: 16 }}>
        Claves para que tus agentes (automatizaciones, scripts, asistentes IA) operen la consola
        programáticamente. Cada clave actúa <b>como su creador</b> y todo queda en bitácora como
        «vía API». Todo lo que haces en esta interfaz tiene endpoint equivalente — ver{' '}
        <code>Superportal-API.md</code> en el repo.
      </Text>

      <Card className="fade-in" styles={{ body: { padding: 14 } }} style={{ marginBottom: 14 }}>
        <Space wrap>
          <Tooltip title="La clave se muestra una sola vez al crearla. Opera como tú (SuperAdmin) hasta que la revocques o expire.">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCrearOpen(true)}>
              Nueva API key
            </Button>
          </Tooltip>
        </Space>
      </Card>

      <Table<SuperApiKey>
        rowKey="id" loading={isLoading} className="fade-in" rowClassName="tt-row-in"
        dataSource={data?.items ?? []}
        pagination={false}
        locale={{ emptyText: <Empty description="Sin API keys activas — crea la primera para tu agente" style={{ padding: 30 }} /> }}
        columns={[
          {
            title: 'Nombre', dataIndex: 'nombre',
            render: (v, k) => (
              <span>
                <ApiOutlined style={{ marginRight: 8, color: 'var(--accent)' }} />{v}
                {k.es_mia && <Tag style={{ marginInlineStart: 8 }}>mía</Tag>}
              </span>
            ),
          },
          { title: 'Prefijo', dataIndex: 'prefijo', width: 130, render: (v: string) => <span className="mono">{v}</span> },
          { title: 'Creada por', dataIndex: 'creada_por', width: 170 },
          {
            title: 'Último uso', dataIndex: 'ultima_vez_uso', width: 150,
            render: (v: string | null) => <span className="mono">{v ? dayjs(v).format('DD MMM HH:mm') : 'nunca'}</span>,
          },
          {
            title: 'Expira', dataIndex: 'expira', width: 120,
            render: (v: string | null) => {
              if (!v) return <Tag>sin límite</Tag>;
              const vencida = dayjs(v).isBefore(dayjs(), 'day');
              return <span className="mono" style={{ color: vencida ? '#ff7875' : undefined }}>{v}{vencida ? ' (vencida)' : ''}</span>;
            },
          },
          {
            title: '', width: 110,
            render: (_v, k) => (
              <Popconfirm title={`¿Revocar "${k.nombre}"? Los agentes que la usen dejan de autenticar.`}
                okText="Revocar" okButtonProps={{ danger: true }}
                onConfirm={() => revocar.mutate(k.id)}>
                <Button size="small" className="tt-press" danger>Revocar</Button>
              </Popconfirm>
            ),
          },
        ]}
      />

      <Modal title="Nueva API key de plataforma" open={crearOpen} onCancel={() => setCrearOpen(false)}
        onOk={() => form.validateFields().then((v) => crear.mutate({
          nombre: v.nombre,
          expira: v.expira ? (v.expira as Dayjs).format('YYYY-MM-DD') : undefined,
        }))}
        confirmLoading={crear.isPending} okText="Crear key">
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre del agente o uso"
            rules={[{ required: true, max: 100 }]}
            tooltip="Para identificarla en la lista y en la bitácora: 'Agente demos', 'Sync CRM', etc.">
            <Input placeholder="Agente de demos comerciales" />
          </Form.Item>
          <Form.Item name="expira" label="Expira (recomendado)"
            tooltip="Buena práctica: claves de vida corta. Puedes revocar en cualquier momento.">
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            La clave opera con tu autoridad de SuperAdmin. Si tu usuario baja de rol o se desactiva,
            la clave deja de funcionar automáticamente.
          </Text>
        </Form>
      </Modal>
    </div>
  );
}
