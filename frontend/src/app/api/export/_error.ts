// FastAPI's HTTPException responses are `{"detail": "..."}`, not the `{"error": "..."}`
// shape the rest of this app's routes use - read the raw text once and pull a clean
// message out of it, falling back to the raw text itself if it isn't JSON at all.
export async function parseUpstreamError(response: Response, fallbackStatus: number): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) return `Export failed with status ${fallbackStatus}`;
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown };
    const message = parsed.detail ?? parsed.error;
    if (typeof message === "string" && message.trim()) return message;
  } catch {
    // not JSON - fall through to the raw text below
  }
  return text;
}
