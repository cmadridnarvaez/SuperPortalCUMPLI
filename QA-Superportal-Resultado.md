# QA Superportal TitanTech — Resultado y Correcciones

**Fecha:** 12 de noviembre de 2026
**Entorno:** https://dev-titantech.cumplisign.com (consola) + https://dev.cumplisign.com (app del cliente) — labcmadrid, rama `feat/superportal-titantech`
**Método:** recorrido por interfaz (navegador real) según §10 de `Superportal-TitanTech-especificacion-desarrollo.md`, complementado con verificaciones por API y BD.
**Cuenta operador:** `admin` (SuperAdmin) · **Tenant de prueba:** Empresa Demo (org 1, admin `demo.admin`).

---

## Resumen

| Paso | Resultado | Detalle |
|---|---|---|
| QA-1 Login (rechazo tenant / acepta SuperAdmin) | ✅ OK | `demo.admin` → "Esta consola es exclusiva del equipo TitanStudio (SuperAdmin)" y cookie de refresh revocada; `admin` entra al dashboard |
| QA-2 Dashboard coherente | ✅ OK | 3 tenants · 3 activos · MRR $0 · 6 usuarios · +3 tenants/30d — coincide con API y BD |
| QA-3 Extender trial → reflejo en el cliente | ✅ OK | +14d por UI ("trial hasta 2026-11-26 (14d)"); con trial a 3d el cliente ve el banner "Te quedan 3 día(s) de prueba" con CTA "Ver planes" |
| QA-4 Suspender/reactivar + notificación | ⚠️ OK con hallazgo | Modal de confirmación, tag "suspendido", campana del admin muestra "Cuenta suspendida (alta)" con contacto; reactivación restaura todo. **PERO el login NO se bloqueaba → hallazgo QA-01 (P1), corregido** |
| QA-5 Producto deshabilitado → reflejo | ✅ OK | Switch ISO 37301 → "no contratado"; el cliente ve tag "No incluido en tu plan" y botón "Cargar marco" deshabilitado; notificación al admin; rehabilitación restaura el botón |
| QA-6 Crear usuario + alta | ✅ OK | Modal → link de activación copiable → pantalla de contraseña en la app → login OK (`ignacia.qa`, rol Usuario) |
| QA-7 "Entrar como" | ✅ OK | Banner fijo "Sesión de soporte TitanStudio — actuando como Carlos Ortega · iniciada por Administrador Sistema · expira sola (~60 min)" + "Finalizar" vuelve al login. Hallazgo menor QA-03 (popup blocker) corregido con fallback |
| QA-8 Bitácora en Auditoría Sistema | ✅ OK | El tenant ve las entradas `impersonacion` con "Administrador Sistema **en nombre de** Carlos Ortega/Sofía Ramírez"; secrets redactados (`password_hash: •••`) |

**Balance: 8/8 pasos verificados · 1 hallazgo P1 + 2 menores — los 3 corregidos en esta misma entrega.**

## Hallazgos y correcciones aplicadas

### QA-01 (P1) — Suspender un tenant NO bloqueaba el acceso
**Síntoma:** con Empresa Demo suspendida, `demo.admin` podía iniciar sesión normalmente (login 200). La suspensión solo notificaba.
**Causa:** `login` valida `usuario.activo` pero nunca `organizacion.activo`; ningún gate revisaba la suspensión por request.
**Corrección (backend):**
- `app/blueprints/api/auth.py` — `login`: 403 `cuenta_suspendida` si la org del usuario está inactiva (con mensaje de contacto); `refresh`: no renueva sesiones de tenants suspendidos (SuperAdmin exento).
- `app/__init__.py` — nuevo `configure_suspension_gate` (before_request): corta TODA la API para usuarios de orgs suspendidas, también con access tokens emitidos antes de la suspensión. Exentos: `/api/auth/logout`, `/api/publico/`, `/api/billing/` (para que puedan pagar y reactivar), `/api/notificaciones` (para que vean el aviso) y `/api/super/`.
- `app/blueprints/auth/routes.py` — mismo bloqueo en el login SSR legacy.
**Test:** `test_suspension_bloquea_login_y_requests` (login → 403 · token previo → 403 · refresh → 403 · exentas → 200 · SuperAdmin reactiva → login vuelve a 200).

### QA-02 (P3) — Icono de notificación tipo `plataforma` como emoji
**Síntoma:** la notificación "Cuenta suspendida" mostraba 📢 (default) en la campana, en vez de icono AntD (patrón PR #19 H-03).
**Corrección:** `frontend/src/components/NotificacionesBell.tsx` — mapeo `plataforma: ThunderboltOutlined`.

### QA-03 (P3) — Pop-up de "Entrar como" bloqueable
**Síntoma:** si el navegador bloquea pop-ups, el clic en "Entrar como" emitía y consumía el token (quedaba en bitácora) pero la pestaña nunca se abría.
**Corrección:** `frontend-titantech/src/pages/TenantDetail.tsx` — si `window.open` devuelve null, modal con el link copiable y aviso de expiración (el token de canje vive 90s).

## Observaciones (sin acción)

- El select de rol del modal "Crear usuario" del superportal usa el default "Usuario" si no se despliega (comportamiento antd estándar; los roles quedan cubiertos por API en la suite).
- El texto del banner de soporte menciona la expiración "~60 min": correcto (access token de soporte sin refresh).
- Las notificaciones de plataforma llegan solo a roles AdminGRC/Administrador del tenant (diseño).
- **Diseño a validar con negocio (post-QA):** un tenant suspendido puede pagar solo mientras viva su access token (~15 min); tras eso no puede renovar sesión (refresh bloqueado, por diseño). Además, el webhook de Flow (`activar_plan`) cambia el plan pero NO reactiva una org suspendida. Decisión pendiente: si un suspendido paga, ¿se reactiva solo? (hoy la reactivación la ejecuta TitanStudio desde la consola al confirmar el pago).

## Estado de verificación post-fix

- Suite backend: **77/77** (16 del superportal, incluida la regresión de suspensión).
- Ambos frontends compilan (`npm run build`) ✓.
- Fix verificado en dev tras el redeploy: login de tenant suspendido → **403 `cuenta_suspendida`** (ver §"Recorrido de aceptación" abajo).

## Recorrido de aceptación (repetible en 10 min)

1. Entrar a la consola con `admin`; intentar con `demo.admin` → rechazo con mensaje claro.
2. Dashboard → revisar KPIs contra BD.
3. Tenant Empresa Demo → Plan y productos → Extender trial +14d → aceptar → verificar "trial hasta …(14d)"; entrar a dev.cumplisign.com como `demo.admin` y ver el banner de días restantes.
4. Suspender tenant → en dev.cumplisign.com el usuario suspendido NO puede iniciar sesión (403/mensaje) ni renovar; su campana muestra el aviso; Facturación sigue accesible → Reactivar desde la consola → login vuelve a funcionar.
5. Apagar un producto (p.ej. ISO 37301) → en la app del cliente "¿Qué me aplica?" aparece "No incluido en tu plan" con botón deshabilitado → reactivar.
6. Crear usuario desde la consola → abrir el link de activación → definir contraseña → login.
7. "Entrar como" el admin del tenant → banner de soporte en dev.cumplisign.com → navegar → "Finalizar sesión de soporte".
8. Como `demo.admin`: Administración → Auditoría Sistema → ver entradas `impersonacion` con "en nombre de".
