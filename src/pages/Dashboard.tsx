import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import {
  ClusterOutlined, TeamOutlined, ClockCircleOutlined, DollarOutlined,
  RiseOutlined, PauseCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { superApi, TenantListItem, fmtCLP } from '@/api/super';
import { useCountUp } from '@/hooks/useCountUp';

const { Title } = Typography;

// Etiquetas de plan coherentes con billing_service.PLANES
export const PLAN_COLORS: Record<string, string> = {
  trial: 'default', basico: 'blue', pro: 'gold', empresa: 'purple',
};

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['super-dashboard'], queryFn: superApi.dashboard });

  const kpis = data?.kpis;
  const planes = Object.entries(data?.por_plan ?? {});

  // Count-up para los KPIs (respecta reduced-motion internamente)
  const nAmbientes = useCountUp(kpis?.total_tenants ?? 0);
  const mrr = useCountUp(kpis?.mrr_clp ?? 0, { format: (n) => fmtCLP(n) });
  const nTrials = useCountUp(kpis?.trials_activos ?? 0);
  const nUsuarios = useCountUp(kpis?.usuarios_totales ?? 0);

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>Dashboard de plataforma</Title>

      <Row gutter={[14, 14]}>
        <Col xs={12} md={6} className="rise rise-1">
          <Tooltip title="Total de ambientes de clientes registrados en la plataforma, activos y suspendidos.">
            <Card><Statistic loading={isLoading} title="Ambientes" value={nAmbientes}
              prefix={<ClusterOutlined />} suffix={<span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                · {kpis?.tenants_activos ?? 0} activos</span>} /></Card>
          </Tooltip>
        </Col>
        <Col xs={12} md={6} className="rise rise-2">
          <Tooltip title="Ingreso recurrente mensual estimado: suma del precio de los planes pagados de ambientes activos (precios de Flow).">
            <Card><Statistic loading={isLoading} title="MRR estimado" value={kpis ? mrr : '—'}
              prefix={<DollarOutlined />} /></Card>
          </Tooltip>
        </Col>
        <Col xs={12} md={6} className="rise rise-3">
          <Tooltip title="Períodos de prueba vigentes hoy. 'Por vencer' vence en ≤ 7 días: es tu cola comercial de conversión.">
            <Card><Statistic loading={isLoading} title="Trials activos" value={nTrials}
              prefix={<ClockCircleOutlined />} suffix={<span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                · {kpis?.trials_por_vencer ?? 0} por vencer</span>} /></Card>
          </Tooltip>
        </Col>
        <Col xs={12} md={6} className="rise rise-4">
          <Tooltip title="Usuarios activos en toda la plataforma y altas de ambientes en los últimos 30 días.">
            <Card><Statistic loading={isLoading} title="Usuarios" value={nUsuarios}
              prefix={<TeamOutlined />} suffix={<span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                · +{kpis?.altas_30_dias ?? 0} ambientes/30d</span>} /></Card>
          </Tooltip>
        </Col>
      </Row>

      <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
        <Col xs={24} md={14}>
          <Card title="Trials por vencer (próximos 7 días)" styles={{ header: { borderBottom: 'none' } }}
            extra={<Tooltip title="Trials vencidos que aún no eligen plan: contacto de recuperación.">
              <Tag icon={<WarningOutlined />} color="warning">vencidos: {kpis?.trials_vencidos ?? 0}</Tag>
            </Tooltip>}>
            <Table<TenantListItem>
              rowKey="id" size="small" loading={isLoading}
              dataSource={data?.trials_por_vencer ?? []}
              pagination={false} locale={{ emptyText: 'Sin trials por vencer 🎉' }}
              columns={[
                { title: 'Empresa', dataIndex: 'nombre', render: (v, t) => <Link to={`/tenants/${t.id}`}>{v}</Link> },
                { title: 'Vence', dataIndex: 'trial_hasta', render: (v: string, t) =>
                  <span className="mono">{v}{t.trial_restante_dias != null && ` (${t.trial_restante_dias}d)`}</span> },
                { title: 'Usuarios', dataIndex: ['metricas', 'usuarios'], width: 90, align: 'right' },
                {
                  title: '', width: 40, render: (_v, t) => (
                    <Tooltip title={`Suspender o extender el trial del ambiente ${t.nombre}`}>
                      <Link to={`/tenants/${t.id}`}>→</Link>
                    </Tooltip>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="Distribución por plan" styles={{ header: { borderBottom: 'none' } }}>
            {planes.map(([codigo, info]) => (
              <Tooltip key={codigo} title={`${info.tenant} ambiente(s) en plan ${info.nombre}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span><Tag color={PLAN_COLORS[codigo] ?? 'default'} className="mono">{codigo}</Tag>{info.nombre}</span>
                  <span className="kpi-num">{info.tenant}</span>
                </div>
              </Tooltip>
            ))}
            {kpis && kpis.tenants_suspendidos > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span><PauseCircleOutlined style={{ marginInlineEnd: 6 }} />Suspendidos</span>
                <span className="kpi-num">{kpis.tenants_suspendidos}</span>
              </div>
            )}
            {kpis && kpis.trials_activos > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span><RiseOutlined style={{ marginInlineEnd: 6 }} />En trial</span>
                <span className="kpi-num">{kpis.trials_activos}</span>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
