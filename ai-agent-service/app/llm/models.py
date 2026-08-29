"""Provider-agnostic LLM message and tool-call models.

These mirror the shapes used by OpenAI's function-calling API, which
Anthropic and local Llama providers also adopt or can map to.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ToolFunction(BaseModel):
    name: str
    description: str = ""
    parameters: dict[str, Any] = Field(default_factory=dict)


class ToolDefinition(BaseModel):
    type: Literal["function"] = "function"
    function: ToolFunction


class LLMMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str | None = None
    tool_calls: list[dict[str, Any]] | None = None
    tool_call_id: str | None = None
    name: str | None = None


class ToolCall(BaseModel):
    id: str
    type: Literal["function"] = "function"
    function: ToolCallFunction


class ToolCallFunction(BaseModel):
    name: str
    arguments: str  # JSON string, parsed by executor


class LLMResponse(BaseModel):
    """Unified response from any LLM provider."""
    content: str | None = None
    tool_calls: list[ToolCall] = Field(default_factory=list)
    finish_reason: str | None = None
    usage: dict[str, int] = Field(default_factory=dict)
    model: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)


class LLMStreamChunk(BaseModel):
    """A single chunk from a streaming LLM response."""
    content_delta: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    finish_reason: str | None = None
