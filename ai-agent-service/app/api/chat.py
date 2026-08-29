"""Chat API endpoint.

POST /api/chat        — standard request/response
POST /api/chat/stream  — Server-Sent Events streaming
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.agent.agent import GeoAIAgent
from app.cache.redis import generate_session_id
from app.config.settings import Settings, get_settings
from app.llm.provider import LLMProvider, get_provider
from app.logging.logger import get_logger
from app.schemas.chat_models import (
    ChatRequest,
    ChatResponse,
    ErrorResponse,
)

logger = get_logger("agent.api.chat")

router = APIRouter(prefix="/api", tags=["chat"])


# --------------------------------------------------------------------------- #
# Rate limiting via API key
# --------------------------------------------------------------------------- #

async def verify_api_key(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> str:
    """Extract and validate the API key from the request header."""
    api_key = request.headers.get("X-API-Key", "")
    if settings.agent_api_keys and api_key not in settings.agent_api_keys:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key.",
        )
    return api_key


# --------------------------------------------------------------------------- #
# Standard chat endpoint
# --------------------------------------------------------------------------- #

@router.post(
    "/chat",
    response_model=ChatResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def chat(
    req: ChatRequest,
    _api_key: str = Depends(verify_api_key),
    settings: Settings = Depends(get_settings),
) -> ChatResponse:
    """Process a geographic question and return a structured response."""
    session_id = req.session_id or generate_session_id()
    llm: LLMProvider = get_provider()

    try:
        agent = GeoAIAgent(llm=llm, session_id=session_id)
        result = await agent.run(
            user_message=req.message,
            user_location=req.user_location.model_dump() if req.user_location else None,
            map_context=req.map_context.model_dump() if req.map_context else None,
        )

        return ChatResponse(
            answer=result["answer"],
            tool_used=result.get("tool_used"),
            tool_result=result.get("tool_result"),
            map_action=result.get("map_action"),
            session_id=result["session_id"],
            sources=result.get("sources", []),
        )
    except Exception as e:
        logger.error("Chat error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await llm.close()


# --------------------------------------------------------------------------- #
# Streaming chat endpoint (SSE)
# --------------------------------------------------------------------------- #

@router.post("/chat/stream")
async def chat_stream(
    req: ChatRequest,
    _api_key: str = Depends(verify_api_key),
    settings: Settings = Depends(get_settings),
):
    """Stream a geographic answer as Server-Sent Events.

    SSE events:
      - event: answer_chunk  — incremental text
      - event: tool_call     — tool being invoked
      - event: tool_result   — tool response
      - event: answer_done   — final payload with answer + map_action
      - event: error         — error occurred
    """
    if not settings.enable_streaming:
        raise HTTPException(status_code=404, detail="Streaming is disabled.")

    session_id = req.session_id or generate_session_id()
    llm = get_provider()

    async def event_generator():
        try:
            agent = GeoAIAgent(llm=llm, session_id=session_id)
            async for event in agent.run_streaming(
                user_message=req.message,
                user_location=req.user_location.model_dump() if req.user_location else None,
                map_context=req.map_context.model_dump() if req.map_context else None,
            ):
                event_name = event["event"]
                event_data = event["data"]
                if isinstance(event_data, dict):
                    event_data = json.dumps(event_data, default=str)
                yield f"event: {event_name}\ndata: {event_data}\n\n"
        except Exception as e:
            logger.error("Stream error: %s", e, exc_info=True)
            error_data = json.dumps({"error": str(e)})
            yield f"event: error\ndata: {error_data}\n\n"
        finally:
            await llm.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# --------------------------------------------------------------------------- #
# Session management endpoints
# --------------------------------------------------------------------------- #

@router.delete("/chat/session/{session_id}")
async def delete_session(
    session_id: str,
    _api_key: str = Depends(verify_api_key),
):
    """Clear conversation history for a session."""
    from app.cache.redis import ConversationMemory
    memory = ConversationMemory(session_id)
    await memory.clear()
    return {"status": "ok", "session_id": session_id}


# --------------------------------------------------------------------------- #
# Analytics endpoint
# --------------------------------------------------------------------------- #

@router.get("/analytics/recent")
async def recent_analytics(
    _api_key: str = Depends(verify_api_key),
    limit: int = 20,
):
    """Return recent query analytics from Redis."""
    from app.cache.redis import get_redis
    r = await get_redis()
    if r is None:
        return {"records": [], "message": "Redis not available"}
    records = await r.lrange("agent:analytics", 0, limit - 1)
    return {"records": [json.loads(r) for r in records]}
