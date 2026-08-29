# LLM Provider Guide

Switch between cloud and local LLM providers using only environment variables.

## Supported Providers

| Provider | Type | Model | When to Use |
|---|---|---|---|
| `openai` | Cloud | GPT-4.1 | Production with best quality |
| `ollama` | Local | Qwen2.5-3B | Offline / cost-free / privacy |

## Switching Providers

### OpenAI → Ollama

Change one line in `.env`:

```bash
# Before
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...

# After
LLM_PROVIDER=ollama
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:3b
```

Restart the service:
```bash
docker compose restart ai-agent-service
```

### Ollama → OpenAI

```bash
# Before
LLM_PROVIDER=ollama
OLLAMA_URL=http://ollama:11434

# After
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
```

Restart:
```bash
docker compose restart ai-agent-service
```

## Environment Variables Reference

### Common
| Variable | Description | Default |
|---|---|---|
| `LLM_PROVIDER` | `openai` or `ollama` | `openai` |

### OpenAI
| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | API key | — |
| `OPENAI_MODEL` | Model name | `gpt-4.1` |
| `OPENAI_BASE_URL` | Override API URL | `https://api.openai.com/v1` |
| `OPENAI_MAX_TOKENS` | Max response tokens | `4096` |
| `OPENAI_TEMPERATURE` | Sampling temperature | `0.2` |

### Ollama
| Variable | Description | Default |
|---|---|---|
| `OLLAMA_URL` | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Model to use | `qwen2.5:3b` |
| `OLLAMA_TEMPERATURE` | Sampling temperature | `0.1` |
| `OLLAMA_NUM_CTX` | Context window size | `4096` |
| `OLLAMA_TIMEOUT` | Request timeout (seconds) | `120` |

## Docker Compose Configurations

### OpenAI only (no Ollama container needed)
```yaml
services:
  ai-agent-service:
    env_file: .env
    # LLM_PROVIDER=openai in .env
    # No ollama service needed
```

### Ollama only
```yaml
services:
  ai-agent-service:
    env_file: .env
    depends_on:
      - ollama
    # LLM_PROVIDER=ollama in .env

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
```

### Both available (switch at runtime via env)
```yaml
services:
  ai-agent-service:
    env_file: .env
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
```

## Performance Comparison

| Metric | OpenAI GPT-4.1 | Ollama Qwen2.5-3B |
|---|---|---|
| Latency | ~500ms | ~2-5s (GPU) |
| Quality | Excellent | Good |
| Cost | ~$0.01/query | Free |
| Availability | Requires internet | Always available |
| Privacy | Data sent to OpenAI | Data stays local |
| Tool calling | Native | Native + JSON fallback |

## Tool Calling Compatibility

### OpenAI (GPT-4.1)
- Native function calling
- Structured tool call objects
- Multi-tool parallel calls

### Ollama (Qwen2.5)
- Native tool calling (when model supports it)
- JSON text extraction fallback for all models
- Handles both patterns:
  - `{"name": "tool", "arguments": {...}}`
  - `{"tool": "tool", "arguments": {...}}`
  - `find_nearest_place(category="hospital", ...)`

The agent automatically detects and handles both formats.

## API Compatibility

The `/api/chat` and `/api/chat/stream` endpoints work identically regardless of which provider is active. The frontend never needs to know which LLM is running.

```bash
# Same request works with either provider
curl -X POST http://localhost:8200/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"message": "Find police station near me", "user_location": {"lat": 12.97, "lon": 77.59}}'
```

## Monitoring

Check which provider is active:
```bash
curl http://localhost:8200/agent/info
# {"provider": "ollama", "model": "qwen2.5:3b", "geoai_url": "http://geoai-service:8000"}
```

Structured logs include provider info:
```json
{"level": "INFO", "logger": "agent.main", "message": "Starting Naksha GeoAI Agent Service (env=development, provider=ollama)"}
```
