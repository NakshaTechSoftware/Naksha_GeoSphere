"""Shared test fixtures and configuration."""

import os

# Set test environment variables before any imports
os.environ.setdefault("OPENAI_API_KEY", "sk-test-key")
os.environ.setdefault("GEOAI_API_KEY", "test-geoai-key")
os.environ.setdefault("AGENT_API_KEYS", "test-key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")  # Test DB
os.environ.setdefault("GEOAI_BASE_URL", "http://localhost:8100")
os.environ.setdefault("LLM_PROVIDER", "openai")
os.environ.setdefault("OLLAMA_URL", "http://localhost:11434")
os.environ.setdefault("OLLAMA_MODEL", "qwen2.5:3b")
os.environ.setdefault("OLLAMA_TIMEOUT", "5")
os.environ.setdefault("OPENCODE_API_KEY", "test-opencode-key")
os.environ.setdefault("OPENCODE_BASE_URL", "https://opencode.ai/zen/v1")
os.environ.setdefault("OPENCODE_MODEL", "mimo-v2.5-free")
os.environ.setdefault("OPENCODE_TIMEOUT", "5")
