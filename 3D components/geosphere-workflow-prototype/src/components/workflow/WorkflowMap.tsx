import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapEnvConfig } from "@/map/mapConfig";
import { ensureWorkflowLayers, setAoiPolygon, setAoiVertices, setLocationMarker } from "@/map/mapLayers";
import { isWebglAvailable, logDevMapError } from "@/map/mapFallback";
import { flyToBengaluru, setInitialCamera, softCrossfadeToBengaluru, easeOutForReset } from "@/map/cameraSequence";
import { buildDemoAoiPolygon, getAoiVerticesUpTo } from "@/map/aoiGeometry";
import { BENGALURU_WIDE_VIEW } from "@/data/mockWorkflow";
import type { WorkflowStage } from "@/animation/workflowStages";
import styles from "./GeoWorkflowDemo.module.css";

const DEMO_AOI_FEATURE = buildDemoAoiPolygon();

/** Approximate on-screen AOI shape used only when the real map is unavailable. */
const FALLBACK_AOI_POINTS_PCT: [number, number][] = [
  [30, 34],
  [46, 30],
  [66, 33],
  [70, 46],
  [58, 58],
  [40, 60],
  [28, 48],
];

export type WorkflowMapProps = {
  stage: WorkflowStage;
  aoiVertexCount: number;
  aoiFillVisible: boolean;
  reducedMotion: boolean;
};

export function WorkflowMap({ stage, aoiVertexCount, aoiFillVisible, reducedMotion }: WorkflowMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [fallbackActive, setFallbackActive] = useState(!isWebglAvailable());

  useEffect(() => {
    if (fallbackActive || !containerRef.current) return;

    const { styleUrl, accessToken } = getMapEnvConfig();
    let cancelled = false;

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: accessToken ? `${styleUrl}${styleUrl.includes("?") ? "&" : "?"}key=${accessToken}` : styleUrl,
        center: BENGALURU_WIDE_VIEW.center,
        zoom: BENGALURU_WIDE_VIEW.zoom,
        pitch: BENGALURU_WIDE_VIEW.pitch,
        bearing: BENGALURU_WIDE_VIEW.bearing,
        attributionControl: false,
        interactive: false,
      });
    } catch (error) {
      logDevMapError("map construction failed", error);
      setFallbackActive(true);
      return;
    }

    mapRef.current = map;

    map.on("load", () => {
      if (cancelled) return;
      ensureWorkflowLayers(map);
      setInitialCamera(map);
      setMapReady(true);
    });

    map.on("error", (event) => {
      logDevMapError("style/tile error", event.error);
      if (!mapReady) setFallbackActive(true);
    });

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackActive]);

  // Stage-driven camera + marker + AOI behaviour on the real map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (stage === "SEARCH") {
      setLocationMarker(map, BENGALURU_WIDE_VIEW.center);
    }
    if (stage === "CAMERA_FLY") {
      if (reducedMotion) softCrossfadeToBengaluru(map);
      else void flyToBengaluru(map, 2400);
    }
    if (stage === "RESET") {
      setLocationMarker(map, null);
      void easeOutForReset(map, reducedMotion ? 200 : 1200);
    }
  }, [stage, mapReady, reducedMotion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    setAoiVertices(map, getAoiVerticesUpTo(aoiVertexCount));
  }, [aoiVertexCount, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    setAoiPolygon(map, aoiFillVisible ? DEMO_AOI_FEATURE : null);
  }, [aoiFillVisible, mapReady]);

  const isBuilt = stage !== "INITIALIZE";

  return (
    <div className={styles.mapStage}>
      {!fallbackActive && (
        <div
          ref={containerRef}
          className={`${styles.mapCanvas} ${isBuilt ? styles.mapCanvasBuilt : ""}`}
          data-testid="workflow-map-canvas"
        />
      )}

      {fallbackActive && (
        <div className={styles.mapFallback} data-testid="workflow-map-fallback">
          <img src="/assets/map-fallback-grid.svg" alt="" className={styles.mapFallbackGrid} />
          {(aoiVertexCount > 0 || aoiFillVisible) && (
            <svg
              className={styles.aoiFallbackSvg}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {aoiFillVisible && (
                <polygon
                  points={FALLBACK_AOI_POINTS_PCT.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="var(--ngs-aoi-fill)"
                  stroke="var(--ngs-aoi-stroke)"
                  strokeWidth={0.6}
                />
              )}
              {!aoiFillVisible &&
                FALLBACK_AOI_POINTS_PCT.slice(0, aoiVertexCount).map(([x, y], i, arr) => (
                  <g key={`${x}-${y}`}>
                    {i > 0 && (
                      <line
                        x1={arr[i - 1][0]}
                        y1={arr[i - 1][1]}
                        x2={x}
                        y2={y}
                        stroke="var(--ngs-aoi-stroke)"
                        strokeWidth={0.6}
                      />
                    )}
                  </g>
                ))}
              {FALLBACK_AOI_POINTS_PCT.slice(0, aoiVertexCount).map(([x, y]) => (
                <circle key={`${x}-${y}-v`} cx={x} cy={y} r={1.4} fill="#ffffff" stroke="var(--ngs-aoi-stroke)" strokeWidth={0.6} />
              ))}
            </svg>
          )}
        </div>
      )}
    </div>
  );
}
