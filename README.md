# Naksha GeoSphere — The Geospatial Data Marketplace

> **Status: Engineering Foundation + AI Agent Integration.** This repository contains
> a production-oriented platform foundation with an integrated AI-powered GeoGIS copilot
> ("Nibo") that understands natural-language geographic questions and automatically
> orchestrates GIS tool calls.

---

## 1. Project Overview

Naksha GeoSphere is a premium geospatial data marketplace with an integrated AI assistant
that can answer geographic questions, find nearby places, show administrative boundaries,
calculate routes, and visualize results on an interactive MapLibre GL map.

### What's Built

- **Frontend** — Next.js + MapLibre GL interactive map with AI chat panel ("Nibo")
- **AI Agent Service** — LLM-powered reasoning layer with tool calling (Ollama/Qwen2.5 local, OpenAI, OpenCode Zen)
- **GeoAI Tool Adapter** — Spatial query middleware between AI and PostGIS/MinIO
- **GIS Backend** — FastAPI + PostGIS + MinIO + Celery worker
- **Spatial Context Engine** — AI understands live map state (center, zoom, layers, selected features)
- **Streaming Chat** — Real-time SSE responses with map visualization actions

---

## 2. Architecture

```
                    ┌─────────────────────┐
                    │   Browser / Mobile   │
                    │  (Next.js + MapLibre)│
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │   AI Agent Service   │  ← Nibo chat, streaming, tool calling
                    │   (port 8200)        │
                    └─────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌─────────────┐ ┌───────────┐ ┌──────────────┐
       │ LLM Provider│ │   Redis   │ │ GeoAI Tool   │
       │ (Ollama/    │ │ (memory)  │ │ Adapter      │
       │  OpenAI)    │ └───────────┘ │ (port 8100)  │
       └─────────────┘               └──────┬───────┘
                                            │
                                ┌───────────┼───────────┐
                                ▼           ▼           ▼
                         ┌──────────┐ ┌─────────┐ ┌─────────┐
                         │ PostGIS  │ │  MinIO  │ │  OSRM   │
                         │ (5544)   │ │ (9000)  │ │(5001-3) │
                         └──────────┘ └─────────┘ └─────────┘
```

---

## 3. Prerequisites

### Required

| Tool | Version | Purpose |
|---|---|---|
| **Docker Desktop** | Latest | Runs all backend services |
| **Git** | Latest | Clone the repository |
| **Python** | 3.11 or 3.12 | AI Agent Service local dev |
| **Node.js** | ≥ 20 | Frontend local dev (optional) |
| **pnpm** | Latest | Frontend package manager |

### Optional (for local LLM)

| Tool | Purpose |
|---|---|
| **Ollama** | Local LLM inference (runs inside Docker) |

> **Note:** You do NOT need PostgreSQL, Redis, or MinIO installed locally — they run inside Docker.

---

## 4. Quick Start (5 minutes)

### Step 1: Clone and configure

```bash
git clone <repo-url>
cd Naksha_GeoSphere

# Copy environment template
cp .env.example .env

# Edit .env with your settings (see Section 5 for all variables)
# Minimum required: POSTGRES_PASSWORD and MINIO_ACCESS_KEY / MINIO_SECRET_KEY
```

### Step 2: Start the core stack

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build -d
```

> There is no `compose.local-storage*.yaml` in this repo — the two files above are
> the whole core stack (Postgres/PostGIS, Redis, MinIO, OSRM, the FastAPI `api`,
> the Celery `worker`, and the Next.js `web` frontend). See `compose.remote-storage.yaml`
> only if you're pointing at a separate database machine instead of the Docker-local one.

### Step 3: Start the GeoAI Tool Adapter

```bash
cd geoai-service

# Create .env from template
cp .env.example .env
# Edit .env — see Section 5 for database credentials

# Start
docker compose up --build -d
cd ..
```

### Step 4: Start the AI Agent Service (and Ollama)

The agent's own `docker compose.yml` already starts Ollama for you (it's a
`depends_on` service) — **do not** also `docker run --name ollama ...` separately,
that will conflict with it.

```bash
cd ai-agent-service

# Create .env from template
cp .env.example .env
# Edit .env — see Section 5. The defaults use LLM_PROVIDER=ollama, which needs
# no API key at all, so this works out of the box for local dev.

# Start (also brings up the ollama service automatically)
docker compose up --build -d

# First time only: pull the model into the now-running ollama container
docker exec $(docker compose ps -q ollama) ollama pull qwen2.5:3b
cd ..
```

> ⚠️ **Known gotcha: `docker compose up` fails with "network ... declared as
> external, but could not be found".** `ai-agent-service/docker-compose.yml`
> joins an external network named literally `naksha-network`, but Compose
> actually creates the core stack's network as `<project-name>_naksha-network`
> (e.g. `naksha_geosphere_naksha-network` if you cloned into a folder called
> `Naksha_GeoSphere`, since Compose derives the project name from the folder).
> If you hit this, either rename your clone folder to `naksha_geosphere` (all
> lowercase - simplest, since that's what the checked-in `.env`/scripts assume)
> and re-run Step 2, or run `docker network ls | grep naksha` to see the real
> name Step 2 actually created, then temporarily override it for your own
> machine with `docker compose -p <that-project-name> up --build -d` here in
> `ai-agent-service/`. **Don't just rename the `naksha-network:` key in
> `docker-compose.yml`** to "fix" it - that's shared, checked-in config and
> would just move the mismatch onto whoever pulls that change next; this is
> really a one-line fix in the compose file itself, worth raising with
> whoever owns this service rather than patching around per-machine.
>
> **No NVIDIA GPU?** The `ollama` service in `ai-agent-service/docker-compose.yml`
> requests an NVIDIA GPU (`deploy.resources.reservations.devices`). Without one
> (and the NVIDIA Container Toolkit installed), `docker compose up` for this file
> will fail outright with a "could not select device driver" error. Either install
> the toolkit, or delete/comment out that `deploy:` block — Ollama runs fine on
> CPU, just slower. Alternatively, skip Ollama entirely and set
> `LLM_PROVIDER=openai` (or `opencode`) with a real API key instead.
>
> **Prefer running the agent outside Docker for `--reload` dev?** See
> "AI Agent Service (Local, outside Docker)" in Section 6 — you'll still need
> Ollama running somehow (Docker or a native install) if `LLM_PROVIDER=ollama`.

### Step 5: Verify everything works

```bash
# Core stack health
curl http://localhost:8000/api/v1/health

# GeoAI Tool Adapter
curl http://localhost:8100/health

# AI Agent Service
curl http://localhost:8200/health
curl http://localhost:8200/agent/info   # confirms which LLM provider/model it's using

# Ollama (only relevant if LLM_PROVIDER=ollama)
curl http://localhost:11434/api/tags

# Frontend
open http://localhost:3000
```

---

## 5. Environment Variables

### Core Stack (.env at repo root)

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | ✅ | PostgreSQL password |
| `MINIO_ACCESS_KEY` | ✅ | MinIO access key |
| `MINIO_SECRET_KEY` | ✅ | MinIO secret key |
| `POSTGRES_HOST_PORT` | | DB port (default: 5434) |
| `REDIS_HOST_PORT` | | Redis port (default: 6380) |
| `NEXT_PUBLIC_API_URL` | | Frontend→API URL (default: http://localhost:8000) |

### Remote Storage Server (if using separate DB machine)

| Variable | Example | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://geosphere_app:PASSWORD@192.168.10.81:5544/naksha_geosphere` | PostGIS connection |
| `REDIS_URL` | `redis://:PASSWORD@192.168.10.81:6390/2` | Redis connection |
| `MINIO_ENDPOINT` | `192.168.10.81:9000` | MinIO server |
| `S3_ACCESS_KEY` | `geosphere_storage` | MinIO/S3 access key |
| `S3_SECRET_KEY` | `...` | MinIO/S3 secret key |

### GeoAI Tool Adapter (geoai-service/.env)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Same PostGIS as core stack |
| `REDIS_URL` | ✅ | Same Redis, different DB index (/2) |
| `MINIO_ENDPOINT` | ✅ | Same MinIO as core stack |
| `MINIO_ACCESS_KEY` | ✅ | Same as core stack |
| `MINIO_SECRET_KEY` | ✅ | Same as core stack |
| `GEOAI_API_KEYS` | ✅ | API key for auth (generate: `python -c "import secrets; print(secrets.token_urlsafe(32))"`) |
| `GEOAI_HOST_PORT` | | Port to expose (default: 8100) |

### AI Agent Service (ai-agent-service/.env)

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | ✅ | `openai` | LLM provider: `ollama`, `openai`, or `opencode` |
| `OLLAMA_URL` | If using Ollama | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | If using Ollama | `qwen2.5:3b` | Ollama model name |
| `OPENAI_API_KEY` | If using OpenAI | | OpenAI API key |
| `OPENCODE_API_KEY` | If using OpenCode | | OpenCode Zen API key |
| `GEOAI_BASE_URL` | ✅ | `http://localhost:8100` | GeoAI Tool Adapter URL |
| `GEOAI_API_KEY` | ✅ | | Must match `GEOAI_API_KEYS` in geoai-service |
| `REDIS_URL` | ✅ | | Redis for conversation memory |
| `AGENT_API_KEYS` | | | Comma-separated keys for frontend auth |
| `MAX_TOOL_ROUNDS` | | `10` | Max LLM tool-calling iterations |

---

## 6. Running the Services

### Core Stack (Docker)

```bash
# Start everything
docker compose -f compose.yaml -f compose.dev.yaml up --build -d

# View logs
docker compose -f compose.yaml -f compose.dev.yaml logs -f

# Stop everything
docker compose -f compose.yaml -f compose.dev.yaml down
```

### GeoAI Tool Adapter (Docker)

```bash
cd geoai-service
docker compose up --build -d

# View logs
docker compose logs -f geoai-service
```

### AI Agent Service + Ollama (Docker)

```bash
cd ai-agent-service
docker compose up --build -d

# View logs
docker compose logs -f ai-agent-service
docker compose logs -f ollama
```

### AI Agent Service (Local, outside Docker)

Useful for faster `--reload` iteration on the agent code itself. Ollama (or
whichever LLM provider you're using) still needs to be reachable — either
start just the `ollama` service from the compose file above
(`docker compose up -d ollama`), or point `OLLAMA_URL`/`OPENAI_API_KEY`/etc.
at an already-running instance.

```bash
cd ai-agent-service
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env       # edit as needed

# Development with auto-reload
uvicorn app.main:app --host 127.0.0.1 --port 8200 --reload

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8200 --workers 4
```

### Ollama model management

```bash
# Pull a model (first time only) - into the compose-managed container
docker exec $(docker compose -f ai-agent-service/docker-compose.yml ps -q ollama) ollama pull qwen2.5:3b

# Verify model is available
curl http://localhost:11434/api/tags

# Test inference directly
docker exec $(docker compose -f ai-agent-service/docker-compose.yml ps -q ollama) ollama run qwen2.5:3b "Say hello"
```

---

## 7. Features

### AI Chat (Nibo)

- **Natural language queries** — "Find police stations near me", "Which district is this?"
- **Context-aware** — AI understands current map state (center, zoom, layers, selected features)
- **Streaming responses** — Real-time token-by-token via Server-Sent Events
- **Map visualization** — Automatic markers, routes, polygons on the map

### Supported Commands

| User Intent | Example | Tool Used |
|---|---|---|
| Find nearby places | "Find hospital near me" | `find_nearest_place` |
| Administrative boundaries | "Which district am I in?" | `query_spatial_layer` |
| Navigation | "Navigate to Mysore Palace" | `get_route` + `search_place` |
| Address lookup | "What is this address?" | `reverse_geocode` |
| Place search | "Find Bangalore Palace" | `search_place` |

### Map Actions

| Action Type | Description |
|---|---|
| `marker` | Single pin on the map |
| `multi_marker` | Multiple pins (e.g., nearby results) |
| `route` | Polyline between two points |
| `polygon` / `highlight` | Area highlight with fill |
| `fly_to` | Animate camera to location |
| `add_layer` | Add GeoJSON data layer |

### Spatial Context Engine

When a user asks "Find police stations here", the AI uses:
- **Map center** — resolves "here" to coordinates
- **Zoom level** — understands detail level
- **Active layers** — knows what data is visible
- **Selected feature** — uses clicked feature properties

---

## 8. API Reference

### AI Agent Service (port 8200)

#### `POST /api/chat/stream` (Recommended)

Stream a geographic answer as Server-Sent Events.

```bash
curl -X POST http://localhost:8200/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Find police station near me",
    "user_location": {"lat": 12.9716, "lon": 77.5946},
    "map_context": {
      "center": {"lat": 12.9716, "lon": 77.5946},
      "zoom": 15,
      "active_layers": ["roads", "buildings"]
    },
    "session_id": "test-1"
  }'
```

**SSE Events:**
```
event: answer_chunk
data: The

event: answer_chunk
data:  nearest

event: tool_call
data: {"name": "find_nearest_place", "arguments": "..."}

event: tool_result
data: {"status": "success", "results": [...]}

event: answer_done
data: {"answer": "...", "tool_used": "...", "map_action": {...}}
```

#### `POST /api/chat` (Standard)

```bash
curl -X POST http://localhost:8200/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "hi", "session_id": "test-1"}'
```

#### `GET /health`

```bash
curl http://localhost:8200/health
# {"status":"ok","service":"Naksha GeoAI Agent Service","version":"1.0.0"}
```

#### `GET /agent/info`

```bash
curl http://localhost:8200/agent/info
# {"provider":"ollama","model":"qwen2.5:3b","base_url":"http://localhost:11434","geoai_url":"http://localhost:8100"}
```

### GeoAI Tool Adapter (port 8100)

#### `GET /geoai/tools/definitions`

Returns OpenAI function-calling compatible tool schemas.

#### `POST /geoai/tools/execute`

Execute a GIS tool.

```bash
curl -X POST http://localhost:8100/geoai/tools/execute \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"name": "find_nearest_place", "arguments": {"category": "police_station", "latitude": 12.9716, "longitude": 77.5946, "radius": 5000}}'
```

---

## 9. LLM Provider Switching

Switch between providers by changing one environment variable — no code changes needed.

| Provider | `LLM_PROVIDER` | Model | API |
|---|---|---|---|
| **Ollama (Local)** | `ollama` | `qwen2.5:3b` | `http://localhost:11434` |
| **OpenAI (Cloud)** | `openai` | `gpt-4.1` | OpenAI API |
| **OpenCode Zen** | `opencode` | `mimo-v2.5-free` | OpenCode API |

### Switch to Ollama (Recommended for dev)

```bash
# ai-agent-service/.env
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
```

### Switch to OpenAI

```bash
# ai-agent-service/.env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key
OPENAI_MODEL=gpt-4.1
```

---

## 10. Frontend Integration

The frontend (Next.js) communicates with the AI Agent Service via a proxy rewrite.

### Proxy Configuration (frontend/next.config.ts)

```typescript
async rewrites() {
  return [
    {
      source: "/api/agent/:path*",
      destination: `${process.env.AGENT_API_URL ?? "http://localhost:8200"}/api/:path*`,
    },
    {
      // Nibo's "online" indicator - a cheap GET, not a full agent turn.
      source: "/api/agent-health",
      destination: `${process.env.AGENT_API_URL ?? "http://localhost:8200"}/health`,
    },
  ];
}
```

### Docker Configuration

The `web` container needs `AGENT_API_URL` set to something IT can reach the agent
service through - `localhost` inside a container means the container itself, not
your host machine, so the default (`http://localhost:8200`) will never work there.

```yaml
# compose.dev.yaml (as currently checked in)
web:
  environment:
    AGENT_API_URL: ${AGENT_API_URL:-http://192.168.10.42:8200}
```

> ⚠️ **Known gotcha for a new machine.** That fallback IP (`192.168.10.42`) is one
> specific developer's LAN address, not something portable - it will not resolve
> on your machine or your teammates'. **Don't edit `compose.dev.yaml` to "fix"
> this for everyone** (a shared file shouldn't hardcode any one person's IP);
> instead override it for your own machine, either:
> - Add `AGENT_API_URL=http://host.docker.internal:8200` to your root `.env`
>   (works out of the box on Docker Desktop for Windows/macOS; on Linux add
>   `extra_hosts: ["host.docker.internal:host-gateway"]` to the `web` service
>   first, or run this override some other way), or
> - Point it at `ai-agent-service`'s actual reachable address on your network/
>   container setup (its own container DNS name if it's joined to
>   `naksha-network`, e.g. `http://ai-agent-service:8000`, or your own LAN IP).

### Key Frontend Components

| Component | Location | Purpose |
|---|---|---|
| `ExplorePage.tsx` | `frontend/src/components/explore/` | Main map + chat UI |
| `MapContextProvider.tsx` | `frontend/src/components/geoai/` | Captures live map state |
| `MapActionHandler.tsx` | `frontend/src/components/geoai/` | Executes map actions from AI |
| `IndiaMapViewer.tsx` | `frontend/src/components/explore/` | MapLibre GL map component |

---

## 11. Project Structure

```
Naksha_GeoSphere/
├── ai-agent-service/              # AI Agent (Nibo)
│   ├── app/
│   │   ├── agent/
│   │   │   ├── agent.py           # Main orchestration loop
│   │   │   ├── context.py         # Spatial Context Resolver
│   │   │   ├── executor.py        # Tool execution engine
│   │   │   ├── prompts.py         # Context-aware system prompt
│   │   │   ├── memory.py          # Redis conversation memory
│   │   │   └── analytics.py       # Query analytics logging
│   │   ├── llm/
│   │   │   ├── provider.py        # Abstract LLM provider
│   │   │   ├── openai_provider.py # OpenAI implementation
│   │   │   ├── ollama_provider.py # Ollama implementation
│   │   │   ├── opencode_provider.py # OpenCode Zen implementation
│   │   │   └── factory.py         # Provider factory
│   │   ├── geoai/
│   │   │   ├── client.py          # httpx client to GeoAI service
│   │   │   └── tools.py           # Tool definition loader
│   │   ├── schemas/
│   │   │   ├── chat_models.py     # API request/response models
│   │   │   └── map_actions.py     # Extended map action types
│   │   ├── api/chat.py            # Chat + streaming endpoints
│   │   ├── cache/redis.py         # Redis connection + memory
│   │   └── config/settings.py     # Pydantic settings
│   ├── tests/                     # 79 tests
│   ├── requirements.txt
│   └── .env.example
│
├── geoai-service/                 # GeoAI Tool Adapter
│   ├── app/
│   │   ├── api/tools.py           # Tool definitions + dispatcher
│   │   ├── services/              # nearby, spatial, geocode, minio
│   │   ├── database/models.py     # PostGIS POI models
│   │   └── schemas/
│   ├── migrations/
│   ├── docker-compose.yml
│   └── .env.example
│
├── frontend/                      # Next.js + MapLibre GL
│   ├── src/
│   │   ├── components/
│   │   │   ├── explore/           # Map, chat, search UI
│   │   │   └── geoai/             # MapContextProvider, MapActionHandler
│   │   ├── lib/config.ts
│   │   └── app/
│   ├── next.config.ts
│   └── Dockerfile
│
├── services/
│   ├── api/                       # FastAPI backend
│   └── worker/                    # Celery worker
│
├── infrastructure/                # Docker, Terraform, routing
├── compose.yaml                   # Base Docker Compose
├── compose.dev.yaml               # Development overlay
├── compose.prod.yaml              # Production overlay
└── .env.example                   # Environment template
```

---

## 12. Testing

### AI Agent Service (79 tests)

```bash
cd ai-agent-service
source .venv/bin/activate
pip install -r requirements.txt
pytest -v
```

### GeoAI Tool Adapter

```bash
cd geoai-service
source .venv/bin/activate
pip install -r requirements.txt
pytest -v
```

### Frontend

```bash
cd frontend
pnpm install
pnpm test
```

---

## 13. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **Agent returns 500** | Agent service not running | Start with `uvicorn app.main:app --port 8200` (or `docker compose up` in `ai-agent-service/`) |
| **"Agent service returned 500" / agent-health keeps failing in browser** | Frontend container can't reach agent | Override `AGENT_API_URL` for your machine — see "Docker Configuration" in Section 10, **don't hardcode your IP into `compose.dev.yaml`** |
| **`docker compose up` in `ai-agent-service/` fails: network declared as external, but could not be found** | Network name mismatch between `ai-agent-service/docker-compose.yml` and what Step 2 actually created | See the callout under Quick Start Step 4 |
| **`docker compose up` in `ai-agent-service/` fails: could not select device driver "nvidia"** | No NVIDIA GPU / Container Toolkit on this machine | See the callout under Quick Start Step 4 |
| **GeoAI returns 500 on tool call** | PostGIS tables don't exist | Run migrations: `python migrations/run_migrations.py` in geoai-service |
| **Ollama 400 Bad Request** | Tool arguments format wrong | Ensure `arguments` is a dict, not JSON string (already fixed in code) |
| **Redis connection error** | Redis not running or wrong URL | Check `REDIS_URL` in .env matches your Redis instance |
| **OpenAI 429 Rate Limit** | API quota exhausted | Switch to Ollama: `LLM_PROVIDER=ollama` |
| **Frontend shows "coming soon"** | Agent service not wired | Ensure `AGENT_API_URL` is set in web container env |
| **Port conflict** | Another process using port | Change `*_HOST_PORT` in .env |

### Checking Service Health

```bash
# Core stack
docker compose ps

# GeoAI Tool Adapter
curl http://localhost:8100/health

# AI Agent Service
curl http://localhost:8200/health
curl http://localhost:8200/agent/info

# Ollama
curl http://localhost:11434/api/tags
```

---

## 14. Security Notes

- **Never commit `.env` files** — they are excluded via `.gitignore`
- **API keys** — Use unique keys for each service, rotate regularly
- **LLM keys** — Never expose `OPENAI_API_KEY` or `OPENCODE_API_KEY` to the frontend
- **GeoAI isolation** — The AI agent only sees `/geoai/*` endpoints, never raw DB credentials
- **Rate limiting** — Both GeoAI and Agent services implement per-key rate limiting

---

## 15. Development Workflow

### Adding a new GIS tool

1. Add tool definition to `geoai-service/app/api/tools.py::TOOL_DEFINITIONS`
2. Implement the handler in the appropriate service file
3. Add test in `geoai-service/tests/`
4. The AI agent will automatically pick up the new tool via dynamic loading

### Adding a new LLM provider

1. Create `ai-agent-service/app/llm/new_provider.py` implementing `LLMProvider`
2. Add provider to `ai-agent-service/app/llm/factory.py`
3. Add config fields to `ai-agent-service/app/config/settings.py`
4. Add tests in `ai-agent-service/tests/`

### Modifying the AI system prompt

Edit `ai-agent-service/app/agent/prompts.py` — the `SYSTEM_PROMPT` variable.

---

## 16. License

[Add your license here]
