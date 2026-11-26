"""Modelo de Productos normativos (catálogo de plataforma).

Un Producto es un SKU comercial: el marco/módulo normativo que un cliente
contrata (ej. ISO 27001, Ley 21.719). El catálogo es global (TitanStudio) y
la habilitación por tenant vive en ``organizacion_productos``. El ``codigo``
coincide con el ``codigo`` del marco normativo (``perfil_service.LOADERS``)
para poder aplicar el gate en la carga de marcos.

Superportal TitanTech (dev.titantech.cumplisign.com): Sprint Superportal.
"""
from datetime import datetime
from app import db


class Producto(db.Model):
    """Catálogo global de productos normativos de la plataforma."""

    __tablename__ = 'productos'

    id = db.Column(db.Integer, primary_key=True)
    codigo = db.Column(db.String(30), unique=True, nullable=False, index=True)  # ej. ISO27001
    nombre = db.Column(db.String(200), nullable=False)
    descripcion = db.Column(db.Text)
    orden = db.Column(db.Integer, default=0)  # orden de presentación en el superportal
    activo = db.Column(db.Boolean, default=True)  # disponible en el catálogo de la plataforma

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tenants = db.relationship('OrganizacionProducto', backref='producto', lazy='dynamic')

    def __repr__(self):
        return f'<Producto {self.codigo}>'


class OrganizacionProducto(db.Model):
    """Habilitación de un producto para un tenant (many-to-many con estado).

    La ausencia de fila se interpreta como habilitado (default true) para no
    romper tenants existentes; el gate en cargar-marco considera habilitado
    cuando no hay fila o ``habilitado`` es True.
    """

    __tablename__ = 'organizacion_productos'
    __table_args__ = (
        db.UniqueConstraint('organizacion_id', 'producto_id', name='uq_org_producto'),
    )

    id = db.Column(db.Integer, primary_key=True)
    organizacion_id = db.Column(db.Integer, db.ForeignKey('organizaciones.id'), nullable=False, index=True)
    producto_id = db.Column(db.Integer, db.ForeignKey('productos.id'), nullable=False, index=True)
    habilitado = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organizacion = db.relationship('Organizacion', backref='productos_habilitados')

    def __repr__(self):
        return f'<OrganizacionProducto org={self.organizacion_id} prod={self.producto_id} habilitado={self.habilitado}>'
