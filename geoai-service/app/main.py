"""GeoAI Tool Adapter Service — application entrypoint.

This service is the *only* thing an LLM/AI agent is allowed to call. It
never lets the agent reach FastAPI internals, Next.js routes, MinIO, or
the database directly — see the module docstrings in app/services/* and
app/core/security.py for how that boundary is enforced.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.api.geocode import router as geocode_router
from app.api.nearby import router as nearby_router
from app.api.spatial_query import router as spatial_query_router
from app.api.tools import router as tools_router
from app.config.settings import get_settings
from app.core.cache import close_redis
from app.core.exceptions import GeoAIError
from app.core.logging import configure_logging, get_logger
from app.core.middleware import RequestIDMiddleware, geoai_error_handler, unhandled_exception_handler
from app.database.postgres import dispose_engine

API_VERSION = "1.0.0"

settings = get_settings()
configure_logging(settings.log_level)
logger = get_logger("geoai.main")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Starting %s (env=%s)", settings.app_name, settings.app_env)
    yield
    logger.info("Shutting down %s", settings.app_name)
    await dispose_engine()
    await close_redis()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=API_VERSION,
        description=(
            "Controlled, typed tool surface between an AI agent and the GeoSphere "
            "platform's PostGIS database, MinIO object storage, and internal APIs. "
            "The agent never receives credentials or internal URLs — every call "
            "here is validated, rate-limited, cached, and logged."
        ),
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts or ["*"])
    app.add_middleware(RequestIDMiddleware)

    app.add_exception_handler(GeoAIError, geoai_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    app.include_router(nearby_router)
    app.include_router(spatial_query_router)
    app.include_router(geocode_router)
    app.include_router(tools_router)

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": settings.app_name, "version": API_VERSION}

    return app


app = create_app()
