# Naksha GeoAI Agent Service

LLM-powered geographic intelligence agent that understands natural-language location questions and automatically orchestrates GIS tool calls via the GeoAI Tool Adapter Service.

```
User → AI Agent Service → LLM Provider → Function Calling → GeoAI Tool Adapter → PostGIS/MinIO
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    AI Agent Service                       │
│                                                          │
│  ┌─────────┐   ┌──────────┐   ┌──────────────────────┐  │
│  │ Chat API │──▶│  Agent   │──▶│   LLM Provider       │  │
│  │ (FastAPI)│   │  Loop    │   │  (OpenAI / Anthropic) │  │
│  └─────────┘   └────┬─────┘   └──────────────────────┘  │
│                     │                                     │
│              ┌──────┴──────┐                              │
│              │ Tool        │                              │
│              │ Executor    │                              │
│              └──────┬──────┘                              │
│                     │                                     │
│  ┌─────────┐   ┌────┴─────┐                              │
│  │  Redis  │   │ GeoAI    │                              │
│  │ Memory  │   │ Client   │────▶ GeoAI Tool Adapter     │
│  └─────────┘   └──────────┘                              │
└──────────────────────────────────────────────────────────┘
```

## Features

| Feature | Description |
|---|---|
| **LLM Connection** | Provider-agnostic abstraction (OpenAI first, extensible to Anthropic/Llama) |
| **Dynamic Tool Loading** | Fetches GIS tool definitions from GeoAI service — never hardcoded |
| **Tool Execution Engine** | Dispatches LLM function calls to GeoAI `/tools/execute` |
| **System Prompt** | Production prompt for geographic reasoning and tool selection |
| **Chat API** | `POST /api/chat` standard + `POST /api/chat/stream` SSE streaming |
| **Conversation Memory** | Redis-backed per-session history with location persistence |
| **Map Response Format** | Structured map_action payloads (marker, route, polygon) for MapLibre GL |
| **Streaming SSE** | Real-time token-by-token responses with tool call events |
| **Security** | API key auth, rate limiting, no credential exposure |
| **Observability** | Structured JSON logging of every agent turn with latency metrics |

## Quick Start

### Prerequisites

The main GeoSphere stack must be running:

```bash
# From repo root
docker compose -f compose.yaml -f compose.dev.yaml up -d

# Start the GeoAI Tool Adapter
cd geoai-service && docker compose up --build -d
```

### 1. Configure

```bash
cd ai-agent-service
cp .env.example .env
# Edit .env with your OPENAI_API_KEY and AGENT_API_KEYS
```

### 2. Run with Docker

```bash
docker compose up --build -d
```

### 3. Run locally (development)

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8200
```

### 4. Test

```bash
curl -X POST http://localhost:8200/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-agent-api-key" \
  -d '{
    "message": "Find police station near me",
    "user_location": {"lat": 12.9716, "lon": 77.5946},
    "session_id": "test-1"
  }'
```

## API Reference

### `POST /api/chat`

Standard request/response for geographic questions.

**Request:**
```json
{
  "message": "Find police station near me",
  "user_location": {"lat": 12.9716, "lon": 77.5946},
  "session_id": "abc123"
}
```

**Response:**
```json
{
  "answer": "The nearest police station is Indiranagar Police Station, located 1.2km away.",
  "tool_used": "find_nearest_place",
  "tool_result": { "status": "success", "results": [...] },
  "map_action": {
    "type": "marker",
    "coordinates": [77.6408, 12.9784],
    "label": "Indiranagar Police Station"
  },
  "session_id": "abc123",
  "sources": ["postgis"]
}
```

### `POST /api/chat/stream`

Server-Sent Events streaming response.

**SSE Events:**
```
event: answer_chunk
data: Here

event: answer_chunk
data:  are

event: tool_call
data: {"name": "find_nearest_place", "arguments": "..."}

event: tool_result
data: {"status": "success", ...}

event: answer_done
data: {"answer": "...", "tool_used": "...", "map_action": {...}}
```

### `DELETE /api/chat/session/{session_id}`

Clear conversation history for a session.

### `GET /health`

Health check endpoint.

### `GET /agent/info`

Returns configured provider, model, and GeoAI URL.

## Supported Commands

| Command | Tool Used |
|---|---|
| "Find police station near me" | `find_nearest_place` |
| "Find hospitals near my location" | `find_nearest_place` |
| "Which district am I in?" | `query_spatial_layer` |
| "Find my postal code" | `query_spatial_layer` |
| "Navigate to Mysore Palace" | `get_route` + `search_place` |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `openai` | LLM provider (openai, anthropic, llama) |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4.1` | Model to use |
| `OPENAI_BASE_URL` | — | Override for Azure/custom APIs |
| `GEOAI_BASE_URL` | `http://geoai-service:8000` | GeoAI Tool Adapter URL |
| `GEOAI_API_KEY` | — | Key for GeoAI service auth |
| `REDIS_URL` | `redis://redis:6379/3` | Redis for conversation memory |
| `AGENT_API_KEYS` | — | Comma-separated frontend API keys |
| `MAX_TOOL_ROUNDS` | `10` | Max LLM tool-calling iterations |
| `ENABLE_STREAMING` | `true` | Enable SSE streaming |

## Testing

```bash
pip install -r requirements.txt
pytest -v
```

## Project Structure

```
ai-agent-service/
├── app/
│   ├── main.py                 # FastAPI app factory
│   ├── config/settings.py      # Pydantic settings from env
│   ├── api/chat.py             # Chat + streaming endpoints
│   ├── agent/
│   │   ├── agent.py            # Main orchestration loop
│   │   ├── executor.py         # Tool execution engine
│   │   ├── prompts.py          # System prompt
│   │   └── memory.py           # Conversation memory manager
│   ├── llm/
│   │   ├── provider.py         # Abstract LLM provider
│   │   ├── openai_provider.py  # OpenAI implementation
│   │   └── models.py           # LLM message models
│   ├── geoai/
│   │   ├── client.py           # httpx client to GeoAI service
│   │   └── tools.py            # Tool definition loader
│   ├── schemas/chat_models.py  # API request/response models
│   ├── cache/redis.py          # Redis connection + memory
│   └── logging/logger.py       # Structured JSON logging
├── tests/
│   ├── test_agent.py           # Agent orchestration tests
│   ├── test_chat_api.py        # API endpoint tests
│   └── test_tools.py           # Tool loading tests
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── .env.example
```
