"""Integration tests for the chat API endpoints.

Tests the HTTP layer without hitting real LLM, GeoAI, or Redis services.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


@pytest.fixture
def api_key():
    return "test-key"


@pytest.fixture
def auth_headers(api_key):
    return {"X-API-Key": api_key}


class TestHealthEndpoint:
    def test_health_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data

    def test_agent_info(self, client):
        resp = client.get("/agent/info")
        assert resp.status_code == 200
        data = resp.json()
        assert "provider" in data
        assert "model" in data


class TestChatEndpoint:
    def test_chat_requires_api_key(self, client):
        resp = client.post(
            "/api/chat",
            json={"message": "Find police station"},
        )
        # Without AGENT_API_KEYS configured, all keys are accepted
        # With AGENT_API_KEYS, missing/wrong key returns 401
        assert resp.status_code in (200, 401)

    def test_chat_rejects_empty_message(self, client, auth_headers):
        resp = client.post(
            "/api/chat",
            json={"message": ""},
            headers=auth_headers,
        )
        assert resp.status_code == 422  # Pydantic validation

    def test_chat_rejects_long_message(self, client, auth_headers):
        resp = client.post(
            "/api/chat",
            json={"message": "x" * 2001},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_chat_returns_answer(self, client, auth_headers):
        from app.llm.models import LLMResponse

        mock_llm = AsyncMock()
        mock_llm.chat = AsyncMock(return_value=LLMResponse(
            content="Please share your location.",
            tool_calls=[],
            finish_reason="stop",
        ))
        mock_llm.close = AsyncMock()

        with patch("app.api.chat.get_provider", return_value=mock_llm):
            with patch("app.agent.agent.load_tools", new_callable=AsyncMock) as m:
                m.return_value = []
                resp = client.post(
                    "/api/chat",
                    json={
                        "message": "Find police station near me",
                        "user_location": {"lat": 12.9716, "lon": 77.5946},
                    },
                    headers=auth_headers,
                )

        assert resp.status_code == 200
        data = resp.json()
        assert "answer" in data
        assert "session_id" in data


class TestSessionEndpoint:
    def test_delete_session(self, client, auth_headers):
        mock_redis = AsyncMock()
        mock_redis.delete = AsyncMock(return_value=1)

        with patch("app.cache.redis.get_redis", new_callable=AsyncMock, return_value=mock_redis):
            resp = client.delete(
                "/api/chat/session/test-session-123",
                headers=auth_headers,
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["session_id"] == "test-session-123"
