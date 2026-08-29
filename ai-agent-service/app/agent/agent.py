"""Main agent orchestration loop.

This is the core reasoning engine: it manages the conversation loop
between the user, the LLM, and the GIS tools.

Flow:
  1. Build messages from system prompt + memory + current user message
  2. Inject map context into the prompt
  3. Call LLM with tool definitions
  4. If LLM requests tool calls → execute them, append results, loop
  5. If LLM produces text → extract map_action and return final answer
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from app.agent.analytics import QueryAnalytics, classify_intent
from app.agent.context import format_context_for_prompt, resolve_map_context
from app.agent.executor import ToolExecutor
from app.agent.memory import MemoryManager
from app.agent.prompts import get_system_prompt
from app.agent.rag import format_rag_context, retrieve_relevant_examples
from app.config.settings import get_settings
from app.geoai.tools import load_tools
from app.llm.models import LLMMessage, ToolCall, ToolDefinition
from app.llm.provider import LLMProvider
from app.logging.logger import AgentRunLogger, get_logger

logger = get_logger("agent.core")


class GeoAIAgent:
    """Orchestrates LLM + GIS tool calling for geographic questions."""

    def __init__(
        self,
        llm: LLMProvider,
        session_id: str,
    ) -> None:
        self.llm = llm
        self.session_id = session_id
        self.memory = MemoryManager(session_id)
        self.executor = ToolExecutor(session_id=session_id, memory=self.memory)
        self.settings = get_settings()

    async def run(
        self,
        user_message: str,
        user_location: dict[str, float] | None = None,
        map_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Process a user message and return the agent's response.

        Returns a dict with: answer, tool_used, tool_result,
        map_action, session_id, sources.
        """
        analytics = QueryAnalytics()
        analytics.query = user_message
        analytics.intent = classify_intent(user_message)
        analytics.session_id = self.session_id
        analytics.has_map_context = bool(map_context)

        with AgentRunLogger.turn(self.session_id, user_message) as rec:
            try:
                # Persist user message
                await self.memory.save_user_message(user_message)

                # Save location if provided
                if user_location:
                    await self.memory.save_location(
                        user_location["lat"], user_location["lon"]
                    )

                # Save map context if provided
                if map_context:
                    await self.memory.save_map_context(map_context)
                    center = map_context.get("center")
                    if center and center.get("lat") and center.get("lon"):
                        await self.memory.save_location(center["lat"], center["lon"])
                    selected = map_context.get("selected_feature")
                    if selected:
                        await self.memory.save_selected_feature(selected)

                # Resolve spatial context
                ctx = resolve_map_context(map_context)

                # Build conversation messages
                messages = await self._build_messages(
                    user_message, user_location, ctx
                )
                try:
                    tools = await load_tools()
                except Exception as e:
                    logger.warning("Could not load GIS tools: %s — proceeding without tools", e)
                    tools = []

                # Agent loop: LLM → tool calls → results → LLM
                tool_used: str | None = None
                tool_result: dict[str, Any] | None = None
                sources: list[str] = []
                answer = ""
                map_action: dict[str, Any] | None = None

                for round_num in range(self.settings.max_tool_rounds):
                    rec.start_llm()
                    llm_response = await self.llm.chat(
                        messages=messages, tools=tools
                    )
                    rec.stop_llm()

                    # No tool calls → LLM is done
                    if not llm_response.tool_calls:
                        answer = llm_response.content or ""
                        map_action = self._extract_map_action(answer)
                        break

                    # Process tool calls
                    for tc in llm_response.tool_calls:
                        tool_name = tc.function.name
                        tool_used = tool_name
                        analytics.tool = tool_name
                        rec.tool = tool_name

                        try:
                            analytics.tool_args = json.loads(tc.function.arguments)
                        except (json.JSONDecodeError, TypeError):
                            analytics.tool_args = {}

                        result = await self.executor.execute(
                            tool_name, tc.function.arguments
                        )
                        tool_result = result
                        rec.tool_args = analytics.tool_args

                        # Track sources. Note: result["result"] is explicitly `null` (not
                        # absent) on a tool error — `.get("result", {})` would NOT
                        # substitute the default in that case (the key IS present), so
                        # `or {}` is required here to avoid calling .get() on None.
                        if (result.get("result") or {}).get("source"):
                            sources.append(result["result"]["source"])

                        # Save tool context to memory
                        await self.memory.save_tool_result(tool_name, result)

                        # Append assistant message with tool call
                        messages.append(
                            LLMMessage(
                                role="assistant",
                                content=None,
                                tool_calls=[{
                                    "id": tc.id,
                                    "type": "function",
                                    "function": {
                                        "name": tc.function.name,
                                        "arguments": tc.function.arguments,
                                    },
                                }],
                            )
                        )

                        # Append tool result
                        messages.append(
                            LLMMessage(
                                role="tool",
                                content=json.dumps(result, default=str),
                                tool_call_id=tc.id,
                            )
                        )

                    # If finish_reason was "stop" with no content, break
                    if llm_response.finish_reason == "stop":
                        answer = llm_response.content or ""
                        map_action = self._extract_map_action(answer)
                        break
                else:
                    # Max rounds exhausted — force text-only response
                    logger.warning(
                        "Max tool rounds (%d) exhausted for session %s",
                        self.settings.max_tool_rounds,
                        self.session_id,
                    )
                    messages.append(
                        LLMMessage(
                            role="user",
                            content="Please provide your final answer now based on the tool results above.",
                        )
                    )
                    final = await self.llm.chat(messages=messages, tools=None)
                    answer = final.content or "I was unable to complete the request within the allowed tool calls."
                    map_action = self._extract_map_action(answer)

                # Build map_action from tool_result if LLM didn't provide one
                if map_action is None and tool_result:
                    map_action = self._build_map_action_from_result(
                        tool_used, tool_result
                    )

                # Save assistant response to memory, then persist the whole
                # turn (user message + location/context/tool-result/assistant
                # message buffered above) in a single Redis round trip.
                await self.memory.save_assistant_message(
                    answer, tool_used=tool_used, tool_result=tool_result
                )
                await self.memory.flush()

                analytics.finish("success")
                asyncio.create_task(analytics.save())  # best-effort, off the critical path

                rec.status = "success"
                rec.sources = sources

                return {
                    "answer": answer,
                    "tool_used": tool_used,
                    "tool_result": tool_result,
                    "map_action": map_action,
                    "session_id": self.session_id,
                    "sources": sources,
                }

            except Exception as e:
                logger.error(
                    "Agent run failed for session %s: %s",
                    self.session_id,
                    e,
                    exc_info=True,
                )
                await self.memory.flush()
                analytics.finish("error", str(e))
                asyncio.create_task(analytics.save())

                rec.status = "error"
                return {
                    "answer": f"I encountered an error processing your request: {e}",
                    "tool_used": None,
                    "tool_result": None,
                    "map_action": None,
                    "session_id": self.session_id,
                    "sources": [],
                }

    async def _build_messages(
        self,
        user_message: str,
        user_location: dict[str, float] | None,
        map_context: dict[str, Any] | None = None,
    ) -> list[LLMMessage]:
        """Build the full message list for the LLM."""
        messages: list[LLMMessage] = []

        # System prompt + map context
        prompt = get_system_prompt()
        if map_context:
            context_str = format_context_for_prompt(map_context)
            if context_str:
                prompt += context_str

        # RAG: inject similar query examples for better tool routing
        try:
            relevant_intents = await retrieve_relevant_examples(user_message)
            rag_context = format_rag_context(relevant_intents)
            if rag_context:
                prompt += rag_context
        except Exception as e:
            logger.debug("RAG retrieval skipped: %s", e)

        # Also inject location from user_location or memory
        location = user_location
        if not location:
            location = await self.memory.get_last_location()
        if location:
            prompt += (
                f"\n\n[User's current GPS location: lat={location['lat']}, "
                f"lon={location['lon']}]"
            )

        messages.append(LLMMessage(role="system", content=prompt))

        # Conversation history from memory
        history = await self.memory.get_context_messages()
        for msg in history:
            messages.append(LLMMessage(role=msg["role"], content=msg["content"]))

        # Current user message
        messages.append(LLMMessage(role="user", content=user_message))

        return messages

    def _extract_map_action(self, text: str) -> dict[str, Any] | None:
        """Try to extract a map_action JSON object from the LLM's text response."""
        if not text:
            return None
        import re
        # Try to find JSON in ```json ... ``` blocks
        json_blocks = re.findall(r"```json\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
        for block in json_blocks:
            try:
                parsed = json.loads(block)
                if isinstance(parsed, dict) and "type" in parsed:
                    return parsed
            except json.JSONDecodeError:
                continue

        # Try to find inline JSON objects with type field
        inline_jsons = re.findall(
            r'\{[^{}]*"type"\s*:\s*"(?:marker|route|polygon|highlight|fly_to|multi_marker|add_layer)"[^{}]*\}',
            text,
        )
        for candidate in inline_jsons:
            try:
                parsed = json.loads(candidate)
                return parsed
            except json.JSONDecodeError:
                continue

        return None

    def _build_map_action_from_result(
        self, tool_name: str | None, result: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Derive a map_action from the GeoAI tool result."""
        if not tool_name or result.get("status") != "success":
            return None

        data = result.get("result") or {}

        if tool_name == "find_nearest_place":
            results = data.get("results", [])
            if results:
                # Multi-marker for multiple results
                if len(results) > 1:
                    markers = []
                    for r in results:
                        loc = r.get("location", {})
                        if "lat" in loc and "lon" in loc:
                            markers.append({
                                "coordinates": [loc["lon"], loc["lat"]],
                                "label": r.get("name", "Unknown"),
                            })
                    if markers:
                        return {"type": "multi_marker", "markers": markers}
                # Single marker for first result
                first = results[0]
                loc = first.get("location", {})
                if "lat" in loc and "lon" in loc:
                    return {
                        "type": "marker",
                        "coordinates": [loc["lon"], loc["lat"]],
                        "label": first.get("name", ""),
                    }

        elif tool_name == "reverse_geocode":
            if data.get("label"):
                return None

        elif tool_name == "query_spatial_layer":
            feature = data.get("feature", {})
            if feature.get("name"):
                return {
                    "type": "highlight",
                    "geometry": feature.get("geometry", {}),
                    "label": feature["name"],
                }

        elif tool_name == "get_route":
            geometry = data.get("geometry")
            if geometry and geometry.get("coordinates"):
                return {
                    "type": "route",
                    "coordinates": geometry["coordinates"],
                    "distance_meters": data.get("distance_meters"),
                    "duration_seconds": data.get("duration_seconds"),
                }

        return None

    async def run_streaming(
        self,
        user_message: str,
        user_location: dict[str, float] | None = None,
        map_context: dict[str, Any] | None = None,
    ):
        """Async generator that yields streaming events."""
        analytics = QueryAnalytics()
        analytics.query = user_message
        analytics.intent = classify_intent(user_message)
        analytics.session_id = self.session_id
        analytics.has_map_context = bool(map_context)

        with AgentRunLogger.turn(self.session_id, user_message) as rec:
            try:
                await self.memory.save_user_message(user_message)

                if user_location:
                    await self.memory.save_location(
                        user_location["lat"], user_location["lon"]
                    )

                if map_context:
                    await self.memory.save_map_context(map_context)
                    center = map_context.get("center")
                    if center and center.get("lat") and center.get("lon"):
                        await self.memory.save_location(center["lat"], center["lon"])
                    selected = map_context.get("selected_feature")
                    if selected:
                        await self.memory.save_selected_feature(selected)

                ctx = resolve_map_context(map_context)

                messages = await self._build_messages(
                    user_message, user_location, ctx
                )
                try:
                    tools = await load_tools()
                except Exception as e:
                    logger.warning("Could not load GIS tools for streaming: %s", e)
                    tools = []

                tool_used: str | None = None
                tool_result: dict[str, Any] | None = None
                sources: list[str] = []
                full_answer = ""
                map_action: dict[str, Any] | None = None

                for round_num in range(self.settings.max_tool_rounds):
                    # Stream from LLM
                    rec.start_llm()
                    accumulated_content = ""
                    final_tool_calls: list[ToolCall] = []

                    async for chunk in self.llm.stream(messages=messages, tools=tools):
                        if chunk.content_delta:
                            accumulated_content += chunk.content_delta
                            yield {
                                "event": "answer_chunk",
                                "data": chunk.content_delta,
                            }
                        if chunk.tool_calls:
                            final_tool_calls = chunk.tool_calls
                        if chunk.finish_reason:
                            break

                    rec.stop_llm()

                    if not final_tool_calls:
                        full_answer = accumulated_content
                        map_action = self._extract_map_action(full_answer)
                        break

                    # Execute tool calls
                    for tc in final_tool_calls:
                        tool_name = tc.function.name
                        tool_used = tool_name
                        analytics.tool = tool_name
                        rec.tool = tool_name

                        try:
                            analytics.tool_args = json.loads(tc.function.arguments)
                        except (json.JSONDecodeError, TypeError):
                            analytics.tool_args = {}

                        yield {
                            "event": "tool_call",
                            "data": json.dumps({
                                "name": tool_name,
                                "arguments": tc.function.arguments,
                            }),
                        }

                        result = await self.executor.execute(
                            tool_name, tc.function.arguments
                        )
                        tool_result = result
                        rec.tool_args = analytics.tool_args

                        if (result.get("result") or {}).get("source"):
                            sources.append(result["result"]["source"])

                        await self.memory.save_tool_result(tool_name, result)

                        yield {
                            "event": "tool_result",
                            "data": json.dumps(result, default=str),
                        }

                        # Build message history
                        messages.append(
                            LLMMessage(
                                role="assistant",
                                content=None,
                                tool_calls=[{
                                    "id": tc.id,
                                    "type": "function",
                                    "function": {
                                        "name": tc.function.name,
                                        "arguments": tc.function.arguments,
                                    },
                                }],
                            )
                        )
                        messages.append(
                            LLMMessage(
                                role="tool",
                                content=json.dumps(result, default=str),
                                tool_call_id=tc.id,
                            )
                        )
                else:
                    messages.append(
                        LLMMessage(
                            role="user",
                            content="Please provide your final answer now based on the tool results above.",
                        )
                    )
                    final = await self.llm.chat(messages=messages, tools=None)
                    full_answer = final.content or "I was unable to complete the request."
                    map_action = self._extract_map_action(full_answer)

                if map_action is None and tool_result:
                    map_action = self._build_map_action_from_result(
                        tool_used, tool_result
                    )

                await self.memory.save_assistant_message(
                    full_answer, tool_used=tool_used, tool_result=tool_result
                )
                await self.memory.flush()

                analytics.finish("success")
                asyncio.create_task(analytics.save())  # best-effort, off the critical path

                rec.status = "success"
                rec.sources = sources

                # Emit final done event with full payload
                yield {
                    "event": "answer_done",
                    "data": json.dumps({
                        "answer": full_answer,
                        "tool_used": tool_used,
                        "map_action": map_action,
                        "session_id": self.session_id,
                        "sources": sources,
                    }, default=str),
                }

            except Exception as e:
                logger.error("Streaming agent run failed: %s", e, exc_info=True)
                await self.memory.flush()
                analytics.finish("error", str(e))
                asyncio.create_task(analytics.save())

                rec.status = "error"
                yield {
                    "event": "error",
                    "data": json.dumps({
                        "error": str(e),
                        "session_id": self.session_id,
                    }),
                }
