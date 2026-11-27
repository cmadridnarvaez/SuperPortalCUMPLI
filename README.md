# SuperPortal CumpliSign — Guía para desarrollo

## Qué es este repo

La **consola de operación TitanTech** (dev-titantech.cumplisign.com): la interfaz interna donde TitanStudio administra los ambientes de clientes, planes, productos normativos, usuarios y soporte por impersonación.

Este repo es un **extracto del monorepo principal** `jpalmae/grc` (carpeta `frontend-titantech/`), publicado aquí para trabajo de diseño/rediseño. El backend vive en el monorepo.

## Contributors

| | | |
|---|---|---|
| [@cmadridnarvaez](https://github.com/cmadridnarvaez) | Cristian Madrid | Arquitectura, backend API, deploy, docs |
| [@saambellido-dev](https://github.com/saambellido-dev) | Samantha Bellido | Rediseño de permisos y módulos (PR #1) |
| [@jpalmae](https://github.com/jpalmae) | Jorge Palma | Revisor principal en el monorepo |
| [@mbaeza](https://github.com/mbaeza) | Martin Baeza | Producto y negocio |

---

<a href="https://github.com/cmadridnarvaez/superportalcumpli/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=cmadridnarvaez/SuperPortalCUMPLI&max=4&columns=4" alt="Contributors" />
</a>

## Estructura

```
src/
├── pages/
│   ├── Dashboard.tsx        ← KPIs + MRR + trials por vencer
│   ├── Tenants.tsx          ← Listado de ambientes + filtros + "Nuevo ambiente"
│   ├── TenantDetail.tsx     ← ⭐ Detalle: tabs Datos | Plan y productos | Usuarios
│   ├── ApiKeys.tsx          ← API keys para agentes
│   └── Login.tsx            ← Login exclusivo SuperAdmin
├── components/
│   ├── Layout.tsx           ← Header + menú (Dashboard, Ambientes, API)
│   ├── TableroMarco.tsx     ← (no usado aquí, es del producto principal)
│   └── CheckDraw.tsx        ← Checkmark animado para éxitos
├── api/
│   ├── super.ts             ← Cliente tipado de toda la API /api/super/*
│   └── client.ts            ← Axios base con JWT + refresh
├── auth/AuthContext.tsx     ← Context de autenticación (solo SuperAdmin)
├── theme/tokens.ts          ← Skin Titan (negro/plata/azul, Space Mono)
└── brand.ts                 ← Marca de la consola

backend-reference/            ← Código del backend (solo lectura, para entender la API)
├── super_admin.py           ← Todos los endpoints /api/super/*
├── perfil_service.py        ← Motor "¿Qué me aplica?" + gate de productos
├── producto.py              ← Modelo: productos + organizacion_productos
├── impersonation_service.py ← Tokens single-use para "Entrar como"
└── security.py              ← jwt_superadmin_required + API keys

docs:
├── Superportal-TitanTech-especificacion-desarrollo.md  ← Spec completa
├── Superportal-API.md        ← Contrato API (17 acciones GUI→endpoint)
├── QA-Superportal-Resultado.md ← QA con hallazgos corregidos
├── CumpliSign-QA-Sincronizacion-TitanTech-Dev.md ← QA de la validadora (sincronización)
└── RESPUESTA-QA-Sincronizacion-2026-11-26.md ← Respuesta al QA de sincronización
```

## ⭐ Dónde está "Plan y productos"

**Archivo:** `src/pages/TenantDetail.tsx`
**Línea:** ~245 (tab `key: 'plan'`)
**Componente:** dentro del Tabs de TenantDetail, el segundo tab muestra:
- Select de plan (trial/básico/pro/empresa)
- Botón "Extender trial +14d"
- Botón "Suspender/Reactivar ambiente"
- Lista de productos normativos con Switch on/off (15 productos = marcos)

**API que consume:**
- `GET /api/super/tenants/<id>/productos` → lista con `habilitado` bool
- `PATCH /api/super/tenants/<id>/productos` → `{producto_id, habilitado}`
- `PATCH /api/super/tenants/<id>` → `{plan, extender_trial_dias, activo}`
- Ver `src/api/super.ts` → `superApi.productos` y `superApi.patchTenant`

## Cómo levantar localmente

```bash
# Prerrequisitos: Node 20+, npm
npm install

# Modo desarrollo (proxy /api → backend dev en labcmadrid no funciona local;
# para desarrollo visual puedes usar el mock o apuntar al dev):
VITE_API_TARGET=https://dev.cumplisign.com npm run dev
# → abre http://localhost:5174

# Build
npm run build
```

**Login de prueba:** usuario `admin` / contraseña `Admin123!` (rol SuperAdmin, entorno dev).

## Cómo probar con una empresa de prueba

1. Entra a https://dev-titantech.cumplisign.com con `admin` / `Admin123!`
2. **Ambientes → Nuevo ambiente** → crea una empresa de prueba (ej. "Mi Empresa QA")
3. Ve al detalle → tab **Plan y productos** → ahí están los switches
4. Para verificar la sincronización con CumpliSign:
   - Desactiva un producto (ej. ISO 27001) en TitanTech
   - Abre https://dev.cumplisign.com como usuario del tenant (demo.admin / Demo123!)
   - El menú lateral y el selector de marcos deben ocultar ISO 27001 en ≤15 segundos
   - La navegación directa a `/cumplimiento?marco=ISO27001` responde 403
5. **Reactiva el producto** al terminar para no dejar el ambiente en estado extraño

## Flujo de integración y deploy

### Dónde vive el código de verdad
El código fuente está en el **monorepo** `jpalmae/grc` (privado, invite-only):
- Frontend: `frontend-titantech/` (este repo es una copia)
- Backend: `app/blueprints/api/super_admin.py`

### Flujo de PR
1. Trabaja en una rama `feat/redesign-plan-productos` (o similar)
2. Abre PR a `main` en el monorepo con **cc @jpalmae** (Jorge es el revisor principal)
3. Suite de tests debe pasar (259+ tests en `tests/`)
4. **Quién despliega:** Cristian (cmadridnarvaez) o Jorge hacen el deploy a dev:
   ```bash
   # en labcmadrid (SSH):
   cd ~/apps/grc-dev
   git fetch origin main && git reset --hard origin/main
   docker compose -f docker-compose.dev.yml up -d --build front-titantech
   ```
5. Se verifica en https://dev-titantech.cumplisign.com
6. Para producción: mismo flujo pero contra `~/apps/grc-prod` (puertos 62xx)

### Rama desplegada en Dev ahora
- `main` @ commit `5cf5add` (26-nov-2026)
- Ver siempre: `git log --oneline -1` en `~/apps/grc-dev` del server

## Stack

| Tecnología | Versión | Rol |
|---|---|---|
| React | 18.2 | UI |
| TypeScript | 5.3 | Tipos |
| Vite | 5.1 | Bundler + dev server |
| Ant Design | 5.14 | Componentes |
| TanStack React Query | 5.20 | Data fetching + cache |
| Axios | 1.6 | HTTP client |

## Skin / diseño

La consola usa el **skin Titan** (ver `src/theme/tokens.ts`):
- Negro `#050505` / Plata `#C4C4C4` / Azul `#A8C7DA`
- Space Mono (fuente)
- Borde radio 0 (brutalismo industrial)
- Dark mode fijo

Si el rediseño cambia la estética, mantener coherencia con `tokens.ts`.
