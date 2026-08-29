"""Async httpx client for the GeoAI Tool Adapter Service.

All communication with the GIS backend goes through this client.
The LLM never sees any of these URLs or credentials.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.config.settings import get_settings
from app.logging.logger import get_logger

logger = get_logger("agent.geoai.client")

_client: httpx.AsyncClient | None = None


async def get_geoai_client() -> httpx.AsyncClient:
    """Return a shared httpx client pool (lazy-init)."""
    global _client
    if _client is None:
        settings = get_settings()
        headers = {"Content-Type": "application/json"}
        if settings.geoai_api_key:
            headers["X-API-Key"] = settings.geoai_api_key

        _client = httpx.AsyncClient(
            base_url=settings.geoai_base_url,
            headers=headers,
            timeout=httpx.Timeout(settings.geoai_timeout_seconds),
            limits=httpx.Limits(max_connections=30, max_keepalive_connections=10),
        )
        logger.info(
            "GeoAI client created (base_url=%s)", settings.geoai_base_url
        )
    return _client


async def close_geoai_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
        logger.info("GeoAI client closed")


async def fetch_tool_definitions() -> list[dict[str, Any]]:
    """GET /geoai/tools/definitions — fetch OpenAI function-calling schemas."""
    client = await get_geoai_client()
    resp = await client.get("/geoai/tools/definitions")
    resp.raise_for_status()
    return resp.json()


async def execute_tool(
    name: str,
    arguments: dict[str, Any],
    session_id: str | None = None,
) -> dict[str, Any]:
    """POST /geoai/tools/execute — execute a GIS tool.

    Returns the full response dict including status, result, and error fields.
    Even on HTTP errors, returns the body as a structured result rather
    than raising, so the agent loop can feed the error back to the LLM.
    """
    client = await get_geoai_client()
    payload: dict[str, Any] = {"name": name, "arguments": arguments}
    if session_id:
        payload["session_id"] = session_id

    resp = await client.post("/geoai/tools/execute", json=payload)
    try:
        body = resp.json()
    except Exception:
        body = {"detail": resp.text}

    if resp.status_code >= 400:
        return {
            "status": "error",
            "tool": name,
            "error": body.get("detail", body.get("error", f"HTTP {resp.status_code}")),
        }
    return body
