# CumpliSign | QA de sincronización entre TitanTech Dev y CumpliSign Dev

**Fecha de prueba** · 26 de noviembre de 2026  
**Ambiente** · Empresa Demo (ID 1)  
**Resultado** · Los tres módulos oficiales conservaron visibilidad y acceso al marco durante la baja. La actualización en tiempo real queda pendiente.

## Hallazgo para desarrollo

Al desactivar un producto en **Plan y productos** de TitanTech Dev, el interruptor pasó de **incluido** a **no contratado**. En CumpliSign Dev, la sesión ya abierta siguió mostrando el marco en el selector y permitió abrir su contenido. La primera comprobación del selector se hizo 20 segundos después de confirmar cada baja, sin recargar ni volver a iniciar sesión.

La prueba usó un **SuperAdmin** en TitanTech y el perfil **Administrador de Empresa Demo** en CumpliSign, mediante la sesión de soporte de TitanTech. Se probó una baja por vez y se restituyó cada producto antes de pasar al siguiente. Al cierre, los tres figuraban como **incluidos** y se cerró la sesión de soporte.

## Evidencia de ambos Dev

Los siguientes registros se transcribieron de las interfaces durante la prueba. Los enlaces llevan a las pantallas y los marcos utilizados. El contenido visible al abrirlos depende de la configuración y sesión vigentes.

| Producto | Evidencia en TitanTech Dev | Evidencia en CumpliSign Dev con el producto desactivado |
|---|---|---|
| Seguridad de la información — ISO 27001 (`ISO27001`) | **Incluido → No contratado → Incluido**. | **Seguridad Digital** siguió visible en el menú. El selector conservó ISO 27001 y el marco abrió con **115 requisitos aplicables**. [Marco ISO 27001](https://dev.cumplisign.com/cumplimiento?marco=ISO27001) |
| Protección de datos personales — Ley 21.719 (`LEY21719`) | **Incluido → No contratado → Incluido**. | **Privacidad** siguió visible en el menú. El selector conservó Ley 21.719 y el marco abrió con **24 requisitos aplicables**. [Marco Ley 21.719](https://dev.cumplisign.com/cumplimiento?marco=LEY21719) |
| Leyes 20.393 y 21.595 — MPD (`LEY21595`) | **Incluido → No contratado → Incluido**. | **Personas y Ética** siguió visible en el menú. El selector conservó MPD y el marco abrió con **21 requisitos aplicables**. [Marco MPD](https://dev.cumplisign.com/cumplimiento?marco=LEY21595) |

[TitanTech Dev · Empresa Demo](https://dev-titantech.cumplisign.com/tenants/1) · [CumpliSign Dev · Marcos y Tableros](https://dev.cumplisign.com/cumplimiento)

**Resultado de la reactivación.** TitanTech confirmó la restauración de cada interruptor. En CumpliSign los marcos conservaron su disponibilidad durante la baja y la reactivación, por lo que el restablecimiento efectivo del acceso queda sin validar.

**Antecedente de Ley Karin.** En una prueba previa de la misma empresa, con Administrador Sistema, Ley Karin siguió visible durante 60 segundos sin recargar. Una pestaña nueva con la misma sesión también abrió el marco y mostró 10 requisitos aplicables mientras TitanTech indicaba **no contratado**. Se restauró el producto. [Marco Ley Karin](https://dev.cumplisign.com/cumplimiento?marco=LEYKARIN)

**Alcance verificado.** Se observó la navegación y el acceso a los marcos por interfaz. Quedan pendientes el inicio de sesión directo de cliente, los permisos de otros roles, cada herramienta interna y la validación de autorización en backend. La causa técnica sigue abierta.

## Capturas de la revalidación

Las capturas corresponden a una nueva ejecución de las tres bajas en Empresa Demo. Cada bloque muestra el interruptor en TitanTech y, en la misma sesión de cliente de CumpliSign, el menú y el marco después de comprobar que seguía presente a los 20 segundos. La pestaña de CumpliSign se mantuvo sin recargar durante las tres pruebas. Las imágenes muestran el estado de cada interfaz y la secuencia se registró durante la ejecución. Se confirmó que los tres productos volvieron a quedar incluidos al terminar.

### ISO 27001

**TitanTech Dev** · Producto actualizado a **no contratado**.

![TitanTech Dev, ISO 27001 no contratado](Evidencia-QA-Sincronizacion-TitanTech-Dev/iso27001-titantech.jpg)

**CumpliSign Dev** · Seguridad Digital visible en el menú y marco abierto con sus requisitos mientras el producto estaba dado de baja.

![CumpliSign Dev, menú Seguridad Digital visible durante la baja](Evidencia-QA-Sincronizacion-TitanTech-Dev/iso27001-cumplisign-menu.jpg)

![CumpliSign Dev, marco ISO 27001 abierto durante la baja](Evidencia-QA-Sincronizacion-TitanTech-Dev/iso27001-cumplisign-marco.jpg)

### Ley 21.719

**TitanTech Dev** · Producto actualizado a **no contratado**.

![TitanTech Dev, Ley 21.719 no contratado](Evidencia-QA-Sincronizacion-TitanTech-Dev/ley21719-titantech.jpg)

**CumpliSign Dev** · Privacidad visible en el menú y marco abierto con sus requisitos mientras el producto estaba dado de baja.

![CumpliSign Dev, menú Privacidad visible durante la baja](Evidencia-QA-Sincronizacion-TitanTech-Dev/ley21719-cumplisign-menu.jpg)

![CumpliSign Dev, marco Ley 21.719 abierto durante la baja](Evidencia-QA-Sincronizacion-TitanTech-Dev/ley21719-cumplisign-marco.jpg)

### MPD

**TitanTech Dev** · Producto actualizado a **no contratado**.

![TitanTech Dev, MPD no contratado](Evidencia-QA-Sincronizacion-TitanTech-Dev/mpd-titantech.jpg)

**CumpliSign Dev** · Personas y Ética visible en el menú y marco abierto con sus requisitos mientras el producto estaba dado de baja.

![CumpliSign Dev, menú Personas y Ética visible durante la baja](Evidencia-QA-Sincronizacion-TitanTech-Dev/mpd-cumplisign-menu.jpg)

![CumpliSign Dev, marco MPD abierto durante la baja](Evidencia-QA-Sincronizacion-TitanTech-Dev/mpd-cumplisign-marco.jpg)

## Alcance de producto para configurar en ambos Dev

**HUB de cumplimiento** es el nombre de toda la plataforma. El catálogo oficial tiene tres módulos y una base compartida. La siguiente definición es el alcance solicitado para configurar la oferta y el acceso en ambas plataformas.

| Módulo oficial | Clave actual en TitanTech | Funciones incluidas |
|---|---|---|
| Seguridad de la información — ISO 27001 | `ISO27001` | Marco ISO 27001, requisitos, aplicabilidad y seguimiento de brechas. Inventario de activos de información. Gestión de amenazas y vulnerabilidades. Registro y seguimiento de incidentes de seguridad. Gestión de controles y sus relaciones con riesgos y requisitos. Incluye la base compartida. |
| Protección de datos personales — Ley 21.719 | `LEY21719` | Registro de Actividades de Tratamiento (RAT) y mapa de datos. Vínculos de los tratamientos con activos y terceros. Evaluaciones de impacto (DPIA). Gestión de consentimientos y solicitudes de ejercicio de derechos. Reportes de tratamientos y evaluaciones. Incluye la base compartida. |
| Leyes 20.393 y 21.595 — MPD | `LEY21595` | Marco del Modelo de Prevención de Delitos y seguimiento de requisitos de ambas leyes. Riesgos, controles y terceros vinculados al programa. Registro y gestión interna de denuncias. Declaración y seguimiento de conflictos de interés. Capacitaciones. Incluye la base compartida. |

**Base compartida.** Gestión de usuarios y responsables, matrices y gestión de riesgos, controles, terceros, políticas, auditorías, hallazgos, planes de acción, evidencias, tableros y reportes.

### Reglas de configuración y revalidación

1. Asociar cada clave de TitanTech al marco, las entradas de navegación y las funciones de su módulo en CumpliSign. Aplicar la configuración por empresa y conservar los permisos del rol. Validar las funciones enumeradas en la tabla además del marco.
2. Mantener una sola base compartida por empresa. Cuando sigue contratado otro módulo oficial, sus usuarios autorizados conservan las herramientas de la base y sus registros. La baja limita el acceso a las funciones exclusivas del módulo y al contenido correspondiente según los permisos. La reactivación recupera el acceso autorizado a los datos existentes.
3. Si un bloque de navegación sirve a varios productos, evaluar sus entradas por función. Por ejemplo, **Controles** pertenece a la base compartida y el marco ISO conserva su propia vista de controles vinculados. El bloque **Seguridad Digital** puede conservar entradas autorizadas por otro producto si corresponde.
4. Validar cada módulo contratado por separado y el escenario con los tres activos. Probar la baja y la reactivación individual en una sesión abierta, incluyendo las funciones específicas, las entradas del menú, el marco y la base compartida. El comportamiento comercial de la base cuando se da de baja el último producto queda por definir.
5. Mantener **CIS Controls v8**, **NIST Cybersecurity Framework 2.0** y **Ley 16.744** como candidatos de contratación independiente. Su presencia en TitanTech identifica opciones de catálogo. Su alcance en CumpliSign y su configuración comercial quedan por validar.

## Pasos para reproducir

1. Abrir **TitanTech Dev → Ambientes → Empresa Demo → Plan y productos** como SuperAdmin. Registrar el estado inicial de los tres productos y usar un ambiente de pruebas autorizado.
2. En TitanTech, abrir **Usuarios → Entrar como** con una cuenta activa cuyo rol sea **Administrador** de la empresa. En CumpliSign, verificar el perfil y abrir **Cumplimiento → Marcos y Tableros**. Dejar abierto el selector **Norma o ley**. Confirmar que el marco objetivo aparece y abre antes de iniciar la prueba.
3. Mantener CumpliSign abierto. Desactivar un solo producto desde TitanTech y esperar a que figure como **no contratado**. Usar ese momento como inicio de la medición.
4. Sin tocar CumpliSign, observar si cambia el selector. Para reproducir el hallazgo, registrar su estado a los 20 segundos. Después, revisar el menú lateral e intentar abrir el marco desde el selector, sin recargar ni cerrar sesión. Registrar el estado del menú, si se abre el marco y si se muestran sus requisitos.
5. Volver a activar el producto en TitanTech. Confirmar **incluido** y registrar si el menú, el selector y el acceso se recuperan en esa misma sesión de CumpliSign.
6. Repetir con los otros dos productos. Restituir cualquier configuración modificada y verificar el estado final de los tres interruptores.

## Criterios de aceptación

- **Baja en sesión abierta.** Al confirmar **no contratado** en TitanTech, CumpliSign actualiza automáticamente el menú y el selector de la misma empresa, sin recargar, volver a iniciar sesión ni navegar para forzar la actualización. Desaparecen las entradas exclusivas del producto y su marco deja de estar disponible.
- **Acceso al producto desactivado.** Si el cliente ya está dentro del marco al momento de la baja, CumpliSign deja de presentar su contenido como accesible y muestra un estado claro de producto no disponible o dirige a una vista permitida. Una navegación directa a la URL del marco tampoco debe dar acceso. El control de acceso se aplica en el servidor y respeta los permisos del rol.
- **Reactivación en sesión abierta.** Al confirmar **incluido** en TitanTech, vuelven automáticamente las entradas aplicables del menú y del selector, y un usuario autorizado puede abrir el marco en esa misma sesión.
- **Base compartida y otros módulos.** Cada baja afecta solo al producto seleccionado y a la empresa configurada. Los demás productos contratados y las funciones compartidas que sigan habilitadas continúan operativos. Si una agrupación del menú contiene funciones compartidas o de otro módulo habilitado, puede seguir visible con las entradas que correspondan.
- **Persistencia.** Una pestaña nueva o una sesión nueva de la misma empresa refleja la última configuración guardada, tanto para la baja como para la reactivación.
- **Verificación de tiempos.** Desarrollo y producto acuerdan el máximo admisible y lo registran antes de la revalidación. Medir desde la confirmación en TitanTech hasta el cambio de visibilidad y acceso en CumpliSign para cada uno de los tres productos. Los **20 segundos** del QA describen la ventana observada.
