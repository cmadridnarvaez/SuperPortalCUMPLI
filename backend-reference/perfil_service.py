"""Motor de reglas "¿Qué me aplica?" (F-8) — sprint transversal.

Evalúa el perfil de la organización contra las obligaciones legales chilenas y
estándares. Cambios del sprint (QA-01/QA-02):

- Tri-estado: cada pregunta se guarda como True/False/NULL. NULL = Sin
  responder y NO se interpreta como No ("No sé" queda como Por confirmar).
- Estados por marco: Aplica / No aplica / Por confirmar / Exigencia
  contractual / Recomendado, cada uno con fundamento y la respuesta que lo
  explica. El diagnóstico registra la versión del catálogo de reglas.
- Separación de indicadores: el quiz ya NO muestra porcentaje de
  cumplimiento. Para la Ley 21.719 entrega "X de Y requisitos del catálogo
  aplican" (grupos DSM/TI activados por sensibles/menores/transferencias);
  los demás marcos muestran estado y motivo.

También permite cargar un marco aplicable bajo demanda (ensure_* idempotentes).
"""
from app import db
from app.models.cumplimiento import MarcoNormativo, RequisitoNormativo
from app.models.control import Control
from app.models.producto import OrganizacionProducto, Producto

# Versión del catálogo de reglas: cambia cuando se editan preguntas o reglas
VERSION_CATALOGO = 'v2026-11'

# Estados
APLICA = 'Aplica'
NO_APLICA = 'No aplica'
POR_CONFIRMAR = 'Por confirmar'
EXIGENCIA = 'Exigencia contractual'
RECOMENDADO = 'Recomendado'


def _s(p, campo):
    """Respuesta legible de una pregunta tri-estado."""
    v = p.get(campo)
    return {True: 'Sí', False: 'No', None: 'Sin responder'}[v]


# ── Reglas de aplicabilidad ──
# eval(p) → (estado, fundamento, razones[], respuesta)
def _r_21719(p):
    if p.get('pais', 'Chile') not in ('Chile', '', None):
        return None  # ley de otro país: reglas por país más abajo
    if p.get('trata_datos_personales') is False:
        return (NO_APLICA, 'Respondiste que no tratas datos personales de personas naturales',
                ['Sin tratamiento de datos personales no hay deberes ante la Agencia (Ley 21.719)'],
                'Trato datos personales: No')
    razones = ['Tratas datos personales de personas naturales: la Ley 21.719 exige registro de actividades, base legal y respuesta a derechos (arts. 14-11)']
    grupos = []
    if p.get('trata_datos_sensibles'):
        grupos.append('datos sensibles')
    if p.get('trata_datos_menores'):
        grupos.append('datos de menores')
    if grupos:
        razones.append(f'Tratas { " y ".join(grupos) }: activa el grupo DSM del catálogo (consentimiento expreso / parental, arts. 16 y 16 quáter)')
    if p.get('transferencia_internacional'):
        razones.append('Transfieres datos al extranjero: activa el grupo TI (mecanismos del art. 27 como alternativas habilitantes, con garantías del receptor)')
    return (APLICA, 'Tratamiento de datos personales en Chile',
            razones, f"Trato datos personales: {_s(p, 'trata_datos_personales')}")


def _r_mpd(p):
    es_pj = p.get('es_persona_juridica')
    if es_pj is False:
        return (NO_APLICA, 'Respondiste que no son persona jurídica: el modelo de prevención de delitos es exigible a personas jurídicas',
                ['Las personas naturales responden penalmente a título individual (Código Penal)'],
                f"Persona jurídica: {_s(p, 'es_persona_juridica')}")
    if es_pj is None:
        return (POR_CONFIRMAR, 'Falta responder si la organización es persona jurídica',
                ['Toda persona jurídica puede incurrir en responsabilidad penal por los delitos de las Leyes 20.393 y 21.595 (art. 50)'],
                'Persona jurídica: Sin responder')
    razones = ['La persona jurídica puede responder penalmente por los delitos de las Leyes 20.393 y 21.595; un modelo de prevención adecuado y efectivamente implementado (Ley 20.393, art. 4) es la vía de exención reconocida']
    if p.get('proveedor_estado'):
        razones.append('Provees al Estado y participas en compras públicas: revisa actividades expuestas e intermediarios en tu modelo')
    return (APLICA, 'Responsabilidad penal de la persona jurídica', razones,
            f"Persona jurídica: {_s(p, 'es_persona_juridica')}")


def _laboral(nombre_corto):
    def _regla(p):
        t = p.get('tiene_trabajadores')
        if t is True:
            return (APLICA, f'Tienes trabajadores dependientes en Chile: {nombre_corto} es obligatoria',
                    ['Con al menos un trabajador dependiente hay deberes formales y de gestión aplicables'],
                    'Trabajadores dependientes: Sí')
        if t is False:
            return (NO_APLICA, 'Respondiste que no hay trabajadores dependientes',
                    ['Sin trabajadores dependientes no aplican los deberes laborales de esta norma'],
                    'Trabajadores dependientes: No')
        return (POR_CONFIRMAR, 'Falta responder si hay trabajadores dependientes en Chile',
                ['La obligatoriedad depende de tener personal contratado; distinto es no tener (No) que no saberlo (No sé)'],
                'Trabajadores dependientes: Sin responder')
    return _regla


def _r_karin(p):
    base = _laboral('la Ley Karin (21.643)')(p)
    if base[0] == APLICA:
        razones = list(base[2]) + [
            'La prevención, investigación y sanción del acoso y la violencia laboral aplica también en empleadores pequeños: el tamaño ajusta la formalización (registro y difusión), no la exigencia']
        if (p.get('numero_empleados') or 0) <= 10:
            razones.append('Dotación pequeña: la ley permite medidas proporcionadas, no exime del protocolo')
        return (APLICA, base[1], razones, base[3])
    return base


def _r_21663(p):
    pse, oiv = p.get('servicio_esencial'), p.get('clasificacion_oiv')
    if pse or oiv:
        razones = ['La ANCI puede clasificarte con deberes plenos: inscripción en el registro, gestión de riesgos y reporte de incidentes (Ley 21.663 arts. 4 y ss.)']
        if oiv:
            razones.append('Calificación OIV confirmada: deberes reforzados según tu categoría')
        return (APLICA, 'Servicio esencial u operador calificado ante la ANCI', razones,
                f'Servicio esencial: {_s(p, "servicio_esencial")} · OIV: {_s(p, "clasificacion_oiv")}')
    if p.get('proveedor_estado') or p.get('maneja_info_critica'):
        return (RECOMENDADO, 'Proveedor del Estado o manejo de información crítica: el marco de ciberseguridad es la referencia esperada',
                ['Sin calificación como servicio esencial los deberes plenos no aplican; el marco ayuda con exigencias contractuales y ciberresiliencia'],
                f'Servicio esencial: {_s(p, "servicio_esencial")} · OIV: {_s(p, "clasificacion_oiv")}')
    if pse is False and oiv is False:
        return (NO_APLICA, 'Respondiste que no provees servicios esenciales ni tienes calificación OIV',
                ['Sin actividad cubierta por el art. 4 de la Ley 21.663 no hay deberes ante la ANCI'],
                'Servicio esencial: No · OIV: No')
    return (POR_CONFIRMAR, 'Faltan antecedentes sobre tu actividad: no sabemos si provees un servicio esencial o estás calificado como OIV',
            ['Responde la pregunta de servicio esencial (y calificación OIV si aplica) para confirmar'],
            'Servicio esencial: Sin responder')


def _r_27001(p):
    exigido = p.get('iso_exigido_contrato')
    # R107-03: la respuesta null («No sé») nunca se presenta como «No» —
    # conserva su significado igual que laboral/MPD/21.663
    resp = f'ISO exigida por contrato/cliente: {_s(p, "iso_exigido_contrato")}'
    if exigido:
        return (EXIGENCIA, 'Un cliente, contrato o licitación exige ISO/IEC 27001',
                ['La exigencia contractual convierte el estándar en compromiso verificable: implementa y audita el SGSI para no incumplir el contrato'],
                resp)
    if p.get('maneja_info_critica') or p.get('trata_datos_personales') is not False:
        razones = ['Lo exigen clientes corporativos, licitaciones y auditores; certifícalo cuando busques demostrarlo ante terceros']
        if exigido is None:
            razones.append('Responde si un cliente o contrato lo exige: con esa señal el estado pasa a Exigencia contractual')
        return (RECOMENDADO, 'Manejas información crítica o datos personales: el SGSI es la referencia de protección esperada',
                razones, resp)
    if exigido is None:
        return (POR_CONFIRMAR, 'Sin señales de exposición y sin responder la exigencia contractual: no podemos diagnosticar ISO 27001',
                ['Responde las preguntas de información crítica y exigencia contractual para confirmar'], resp)
    return (NO_APLICA, 'Sin información crítica ni tratamiento de datos: el estándar no aporta en este escenario',
            [], resp)


REGLAS = [
    {'marco_codigo': 'LEY21719', 'nombre': 'Ley 21.719 — Protección de datos personales',
     'etiqueta': 'Protección de datos personales', 'legal': True, 'eval': _r_21719},
    {'marco_codigo': 'LEY21663', 'nombre': 'Ley 21.663 — Marco de Ciberseguridad',
     'etiqueta': 'Seguridad de la información', 'legal': True, 'eval': _r_21663},
    {'marco_codigo': 'LEY21595', 'nombre': 'MPD — Modelo de Prevención de Delitos (20.393 + 21.595)',
     'etiqueta': 'Modelo de Prevención de Delitos', 'legal': True, 'eval': _r_mpd},
    {'marco_codigo': 'SST16744', 'nombre': 'Ley 16.744 + DS 44 — Seguridad y Salud en el Trabajo',
     'etiqueta': 'Seguridad y salud laboral', 'legal': True,
     'eval': _laboral('la Ley 16.744 (SST)')},
    {'marco_codigo': 'LEYKARIN', 'nombre': 'Ley 21.643 (Karin) — Prevención acoso y violencia laboral',
     'etiqueta': 'Personas y ética', 'legal': True, 'eval': _r_karin},
    {'marco_codigo': 'LEY21459', 'nombre': 'Ley 21.459 — Delitos informáticos',
     'etiqueta': 'Seguridad de la información', 'legal': True,
     'eval': lambda p: ((RECOMENDADO, 'Tipifica delitos contra sistemas y datos: enlaza tu respuesta con Seguridad de la información y el MPD',
                        ['Protege el acceso ilícito, la interceptación y la manipulación de datos; protocoliza respuesta y evidencia',
                         'Si ofertas servicios de comunicaciones o procesas datos para esos servicios, la exposición sube'],
                        f'Trato datos personales: {_s(p, "trata_datos_personales")} · Información crítica: {_s(p, "maneja_info_critica")}')
                       if p.get('maneja_info_critica') or p.get('proveedor_estado') or p.get('trata_datos_personales') is not False
                       else (NO_APLICA, 'Sin sistemas ni datos relevantes', [], ''))},
    {'marco_codigo': 'ISO27001', 'nombre': 'ISO/IEC 27001:2022 — Seguridad de la información',
     'etiqueta': 'Seguridad de la información', 'legal': False, 'eval': _r_27001},
    {'marco_codigo': 'ISO27701', 'nombre': 'ISO/IEC 27701 — Gestión de privacidad',
     'etiqueta': 'Protección de datos personales', 'legal': False,
     'eval': lambda p: ((RECOMENDADO, 'Extensión de privacidad del SGSI: gestión sistemática de datos personales',
                        ['Útil si formalizas la gestión de privacidad o un contrato la exige',
                         'Dev ofrece la edición 2019; la edición 2025 está pendiente de versionado en el catálogo (las evaluaciones históricas se conservan)'],
                        f'Trato datos personales: {_s(p, "trata_datos_personales")}')
                       if p.get('trata_datos_personales') is not False else (NO_APLICA, 'Sin tratamiento de datos personales', [], ''))},
    {'marco_codigo': 'ISO31000', 'nombre': 'ISO 31000:2018 — Gestión de riesgos',
     'etiqueta': 'Matrices de riesgo', 'legal': False,
     'eval': lambda p: (RECOMENDADO, 'Guía metodológica para crear o unificar matrices y seguir tratamientos',
                        ['No es certificable: guía cómo estructurar el proceso de riesgos', ''], '')},
    {'marco_codigo': 'ISO37301', 'nombre': 'ISO 37301:2021 — Sistema de gestión de cumplimiento',
     'etiqueta': 'Modelo de Prevención de Delitos', 'legal': False,
     'eval': lambda p: (RECOMENDADO, 'Marco complementario para gestionar múltiples obligaciones en un sistema común',
                        ['Política, evaluación de obligaciones, canal de denuncias y mejora continua', ''], '')},
    {'marco_codigo': 'NISTCSF', 'nombre': 'NIST Cybersecurity Framework 2.0',
     'etiqueta': 'Seguridad de la información', 'legal': False,
     'eval': lambda p: ((RECOMENDADO, 'Referencia internacional de ciberseguridad (Govern, Identify, Protect, Detect, Respond, Recover)', [], '')
                       if p.get('maneja_info_critica') or p.get('proveedor_estado') or p.get('servicio_esencial')
                       else (NO_APLICA, 'Sin señales de exposición digital relevante', [], ''))},
    {'marco_codigo': 'CIS', 'nombre': 'Seguridad de la información · CIS Controls v8',
     'etiqueta': 'Seguridad de la información', 'legal': False, 'redirect': 'ISO27001',
     'eval': lambda p: ((RECOMENDADO, 'CIS Controls v8 se gestiona dentro de Seguridad de la información',
                        ['No es un marco aparte: sus controles alimentan el SGSI (ISO/IEC 27001)',
                         'El quiz no elige edición ni Implementation Group: la cobertura CIS (edición, IG1–IG3) se define y cotiza al implementar el SGSI'],
                        f'Información crítica: {_s(p, "maneja_info_critica")}')
                       if p.get('maneja_info_critica') or p.get('proveedor_estado')
                       else (NO_APLICA, 'Sin señales de exposición digital relevante', [], ''))},
]

# Leyes de otros países: solo cuando el país corresponde (sin ruido en Chile)
_PAISES = [
    ('LEY29733', 'Ley 29.733 — Protección de datos personales (Perú)', 'Perú',
     'Toda entidad en Perú que administre bancos de datos (RNPDP, derechos ARCO, seguridad)'),
    ('LEY1581', 'Ley 1581 — Protección de datos personales (Colombia)', 'Colombia',
     'Toda entidad en Colombia que trate datos personales (política, RNBD, autorización)'),
    ('LFPDPPP', 'LFPDPPP — Protección de datos personales (México)', 'México',
     'Todo particular en México que trate datos personales (aviso, ARCO, transferencias)'),
]


def producto_habilitado(org_id, codigo_marco):
    """Un marco está incluido para el tenant cuando no existe fila de
    habilitación (default: todo incluido) o la fila está habilitada.
    Si el marco no existe como producto del catálogo, se considera incluido
    (los productos son un contrato comercial, no un bloqueo operativo)."""
    fila = (OrganizacionProducto.query
            .join(Producto, OrganizacionProducto.producto_id == Producto.id)
            .filter(OrganizacionProducto.organizacion_id == org_id,
                    Producto.codigo == codigo_marco)
            .first())
    return fila.habilitado if fila else True


# ── Módulos oficiales por producto (QA sincronización 26-11) ──
# Cada módulo exclusivo pertenece a UN producto oficial; la base compartida
# (riesgos, controles, terceros, políticas, auditorías, acciones, evidencias,
# reportes, usuarios…) queda siempre disponible mientras haya contrato.
MODULOS_POR_PRODUCTO = {
    'ISO27001': 'seguridad',      # activos, amenazas, vulnerabilidades, incidentes
    'LEY21719': 'privacidad',     # RAT/ROPA, DPIA, consentimientos, ARCO
    'LEY21595': 'etica',          # MPD: denuncias, conflictos, capacitaciones
}

# Prefijo de API → módulo exclusivo (gate server-side). Lo que no está aquí
# es base compartida y nunca se bloquea por producto.
MODULO_POR_PREFIJO_API = {
    'activos': 'seguridad',
    'amenazas': 'seguridad',
    'vulnerabilidades': 'seguridad',
    'incidentes': 'seguridad',
    'privacidad': 'privacidad',
    'consentimientos': 'privacidad',
    'arco': 'privacidad',
    'denuncias': 'etica',
    'conflictos': 'etica',
    'capacitaciones': 'etica',
    'necesidades-formativas': 'etica',
}

# Marco → módulo (para gate de /api/cumplimiento y filtrado del selector)
MODULO_POR_MARCO = dict(MODULOS_POR_PRODUCTO)


def modulos_habilitados(org_id):
    """Estado de los módulos oficiales para una org: {modulo: bool}.

    Un módulo está activo cuando su producto está habilitado (ausencia de
    fila = incluido, igual que producto_habilitado).
    """
    out = {m: True for m in MODULOS_POR_PRODUCTO.values()}
    filas = (OrganizacionProducto.query
             .join(Producto, OrganizacionProducto.producto_id == Producto.id)
             .filter(OrganizacionProducto.organizacion_id == org_id).all())
    for fila in filas:
        modulo = MODULOS_POR_PRODUCTO.get(fila.producto.codigo)
        if modulo:
            out[modulo] = bool(fila.habilitado)
    return out


def _perfil_de(org):
    return {
        'numero_empleados': org.numero_empleados or 0,
        'trata_datos_personales': org.trata_datos_personales,
        'trata_datos_sensibles': org.trata_datos_sensibles,
        'trata_datos_menores': org.trata_datos_menores,
        'transferencia_internacional': org.transferencia_internacional,
        'servicio_esencial': org.servicio_esencial,
        'proveedor_estado': org.proveedor_estado,
        'maneja_info_critica': org.maneja_info_critica,
        'tiene_trabajadores': org.tiene_trabajadores,
        'es_persona_juridica': org.es_persona_juridica,
        'clasificacion_oiv': org.clasificacion_oiv,
        'iso_exigido_contrato': org.iso_exigido_contrato,
        'industria': org.industria,
        'pais': org.pais or 'Chile',
    }


def _aplican_21719(marco, perfil):
    """«X de Y requisitos del catálogo aplican»: los capítulos DSM y TI solo
    aplican con sensibles/menores/transferencias; el resto del catálogo es
    base del tratamiento (alcance definido y verificado a nivel de requisito).
    El grupo de cada requisito es el código de su capítulo padre (parent_id).

    R107-03: «Sin responder» (null) no activa el grupo (no equivale a Sí),
    pero esos requisitos se cuentan como «por confirmar»: podrían aplicar
    cuando se responda la pregunta que gobierna el grupo."""
    requisitos = RequisitoNormativo.query.filter_by(
        marco_id=marco.id, activo=True).all()
    codigo_de = {r.id: r.codigo for r in requisitos}
    r_sens = perfil.get('trata_datos_sensibles')
    r_menores = perfil.get('trata_datos_menores')
    r_transf = perfil.get('transferencia_internacional')
    sensibles = bool(r_sens or r_menores)
    transferencias = bool(r_transf)
    grupo_dsm_pendiente = (not sensibles) and (r_sens is None or r_menores is None)
    grupo_ti_pendiente = (not transferencias) and r_transf is None
    exigibles = [r for r in requisitos if r.exigible]
    aplican = pendientes = 0
    for r in exigibles:
        padre = (codigo_de.get(r.parent_id) or '').upper()
        if padre == 'DSM' and not sensibles:
            if grupo_dsm_pendiente:
                pendientes += 1
            continue
        if padre == 'TI' and not transferencias:
            if grupo_ti_pendiente:
                pendientes += 1
            continue
        aplican += 1
    return {'total': len(exigibles), 'aplican': aplican, 'pendientes': pendientes}


def evaluar_aplicabilidad(org):
    """Evalúa todas las reglas contra el perfil (tri-estado). Retorna por
    marco: estado (Aplica/No aplica/Por confirmar/Exigencia contractual/
    Recomendado), fundamento, razones, la respuesta que lo explica, versión
    del catálogo, carga y «X de Y aplican» cuando el marco lo define."""
    perfil = _perfil_de(org)
    cargados = {m.codigo: m for m in MarcoNormativo.query.filter_by(
        organizacion_id=org.id, activo=True).all()}

    reglas = list(REGLAS)
    for codigo, nombre, pais, porque in _PAISES:
        if perfil['pais'] == pais:
            reglas.append({'marco_codigo': codigo, 'nombre': nombre, 'legal': True,
                           'eval': (lambda pq: (lambda p: (APLICA, pq, [pq], '')))(porque)})

    resultado = []
    for regla in reglas:
        codigo = regla['marco_codigo']
        salida = regla['eval'](perfil)
        if salida is None:
            continue
        estado, fundamento, razones, respuesta = salida
        razones = [r for r in razones if r]

        marco = cargados.get(codigo)
        cargado = marco is not None
        aplican = _aplican_21719(marco, perfil) if (cargado and codigo == 'LEY21719') else None

        resultado.append({
            'codigo': codigo, 'nombre': regla['nombre'],
            'etiqueta': regla.get('etiqueta'), 'estado': estado,
            'fundamento': fundamento, 'razones': razones, 'respuesta': respuesta,
            'version_catalogo': VERSION_CATALOGO,
            # R107-04: marcos que se gestionan dentro de otro (CIS → SGSI):
            # la tarjeta deriva allí en vez de ofrecer «Cargar marco» aparte
            'redirect': regla.get('redirect'),
            # compat: los consumidores previos colorean por obligatoriedad
            'obligatoriedad': 'Obligatoria' if (estado == APLICA and regla.get('legal')) else 'Recomendada',
            'cargado': cargado, 'aplican': aplican,
            'incluido': producto_habilitado(org.id, codigo),
        })

    # Orden: por cargar primero, luego el resto por estado
    _orden = {APLICA: 0, EXIGENCIA: 1, POR_CONFIRMAR: 2, RECOMENDADO: 3, NO_APLICA: 4}
    resultado.sort(key=lambda x: (0 if x['estado'] == APLICA and not x['cargado'] else 1,
                                  _orden[x['estado']], x['codigo']))
    return resultado


# ── Carga de marcos bajo demanda ──
LOADERS = {
    'ISO27001': 'ensure_cumplimiento',
    'LEY21595': 'ensure_ley_21595',
    'LEY21663': 'ensure_ley_21663',
    'LEYKARIN': 'ensure_ley_karin',
    'LEY21719': 'ensure_ley_21719',
    'LEY21459': 'ensure_ley_21459',
    'SST16744': 'ensure_sst',
    'ISO37301': 'ensure_iso37301',
    'ISO31000': 'ensure_iso31000',
    'ISO27701': 'ensure_iso27701',
    'NISTCSF': 'ensure_nist_csf',
    'CIS': 'ensure_cis',
    'LEY29733': 'ensure_ley_29733',
    'LEY1581': 'ensure_ley_1581',
    'LFPDPPP': 'ensure_lfpdppp',
}


def cargar_marco(org, codigo, user):
    """Carga el marco `codigo` en la organización usando su ensure_* del seed
    (idempotente). Retorna (marco, mensaje). Si el marco corresponde a un
    producto deshabilitado para el tenant, retorna (None, '__no_incluido__')
    y el endpoint responde 403."""
    from scripts import seed_data

    fn_name = LOADERS.get(codigo)
    if fn_name is None:
        return None, f'No hay cargador para {codigo}'
    existente = MarcoNormativo.query.filter_by(
        organizacion_id=org.id, codigo=codigo, activo=True).first()
    if existente:
        return existente, 'El marco ya estaba cargado'

    if not producto_habilitado(org.id, codigo):
        return None, '__no_incluido__'

    users_map = {'demo.admin': user}
    controles_map = {c.codigo: c for c in Control.query.filter(
        db.or_(Control.organizacion_id == org.id, Control.organizacion_id.is_(None))).all()}
    fn = getattr(seed_data, fn_name)
    fn(org, users_map, controles_map)
    return MarcoNormativo.query.filter_by(organizacion_id=org.id, codigo=codigo).first(), 'Marco cargado'
