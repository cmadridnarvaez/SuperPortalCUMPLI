import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Checkbox, Col, Modal, Row, Space, Switch, Tag, Typography } from 'antd';
import { superApi, type ProductoTenant } from '@/api/super';

const { Text } = Typography;

const modules = [
  { code: 'ISO27001', name: 'Seguridad de la información — ISO 27001', includes: [
    'Marco ISO 27001, requisitos, aplicabilidad y seguimiento de brechas.',
    'Inventario de activos de información, amenazas y vulnerabilidades.',
    'Registro y seguimiento de incidentes de seguridad.',
    'Controles vinculados con riesgos y requisitos.',
  ] },
  { code: 'LEY21719', name: 'Protección de datos personales — Ley 21.719', includes: [
    'Registro de Actividades de Tratamiento (RAT), mapa de datos y vínculos con activos y terceros.',
    'Evaluaciones de impacto (DPIA).',
    'Consentimientos y solicitudes de ejercicio de derechos.',
    'Reportes de tratamientos y evaluaciones.',
  ] },
  { code: 'LEY21595', name: 'Leyes 20.393 y 21.595 — MPD', includes: [
    'Marco del Modelo de Prevención de Delitos y seguimiento de requisitos.',
    'Riesgos, controles y terceros vinculados al programa.',
    'Registro y gestión interna de denuncias.',
    'Declaración y seguimiento de conflictos de interés y capacitaciones.',
  ] },
];

const candidates = [
  { code: 'CIS', name: 'CIS Controls v8' },
  { code: 'NISTCSF', name: 'NIST Cybersecurity Framework 2.0' },
  { code: 'SST16744', name: 'Ley 16.744 — Seguridad y Salud en el Trabajo' },
];

interface Props {
  orgId: number;
  products?: ProductoTenant[];
  loading: boolean;
  error: boolean;
  retry: () => void;
  legacyPending: boolean;
  updateLegacy: (pid: number, habilitado: boolean) => void;
}

export function TenantProducts({ orgId, products, loading, error, retry, legacyPending, updateLegacy }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<number, boolean>>({});
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'warning'; text: string }>();
  const inFlight = useRef(false);
  const items = modules.map((module) => ({
    ...module, product: products?.find((product) => product.codigo === module.code),
  }));
  const selected = items.filter(({ product }) => product && (draft[product.id] ?? product.habilitado));
  const changes = items.flatMap(({ name, product }) => {
    if (!product || draft[product.id] === undefined || draft[product.id] === product.habilitado) return [];
    return [{ name, pid: product.id, habilitado: draft[product.id] }];
  });
  const removed = changes.filter((change) => !change.habilitado);
  const legacy = products?.filter(({ codigo }) =>
    !modules.some(({ code }) => code === codigo) && !candidates.some(({ code }) => code === codigo),
  );
  const disabled = loading || error || saving || legacyPending;
  const allAvailable = items.every(({ product }) => product);

  async function save() {
    if (inFlight.current || disabled || !changes.length) return;
    inFlight.current = true;
    setSaving(true);
    setConfirm(false);
    setNotice(undefined);
    const queryKey = ['super-tenant-productos', orgId];
    try {
      await qc.cancelQueries({ queryKey });
      let latest = await superApi.productos(orgId);
      qc.setQueryData(queryKey, latest);
      for (const change of changes) {
        const current = latest.find(({ id }) => id === change.pid);
        if (!current) throw new Error('Producto no disponible');
        if (current.habilitado !== change.habilitado) {
          const response = await superApi.patchProducto(orgId, change.pid, change.habilitado);
          latest = latest.map((product) => product.id === change.pid
            ? { ...product, habilitado: response.habilitado } : product);
          qc.setQueryData(queryKey, latest);
          if (response.habilitado !== change.habilitado) throw new Error('Cambio no aplicado');
        }
        setDraft((pending) => {
          const remaining = { ...pending };
          delete remaining[change.pid];
          return remaining;
        });
      }
      setDraft({});
      setNotice({ type: 'success', text: 'Configuración de módulos guardada.' });
    } catch {
      setNotice({ type: 'warning', text: 'El guardado quedó incompleto. Revisa los cambios pendientes antes de reintentar.' });
    } finally {
      await qc.invalidateQueries({ queryKey });
      await qc.invalidateQueries({ queryKey: ['super-tenants'] });
      setSaving(false);
      inFlight.current = false;
    }
  }

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Card title="Permisos y módulos" loading={loading}>
        {error && <Alert type="error" showIcon message="No pudimos consultar los productos de este ambiente."
          action={<Button onClick={retry}>Reintentar</Button>} />}
        {products && <>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={15}>
              <Typography.Title level={5}>Módulos oficiales</Typography.Title>
              <Button disabled={disabled || !allAvailable || selected.length === modules.length}
                onClick={() => {
                  setDraft(Object.fromEntries(items.flatMap(({ product }) => product ? [[product.id, true]] : [])));
                  setNotice(undefined);
                }}>
                Seleccionar HUB de cumplimiento
              </Button>
              <Space direction="vertical" size={10} style={{ width: '100%', marginBlock: 16 }}>
                {items.map(({ code, name, includes, product }) => (
                  <Card key={code} size="small">
                    <Checkbox disabled={disabled || !product}
                      checked={!!product && (draft[product.id] ?? product.habilitado)}
                      onChange={({ target }) => {
                        if (product) setDraft((value) => ({ ...value, [product.id]: target.checked }));
                        setNotice(undefined);
                      }}>
                      {name}
                    </Checkbox>
                    {!product && <Tag>Fuera del catálogo de este ambiente</Tag>}
                    <details style={{ marginTop: 8 }}>
                      <summary>Qué incluye</summary>
                      <ul>{includes.map((item) => <li key={item}>{item}</li>)}</ul>
                    </details>
                  </Card>
                ))}
              </Space>
            </Col>
            <Col xs={24} lg={9}>
              <Card size="small" title="Resumen de acceso">
                <Space direction="vertical">
                  {selected.length === modules.length && <Text strong>HUB de cumplimiento</Text>}
                  {selected.length
                    ? <ul style={{ marginBlock: 0 }}>{selected.map(({ code, name }) => <li key={code}>{name}</li>)}</ul>
                    : <Text type="secondary">Sin módulos oficiales seleccionados.</Text>}
                  {selected.length > 0 && <Text>Incluye la base compartida.</Text>}
                  {changes.map(({ pid, name, habilitado }) => (
                    <Text key={pid}> {habilitado ? 'Se agregará' : 'Se quitará'} · {name}</Text>
                  ))}
                  {notice && <Alert type={notice.type} showIcon message={notice.text} />}
                  <Space wrap>
                    <Button type="primary" loading={saving} disabled={disabled || !changes.length}
                      onClick={() => removed.length ? setConfirm(true) : void save()}>
                      Guardar cambios
                    </Button>
                    <Button disabled={disabled || !changes.length} onClick={() => { setDraft({}); setNotice(undefined); }}>
                      Deshacer
                    </Button>
                  </Space>
                </Space>
              </Card>
            </Col>
          </Row>
        </>}
      </Card>
      <Card size="small" title="Base compartida">
        <Text>Gestión de usuarios y responsables, matrices y gestión de riesgos, controles, terceros, políticas,
          auditorías, hallazgos, planes de acción, evidencias, tableros y reportes.</Text>
      </Card>
      <Card size="small" title="Candidatos de contratación independiente">
        <Text type="secondary">Pendientes de definición comercial.</Text>
        <ul>{candidates.map(({ code, name }) => <li key={code}>{name}</li>)}</ul>
      </Card>
      {!!legacy?.length && <Card size="small" title="Otros productos normativos">
        <details>
          <summary>Ver configuración de productos existentes</summary>
          <Space direction="vertical" style={{ width: '100%', marginTop: 12 }}>
            {legacy.map((product) => (
              <Space key={product.id} wrap>
                <Text>{product.nombre}</Text>
                <Tag className="mono">{product.codigo}</Tag>
                <Switch aria-label={product.nombre} checked={product.habilitado}
                  checkedChildren="incluido" unCheckedChildren="no contratado" disabled={disabled}
                  onChange={(habilitado) => updateLegacy(product.id, habilitado)} />
                {product.descripcion && <Text type="secondary">{product.descripcion}</Text>}
              </Space>
            ))}
          </Space>
        </details>
      </Card>}
      <Modal open={confirm} title="Confirmar baja de módulos" okText="Guardar cambios" cancelText="Volver"
        onCancel={() => setConfirm(false)} onOk={() => void save()} okButtonProps={{ disabled, danger: true }}>
        <p>Se retirará el acceso contratado a estos módulos:</p>
        <ul>{removed.map(({ pid, name }) => <li key={pid}>{name}</li>)}</ul>
      </Modal>
    </Space>
  );
}
