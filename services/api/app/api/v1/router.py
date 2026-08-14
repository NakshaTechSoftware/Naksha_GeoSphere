"""Aggregates all /api/v1 routers. Future domain modules
(catalog, aoi, orders, ...) register their routers here."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.datasets import router as datasets_router
from app.api.v1.environment import router as environment_router
from app.api.v1.export import router as export_router
from app.api.v1.health import router as health_router
from app.api.v1.locations import router as locations_router
from app.modules.authentication.router import router as auth_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(auth_router)
api_v1_router.include_router(locations_router)
api_v1_router.include_router(datasets_router)
api_v1_router.include_router(export_router)
api_v1_router.include_router(environment_router)
