/**
 * MapContextProvider — Captures live MapLibre GL map state and provides
 * it as React context so the chat interface can send spatial context
 * with every message to the AI agent.
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

export interface MapCenter {
  lat: number;
  lon: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface SelectedFeature {
  layer: string;
  id: string | number | null;
  properties: Record<string, unknown>;
}

export interface MapContextState {
  /** Current map center */
  center: MapCenter;
  /** Current zoom level */
  zoom: number;
  /** Current viewport bounds */
  bounds: MapBounds;
  /** Names of active/visible layers */
  active_layers: string[];
  /** Currently selected/clicked feature, if any */
  selected_feature: SelectedFeature | null;
}

interface MapContextValue extends MapContextState {
  /** Register the map instance for context capture */
  registerMap: (map: MapLibreMap | null) => void;
  /** Manually set a selected feature */
  setSelectedFeature: (feature: SelectedFeature | null) => void;
  /** Add an active layer name */
  addActiveLayer: (name: string) => void;
  /** Remove an active layer name */
  removeActiveLayer: (name: string) => void;
  /** Get context object ready to send with chat request */
  getContextForRequest: () => Record<string, unknown>;
}

const DEFAULT_CENTER: MapCenter = { lat: 12.9716, lon: 77.5946 };
const DEFAULT_BOUNDS: MapBounds = {
  north: 13.05,
  south: 12.90,
  east: 77.70,
  west: 77.50,
};

const MapContext = createContext<MapContextValue | null>(null);

export function useMapContext(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) {
    // Fallback when used outside provider (e.g. SSR)
    return {
      center: DEFAULT_CENTER,
      zoom: 12,
      bounds: DEFAULT_BOUNDS,
      active_layers: [],
      selected_feature: null,
      registerMap: () => {},
      setSelectedFeature: () => {},
      addActiveLayer: () => {},
      removeActiveLayer: () => {},
      getContextForRequest: () => ({
        center: DEFAULT_CENTER,
        zoom: 12,
        bounds: DEFAULT_BOUNDS,
        active_layers: [],
        selected_feature: null,
      }),
    };
  }
  return ctx;
}

interface ProviderProps {
  children: ReactNode;
}

export default function MapContextProvider({ children }: ProviderProps) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [center, setCenter] = useState<MapCenter>(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(12);
  const [bounds, setBounds] = useState<MapBounds>(DEFAULT_BOUNDS);
  const [activeLayers, setActiveLayers] = useState<string[]>([]);
  const [selectedFeature, setSelectedFeature] = useState<SelectedFeature | null>(null);

  // Stable refs for event handlers
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const boundsRef = useRef(bounds);
  centerRef.current = center;
  zoomRef.current = zoom;
  boundsRef.current = bounds;

  const registerMap = useCallback((map: MapLibreMap | null) => {
    // Clean up old listeners
    if (mapRef.current) {
      mapRef.current.off("move", handleMove);
      mapRef.current.off("zoom", handleZoom);
    }

    mapRef.current = map;

    if (map) {
      // Capture initial state
      const c = map.getCenter();
      setCenter({ lat: c.lat, lon: c.lng });
      setZoom(map.getZoom());
      updateBounds(map);

      // Listen for changes
      map.on("move", handleMove);
      map.on("zoom", handleZoom);
    }
  }, []);

  const handleMove = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    setCenter({ lat: c.lat, lon: c.lng });
    updateBounds(map);
  }, []);

  const handleZoom = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setZoom(map.getZoom());
    updateBounds(map);
  }, []);

  const updateBounds = useCallback((map: MapLibreMap) => {
    try {
      const b = map.getBounds();
      if (b) {
        setBounds({
          north: b.getNorth(),
          south: b.getSouth(),
          east: b.getEast(),
          west: b.getWest(),
        });
      }
    } catch {
      // Map might not be fully loaded
    }
  }, []);

  const addActiveLayer = useCallback((name: string) => {
    setActiveLayers((prev) => (prev.includes(name) ? prev : [...prev, name]));
  }, []);

  const removeActiveLayer = useCallback((name: string) => {
    setActiveLayers((prev) => prev.filter((l) => l !== name));
  }, []);

  const getContextForRequest = useCallback((): Record<string, unknown> => {
    return {
      center: centerRef.current,
      zoom: zoomRef.current,
      bounds: boundsRef.current,
      active_layers: activeLayers,
      selected_feature: selectedFeature,
    };
  }, [activeLayers, selectedFeature]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.off("move", handleMove);
        mapRef.current.off("zoom", handleZoom);
      }
    };
  }, [handleMove, handleZoom]);

  const value: MapContextValue = {
    center,
    zoom,
    bounds,
    active_layers: activeLayers,
    selected_feature: selectedFeature,
    registerMap,
    setSelectedFeature,
    addActiveLayer,
    removeActiveLayer,
    getContextForRequest,
  };

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}
