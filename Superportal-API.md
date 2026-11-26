# Superportal TitanTech · API para agentes

**Versión:** 1.0 · 25-nov-2026
**Base URL:** `https://dev-titantech.cumplisign.com` (dev) · `https://titantech.cumplisign.com` (prod)
**Regla de gobernanza:** *todo lo que la consola hace por GUI existe como API, siempre. Toda feature nueva del superportal nace con su endpoint — sin excepciones.*

## Autenticación

Dos credenciales válidas para `/api/super/*`:

1. **JWT de sesión** (el login de la consola): `Authorization: Bearer <token>`
2. **API key de plataforma** (para agentes): header `X-API-Key: grc_…` o `Authorization: Bearer grc_…`

Las API keys las crea cada SuperAdmin desde la consola (**menú → API → Nueva API key**). La clave se muestra **una sola vez**; guardará con hash y opera **como su creador**. Si el creador baja de rol o se desactiva, la clave muere automáticamente. Todo lo que haga un agente queda en bitácora como «`<usuario> — vía API <nombre key>`».

```bash
# crear una key (con sesión de consola)
curl -X POST https://dev-titantech.cumplisign.com/api/super/api-keys \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{"nombre": "Agente demos", "expira": "2027-03-31"}'
# → { "msg": "…", "clave": "grc_XXXX…", "aviso": "Guarda la clave ahora…" }

# usarla
curl -H "X-API-Key: grc_XXXX…" https://dev-titantech.cumplisign.com/api/super/dashboard
```

## Paridad GUI ↔ API (tabla de verdad)

Cada acción de la consola y su endpoint exacto:

| # | Acción en la GUI | Método y endpoint | Body / notas |
|---|---|---|---|
| 1 | Dashboard (KPIs, MRR, trials por vencer) | `GET /api/super/dashboard` | — |
| 2 | Ambientes: listado con búsqueda y filtros | `GET /api/super/tenants?q=&plan=&estado=&producto_id=&page=&per_page=` | `estado`: `activos`\|`suspendidos` |
| 3 | Ambientes: **Nuevo ambiente** | `POST /api/super/tenants` | `{empresa*, admin_nombre*, admin_email*, rut?, pais?, industria?, plan?, trial_dias?}` → devuelve `reset_url` (link de activación) |
| 4 | Detalle del ambiente | `GET /api/super/tenants/<id>` | datos + usuarios + métricas |
| 5 | Cambiar plan | `PATCH /api/super/tenants/<id>` | `{"plan": "pro"}` |
| 6 | Extender trial +14 días | `PATCH /api/super/tenants/<id>` | `{"extender_trial_dias": 14}` |
| 7 | Fijar trial a fecha exacta | `PATCH /api/super/tenants/<id>` | `{"trial_hasta": "2026-12-31"}` |
| 8 | Suspender / Reactivar | `PATCH /api/super/tenants/<id>` | `{"activo": false}` / `true` — notifica a los admins del ambiente |
| 9 | Productos: listar catálogo + habilitados | `GET /api/super/tenants/<id>/productos` | sin fila = incluido |
| 10 | Productos: activar/desactivar por ambiente | `PATCH /api/super/tenants/<id>/productos` | `{"producto_id": N, "habilitado": false}` |
| 11 | Usuarios: crear (invitación) | `POST /api/super/tenants/<id>/usuarios` | `{nombre*, email*, rol, cargo?}` → `reset_url` |
| 12 | Usuarios: bloquear/activar/cambiar rol/desbloquear | `PATCH /api/super/tenants/<id>/usuarios/<uid>` | `{activo?, rol?, desbloquear?}` |
| 13 | Usuarios: reset de contraseña | `POST /api/super/tenants/<id>/usuarios/<uid>/reset-password` | → `reset_url` + `email_enviado` |
| 14 | **Entrar como** (soporte) | `POST /api/super/tenants/<id>/impersonate` | `{usuario_id?}` → token single-use 90s; canjear con `POST /api/auth/impersonate/consume` |
| 15 | API keys: listar | `GET /api/super/api-keys` | nunca expone hashes |
| 16 | API keys: crear | `POST /api/super/api-keys` | `{nombre*, expira?}` → clave plana UNA vez |
| 17 | API keys: revocar | `DELETE /api/super/api-keys/<id>` | revocación (no borrado físico) |

**Errores:** `400` validación · `401` sin credencial válida · `403` permisos (ej. key cuyo dueño ya no es SuperAdmin) · `404` no existe · `409` duplicado.

## Recetas para agentes

### Onboarding completo de un cliente (sin tocar la GUI)

```bash
BASE=https://dev-titantech.cumplisign.com
KEY="X-API-Key: grc_TU_CLAVE"

# 1. alta del ambiente con plan y admin
ALTA=$(curl -s -X POST $BASE/api/super/tenants -H "$KEY" -H "Content-Type: application/json" \
  -d '{"empresa":"AudySalud SpA","industria":"Salud","plan":"pro",
       "admin_nombre":"Rocío Andrade","admin_email":"rocio@audysalud.cl"}')
RESET=$(echo $ALTA | jq -r .reset_url)      # → https://dev.cumplisign.com/reset-password?token=…

# 2. desactivar un producto no contratado (ej. CIS)
PID=$(curl -s $BASE/api/super/tenants/$(echo $ALTA | jq -r .tenant.id)/productos -H "$KEY" \
  | jq -r '.items[] | select(.codigo=="CIS") | .id')
curl -s -X PATCH $BASE/api/super/tenants/$(echo $ALTA | jq -r .tenant.id)/productos \
  -H "$KEY" -H "Content-Type: application/json" -d "{\"producto_id\":$PID,\"habilitado\":false}"

# 3. entregar $RESET al cliente (WhatsApp/correo): define su contraseña y entra
```

### Salud comercial de la mañana (para un agente de reporte)

```bash
curl -s -H "$KEY" $BASE/api/super/dashboard | jq '{mrr: .kpis.mrr_clp,
  trials_por_vencer: [.trials_por_vencer[] | {nombre, trial_hasta, dias: .trial_restante_dias}]}'
```

### Soporte en nombre del cliente

```bash
TOK=$(curl -s -X POST $BASE/api/super/tenants/1/impersonate -H "$KEY" \
  -H "Content-Type: application/json" -d '{}' | jq -r .token)
# abrir en el navegador (válido 90s, un solo uso):
echo "$BASE/impersonate?token=$TOK"   # …o contra la app principal: https://dev.cumplisign.com/impersonate?token=$TOK
```

## Límites y trazabilidad

- La key **no** sirve para endpoints fuera de `/api/super/*` (una key de integración por org — scope `read`/`write` — es otra cosa, ver F-29).
- `ultima_vez_uso` se actualiza en cada uso (visible en la consola → API).
- Creación, revocación y toda operación vía key quedan en la bitácora del ambiente afectado.
- Buena práctica: `expira` en cada key; una por agente/uso; revocar al rotar personal.
