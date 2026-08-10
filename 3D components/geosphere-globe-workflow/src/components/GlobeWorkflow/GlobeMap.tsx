import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  GLOBE_STYLE,
  MAP_PROJECTION,
  envMapStyleUrl,
} from "../../map/mapConfig";
import {
  addGlobeSources,
  SOURCE_IDS,
} from "../../map/mapSources";
import {
  addGeographyLayers,
  GEO_LAYER_IDS,
  setLayerVisibility,
  setSource,
} from "../../map/geographyLayers";
import { bindFallbackHandler } from "../../map/fallbackRenderer";
import type { FeatureCollection, Polygon } from "geojson";

export interface GlobeMapHandle {
  map: maplibregl.Map | null;
  flyTo: (target: { center: [number, number]; zoom: number; pitch: number; bearing: number }, durationMs?: number) => void;
  easeTo: (target: { center: [number, number]; zoom: number; pitch: number; bearing: number }, durationMs?: number) => void;
  setProjection: (proj: "globe" | "mercator") => void;
  showIndia: () => void;
  showStates: () => void;
  showKarnataka: () => void;
  resetGeography: () => void;
  setAOIData: (feature: GeoJSON.Feature<Polygon>, vertices: [number, number][]) => void;
  setAOIPartial: (vertices: [number, number][]) => void;
  setAoiFillOpacity: (opacity: number) => void;
  setAoiVisible: (visible: boolean) => void;
  clearAOI: () => void;
}

interface Props {
  onMapReady?: (map: maplibregl.Map) => void;
  className?: string;
}

/**
 * A single MapLibre instance. Starts on the globe; MapLibre's built-in globe->Mercator
 * transition (around zoom 5) provides the seamless curvature reduction during the fly-in.
 * The local grid + simplified geography render from local sources, so the component works
 * with zero external tiles (env style optional for a richer demo).
 */
export const GlobeMap = forwardRef<GlobeMapHandle, Props>(function GlobeMap(
  { onMapReady, className },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const geoDataRef = useRef<{
    indiaStates: FeatureCollection;
    indiaBoundary: FeatureCollection;
    karnataka: FeatureCollection;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const styleUrl = envMapStyleUrl();
    const MapClass = maplibregl.Map as unknown as new (opts: Record<string, unknown>) => maplibregl.Map;
    const map = new MapClass({
      container: containerRef.current,
      style: styleUrl || GLOBE_STYLE,
      center: [72, 20],
      zoom: 1.1,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      maxPitch: 60,
    });
    // Set projection after construction for runtime support (v4 typings omit it).
    try {
      (map as unknown as { setProjection: (p: string) => void }).setProjection(MAP_PROJECTION);
    } catch { /* older version */ }

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    bindFallbackHandler(map);

    let cancelled = false;

    const bootstrap = async () => {
      // Load the local real geodata (never depends on a remote API during playback).
      try {
        const [states, boundary, karnataka] = await Promise.all([
          fetch("/geodata/india-states.geojson").then((r) => r.json()),
          fetch("/geodata/india-boundary.geojson").then((r) => r.json()),
          fetch("/geodata/karnataka-boundary.geojson").then((r) => r.json()),
        ]);
        if (cancelled) return;
        geoDataRef.current = { indiaStates: states, indiaBoundary: boundary, karnataka };
      } catch (e) {
        console.warn("[globe] geodata load failed", e);
        return;
      }

      if (!map.getSource(SOURCE_IDS.indiaStates)) {
        map.addSource(SOURCE_IDS.indiaStates, { type: "geojson", data: geoDataRef.current.indiaStates });
        map.addSource(SOURCE_IDS.indiaBoundary, { type: "geojson", data: geoDataRef.current.indiaBoundary });
        map.addSource(SOURCE_IDS.karnataka, { type: "geojson", data: geoDataRef.current.karnataka });
        map.addSource(SOURCE_IDS.aoi, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        addGlobeSources(map);
        addGeographyLayers(map);
      }
      onMapReady?.(map);
    };

    map.on("load", bootstrap);
    // If the optional style is missing tiles, keep the local fallback style.
    map.on("error", () => {
      if (map.isStyleLoaded() && map.getStyle()?.sources) {
        // tiles may fail; nothing to swap for the local style
      }
    });

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, [onMapReady]);

  useImperativeHandle(ref, () => ({
    get map() {
      return mapRef.current;
    },
    flyTo: (target, durationMs = 2500) => {
      const m = mapRef.current;
      if (!m) return;
      m.flyTo({
        center: target.center,
        zoom: target.zoom,
        pitch: target.pitch,
        bearing: target.bearing,
        duration: durationMs,
        essential: true,
      });
    },
    easeTo: (target, durationMs = 1500) => {
      const m = mapRef.current;
      if (!m) return;
      m.easeTo({
        center: target.center,
        zoom: target.zoom,
        pitch: target.pitch,
        bearing: target.bearing,
        duration: durationMs,
        essential: true,
      });
    },
    setProjection: (proj) => {
      const m = mapRef.current;
      if (!m) return;
      try {
        (m as unknown as { setProjection: (p: string) => void }).setProjection(proj);
      } catch {
        // older / typeless API path
      }
    },
    showIndia: () => {
      const m = mapRef.current;
      if (!m) return;
      setLayerVisibility(m, GEO_LAYER_IDS.indiaBoundary, true);
    },
    showStates: () => {
      const m = mapRef.current;
      if (!m) return;
      setLayerVisibility(m, GEO_LAYER_IDS.indiaStatesFill, true);
      setLayerVisibility(m, GEO_LAYER_IDS.indiaStates, true);
    },
    showKarnataka: () => {
      const m = mapRef.current;
      if (!m) return;
      setLayerVisibility(m, GEO_LAYER_IDS.karnatakaFill, true);
      setLayerVisibility(m, GEO_LAYER_IDS.karnataka, true);
    },
    resetGeography: () => {
      const m = mapRef.current;
      if (!m) return;
      setLayerVisibility(m, GEO_LAYER_IDS.indiaBoundary, false);
      setLayerVisibility(m, GEO_LAYER_IDS.indiaStatesFill, false);
      setLayerVisibility(m, GEO_LAYER_IDS.indiaStates, false);
      setLayerVisibility(m, GEO_LAYER_IDS.karnatakaFill, false);
      setLayerVisibility(m, GEO_LAYER_IDS.karnataka, false);
    },
    setAOIData: (feature, vertices) => {
      const m = mapRef.current;
      if (!m) return;
      const fc: FeatureCollection = {
        type: "FeatureCollection",
        features: [feature as GeoJSON.Feature],
      };
      setSource(m, SOURCE_IDS.aoi, fc);
      setLayerVisibility(m, GEO_LAYER_IDS.aoiFill, true);
      setLayerVisibility(m, GEO_LAYER_IDS.aoiLine, true);
      setLayerVisibility(m, GEO_LAYER_IDS.aoiVertices, true);
      // Vertices as separate circle features via the same source would need point geo;
      // the AOI line+fill already show the shape; vertices are rendered by the AOISelection
      // overlay in screen space instead (cheaper + crisp).
      void vertices;
    },
    setAOIPartial: (vertices) => {
      const m = mapRef.current;
      if (!m) return;
      if (vertices.length < 2) {
        setSource(m, SOURCE_IDS.aoi, { type: "FeatureCollection", features: [] });
        return;
      }
      const line: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [...vertices, vertices[0]] },
      };
      setSource(m, SOURCE_IDS.aoi, { type: "FeatureCollection", features: [line] });
      setLayerVisibility(m, GEO_LAYER_IDS.aoiLine, true);
      setLayerVisibility(m, GEO_LAYER_IDS.aoiFill, false);
      setLayerVisibility(m, GEO_LAYER_IDS.aoiVertices, false);
    },
    setAoiFillOpacity: (opacity) => {
      const m = mapRef.current;
      if (!m) return;
      try {
        m.setPaintProperty(GEO_LAYER_IDS.aoiFill, "fill-opacity", opacity);
      } catch {
        /* layer not ready */
      }
    },
    setAoiVisible: (visible) => {
      const m = mapRef.current;
      if (!m) return;
      setLayerVisibility(m, GEO_LAYER_IDS.aoiFill, visible);
      setLayerVisibility(m, GEO_LAYER_IDS.aoiLine, visible);
      setLayerVisibility(m, GEO_LAYER_IDS.aoiVertices, visible);
    },
    clearAOI: () => {
      const m = mapRef.current;
      if (!m) return;
      setSource(m, SOURCE_IDS.aoi, { type: "FeatureCollection", features: [] });
      setLayerVisibility(m, GEO_LAYER_IDS.aoiFill, false);
      setLayerVisibility(m, GEO_LAYER_IDS.aoiLine, false);
      setLayerVisibility(m, GEO_LAYER_IDS.aoiVertices, false);
    },
  }));

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "absolute", inset: 0, borderRadius: "inherit", overflow: "hidden" }}
    />
  );
});
