"""Naksha GeoAI Agent Service — application entrypoint.

This service is the LLM reasoning layer that sits between the user
and the GeoAI Tool Adapter Service. It never touches PostGIS, MinIO,
or any GIS data directly.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.api.chat import router as chat_router
from app.cache.redis import close_redis
from app.config.settings import get_settings
from app.geoai.client import close_geoai_client
from app.llm.models import LLMMessage
from app.llm.provider import get_provider
from app.logging.logger import configure_logging, get_logger

API_VERSION = "1.0.0"

settings = get_settings()
configure_logging(settings.log_level)
logger = get_logger("agent.main")


async def _warm_up_llm() -> None:
    """Force the model to load before the server accepts real traffic.

    Ollama loads a model into (GPU or CPU) memory on its *first* request,
    not on process start — that first load can take 30+ seconds, which
    otherwise lands on whichever real user happens to send the first
    message after a restart. Runs during lifespan startup (before the
    `yield`), so uvicorn doesn't start accepting connections until this
    completes — a background/fire-and-forget task would still let a real
    request race it. Never blocks startup on failure: if the LLM backend
    is briefly unreachable, the first real request just pays the cost
    normally instead of the service failing to start.
    """
    try:
        llm = get_provider()
        await llm.chat(messages=[LLMMessage(role="user", content="hi")], tools=None)
        await llm.close()
        logger.info("LLM warm-up complete (provider=%s)", settings.llm_provider)
    except Exception as e:
        logger.warning("LLM warm-up failed (will retry on first real request): %s", e)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info(
        "Starting %s (env=%s, provider=%s)",
        settings.app_name,
        settings.app_env,
        settings.llm_provider,
    )
    await _warm_up_llm()
    yield
    logger.info("Shutting down %s", settings.app_name)
    await close_geoai_client()
    await close_redis()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=API_VERSION,
        description=(
            "LLM-powered geographic intelligence agent. Understands natural "
            "language geographic questions and orchestrates GIS tool calls "
            "via the GeoAI Tool Adapter Service."
        ),
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins or ["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Trusted hosts — skip in test env
    import os
    if settings.trusted_hosts and not os.environ.get("TESTING"):
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=settings.trusted_hosts,
        )

    # Routes
    app.include_router(chat_router)

    # Health check
    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {
            "status": "ok",
            "service": settings.app_name,
            "version": API_VERSION,
        }

    # Agent info
    @app.get("/agent/info", tags=["meta"])
    async def agent_info() -> dict[str, str]:
        from app.llm.factory import get_provider_info
        info = get_provider_info()
        info["geoai_url"] = settings.geoai_base_url
        return info

    return app


app = create_app()
