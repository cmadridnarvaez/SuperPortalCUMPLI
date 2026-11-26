// Tipos y cliente tipado del Superportal (API /api/super/* y /api/auth/*).
import { api } from './client';

export interface User {
  id: number;
  username: string;
  email: string;
  nombre_completo: string;
  rol: string;
  activo: boolean;
  email_verificado?: boolean;
}

export interface TenantListItem {
  id: number;
  nombre: string;
  rut: string | null;
  pais: string | null;
  industria: string | null;
  email: string | null;
  plan: string;
  trial_hasta: string | null;
  trial_restante_dias: number | null;
  activo: boolean;
  onboarding_completado: boolean;
  created_at: string | null;
  metricas: { usuarios: number; riesgos: number; activos: number; controles: number };
  ultimo_acceso: string | null;
}

export interface TenantUser {
  id: number;
  username: string;
  email: string;
  nombre_completo: string;
  cargo: string | null;
  rol: string;
  activo: boolean;
  email_verificado: boolean;
  bloqueado_hasta: string | null;
  ultimo_acceso: string | null;
}

export interface TenantDetail extends TenantListItem {
  usuarios: TenantUser[];
  [k: string]: unknown; // dump completo del schema
}

export interface DashboardKpis {
  total_tenants: number;
  tenants_activos: number;
  tenants_suspendidos: number;
  trials_activos: number;
  trials_vencidos: number;
  trials_por_vencer: number;
  usuarios_totales: number;
  altas_30_dias: number;
  mrr_clp: number;
}

export interface DashboardData {
  kpis: DashboardKpis;
  por_plan: Record<string, { tenant: number; nombre: string }>;
  trials_por_vencer: TenantListItem[];
}

export interface ProductoTenant {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  habilitado: boolean;
}

const clp = (n: number) => '$' + n.toLocaleString('es-CL');
export const fmtCLP = clp;

export const authApi = {
  async login(username: string, password: string): Promise<{ access_token: string; user: User }> {
    const { data } = await api.post('/auth/login', { username, password });
    return data;
  },
  async me(): Promise<User> {
    const { data } = await api.get('/auth/me');
    return data.user;
  },
  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },
};

export interface NuevoAmbientePayload {
  empresa: string;
  rut?: string;
  pais?: string;
  industria?: string;
  plan?: string;
  trial_dias?: number;
  admin_nombre: string;
  admin_email: string;
}

export const superApi = {
  async dashboard(): Promise<DashboardData> {
    const { data } = await api.get('/super/dashboard');
    return data;
  },
  async crearAmbiente(payload: NuevoAmbientePayload) {
    const { data } = await api.post('/super/tenants', payload);
    return data as { msg: string; tenant: TenantListItem; usuario: User; reset_url: string | null };
  },
  async tenants(params: { q?: string; plan?: string; estado?: string; producto_id?: number; page?: number; per_page?: number } = {}) {
    const { data } = await api.get('/super/tenants', { params });
    return data as { items: TenantListItem[]; meta: { page: number; per_page: number; total: number; pages: number } };
  },
  async tenant(id: number): Promise<TenantDetail> {
    const { data } = await api.get(`/super/tenants/${id}`);
    return data;
  },
  async patchTenant(id: number, cambios: { plan?: string; activo?: boolean; extender_trial_dias?: number; trial_hasta?: string }) {
    const { data } = await api.patch(`/super/tenants/${id}`, cambios);
    return data as { msg: string; tenant: TenantListItem };
  },
  async productos(id: number): Promise<ProductoTenant[]> {
    const { data } = await api.get(`/super/tenants/${id}/productos`);
    return data.items;
  },
  async patchProducto(orgId: number, productoId: number, habilitado: boolean) {
    const { data } = await api.patch(`/super/tenants/${orgId}/productos`, {
      producto_id: productoId, habilitado,
    });
    return data as { msg: string; habilitado: boolean };
  },
  async crearUsuario(orgId: number, payload: { nombre: string; email: string; rol: string; cargo?: string }) {
    const { data } = await api.post(`/super/tenants/${orgId}/usuarios`, payload);
    return data as { msg: string; usuario: User; reset_url: string | null };
  },
  async patchUsuario(orgId: number, uid: number, cambios: { activo?: boolean; rol?: string; desbloquear?: boolean }) {
    const { data } = await api.patch(`/super/tenants/${orgId}/usuarios/${uid}`, cambios);
    return data as { msg: string; usuario: User };
  },
  async resetPassword(orgId: number, uid: number) {
    const { data } = await api.post(`/super/tenants/${orgId}/usuarios/${uid}/reset-password`);
    return data as { msg: string; reset_url: string; email_enviado: boolean };
  },
  async impersonate(orgId: number, usuarioId?: number) {
    const { data } = await api.post(`/super/tenants/${orgId}/impersonate`,
      usuarioId ? { usuario_id: usuarioId } : {});
    return data as { token: string; expira_en: number; usuario: User };
  },
  apiKeys: {
    async list() {
      const { data } = await api.get('/super/api-keys');
      return data as { items: SuperApiKey[] };
    },
    async crear(payload: { nombre: string; expira?: string }) {
      const { data } = await api.post('/super/api-keys', payload);
      return data as { msg: string; id: number; nombre: string; clave: string; aviso: string };
    },
    async revocar(id: number) {
      const { data } = await api.delete(`/super/api-keys/${id}`);
      return data as { msg: string };
    },
  },
};

export interface SuperApiKey {
  id: number; nombre: string; prefijo: string;
  ultima_vez_uso: string | null; expira: string | null;
  creada_por: string | null; es_mia: boolean; created_at: string | null;
}

// URL de la app principal (para abrir /impersonate?token=...). En dev local,
// el Vite de la app principal corre en 5173.
export const APP_PRINCIPAL_URL =
  (import.meta.env.VITE_APP_URL as string | undefined) || 'http://localhost:5173';

export const ROLES_TENANT = ['AdminGRC', 'RiskManager', 'Auditor', 'Usuario'];
