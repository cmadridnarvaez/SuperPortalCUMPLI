# Superportal TitanTech — Administración de Tenants · Especificación de desarrollo

**Versión:** 1.0
**Fecha:** 11 de noviembre de 2026
**Proyecto:** CumpliSign GRC (SaaS multiempresa de TitanStudio)
**URL de operación:** `https://dev-titantech.cumplisign.com` (nombre deliberadamente neutro, sin "admin")
**Destinatarios:** Producto, desarrollo y QA
**Estado:** Implementado y desplegado en dev (labcmadrid) el 2026-11-11: https://dev-titantech.cumplisign.com

---

## 1. Objetivo del producto

CumpliSign es un producto en operación con tenants (empresas cliente) reales. La operación del proveedor (TitanStudio) se hacía editando la BD o con un panel SSR legacy (`/admin`, Jinja) inalcanzable desde la URL pública. Este sprint construye el **Superportal TitanTech**: la consola interna donde el equipo TitanStudio administra todos los tenants desde una sola vista, con el mismo estándar de producto que el resto del sistema (bitácora, notificaciones, tooltips, tests).

El superportal responde cuatro preguntas operativas:

1. ¿Cómo van mis empresas? (tenants activos, suspendidos, trials, MRR)
2. ¿Qué tiene contratado cada una? (plan y productos normativos habilitados)
3. ¿Cómo ayudo a un cliente sin pedirle credenciales? (usuarios, reset, impersonación)
4. ¿Qué hice y cuándo? (todo en bitácora, con actor real)

## 2. Decisiones de diseño (validadas con negocio)

| Decisión | Elección | Razón |
|---|---|---|
| Acceso | **Exclusivo rol SuperAdmin** | AdminGRC es admin de *su* tenant, no de la plataforma |
| Arquitectura | **SPA separada** (`frontend-titantech/`) | Aislamiento de la app de clientes; stack idéntico |
| Subdominio | `dev-titantech.cumplisign.com` | Neutro (sin "admin") para no delatar el objetivo a escáneres; la protección real es el guard + Cloudflare Access. **Nota:** un solo nivel bajo la zona — el Universal SSL (`*.cumplisign.com`) no cubre dos niveles (`dev.titantech.…` dio handshake TLS failure), por eso el guion en vez del punto |
| Multiproducto | **Productos habilitados por empresa** (catálogo global + join) | El plan (trial/básico/pro/empresa) sigue único por tenant; los productos son los módulos normativos contratados |
| Panel `/admin` legacy | **Desactivado (404)** | Menos superficie de ataque; una sola herramienta de operación |
| Límites por plan (ej. "3 marcos" en básico) | **No se enforcean** | El modelo elegido es productos por org; los límites del texto comercial quedan para cuando el pricing esté cerrado |

## 3. Modelo de datos

**Nuevo `app/models/producto.py`** · migración `migrations/versions/i1a2b3c4d5e6_productos_normativos.py`:

- `productos` — catálogo global de plataforma: `codigo` (unique, coincide con el `codigo` del marco en `perfil_service.LOADERS`), `nombre`, `descripcion`, `orden`, `activo`.
- `organizacion_productos` — habilitación por tenant: `organizacion_id`, `producto_id`, `habilitado`, único por (org, producto).

**Semántica clave:** la *ausencia de fila* = incluido (default true). Los tenants existentes no se ven afectados hasta que el superportal desactive explícitamente un producto. Si un marco no existe como producto, se considera incluido.

**Seed** (`scripts/seed_data.py::ensure_productos`): catálogo inicial de 15 productos = los 15 marcos del motor "¿Qué me aplica?". Idempotente.

## 4. Endurecimiento de seguridad (incluido en el sprint)

Corrección de un hueco real: `AdminGRC` podía listar y editar **cualquier** organización vía API (`ROLES_ADMIN = {'SuperAdmin','AdminGRC'}` agrupaba ambos).

- `app/utils/security.py` → nuevo decorador **`jwt_superadmin_required`** (exclusivamente SuperAdmin). `ROLES_ADMIN` global queda intacto (no rompe otros flujos).
- `app/blueprints/api/organizaciones.py` → cross-tenant solo SuperAdmin; AdminGRC limitado a su org en `list/get/update`.
- `/admin/*` SSR legacy → **404** (catch-all en la factory; se retiró el menú de `base.html`).

## 5. API del superportal (`app/blueprints/api/super_admin.py`, prefijo `/api/super`)

**Naming (decisión 2026-11-12):** un *tenant* (organización en el backend) es un **"ambiente de cliente"** en la consola y los mensajes. Coincidencia 1:1, sin jerarquía adicional.

Todo con `@jwt_superadmin_required`, **todo en bitácora** (org del tenant afectado) y exento del trial gate (`TRIAL_GATE_EXENTOS`):

| Endpoint | Función |
|---|---|
| `GET /api/super/dashboard` | KPIs: tenants (total/activos/suspendidos), trials (activos/vencidos/por vencer 7d), usuarios, altas 30d, **MRR estimado** (precios de `billing_service.PLANES`, solo planes pagados de tenants activos), distribución por plan y tabla de trials por vencer |
| `POST /api/super/tenants` | **Alta de ambiente de cliente** (onboarding asistido): crea organización (plan/trial a elección) + usuario **AdminGRC** con link de activación para definir contraseña + bitácora. Validaciones: 400 faltantes/plan inválido, 409 email o nombre duplicados |
| `GET /api/super/tenants?q=&plan=&estado=&producto_id=` | Listado paginado con métricas agregadas por org (COUNTs `group_by`, sin N+1) y último acceso |
| `GET /api/super/tenants/<id>` | Detalle: datos + usuarios + productos + métricas |
| `PATCH /api/super/tenants/<id>` | `plan` (validado contra PLANES), `trial_hasta` (ISO), `extender_trial_dias`, `activo` (suspender/reactivar). **Notifica in-app a los admins del tenant** |
| `GET/PATCH /api/super/tenants/<id>/productos` | Listar catálogo con estado / habilitar-deshabilitar (upsert). Deshabilitar notifica a los admins |
| `POST /api/super/tenants/<id>/usuarios` | Crear usuario (invitación; nunca rol SuperAdmin). Devuelve `reset_url` para entregar manualmente si no hay SMTP |
| `PATCH /api/super/tenants/<id>/usuarios/<uid>` | `activo`, `rol` (nunca SuperAdmin), `desbloquear` (limpia bloqueo por intentos fallidos) |
| `POST /api/super/tenants/<id>/usuarios/<uid>/reset-password` | Genera link de reset (correo si hay SMTP + URL de respaldo en la respuesta) |
| `POST /api/super/tenants/<id>/impersonate` | Token de canje single-use (ver §6) |

**Enforcement de productos** (cliente + plataforma):
- `POST /api/perfil/cargar-marco` → **403** si el producto del marco está deshabilitado para la org (mensaje con contacto TitanStudio). Un marco ya cargado sigue accesible (el gate aplica a cargas nuevas).
- `GET /api/perfil/que-me-aplica` → cada ítem incluye `incluido: true|false`.

## 6. Impersonación de soporte (diseño single-use)

Servicio `app/services/impersonation_service.py` + endpoints en `super_admin.py` y `auth.py`:

1. SuperAdmin emite token JWT de canje: vida **90 s**, claims `tipo=impersonacion`, `actor_id`, jti registrado como pendiente en **Redis** (misma instancia del rate-limiter; fallback a memoria de proceso).
2. El superportal abre `<APP>/impersonate?token=...` en pestaña nueva. La SPA principal canjea en `POST /api/auth/impersonate/consume` (rate-limit 10/min): valida tipo/exp/pendiente, **marca consumido** (un solo uso, defensa en profundidad con TTL 10 min) y emite un **access token de ~60 min con claim `actuando_como`** (actor real). **Sin refresh token**: la sesión de soporte expira sola.
3. Trazabilidad: la bitácora registra cada acción como `"<actor> en nombre de <objetivo>"` (propagación del claim en `configure_bitacora` → `bitacora_service._actor`), y el inicio/fin quedan como acción `impersonacion`.
4. UX en la app principal: **banner fijo** ("Sesión de soporte TitanStudio actuando como ⟨usuario⟩… Finalizar") visible durante toda la sesión (`AuthContext.actuandoComo`).

## 7. Frontend

### 7.1 SPA `frontend-titantech/` (nueva, mismo stack: React 18 + Vite 5 + TS + AntD 5)

- **Skin Titan fijo** (negro/plata/azul): la consola se distingue visualmente del producto.
- Login propio que **rechaza roles != SuperAdmin** (y limpia la cookie de refresh recién creada).
- Páginas: **Dashboard** (KPIs con tooltips + trials por vencer + distribución por plan + MRR) · **Tenants** (búsqueda/filtros plan/estado/producto + acciones: extender trial +14d, suspender/reactivar con confirmación) · **Tenant detalle** (tabs Datos · Plan y productos con switches · Usuarios con crear/bloquear/desbloquear/reset/**Entrar como**).
- `VITE_APP_URL` (build arg) apunta a la app principal para los links de activación/reset/impersonación.
- `X-Robots-Tag: noindex` + `noindex` en el HTML.

### 7.2 App principal (`frontend/`) — cambios mínimos

- Nueva ruta pública `/impersonate` (`pages/Impersonate.tsx`): canjea el token y redirige.
- Banner de sesión de soporte en `AppLayout` (con "Finalizar").
- `¿Qué me aplica?`: marco no incluido → tarjeta con tag "No incluido en tu plan" (tooltip explicativo) y botón de carga deshabilitado.

## 8. Deploy (labcmadrid) — ejecutado 2026-11-11

1. `docker compose build front-titantech && docker compose up -d front-titantech` (puerto **6004**; `VITE_APP_URL` por defecto `https://dev.cumplisign.com` en el `.env` del servidor).
2. `docker compose exec back flask db upgrade` (aplica `i1a2b3c4d5e6`) — recomendado: backup previo (el servicio `db-backup` ya lo hace).
3. Cloudflare (misma mecánica que dev.cumplisign.com, vía túnel existente apuntando a la IP Tailscale):
   - DNS: CNAME `dev.titantech` → túnel cloudflared.
   - Ingress del túnel: `dev-titantech.cumplisign.com` → `http://<host>:6004`.
4. Recomendado: **Cloudflare Access** sobre `dev-titantech.cumplisign.com` restringido a los emails de los 3 socios (capa extra antes del login de la app).

## 9. Tests y criterios de aceptación

`tests/test_super_admin.py` (15 tests) + suite completa **76 passed**. Criterios verificados:

- [x] 403 a no-SuperAdmin en `/api/super/*` (401 anónimo)
- [x] Dashboard: KPIs, MRR solo con planes pagados activos, trials por vencer
- [x] Listado con búsqueda/filtros; PATCH plan/trial/suspensión + notificación a admins
- [x] Productos: default incluido, deshabilitación y **gate 403** en cargar-marco; reflejo en ¿Qué me aplica?
- [x] Usuarios: crear (rol SuperAdmin rechazado), bloquear/desbloquear, reset con link; cuentas de plataforma intocables
- [x] Impersonación: single-use (2º consumo 401), access de soporte funciona, actor en bitácora
- [x] Endurecimiento: AdminGRC ya no lista/edita otras orgs; SuperAdmin sí
- [x] `/admin` legacy → 404

E2E local ejecutado con datos del seed (login admin → dashboard → cambio de plan → MRR → deshabilitar producto → 403 → notificaciones → bitácora "actor en nombre de objetivo" → impersonación completa).

## 10. QA pendiente (post-deploy)

Recorrido sobre `https://dev-titantech.cumplisign.com` siguiendo la práctica del proyecto (documentar en `QA-Superportal-Resultado.md`):

1. Login con SuperAdmin (y rechazo con usuario de tenant).
2. Dashboard coherente con datos reales de producción.
3. Extender trial de un tenant demo → reflejo en su banner de la app principal.
4. Suspender/reactivar → notificación in-app a los admins.
5. Deshabilitar producto → "No incluido en tu plan" en la app del cliente → rehabilitar.
6. Crear usuario + link de activación → completar alta.
7. "Entrar como" → banner de soporte en dev.cumplisign.com → operar → finalizar.
8. Verificar entradas de bitácora en Auditoría Sistema del tenant.

## 11. Trabajo futuro (explícito, no parte de este sprint)

- Enforcement de límites por plan (ej. nº de marcos por plan) cuando el pricing esté cerrado.
- Gestión del catálogo global de productos **desde la UI** (hoy el catálogo vive en el seed).
- Métricas de uso avanzadas (actividad por módulo, retención) y export.
- Cloudflare Access como REQUIREMENT (hoy recomendación).
