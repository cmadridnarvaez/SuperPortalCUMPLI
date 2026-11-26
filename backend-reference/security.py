"""Utilidades de seguridad transversales."""
from functools import wraps
from datetime import datetime

from flask import abort, g, jsonify, request
from flask_jwt_extended import get_current_user, verify_jwt_in_request
from flask_login import current_user
from app import db

# Roles con acceso total en la API (no sujetos a checks específicos)
ROLES_ADMIN = {'SuperAdmin', 'AdminGRC'}


def _api_key_super_user():
    """Resuelve el usuario SuperAdmin dueño de una API key de plataforma.

    El header puede ser ``X-API-Key: grc_…`` o ``Authorization: Bearer grc_…``.
    Valida: activa, no expirada, scope 'super', dueño activo y con rol
    SuperAdmin. Marca ``g.api_user`` / ``g.api_key_nombre`` para que jwt_user()
    y la bitácora la respeten. Retorna el Usuario o None.
    """
    clave = request.headers.get('X-API-Key', '')
    if not clave:
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer grc_'):
            clave = auth[7:]
    if not clave.startswith('grc_'):
        return None
    try:
        from app.models.webhook import ApiKey
        from app.models.usuario import Usuario
        k = ApiKey.query.filter_by(prefijo=clave[:12], activo=True).first()
        if k is None or 'super' not in (k.scopes or ''):
            return None
        if k.expira and k.expira < datetime.utcnow().date():
            return None
        u = db.session.get(Usuario, k.created_by_id) if k.created_by_id else None
        if u is None or not u.activo or u.rol != 'SuperAdmin':
            return None
        k.ultima_vez_uso = datetime.utcnow()
        db.session.commit()
        # Vinculado al request actual: jwt_user() solo lo acepta dentro de
        # ESTE request (inmune a contextos retenidos entre requests).
        g._api_key_req = request
        g.api_user = u
        g.api_key_nombre = k.nombre
        return u
    except Exception:
        return None


def jwt_user():
    """Usuario autenticado (JWT, API key de plataforma o None).

    El fallback a ``g.api_user`` aplica únicamente si la API key se validó
    en ESTE request (g._api_key_req is request); los endpoints siguen
    llamando jwt_user() sin cambios.
    """
    api_u = getattr(g, 'api_user', None)
    if api_u is not None and getattr(g, '_api_key_req', None) is request:
        return api_u
    try:
        return get_current_user()
    except Exception:
        return None


def current_org_id():
    """organizacion_id del usuario actual (JWT o sesión Flask-Login)."""
    u = jwt_user()
    if u is not None:
        return u.organizacion_id
    try:
        if current_user.is_authenticated:
            return current_user.organizacion_id
    except Exception:
        pass
    return None


def validar_ref_tenant(model, obj_id, allow_shared=False):
    """Recuperar una entidad verificando que pertenezca a la organización
    del usuario actual (prevención de IDOR cross-tenant).

    Funciona en contexto JWT (API) y en sesión Flask-Login (SSR). Si la
    entidad no existe o pertenece a otra organización se aborta con ``404``.
    ``allow_shared=True`` permite entidades globales con ``organizacion_id``
    NULL (ej. amenazas del catálogo compartido).

    Retorna la instancia cuando es válida, o ``None`` cuando ``obj_id`` es
    vacío/no positivo (campo opcional no informado).
    """
    if not obj_id or obj_id <= 0:
        return None
    obj = db.session.get(model, obj_id)
    if obj is None:
        abort(404)
    obj_org = getattr(obj, 'organizacion_id', None)
    org_id = current_org_id()
    if obj_org != org_id and not (allow_shared and obj_org is None):
        abort(404)
    return obj


def jwt_role_required(*roles):
    """Decorador API: exige JWT válido + rol permitido.

    SuperAdmin/AdminGRC siempre tienen acceso. Responde JSON en caso de
    error (401/403). Usar en lugar de @login_required/@role_required en las
    rutas /api/*.
    """
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            verify_jwt_in_request()
            user = jwt_user()
            if user is None:
                return jsonify(msg='No autenticado'), 401
            allowed = set(roles) | ROLES_ADMIN
            if user.rol not in allowed:
                return jsonify(msg='Permisos insuficientes'), 403
            return f(*args, **kwargs)
        return wrapped
    return decorator


def jwt_superadmin_required(f):
    """Decorador API: exclusivamente rol SuperAdmin (plataforma, cross-tenant).

    Para el Superportal TitanTech (/api/super/*) y cualquier operación sobre
    tenants ajenos. AdminGRC es admin de SU tenant, no de la plataforma:
    no se admite aquí (ver ROLES_ADMIN, que sí lo agrupa para otros checks).

    Acepta dos credenciales:
    - JWT de un SuperAdmin (login de la consola), o
    - API key de plataforma (scope 'super') por X-API-Key / Bearer grc_…,
      creada por un SuperAdmin desde la consola o la propia API.
    """
    @wraps(f)
    def wrapped(*args, **kwargs):
        user = None
        try:
            verify_jwt_in_request(optional=True)
            user = jwt_user()
        except Exception:
            user = None
        if user is None:
            user = _api_key_super_user()
        if user is None:
            return jsonify(msg='No autenticado (JWT o API key de plataforma '
                               'requeridos)'), 401
        if user.rol != 'SuperAdmin':
            return jsonify(msg='Esta operación es exclusiva de la plataforma '
                               '(TitanStudio)'), 403
        return f(*args, **kwargs)
    return wrapped
