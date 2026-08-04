"""Naksha GeoSphere API entrypoint — application factory and lifecycle."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1.router import api_v1_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.core.middleware import RequestIDMiddleware, unhandled_exception_handler
from app.database.session import dispose_engine
from app.modules.authentication.error_handlers import (
    auth_error_handler,
    validation_exception_handler,
)
from app.modules.authentication.exceptions import AuthError

API_VERSION = "0.1.0"

settings = get_settings()
configure_logging(settings.log_level)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Starting %s API (env=%s)", settings.app_name, settings.app_env)
    yield
    logger.info("Shutting down %s API", settings.app_name)
    await dispose_engine()


def create_app() -> FastAPI:
    app = FastAPI(
        title=f"{settings.app_name} API",
        version=API_VERSION,
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(RequestIDMiddleware)

    app.add_exception_handler(AuthError, auth_error_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    app.include_router(api_v1_router, prefix="/api/v1")

    @app.get("/", tags=["meta"])
    async def root() -> dict[str, str]:
        payload = {
            "name": settings.app_name,
            "description": "The Geospatial Data Marketplace — engineering foundation API",
            "version": API_VERSION,
            "environment": settings.app_env,
            "health_url": "/api/v1/health",
        }
        if settings.docs_enabled:
            payload["docs_url"] = "/docs"
        return payload

    return app


app = create_app()
