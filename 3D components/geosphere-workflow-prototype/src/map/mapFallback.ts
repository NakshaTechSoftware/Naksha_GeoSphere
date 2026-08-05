/**
 * Detects whether an interactive MapLibre canvas can reasonably be shown.
 * When it cannot (no WebGL, or the configured style fails to load), the
 * caller renders the pale-blue static grid (public/assets/map-fallback-grid.svg)
 * and continues the AOI/UI animation in pure 2D — never a blank panel,
 * never a thrown error surfaced to the end user.
 */
export function isWebglAvailable(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;

  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

export function logDevMapError(context: string, error: unknown): void {
  // Intentionally concise — never logs style URLs or tokens.
  console.warn(`[geosphere-workflow-prototype] map fallback engaged: ${context}`, error);
}
