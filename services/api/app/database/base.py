"""Declarative base for future SQLAlchemy ORM models.

No marketplace models exist yet — this is the shared base future domain
modules (`app/modules/*`) will import from.
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
