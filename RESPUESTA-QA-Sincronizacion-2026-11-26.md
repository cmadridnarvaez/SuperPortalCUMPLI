# Respuesta · QA de sincronización TitanTech Dev ↔ CumpliSign Dev

**Fecha:** 26 de noviembre de 2026
**Responde a:** `CumpliSign-QA-Sincronizacion-TitanTech-Dev.md` (frontend-titantech/)
**Implementación:** PR #115 (main `67354d5`), desplegado y verificado en dev con el caso exacto del QA.
**Suite:** 259/259 (2 tests nuevos de regresión).

## Hallazgo → corrección

**Lo que observó el QA era correcto y ahora está corregido en las dos capas:**

1. **Acceso sin control real (la parte grave).** El gate anterior solo impedía *cargar* un marco nuevo; los datos ya cargados y todos los endpoints del módulo quedaban abiertos. Ahora existe **gate server-side por producto** (`configure_producto_gate`): con el producto en `no contratado`, los endpoints del módulo responden `403 producto_no_contratado` — incluida la **navegación directa al marco ya cargado** (árbol, tablero, resumen, detalle, requisitos, mapeos), que era el escenario del criterio 2.

2. **Sin actualización en sesión abierta (la parte visible).** El cliente ahora consulta una configuración liviana (`GET /api/perfil/productos`) con **polling cada 15 segundos**: el menú lateral oculta las entradas del módulo (los grupos que quedan vacíos desaparecen), el selector «Norma o ley» oculta los marcos del producto, y si el usuario estaba dentro del marco o una página del módulo, se le expulsa a una vista permitida con un aviso claro — **sin recargar ni volver a iniciar sesión**.

## Verificación con el caso exacto del QA (dev, 26-11)

Baja de **ISO27001** desde TitanTech con la sesión de Empresa Demo abierta:

| Comprobación | Resultado |
|---|---|
| `/api/perfil/productos` (config que ve el polling) | `seguridad: false` al instante → menú/selector en ≤ 15 s |
| Endpoints del módulo (activos, amenazas, vulnerabilidades, incidentes) | **403** `producto_no_contratado` |
| Navegación directa al marco ISO 27001 ya cargado (árbol, tablero) | **403** (CA 2) |
| Base compartida (riesgos, controles, políticas, auditorías) | **200** — sin afectar (CA 4) |
| Otros módulos (privacidad, denuncias) | **200** — sin afectar |
| Reactivación desde TitanTech | **200** al instate en módulo y marco (CA 3) |

## Mapeo módulos ↔ productos (reglas 1–5 de la configuración)

| Módulo oficial | Producto TitanTech | Endpoints/páginas bloqueados en baja |
|---|---|---|
| Seguridad de la información | `ISO27001` | Activos, Amenazas, Vulnerabilidades, Incidentes + marco ISO 27001 |
| Protección de datos personales | `LEY21719` | Datos Personales (RAT/ROPA), Consentimientos, Derechos ARCO + marco Ley 21.719 |
| MPD (20.393 + 21.595) | `LEY21595` | Denuncias, Conflictos, Capacitaciones + marco MPD |

- **Base compartida siempre disponible** (regla 2): usuarios, riesgos, matrices, controles, terceros, políticas, auditorías, hallazgos, plan de acción, evidencias, tableros, reportes.
- **Grupos de menú mixtos** (regla 3): Seguridad Digital conserva **Controles** y **Conectores** (base) cuando ISO 27001 se da de baja; solo desaparecen las entradas exclusivas.
- **Persistencia** (CA 5): una sesión o pestaña nueva ve la última configuración desde el primer render.
- **Tiempos** (CA 6): ventana máxima propuesta **15 segundos** (intervalo de polling). El control de acceso real es inmediato (server-side); los 15 s gobiernan solo la actualización visual de la sesión abierta. Pendiente la aprobación formal de producto del valor.

## Pendientes declarados

1. **Aprobación del tiempo máximo** (15 s propuesto) por producto.
2. **CIS / NIST CSF / Ley 16.744 como productos independientes** (regla 5): hoy constan en el catálogo de TitanTech; su gating y packaging comercial quedan para cuando se decida la oferta.
3. **Comportamiento de la base cuando se da de baja el último producto** (regla 4): por definir con negocio — hoy la base sigue operativa.
4. Pruebas de QA con permisos de otros roles y sesión nueva de cliente directo (alcance que el propio QA dejó pendiente) — el gate aplica igual para todo rol no-SuperAdmin.

## Cómo revalidar (paso a paso del QA, sin cambios)

El recorrido del documento original funciona tal cual: con la sesión de CumpliSign abierta, desactivar el producto en TitanTech y **esperar hasta 15 segundos** (antes se medían 20): el selector actualiza, el menú pierde las entradas exclusivas y el marco responde como no disponible; la navegación directa por URL también queda bloqueada. Reactivar y verificar la recuperación en la misma sesión.
