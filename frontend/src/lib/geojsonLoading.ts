/**
 * Tracks in-flight GeoJSON / dataset fetches so the map can show a loading indicator.
 *
 * The explore map loads boundary data from many call sites (state districts, taluks,
 * hoblies, GBA, roads, constituency layers, ...). Instead of threading a loading flag
 * through each one, the map's fetch wrapper calls begin/end here and the UI subscribes.
 */

let activeCount = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to loading-state changes; returns an unsubscribe function. */
export function subscribeGeojsonLoading(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isGeojsonLoading(): boolean {
  return activeCount > 0;
}

export function beginGeojsonLoad(): void {
  activeCount += 1;
  notify();
}

export function endGeojsonLoad(): void {
  activeCount = Math.max(0, activeCount - 1);
  notify();
}
