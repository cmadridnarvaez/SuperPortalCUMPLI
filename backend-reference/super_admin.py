"""API del Superportal TitanTech (/api/super/*) — operación de plataforma.

Exclusiva del rol SuperAdmin (TitanStudio). Administra los tenants del SaaS:

- GET  /api/super/dashboard                    → KPIs globales + MRR
- GET  /api/super/tenants                      → listado con métricas y filtros
- GET  /api/super/tenants/<id>                 → detalle (datos, usuarios, productos)
- PATCH /api/super/tenants/<id>                → plan / trial_hasta / activo
- GET/PATCH /api/super/tenants/<id>/productos  → productos normativos del tenant
- POST /api/super/tenants/<id>/usuarios        → crear usuario (invitación)
- PATCH /api/super/tenants/<id>/usuarios/<uid> → activo / rol / desbloquear
- POST /api/super/tenants/<id>/usuarios/<uid>/reset-password
- POST /api/super/tenants/<id>/impersonate     → token single-use de soporte

Todo queda en bitácora (org del tenant) y notifica in-app a los admins del
tenant cuando un cambio les afecta.
"""
import re
import secrets
from datetime import datetime, timedelta

from flask import Blueprint, g, jsonify, request
from flask_jwt_extended import decode_token
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app import db
from app.models.notificacion import Notificacion
from app.models.organizacion import Organizacion
from app.models.producto import OrganizacionProducto, Producto
from app.models.usuario import Usuario
from app.schemas import OrganizacionSchema
from app.utils.security import jwt_superadmin_required, jwt_user

super_api = Blueprint('api_super', __name__, url_prefix='/api/super')

org_schema = OrganizacionSchema()

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
ROLES_TENANT = ('AdminGRC', 'RiskManager', 'Auditor', 'Usuario')  # nunca SuperAdmin
ACCION_EXTENDER_TRIAL_DIAS = 14


# ── Helpers ──

def _bitacora(accion, entidad_tipo, entidad_id, entidad_ref, detalle, org):
    """Registra en la bitácora del tenant afectado (actor = SuperAdmin)."""
    try:
        from app.services.bitacora_service import registrar
        registrar(accion, entidad_tipo, entidad_id, entidad_ref, detalle,
                  org_id=org.id, commit=True)
    except Exception:
        db.session.rollback()


def _notificar_admins(org, titulo, mensaje, tipo='plataforma', severidad='media'):
    """Notificación in-app a los admins activos del tenant."""
    admins = Usuario.query.filter_by(organizacion_id=org.id, activo=True).filter(
        Usuario.rol.in_(('AdminGRC', 'Administrador'))).all()
    for u in admins:
        db.session.add(Notificacion(
            organizacion_id=org.id, usuario_id=u.id,
            titulo=titulo, mensaje=mensaje, tipo=tipo, severidad=severidad,
        ))
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()


def _org_o_404(org_id):
    org = db.session.get(Organizacion, org_id)
    if org is None:
        return None, (jsonify(msg='Tenant no encontrado'), 404)
    return org, None


def _metricas_por_org():
    """COUNTs agregados por organizacion_id (una query por métrica, sin N+1)."""
    from app.models.riesgo import Riesgo
    from app.models.activo import Activo
    from app.models.control import Control

    def _count(model, solo_activos=True):
        q = db.session.query(model.organizacion_id, func.count(model.id))
        if solo_activos and hasattr(model, 'activo'):
            q = q.filter(model.activo.is_(True))
        return dict(q.group_by(model.organizacion_id).all())

    ultimo = dict(db.session.query(Usuario.organizacion_id,
                                   func.max(Usuario.ultimo_acceso))
                  .group_by(Usuario.organizacion_id).all())
    return {
        'usuarios': _count(Usuario),
        'riesgos': _count(Riesgo),
        'activos': _count(Activo),
        'controles': _count(Control),
        'ultimo_acceso': ultimo,
    }


def _serialize_tenant(org, metricas):
    hoy = datetime.utcnow().date()
    trial_restante = None
    if org.plan == 'trial' and org.trial_hasta:
        trial_restante = (org.trial_hasta - hoy).days
    ultimo = metricas['ultimo_acceso'].get(org.id) if metricas else None
    return {
        'id': org.id, 'nombre': org.nombre, 'rut': org.rut,
        'pais': org.pais, 'industria': org.industria,
        'email': org.email,
        'plan': org.plan, 'trial_hasta': org.trial_hasta.isoformat() if org.trial_hasta else None,
        'trial_restante_dias': trial_restante,
        'activo': org.activo, 'onboarding_completado': org.onboarding_completado,
        'created_at': org.created_at.isoformat() if org.created_at else None,
        'metricas': {k: metricas[k].get(org.id, 0)
                     for k in ('usuarios', 'riesgos', 'activos', 'controles')} if metricas else {},
        'ultimo_acceso': ultimo.isoformat() if ultimo else None,
    }


# ── Dashboard de plataforma ──

@super_api.get('/dashboard')
@jwt_superadmin_required
def dashboard():
    """KPIs globales: tenants, trials, distribución por plan, MRR y uso."""
    from app.services.billing_service import PLANES

    hoy = datetime.utcnow().date()
    en_7_dias = hoy + timedelta(days=7)
    hace_30 = datetime.utcnow() - timedelta(days=30)

    total = Organizacion.query.count()
    activas = Organizacion.query.filter_by(activo=True).count()
    suspendidas = total - activas

    trials = Organizacion.query.filter(
        Organizacion.plan == 'trial', Organizacion.trial_hasta.isnot(None)).all()
    trials_activos = [o for o in trials if o.trial_hasta >= hoy]
    trials_vencidos = [o for o in trials if o.trial_hasta < hoy]
    trials_por_vencer = [o for o in trials_activos if o.trial_hasta <= en_7_dias]

    por_plan_rows = (db.session.query(Organizacion.plan, func.count(Organizacion.id))
                     .group_by(Organizacion.plan).all())
    por_plan = {}
    mrr = 0
    for plan, n in por_plan_rows:
        precio = PLANES.get(plan, {}).get('precio', 0) or 0
        por_plan[plan] = {'tenant': n, 'nombre': PLANES.get(plan, {}).get('nombre', plan)}
        # MRR: solo tenants activos con plan pago
        activos_plan = (db.session.query(func.count(Organizacion.id))
                        .filter(Organizacion.plan == plan,
                                Organizacion.activo.is_(True)).scalar() or 0)
        mrr += precio * activos_plan

    usuarios_totales = Usuario.query.filter_by(activo=True).count()
    altas_30d = Organizacion.query.filter(Organizacion.created_at >= hace_30).count()

    metricas = _metricas_por_org()
    por_vencer = sorted(
        (_serialize_tenant(o, metricas) for o in trials_por_vencer),
        key=lambda t: t['trial_hasta'])

    return jsonify(
        kpis={
            'total_tenants': total,
            'tenants_activos': activas,
            'tenants_suspendidos': suspendidas,
            'trials_activos': len(trials_activos),
            'trials_vencidos': len(trials_vencidos),
            'trials_por_vencer': len(trials_por_vencer),
            'usuarios_totales': usuarios_totales,
            'altas_30_dias': altas_30d,
            'mrr_clp': mrr,
        },
        por_plan=por_plan,
        trials_por_vencer=por_vencer[:20],
    )


# ── Tenants ──
# Naming: "tenant" es el término técnico del backend (organización); para el
# negocio, en la consola y los mensajes, un tenant es un "ambiente de cliente".
# La coincidencia es 1:1 — no hay jerarquía adicional.

@super_api.post('/tenants')
@jwt_superadmin_required
def crear_tenant():
    """Da de alta un ambiente de cliente con su administrador (onboarding
    asistido: cierre comercial → alta inmediata sin self-signup).

    Crea la organización (plan/trial elegidos por TitanStudio) + usuario
    AdminGRC con link de activación para definir su contraseña. Igual que el
    self-signup, el ambiente arranca vacío: el wizard de onboarding y
    "¿Qué me aplica?" lo guían.
    """
    from app.services.billing_service import PLANES

    data = request.get_json(silent=True) or {}
    empresa = (data.get('empresa') or '').strip()
    nombre = (data.get('admin_nombre') or '').strip()
    email = (data.get('admin_email') or '').strip().lower()
    plan = data.get('plan') or 'trial'
    try:
        trial_dias = int(data.get('trial_dias') or 14)
    except (TypeError, ValueError):
        trial_dias = 14
    trial_dias = max(min(trial_dias, 365), 1)

    faltantes = [f for f, v in (('empresa', empresa), ('admin_nombre', nombre),
                                ('admin_email', email)) if not v]
    if faltantes:
        return jsonify(msg=f'Campos requeridos: {", ".join(faltantes)}'), 400
    if not EMAIL_RE.match(email):
        return jsonify(msg='Email inválido'), 400
    if plan not in PLANES:
        return jsonify(msg=f'Plan inválido. Válidos: {", ".join(PLANES)}'), 400
    if Usuario.query.filter_by(email=email).first():
        return jsonify(msg='Ya existe un usuario con ese email'), 409
    if Organizacion.query.filter_by(nombre=empresa).first():
        return jsonify(msg='Ya existe un ambiente con ese nombre'), 409

    org = Organizacion(
        nombre=empresa,
        pais=(data.get('pais') or 'Chile').strip() or None,
        industria=(data.get('industria') or '').strip() or None,
        rut=(data.get('rut') or '').strip() or None,
        plan=plan,
        trial_hasta=(datetime.utcnow() + timedelta(days=trial_dias)).date()
                    if plan == 'trial' else None,
        activo=True,
    )
    db.session.add(org)
    db.session.flush()

    base = email.split('@')[0][:40]
    username = base
    suf = 1
    while Usuario.query.filter_by(username=username).first():
        suf += 1
        username = f'{base}{suf}'
    admin = Usuario(
        organizacion_id=org.id, username=username, email=email,
        nombre_completo=nombre, rol='AdminGRC',
        cargo='Administrador del ambiente', activo=True,
        created_by_id=jwt_user().id,
    )
    admin.set_password(secrets.token_urlsafe(24))   # la define al activar
    db.session.add(admin)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify(msg='No se pudo crear el ambiente (dato duplicado)'), 409

    _bitacora('crear', 'Organizacion', org.id, org.nombre,
              {'origen': 'superportal', 'plan': plan,
               'admin': email, 'trial_dias': trial_dias if plan == 'trial' else None}, org)

    reset_url = None
    try:
        from app.services.token_service import generar_token_reset
        token = generar_token_reset(admin.email)
        reset_url = f'/reset-password?token={token}'
        try:
            from app.services.email_service import correo_invitacion
            correo_invitacion(email, nombre, empresa, token)
        except Exception:
            pass   # sin SMTP: el operador entrega el link manualmente
    except Exception:
        pass

    return jsonify(
        msg=f'Ambiente "{empresa}" creado; administrador {email}',
        tenant=_serialize_tenant(org, None),
        usuario=admin.to_dict(),
        reset_url=reset_url,
    ), 201


@super_api.get('/tenants')
@jwt_superadmin_required
def list_tenants():
    """Listado de tenants con búsqueda y filtros (plan/estado/producto)."""
    q = (request.args.get('q') or '').strip()
    plan = (request.args.get('plan') or '').strip()
    estado = (request.args.get('estado') or '').strip()  # activos | suspendidos
    producto_id = request.args.get('producto_id', type=int)

    query = Organizacion.query
    if q:
        like = f'%{q}%'
        query = query.filter(db.or_(Organizacion.nombre.ilike(like),
                                    Organizacion.rut.ilike(like),
                                    Organizacion.email.ilike(like)))
    if plan:
        query = query.filter(Organizacion.plan == plan)
    if estado == 'activos':
        query = query.filter(Organizacion.activo.is_(True))
    elif estado == 'suspendidos':
        query = query.filter(Organizacion.activo.is_(False))
    if producto_id:
        habilitadas = (db.session.query(OrganizacionProducto.organizacion_id)
                       .filter(OrganizacionProducto.producto_id == producto_id,
                               OrganizacionProducto.habilitado.is_(True))
                       .subquery())
        query = query.filter(Organizacion.id.in_(habilitadas))

    page = max(request.args.get('page', 1, type=int), 1)
    per_page = max(min(request.args.get('per_page', 25, type=int), 200), 1)
    pagination = query.order_by(Organizacion.nombre.asc()).paginate(
        page=page, per_page=per_page, error_out=False)

    metricas = _metricas_por_org()
    return jsonify(
        items=[_serialize_tenant(o, metricas) for o in pagination.items],
        meta={'page': pagination.page, 'per_page': pagination.per_page,
              'total': pagination.total, 'pages': pagination.pages},
    )


@super_api.get('/tenants/<int:org_id>')
@jwt_superadmin_required
def get_tenant(org_id):
    """Detalle del tenant: datos, usuarios, productos y métricas."""
    org, err = _org_o_404(org_id)
    if err:
        return err
    data = org_schema.dump(org)
    data.update(_serialize_tenant(org, _metricas_por_org()))
    usuarios = Usuario.query.filter_by(organizacion_id=org.id).order_by(
        Usuario.activo.desc(), Usuario.nombre_completo.asc()).all()
    data['usuarios'] = [{
        'id': u.id, 'username': u.username, 'email': u.email,
        'nombre_completo': u.nombre_completo, 'cargo': u.cargo,
        'rol': u.rol, 'activo': u.activo, 'email_verificado': u.email_verificado,
        'bloqueado_hasta': u.bloqueado_hasta.isoformat() if u.bloqueado_hasta else None,
        'ultimo_acceso': u.ultimo_acceso.isoformat() if u.ultimo_acceso else None,
    } for u in usuarios]
    return jsonify(data)


@super_api.patch('/tenants/<int:org_id>')
@jwt_superadmin_required
def patch_tenant(org_id):
    """Cambia plan, trial_hasta o activo del tenant. Notifica a sus admins."""
    from app.services.billing_service import PLANES

    org, err = _org_o_404(org_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    cambios = {}

    if 'plan' in data:
        plan = data['plan']
        if plan not in PLANES:
            return jsonify(msg=f'Plan inválido. Válidos: {", ".join(PLANES)}'), 400
        cambios['plan'] = {'de': org.plan, 'a': plan}
        org.plan = plan

    if 'trial_hasta' in data:
        try:
            org.trial_hasta = datetime.strptime(data['trial_hasta'], '%Y-%m-%d').date()
            cambios['trial_hasta'] = org.trial_hasta.isoformat()
        except (TypeError, ValueError):
            return jsonify(msg='trial_hasta debe ser fecha ISO (YYYY-MM-DD)'), 400

    if 'extender_trial_dias' in data:
        try:
            dias = int(data['extender_trial_dias'])
        except (TypeError, ValueError):
            return jsonify(msg='extender_trial_dias debe ser entero'), 400
        base = org.trial_hasta or datetime.utcnow().date()
        org.trial_hasta = base + timedelta(days=dias)
        org.plan = 'trial'
        cambios['extender_trial_dias'] = dias

    if 'activo' in data:
        activo = bool(data['activo'])
        cambios['activo'] = {'de': org.activo, 'a': activo}
        org.activo = activo

    if not cambios:
        return jsonify(msg='Nada que actualizar'), 400

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify(msg='No se pudo actualizar el tenant'), 500

    _bitacora('actualizar', 'Organizacion', org.id, org.nombre,
              {'origen': 'superportal', 'cambios': cambios}, org)

    # Notificación in-app a los admins del tenant (solo cambios que les afectan)
    if 'plan' in cambios:
        nombre_plan = PLANES.get(org.plan, {}).get('nombre', org.plan)
        _notificar_admins(org, 'Cambio de plan',
                          f'Tu plan ahora es {nombre_plan}. '
                          f'Revisa Facturación para más detalle.')
    if cambios.get('activo', {}).get('a') is False:
        _notificar_admins(org, 'Cuenta suspendida',
                          'Tu cuenta fue suspendida. Contacta a TitanStudio '
                          '(soporte@titanstudio.tech) para reactivarla.',
                          severidad='alta')
    elif cambios.get('activo', {}).get('a') is True:
        _notificar_admins(org, 'Cuenta reactivada',
                          'Tu cuenta vuelve a estar activa. ¡Bienvenido de vuelta!')

    return jsonify(msg='Tenant actualizado',
                   tenant=_serialize_tenant(org, None))


# ── Productos por tenant ──

@super_api.get('/tenants/<int:org_id>/productos')
@jwt_superadmin_required
def get_productos(org_id):
    """Catálogo de productos con el estado de habilitación para el tenant."""
    org, err = _org_o_404(org_id)
    if err:
        return err
    filas = {f.producto_id: f for f in
             OrganizacionProducto.query.filter_by(organizacion_id=org.id).all()}
    items = []
    for p in Producto.query.filter_by(activo=True).order_by(Producto.orden.asc(), Producto.nombre.asc()).all():
        fila = filas.get(p.id)
        items.append({
            'id': p.id, 'codigo': p.codigo, 'nombre': p.nombre,
            'descripcion': p.descripcion,
            'habilitado': fila.habilitado if fila else True,  # default: incluido
        })
    return jsonify(items=items)


@super_api.patch('/tenants/<int:org_id>/productos')
@jwt_superadmin_required
def patch_producto(org_id):
    """Habilita/deshabilita un producto para el tenant (upsert)."""
    org, err = _org_o_404(org_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    try:
        producto_id = int(data.get('producto_id') or 0)
    except (TypeError, ValueError):
        producto_id = 0
    habilitado = data.get('habilitado')
    if not producto_id or habilitado is None:
        return jsonify(msg='producto_id y habilitado requeridos'), 400
    producto = db.session.get(Producto, producto_id)
    if producto is None or not producto.activo:
        return jsonify(msg='Producto no encontrado'), 404

    fila = OrganizacionProducto.query.filter_by(
        organizacion_id=org.id, producto_id=producto_id).first()
    if fila is None:
        fila = OrganizacionProducto(organizacion_id=org.id,
                                    producto_id=producto_id,
                                    habilitado=bool(habilitado))
        db.session.add(fila)
    else:
        fila.habilitado = bool(habilitado)
    db.session.commit()

    _bitacora('actualizar', 'Organizacion', org.id, org.nombre,
              {'origen': 'superportal', 'producto': producto.codigo,
               'habilitado': fila.habilitado}, org)
    if not fila.habilitado:
        _notificar_admins(org, f'Producto {producto.nombre} desactivado',
                          'Este módulo normativo dejó de estar incluido en tu '
                          'contrato. Contacta a TitanStudio si crees que es un error.')
    return jsonify(msg='Producto actualizado', habilitado=fila.habilitado)


# ── Usuarios del tenant ──

@super_api.post('/tenants/<int:org_id>/usuarios')
@jwt_superadmin_required
def crear_usuario(org_id):
    """Crea (invita) un usuario del tenant como lo haría su admin."""
    org, err = _org_o_404(org_id)
    if err:
        return err
    user = jwt_user()
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    nombre = (data.get('nombre') or '').strip()
    rol = Usuario.rol_normalizado(data.get('rol') or 'Usuario')
    if rol is None or rol == 'SuperAdmin':
        return jsonify(msg=f'Rol inválido. Válidos: {", ".join(ROLES_TENANT)}'), 400
    if not email or not nombre:
        return jsonify(msg='nombre y email requeridos'), 400
    if not EMAIL_RE.match(email):
        return jsonify(msg='Email inválido'), 400
    if Usuario.query.filter_by(email=email).first():
        return jsonify(msg='Ya existe un usuario con ese email'), 409

    base = email.split('@')[0][:40]
    username = base
    suf = 1
    while Usuario.query.filter_by(username=username).first():
        suf += 1
        username = f'{base}{suf}'

    nuevo = Usuario(
        organizacion_id=org.id, username=username, email=email,
        nombre_completo=nombre, rol=rol, cargo=data.get('cargo'), activo=True,
        created_by_id=user.id,
    )
    nuevo.set_password(secrets.token_urlsafe(24))   # la define al activar
    db.session.add(nuevo)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify(msg='No se pudo crear el usuario'), 409

    _bitacora('crear', 'Usuario', nuevo.id, nuevo.username,
              {'origen': 'superportal', 'email': email, 'rol': rol}, org)

    reset_url = None
    try:
        from app.services.token_service import generar_token_reset
        token = generar_token_reset(nuevo.email)
        reset_url = f"/reset-password?token={token}"
        try:
            from app.services.email_service import correo_invitacion
            correo_invitacion(email, nombre, org.nombre, token)
        except Exception:
            pass   # sin SMTP: el operador entrega el link manualmente
    except Exception:
        pass

    return jsonify(msg=f'Usuario creado para {org.nombre}',
                   usuario=nuevo.to_dict(), reset_url=reset_url), 201


@super_api.patch('/tenants/<int:org_id>/usuarios/<int:uid>')
@jwt_superadmin_required
def patch_usuario(org_id, uid):
    """Activa/bloquea usuario, cambia rol o desbloquea por intentos fallidos."""
    org, err = _org_o_404(org_id)
    if err:
        return err
    u = db.session.get(Usuario, uid)
    if u is None or u.organizacion_id != org.id:
        return jsonify(msg='Usuario no encontrado'), 404
    if u.rol == 'SuperAdmin':
        return jsonify(msg='No se modifican cuentas de plataforma'), 403

    data = request.get_json(silent=True) or {}
    cambios = {}
    if 'activo' in data:
        u.activo = bool(data['activo'])
        cambios['activo'] = u.activo
    if 'rol' in data:
        rol = Usuario.rol_normalizado(data['rol'])
        if rol is None or rol == 'SuperAdmin':
            return jsonify(msg=f'Rol inválido. Válidos: {", ".join(ROLES_TENANT)}'), 400
        cambios['rol'] = {'de': u.rol, 'a': rol}
        u.rol = rol
    if data.get('desbloquear'):
        u.bloqueado_hasta = None
        u.intentos_login_fallidos = 0
        cambios['desbloqueado'] = True
    if not cambios:
        return jsonify(msg='Nada que actualizar'), 400

    db.session.commit()
    _bitacora('actualizar', 'Usuario', u.id, u.username,
              {'origen': 'superportal', 'cambios': cambios}, org)
    return jsonify(msg='Usuario actualizado', usuario=u.to_dict())


@super_api.post('/tenants/<int:org_id>/usuarios/<int:uid>/reset-password')
@jwt_superadmin_required
def reset_password(org_id, uid):
    """Genera link de reset para el usuario del tenant (soporte)."""
    org, err = _org_o_404(org_id)
    if err:
        return err
    u = db.session.get(Usuario, uid)
    if u is None or u.organizacion_id != org.id:
        return jsonify(msg='Usuario no encontrado'), 404

    from app.services.token_service import generar_token_reset
    token = generar_token_reset(u.email)
    enviado = False
    try:
        from app.services.email_service import correo_recuperacion
        correo_recuperacion(u.email, u.nombre_completo or u.username, token)
        enviado = True
    except Exception:
        pass

    _bitacora('actualizar', 'Usuario', u.id, u.username,
              {'origen': 'superportal', 'accion': 'reset_password_generado',
               'email_enviado': enviado}, org)
    return jsonify(
        msg='Link de restablecimiento generado',
        reset_url=f'/reset-password?token={token}',
        email_enviado=enviado,
    )


# ── Impersonación de soporte ──

@super_api.post('/tenants/<int:org_id>/impersonate')
@jwt_superadmin_required
def impersonate(org_id):
    """Emite un token single-use (90s) para entrar como un usuario del tenant.

    Objetivo por defecto: el primer admin activo del tenant. Vida corta y
    único consumo (Redis); el access token resultante (60 min) lleva el claim
    `actuando_como` y la bitácora deja rastro del SuperAdmin real.
    """
    org, err = _org_o_404(org_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    target = None
    if data.get('usuario_id'):
        target = db.session.get(Usuario, int(data['usuario_id']))
        if target is None or target.organizacion_id != org.id:
            return jsonify(msg='Usuario no encontrado'), 404
    if target is None:
        target = Usuario.query.filter_by(organizacion_id=org.id, activo=True).filter(
            Usuario.rol.in_(('AdminGRC', 'Administrador'))).order_by(Usuario.id.asc()).first()
    if target is None:
        target = Usuario.query.filter_by(organizacion_id=org.id, activo=True).order_by(
            Usuario.id.asc()).first()
    if target is None:
        return jsonify(msg='El tenant no tiene usuarios activos'), 400

    from app.services import impersonation_service
    actor = jwt_user()
    token = impersonation_service.emitir(actor, target)
    exp_epoch = decode_token(token)['exp']
    _bitacora('impersonacion', 'Usuario', target.id, target.username,
              {'origen': 'superportal', 'actor': actor.username,
               'expira': exp_epoch}, org)

    import time
    return jsonify(
        token=token,
        expira_en=int(exp_epoch - time.time()),
        usuario=target.to_dict(),
        # El superportal abre <APP_PRINCIPAL>/impersonate?token=... :
        # la URL base se configura en el frontend (VITE_APP_URL)
    )


# ── API keys de plataforma (para agentes del SuperAdmin) ──
# Paridad GUI↔API: los socios operan la consola programáticamente con la
# misma autoridad y trazabilidad que por interfaz. Reutiliza el modelo
# ApiKey (hash sha256 + prefijo) con scope 'super'.

@super_api.get('/api-keys')
@jwt_superadmin_required
def list_api_keys():
    """API keys de plataforma (scope 'super'). Nunca expone el hash."""
    from app.models.webhook import ApiKey
    from app.models.usuario import Usuario as U
    user = jwt_user()
    keys = ApiKey.query.filter_by(activo=True, scopes='super').order_by(
        ApiKey.id.desc()).all()
    dueños = {}
    if keys:
        ids_dueños = [k.created_by_id for k in keys if k.created_by_id]
        if ids_dueños:
            dueños = {u.id: (u.nombre_completo or u.username)
                      for u in U.query.filter(U.id.in_(ids_dueños)).all()}
    return jsonify(items=[{
        'id': k.id, 'nombre': k.nombre, 'prefijo': k.prefijo + '…',
        'ultima_vez_uso': k.ultima_vez_uso.isoformat() if k.ultima_vez_uso else None,
        'expira': k.expira.isoformat() if k.expira else None,
        'creada_por': dueños.get(k.created_by_id) if k.created_by_id else None,
        'es_mia': k.created_by_id == user.id,
        'created_at': k.created_at.isoformat() if k.created_at else None,
    } for k in keys])


@super_api.post('/api-keys')
@jwt_superadmin_required
def crear_api_key():
    """Crea una API key de plataforma. La clave plana se entrega UNA sola vez.

    Body: {nombre*, expira? (YYYY-MM-DD)}. La key opera como su creador
    (debe seguir siendo SuperAdmin activo; si baja de rol, la key muere).
    """
    from datetime import datetime
    from app.models.webhook import ApiKey
    user = jwt_user()
    data = request.get_json(silent=True) or {}
    nombre = (data.get('nombre') or '').strip()
    if not nombre or len(nombre) > 100:
        return jsonify(msg='Nombre requerido (máx. 100 caracteres)'), 400
    expira = None
    if data.get('expira'):
        try:
            expira = datetime.strptime(data['expira'], '%Y-%m-%d').date()
        except ValueError:
            return jsonify(msg='expira debe ser fecha ISO (YYYY-MM-DD)'), 400

    obj, clave_plana = ApiKey.generar(
        org_id=user.organizacion_id, nombre=nombre,
        scopes='super', expira=expira, created_by_id=user.id)
    _bitacora('crear', 'ApiKey', obj.id, nombre,
              {'origen': 'superportal', 'scope': 'super',
               'expira': expira.isoformat() if expira else None},
              db.session.get(Organizacion, user.organizacion_id))
    return jsonify(msg=f'API key "{nombre}" creada',
                   id=obj.id, nombre=obj.nombre, clave=clave_plana,
                   aviso='Guarda la clave ahora: no volverá a mostrarse.'), 201


@super_api.delete('/api-keys/<int:key_id>')
@jwt_superadmin_required
def revocar_api_key(key_id):
    """Revoca (desactiva) una API key de plataforma. No hay borrado físico."""
    from app.models.webhook import ApiKey
    k = db.session.get(ApiKey, key_id)
    if k is None or not k.activo or k.scopes != 'super':
        return jsonify(msg='API key no encontrada'), 404
    k.activo = False
    db.session.commit()
    user = jwt_user()
    _bitacora('eliminar', 'ApiKey', k.id, k.nombre,
              {'origen': 'superportal', 'accion': 'revocada'},
              db.session.get(Organizacion, user.organizacion_id))
    return jsonify(msg=f'API key "{k.nombre}" revocada'), 200
