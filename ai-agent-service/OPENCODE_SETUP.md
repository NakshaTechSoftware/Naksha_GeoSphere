# OpenCode Zen Setup Guide

Use MiMo-V2.5-Free through OpenCode Zen's OpenAI-compatible API as your local or cloud LLM provider.

## Architecture

```
AI Agent Service → OpenCode Zen API (https://opencode.ai/zen/v1) → MiMo-V2.5-Free → GeoAI Tool Adapter
```

## 1. Get an API Key

1. Sign up at [opencode.ai](https://opencode.ai)
2. Navigate to API settings
3. Generate an API key

## 2. Configure the Agent Service

### Option A: Docker

```bash
cd ai-agent-service
cp .env.example .env
```

Edit `.env`:
```bash
LLM_PROVIDER=opencode
OPENCODE_API_KEY=your-api-key-here
OPENCODE_MODEL=mimo-v2.5-free
OPENCODE_BASE_URL=https://opencode.ai/zen/v1
```

Start:
```bash
docker compose up --build -d
```

### Option B: Local development

```bash
cd ai-agent-service
cp .env.example .env
# Set LLM_PROVIDER=opencode and OPENCODE_API_KEY in .env

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8200
```

## 3. Verify

```bash
# Check agent health
curl http://localhost:8200/health

# Check agent info (should show opencode provider)
curl http://localhost:8200/agent/info
# {"provider": "opencode", "model": "mimo-v2.5-free", "base_url": "https://opencode.ai/zen/v1"}

# Test a query
curl -X POST http://localhost:8200/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-agent-api-key" \
  -d '{"message": "Find police station near me", "user_location": {"lat": 12.9716, "lon": 77.5946}}'
```

## 4. Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | Yes | `openai` | Set to `opencode` |
| `OPENCODE_API_KEY` | Yes | — | Your OpenCode Zen API key |
| `OPENCODE_MODEL` | No | `mimo-v2.5-free` | Model to use |
| `OPENCODE_BASE_URL` | No | `https://opencode.ai/zen/v1` | API endpoint |
| `OPENCODE_MAX_TOKENS` | No | `4096` | Max response tokens |
| `OPENCODE_TEMPERATURE` | No | `0.1` | Sampling temperature |
| `OPENCODE_TIMEOUT` | No | `60` | Request timeout (seconds) |

## 5. Function Calling

MiMo-V2.5-Free supports OpenAI-compatible function calling. The agent sends tool definitions from the GeoAI Tool Adapter and the model returns structured tool calls.

### Workflow

```
1. User: "Find police station near me"
2. Agent sends system prompt + tools + user message to MiMo-V2.5-Free
3. Model returns: {"name": "find_nearest_place", "arguments": {...}}
4. Agent executes tool via GeoAI Tool Adapter
5. Tool result returned to model
6. Model generates final natural language answer
7. Response includes map_action for MapLibre GL
```

### Supported Tools

All GeoAI tools are forwarded automatically:
- `find_nearest_place` — nearby POI search
- `reverse_geocode` — coordinates to address
- `search_place` — place name to coordinates
- `query_spatial_layer` — administrative boundary lookup
- `get_route` — driving/walking/cycling directions

## 6. Streaming

The OpenCode provider supports SSE streaming via `POST /api/chat/stream`:

```bash
curl -N -X POST http://localhost:8200/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"message": "Find hospitals near me"}'
```

Events: `answer_chunk`, `tool_call`, `tool_result`, `answer_done`, `error`

## 7. Troubleshooting

### "Invalid API key" error
- Verify your `OPENCODE_API_KEY` is correct
- Check the key hasn't expired in your OpenCode dashboard

### "Connection refused" / timeout
- Verify `OPENCODE_BASE_URL` is correct: `https://opencode.ai/zen/v1`
- Check your network/firewall allows outbound HTTPS to opencode.ai
- Increase `OPENCODE_TIMEOUT` if requests are slow

### Tool calls not working
- Check logs for structured audit entries
- Verify the model supports function calling (MiMo-V2.5-Free does)
- Ensure `GEOAI_BASE_URL` points to a running GeoAI Tool Adapter

### Rate limiting
- The OpenCode provider logs rate limit errors
- Implement backoff or reduce request frequency
- Check your plan's rate limits in the OpenCode dashboard

### Switch back to OpenAI
```bash
# In .env, change:
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key
# Remove or comment out OPENCODE_* vars
```
