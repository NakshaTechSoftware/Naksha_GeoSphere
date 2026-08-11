import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  GLOBE_STYLE,
  GLOBE_SKY,
  MAP_PROJECTION,
  envMapStyleUrl,
} from "../../map/mapConfig";
import {
  addGlobeSources,
  addGlobeLayers,
  addSatelliteLayers,
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
  map: MapLibreMap | null;
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
  /** Fits the camera so the given [w,s,e,n] bounds sit comfortably inside the box. */
  fitAOI: (bounds: [number, number, number, number]) => void;
  /** Projects a [lng, lat] pair to container-relative pixels (for the drawing cursor). */
  projectPoint: (lngLat: [number, number]) => { x: number; y: number };
  clearAOI: () => void;
}

interface Props {
  onMapReady?: (map: MapLibreMap) => void;
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
  const mapRef = useRef<MapLibreMap | null>(null);
  const geoDataRef = useRef<{
    worldLand: FeatureCollection;
    indiaStates: FeatureCollection;
    indiaBoundary: FeatureCollection;
    karnataka: FeatureCollection;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const styleUrl = envMapStyleUrl();
    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl || GLOBE_STYLE,
      center: [72, 20],
      zoom: 1.1,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      maxPitch: 60,
    });
    // maplibre v6 renders the globe projection natively (the style also declares it).
    try {
      map.setProjection({ type: MAP_PROJECTION });
    } catch { /* older API path */ }

    mapRef.current = map;
    // Dev inspection hook (isolated prototype): lets the review page / tests read the
    // live camera + style state from window.__globeMap.
    (window as unknown as { __globeMap?: MapLibreMap }).__globeMap = map;
    bindFallbackHandler(map);

    let cancelled = false;

    const bootstrap = async () => {
      // Load the local real geodata (never depends on a remote API during playback).
      try {
        const [worldLand, states, boundary, karnataka] = await Promise.all([
          fetch("/geodata/world-land.geojson").then((r) => r.json()),
          fetch("/geodata/india-states.geojson").then((r) => r.json()),
          fetch("/geodata/india-boundary.geojson").then((r) => r.json()),
          fetch("/geodata/karnataka-boundary.geojson").then((r) => r.json()),
        ]);
        if (cancelled) return;
        geoDataRef.current = { worldLand, indiaStates: states, indiaBoundary: boundary, karnataka };
      } catch (e) {
        console.warn("[globe] geodata load failed", e);
        return;
      }

      if (!map.getSource(SOURCE_IDS.indiaStates)) {
        map.addSource(SOURCE_IDS.worldLand, { type: "geojson", data: geoDataRef.current.worldLand });
        map.addSource(SOURCE_IDS.indiaStates, { type: "geojson", data: geoDataRef.current.indiaStates });
        map.addSource(SOURCE_IDS.indiaBoundary, { type: "geojson", data: geoDataRef.current.indiaBoundary });
        map.addSource(SOURCE_IDS.karnataka, { type: "geojson", data: geoDataRef.current.karnataka });
        map.addSource(SOURCE_IDS.aoi, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        addGlobeSources(map);
        addGlobeLayers(map);
        addGeographyLayers(map);
        // Satellite basemap for the local city stage (fades in by zoom, above the globe
        // ocean but below the AOI overlays).
        addSatelliteLayers(map);
        // Pale-blue atmosphere glow behind the sphere (v6 setSky API).
        try {
          map.setSky({ ...GLOBE_SKY } as never);
        } catch { /* older version */ }
      }
      onMapReady?.(map);
    };

    map.on("load", bootstrap);

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
        m.setProjection({ type: proj });
      } catch {
        // older API path
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
    fitAOI: (bounds) => {
      const m = mapRef.current;
      const box = containerRef.current?.getBoundingClientRect();
      if (!m) return;
      const h = box?.height ?? 500;
      const w = box?.width ?? 700;
      // Top padding keeps the drawn AOI below the floating "Drawing AOI" toolbar;
      // scaled to the container so the polygon always fits inside the rounded box.
      m.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        {
          padding: {
            top: Math.round(h * 0.34),
            right: Math.round(w * 0.12),
            bottom: Math.round(h * 0.14),
            left: Math.round(w * 0.12),
          },
          maxZoom: 15.5,
          duration: 900,
          essential: true,
        }
      );
    },
    projectPoint: (lngLat) => {
      const m = mapRef.current;
      const p = m ? m.project(lngLat) : { x: 0, y: 0 };
      return { x: p.x, y: p.y };
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
