"""Aggregates all /api/v1 routers. Future domain modules
(catalog, aoi, orders, ...) register their routers here."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.health import router as health_router
from app.modules.authentication.router import router as auth_router
from app.modules.datasets.router import router as datasets_router
from app.modules.maps.router import router as maps_router
from app.modules.processing.router import router as exports_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(auth_router)
api_v1_router.include_router(datasets_router)
api_v1_router.include_router(maps_router)
api_v1_router.include_router(exports_router)
