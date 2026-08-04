"""Response schemas for locations module."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.locations.models import LocationType


class LocationBase(BaseModel):
    """Base location schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    code: str
    location_type: LocationType
    description: str | None
    display_order: int


class LocationPublic(LocationBase):
    """Public location schema with timestamps."""

    parent_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class LocationWithChildren(LocationBase):
    """Location with nested children."""

    children: list[LocationBase] = []


class LocationHierarchy(BaseModel):
    """Full hierarchical location structure."""

    model_config = ConfigDict(from_attributes=True)

    country: LocationBase
    states: list[LocationBase] = []
