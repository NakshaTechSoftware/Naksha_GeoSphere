"""Redis fixed-window rate limiting, keyed per API key (Feature 4).

Fails open if Redis is unreachable — matching the main GeoSphere API's own
documented choice (services/api/app/modules/authentication/rate_limit.py):
availability of the tool-adapter service takes priority over a best-effort
abuse control, since the caller here is an already-authenticated agent
runtime, not an anonymous public client.
"""

from __future__ import annotations

from fastapi import Depends

from app.config.settings import get_settings
from app.core.cache import get_redis
from app.core.exceptions import RateLimitExceededError
from app.core.logging import get_logger
from app.core.security import require_api_key

logger = get_logger("geoai.rate_limit")


async def enforce_rate_limit(api_key: str = Depends(require_api_key)) -> str:
    settings = get_settings()
    window = settings.rate_limit_window_seconds
    limit = settings.rate_limit_per_key
    key = f"ratelimit:{api_key}:{window}"

    try:
        client = get_redis()
        current = await client.incr(key)
        if current == 1:
            await client.expire(key, window)
        if current > limit:
            raise RateLimitExceededError(
                f"Rate limit exceeded: {limit} requests per {window}s per API key."
            )
    except RateLimitExceededError:
        raise
    except Exception:
        logger.warning("Rate limiter unavailable — failing open", extra={"extra_fields": {}})

    return api_key
