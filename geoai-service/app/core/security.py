"""API key authentication between the LLM/agent runtime and this service (Feature 4).

The AI agent never receives a database, MinIO, or internal-API credential —
this is the *only* secret it holds, and it authorizes calls to this
adapter service alone. Compromise of this key exposes only the controlled,
typed surface in app/api/*, never raw DB/MinIO/internal-API access.
"""

from __future__ import annotations

from fastapi import Header

from app.config.settings import get_settings
from app.core.exceptions import UnauthorizedError


async def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> str:
    """FastAPI dependency — raises UnauthorizedError unless a valid key is presented.

    Returns the API key itself so callers can use it as a per-caller rate-limit
    and audit-log identity (see app/core/rate_limit.py).
    """
    settings = get_settings()
    if not settings.geoai_api_keys:
        # Fail closed: an empty allow-list must never mean "open access".
        raise UnauthorizedError("Service is not configured with any GEOAI_API_KEYS.")
    if not x_api_key or x_api_key not in settings.geoai_api_keys:
        raise UnauthorizedError("Missing or invalid X-API-Key header.")
    return x_api_key
