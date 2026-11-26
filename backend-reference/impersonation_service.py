"""Impersonación de soporte (Superportal TitanTech).

Flujo single-use, sin tokens de larga vida en URLs:

1. SuperAdmin llama ``POST /api/super/tenants/<id>/impersonate`` → JWT corto
   (90s) con claims ``{'tipo': 'impersonacion', 'actor_id': ...}`` y jti.
   El jti queda marcado como pendiente en Redis (o en memoria como fallback
   de proceso; el token expira a los 90s de todas formas).
2. El superportal abre ``<APP>/impersonate?token=...`` y la SPA principal lo
   canjea en ``POST /api/auth/impersonate/consume``: se valida tipo/exp y que
   el jti esté pendiente; se marca consumido y se emite un access token de
   soporte (~60 min, SIN refresh) con claim ``actuando_como`` = actor real.
3. La bitácora registra cada acción como "<actor> en nombre de <objetivo>"
   (ver ``bitacora_service._actor`` y ``configure_bitacora``).
"""
import os
import time
from datetime import timedelta

from flask_jwt_extended import create_access_token, decode_token

TTL_TOKEN = 90          # segundos de vida del token de canje
TTL_CONSUMIDO = 600     # segundos que se recuerda un jti consumido

# Fallback sin Redis (tests/dev): {jti: (estado, exp_epoch)}
_memoria = {}


def _redis():
    """Cliente Redis si RATE_LIMIT_REDIS apunta a Redis (misma instancia del
    rate-limiter, compartida entre workers). None si no está disponible."""
    url = os.environ.get('RATE_LIMIT_REDIS') or ''
    if not url.startswith(('redis://', 'rediss://', 'unix://')):
        return None
    try:
        import redis
        client = redis.Redis.from_url(url, socket_connect_timeout=1, socket_timeout=1)
        client.ping()
        return client
    except Exception:
        return None


def _purga_memoria():
    ahora = time.time()
    for jti in [k for k, (_, exp) in _memoria.items() if exp < ahora]:
        _memoria.pop(jti, None)


def emitir(actor, target):
    """Crea el token de canje single-use para entrar como ``target``."""
    token = create_access_token(
        identity=str(target.id),
        expires_delta=timedelta(seconds=TTL_TOKEN),
        additional_claims={'tipo': 'impersonacion', 'actor_id': actor.id},
    )
    jti = decode_token(token)['jti']
    r = _redis()
    if r is not None:
        r.set(f'imp:{jti}', 'pendiente', ex=TTL_TOKEN)
    else:
        _purga_memoria()
        _memoria[jti] = ('pendiente', time.time() + TTL_TOKEN)
    return token


def consumir(token):
    """Valida y consume el token de canje (una sola vez).

    Retorna ``(actor_id, target_id)`` o ``None`` si es inválido, expiró o
    ya fue usado.
    """
    try:
        payload = decode_token(token)
    except Exception:
        return None
    if payload.get('tipo') != 'impersonacion':
        return None
    jti = payload.get('jti')
    if not jti:
        return None

    r = _redis()
    if r is not None:
        pipe = r.pipeline()
        pipe.get(f'imp:{jti}')
        pipe.delete(f'imp:{jti}')
        prev, _ = pipe.execute()
        if prev is None or prev.decode() != 'pendiente':
            return None
    else:
        estado, exp = _memoria.get(jti, (None, 0))
        if estado != 'pendiente' or time.time() > exp:
            return None
        _memoria[jti] = ('consumido', time.time() + TTL_CONSUMIDO)
        _purga_memoria()

    try:
        actor_id = int(payload.get('actor_id'))
        target_id = int(payload.get('sub'))
    except (TypeError, ValueError):
        return None
    return actor_id, target_id
