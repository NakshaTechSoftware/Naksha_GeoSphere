"""RAG (Retrieval-Augmented Generation) module for intent classification.

Uses OpenAI embeddings to find similar example queries from a knowledge base
and injects them into the prompt as few-shot examples. This ensures that
semantically similar queries (e.g., "my police station" and "to which police
station I come under") always map to the same tool.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any

from app.config.settings import get_settings
from app.logging.logger import get_logger

logger = get_logger("agent.rag")

# Knowledge base file path
_KB_PATH = Path(__file__).parent / "rag_knowledge_base.json"

# Module-level cache
_kb: dict[str, Any] | None = None
_embeddings_cache: dict[str, list[float]] = {}
_embeddings_cache_time: float = 0.0
_EMBEDDINGS_CACHE_TTL = 3600  # 1 hour


def _load_kb() -> dict[str, Any]:
    """Load the knowledge base from disk (cached)."""
    global _kb
    if _kb is None:
        with open(_KB_PATH, "r") as f:
            _kb = json.load(f)
        logger.info(
            "Loaded RAG knowledge base: %d intents",
            len(_kb.get("intents", [])),
        )
    return _kb


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors (no numpy needed)."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def _get_embeddings(texts: list[str]) -> list[list[float]]:
    """Get embeddings for a list of texts using OpenAI's API.

    Uses a simple in-memory cache to avoid redundant API calls.
    """
    global _embeddings_cache, _embeddings_cache_time

    settings = get_settings()

    # Filter out texts that are already cached
    to_embed: list[str] = []
    to_embed_indices: list[int] = []
    results: list[list[float] | None] = [None] * len(texts)

    now = time.time()
    if (now - _embeddings_cache_time) > _EMBEDDINGS_CACHE_TTL:
        _embeddings_cache.clear()
        _embeddings_cache_time = now

    for i, text in enumerate(texts):
        if text in _embeddings_cache:
            results[i] = _embeddings_cache[text]
        else:
            to_embed.append(text)
            to_embed_indices.append(i)

    if to_embed:
        try:
            import httpx

            # Use OpenAI-compatible API for embeddings
            base_url = settings.openai_base_url or "https://api.openai.com/v1"
            api_key = settings.openai_api_key

            if not api_key:
                logger.warning("No OpenAI API key — skipping RAG embeddings")
                return [_embeddings_cache.get(t, [0.0]) for t in texts]

            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{base_url}/embeddings",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "text-embedding-3-small",
                        "input": to_embed,
                    },
                )
                resp.raise_for_status()
                data = resp.json()

                for j, item in enumerate(data["data"]):
                    idx = to_embed_indices[j]
                    embedding = item["embedding"]
                    results[idx] = embedding
                    _embeddings_cache[to_embed[j]] = embedding

        except Exception as e:
            logger.error("Embedding API failed: %s", e)
            # Fill missing with zero vectors
            for i, r in enumerate(results):
                if r is None:
                    results[i] = [0.0] * 1536  # text-embedding-3-small dim

    return [r if r is not None else [0.0] * 1536 for r in results]


async def retrieve_relevant_examples(
    query: str,
    top_k: int = 3,
    score_threshold: float = 0.45,
) -> list[dict[str, Any]]:
    """Retrieve the most relevant example queries for a user message.

    Returns a list of intent dicts with added `score` and `matched_query` fields.
    """
    kb = _load_kb()
    intents = kb.get("intents", [])
    if not intents:
        return []

    # Build a flat list of (query, intent_index) pairs
    query_intent_pairs: list[tuple[str, int]] = []
    for i, intent in enumerate(intents):
        for q in intent.get("example_queries", []):
            query_intent_pairs.append((q, i))

    if not query_intent_pairs:
        return []

    # Get embeddings for the user query and all example queries
    all_texts = [query] + [q for q, _ in query_intent_pairs]
    all_embeddings = await _get_embeddings(all_texts)

    query_embedding = all_embeddings[0]
    example_embeddings = all_embeddings[1:]

    # Score each unique intent by its best matching example
    intent_scores: dict[int, float] = {}
    intent_best_query: dict[int, str] = {}

    for j, (example_query, intent_idx) in enumerate(query_intent_pairs):
        sim = _cosine_similarity(query_embedding, example_embeddings[j])
        if sim > intent_scores.get(intent_idx, -1):
            intent_scores[intent_idx] = sim
            intent_best_query[intent_idx] = example_query

    # Sort by score, take top_k
    ranked = sorted(intent_scores.items(), key=lambda x: x[1], reverse=True)[
        :top_k
    ]

    results = []
    for intent_idx, score in ranked:
        if score < score_threshold:
            continue
        intent = intents[intent_idx].copy()
        intent["score"] = round(score, 3)
        intent["matched_query"] = intent_best_query[intent_idx]
        results.append(intent)

    return results


def format_rag_context(relevant_intents: list[dict[str, Any]]) -> str:
    """Format retrieved intents into a prompt section for the LLM.

    This is injected into the system prompt so the LLM sees concrete
    examples of how to map similar queries to the correct tools.
    """
    if not relevant_intents:
        return ""

    lines = [
        "\n\n## Similar Query Examples (from knowledge base)",
        "The user's question is similar to these known patterns. "
        "Use the SAME tool mapping shown below:",
    ]

    for intent in relevant_intents:
        tool = intent.get("tool", "unknown")
        args = intent.get("tool_args", {})
        matched = intent.get("matched_query", "")
        score = intent.get("score", 0)

        args_str = json.dumps(args) if args else "{}"
        lines.append(
            f'\n- Similar to "{matched}" (similarity: {score}) '
            f'→ use `{tool}` with args {args_str}'
        )

    lines.append(
        "\nAlways prefer the tool mapping shown above over generic rules "
        "when the user's question matches a known pattern."
    )

    return "\n".join(lines)
