"""Response models for the users module. `UserPublic` is the only shape
a `User` row is ever allowed to leave the API through — it never
includes `password_hash` or any other internal field."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.users.models import UserStatus


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str
    organization_name: str | None
    role_or_use_case: str | None
    status: UserStatus
    created_at: datetime
