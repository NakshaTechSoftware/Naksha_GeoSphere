# Ollama Local LLM Setup Guide

Run the Naksha GeoAI Agent without any cloud API dependency using Ollama.

## Architecture

```
AI Agent Service → Ollama (http://localhost:11434) → Qwen2.5-3B → GeoAI Tool Adapter
```

## 1. Install Ollama

### macOS / Linux
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Windows
Download from: https://ollama.com/download

### Docker (recommended for production)
```bash
docker run -d --gpus=all -v ollama:/root/.ollama -p 11434:11434 ollama/ollama
```

## 2. Download the Model

```bash
# Default model (3B params, ~2GB)
ollama pull qwen2.5:3b

# Verify installation
ollama list
```

## 3. Build the Custom Naksha GeoAI Model (Optional)

The project includes an optimized Modelfile for GIS tool calling:

```bash
cd ai-agent-service
ollama create naksha-geoai-model -f Modelfile
```

This creates a model with:
- Temperature 0.1 (deterministic tool calls)
- 4096 context window
- System prompt optimized for GIS queries
- Reduced hallucination settings

## 4. Configure the Agent Service

### Option A: Docker Compose (recommended)

```bash
cd ai-agent-service
cp .env.example .env
```

Edit `.env`:
```bash
LLM_PROVIDER=ollama
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:3b
```

Start:
```bash
docker compose up --build -d
```

### Option B: Local development

```bash
# Start Ollama (separate terminal)
ollama serve

# Configure and run the agent
cd ai-agent-service
cp .env.example .env
# Set LLM_PROVIDER=ollama in .env

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8200
```

## 5. Verify

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Check agent health
curl http://localhost:8200/health

# Check agent info (should show ollama provider)
curl http://localhost:8200/agent/info

# Test a query
curl -X POST http://localhost:8200/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"message": "Find police station near me", "user_location": {"lat": 12.9716, "lon": 77.5946}}'
```

## 6. GPU Configuration

### NVIDIA (CUDA)
Ensure you have the NVIDIA Container Toolkit installed:
```bash
# Install NVIDIA Container Toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

The docker-compose.yml includes GPU reservation by default. Remove the `deploy.resources` section if running CPU-only.

### Apple Silicon (Metal)
Ollama automatically uses Metal acceleration on macOS. No extra config needed.

### CPU-only
Remove the `deploy.resources` block from `docker-compose.yml`:
```yaml
  ollama:
    image: ollama/ollama:latest
    # Remove the deploy.resources section
```

## 7. Model Comparison

| Model | Size | RAM | Speed | Quality |
|---|---|---|---|---|
| `qwen2.5:3b` | 2GB | 4GB | Fast | Good for tool calls |
| `qwen2.5:7b` | 4.4GB | 8GB | Medium | Better reasoning |
| `qwen2.5:14b` | 8.9GB | 16GB | Slower | Best quality |
| `naksha-geoai-model` | 2GB | 4GB | Fast | Optimized for GIS |

## 8. Troubleshooting

### "Connection refused" error
- Ensure Ollama is running: `ollama serve`
- Check the port: `curl http://localhost:11434/api/tags`
- In Docker: ensure `OLLAMA_URL=http://ollama:11434` (not localhost)

### Slow responses
- First request is slow (model loading). Subsequent requests are faster.
- Check GPU is being used: `nvidia-smi` (NVIDIA) or Activity Monitor (macOS)
- Reduce context window: `OLLAMA_NUM_CTX=2048`

### Model not found
```bash
ollama list                    # Check available models
ollama pull qwen2.5:3b         # Download if missing
```

### Out of memory
- Use a smaller model: `qwen2.5:1.5b`
- Reduce context: `OLLAMA_NUM_CTX=2048`
- On Docker, increase memory limit:
  ```yaml
  ollama:
    deploy:
      resources:
        limits:
          memory: 8G
  ```

### Tool calls not working
- Some models need the JSON fallback. The agent automatically falls back to text extraction.
- Use the custom model: `OLLAMA_MODEL=naksha-geoai-model`
- Check logs for "tool_call" events in the agent output.
