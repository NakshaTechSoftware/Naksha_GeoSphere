# LLM Provider Switching Guide

Switch between OpenAI, Ollama, and OpenCode Zen using only environment variables — no code changes required.

## Supported Providers

| Provider | `LLM_PROVIDER` | Type | Model | API |
|---|---|---|---|---|
| OpenAI | `openai` | Cloud | GPT-4.1 | OpenAI native |
| Ollama | `ollama` | Local | Qwen2.5-3B | Ollama HTTP |
| OpenCode Zen | `opencode` | Cloud | MiMo-V2.5-Free | OpenAI-compatible |

## Quick Switch

Change one line in `.env`:

```bash
# OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Ollama (local, no API key needed)
LLM_PROVIDER=ollama
OLLAMA_URL=http://ollama:11434

# OpenCode Zen (MiMo-V2.5-Free)
LLM_PROVIDER=opencode
OPENCODE_API_KEY=your-key
```

Then restart:
```bash
docker compose restart ai-agent-service
```

## Provider Comparison

| Metric | OpenAI GPT-4.1 | Ollama Qwen2.5-3B | OpenCode MiMo-V2.5-Free |
|---|---|---|---|
| Latency | ~500ms | ~2-5s (GPU) | ~800ms-2s |
| Quality | Excellent | Good | Good |
| Cost | ~$0.01/query | Free | Free/Paid tier |
| Internet | Required | Not required | Required |
| Privacy | Cloud | Local | Cloud |
| Function calling | Native | Native + JSON fallback | Native |
| Streaming | Full | Full | Full |

## Environment Variables by Provider

### Common
| Variable | Description |
|---|---|
| `LLM_PROVIDER` | `openai`, `ollama`, or `opencode` |
| `MAX_TOOL_ROUNDS` | Max LLM tool-calling iterations (default: 10) |

### OpenAI
```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1
OPENAI_BASE_URL=            # Optional: Azure/custom
OPENAI_MAX_TOKENS=4096
OPENAI_TEMPERATURE=0.2
```

### Ollama
```bash
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_TEMPERATURE=0.1
OLLAMA_NUM_CTX=4096
OLLAMA_TIMEOUT=120
```

### OpenCode Zen
```bash
OPENCODE_API_KEY=your-key
OPENCODE_MODEL=mimo-v2.5-free
OPENCODE_BASE_URL=https://opencode.ai/zen/v1
OPENCODE_MAX_TOKENS=4096
OPENCODE_TEMPERATURE=0.1
OPENCODE_TIMEOUT=60
```

## Docker Compose Configurations

### Cloud only (OpenAI or OpenCode)
```yaml
services:
  ai-agent-service:
    env_file: .env
    # No extra services needed
```

### Ollama only
```yaml
services:
  ai-agent-service:
    env_file: .env
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama-data:/root/.ollama
```

### All three available (switch at runtime via env)
```yaml
services:
  ai-agent-service:
    env_file: .env
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama-data:/root/.ollama
```

## API Compatibility

All endpoints work identically regardless of provider:

```bash
# Same request works with any provider
curl -X POST http://localhost:8200/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"message": "Find police station near me", "user_location": {"lat": 12.97, "lon": 77.59}}'
```

The response format is provider-agnostic:
```json
{
  "answer": "The nearest police station is...",
  "tool_used": "find_nearest_place",
  "tool_result": {...},
  "map_action": {"type": "marker", "coordinates": [...]},
  "session_id": "abc123",
  "sources": ["postgis"]
}
```

## Monitoring

Check which provider is active:
```bash
curl http://localhost:8200/agent/info
```

Structured logs include provider info:
```json
{"level": "INFO", "logger": "agent.main", "message": "Starting Naksha GeoAI Agent Service (env=development, provider=opencode)"}
{"level": "INFO", "logger": "agent.llm.opencode", "message": "OpenCode Zen chat completed", "provider": "opencode", "model": "mimo-v2.5-free", "latency_ms": 1234.56, "status": "success"}
```

## When to Use Which

| Scenario | Recommended Provider |
|---|---|
| Production with best quality | OpenAI |
| Offline / air-gapped | Ollama |
| Free cloud alternative | OpenCode Zen |
| Cost-sensitive with good quality | OpenCode Zen |
| Privacy-critical | Ollama |
| Development/testing | Ollama (free) or OpenCode Zen |
