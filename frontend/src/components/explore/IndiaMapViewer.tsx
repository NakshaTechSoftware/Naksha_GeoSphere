"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type {
  Map as MapLibreMap,
  MapGeoJSONFeature,
  GeoJSONFeature,
  GeoJSONSource,
  MapLayerMouseEvent,
  PointLike,
  QueryRenderedFeaturesOptions,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// Configures maplibre's GeoJSON worker for Next.js (must run before any map is created).
import { configureMaplibreWorker } from "../../lib/maplibreWorker";
import { addIndiaTerrain, removeIndiaTerrain } from "../../lib/indiaTerrain";
import { LayersControl, type MapLayer } from "../map/LayersControl";

// maplibre-gl can throw internally from queryRenderedFeatures while a source's tiles are
// mid-reload (see maplibre-gl-js#7752 / #7765, fixed in v6.0.0-15). Treat that as "no
// feature under the cursor" instead of crashing hover/click/contextmenu handling.
function queryRenderedFeaturesSafe(
  map: MapLibreMap,
  point: PointLike,
  options: QueryRenderedFeaturesOptions | undefined
): MapGeoJSONFeature[] {
  try {
    return map.queryRenderedFeatures(point, options);
  } catch {
    return [];
  }
}

// Matches a place label (e.g. "Karnataka", "Bengaluru") rendered by the basemap's place layer
function featureMatchesName(feature: MapGeoJSONFeature, names: string[]) {
  const props = feature.properties ?? {};
  const candidates = [props.name, props["name:en"], props.name_en];
  return candidates.some(
    (value) =>
      typeof value === "string" && names.includes(value.trim().toLowerCase())
  );
}

const isKarnatakaFeature = (feature: MapGeoJSONFeature) =>
  featureMatchesName(feature, ["karnataka"]);

const isBengaluruFeature = (feature: MapGeoJSONFeature) =>
  featureMatchesName(feature, ["bengaluru", "bangalore"]);

const CITY_LABEL_LAYERS = ["label_city", "label_city_capital", "label_town"];

// Approximate geodesic area (m²) of a GeoJSON polygon, via an equirectangular projection
// centered on the polygon's mean latitude. Accurate to well under 1% at city/ward scale.
function calculatePolygonAreaSqm(geometry: GeoJSON.Geometry): number {
  const EARTH_RADIUS = 6378137; // meters (WGS84 equatorial radius)

  const ringAreaSqm = (ring: GeoJSON.Position[], latRad0: number): number => {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const p1 = ring[i];
      const p2 = ring[i + 1];
      if (!p1 || !p2) continue;
      const lng1 = p1[0] ?? 0;
      const lat1 = p1[1] ?? 0;
      const lng2 = p2[0] ?? 0;
      const lat2 = p2[1] ?? 0;
      const x1 = ((lng1 * Math.PI) / 180) * Math.cos(latRad0) * EARTH_RADIUS;
      const y1 = ((lat1 * Math.PI) / 180) * EARTH_RADIUS;
      const x2 = ((lng2 * Math.PI) / 180) * Math.cos(latRad0) * EARTH_RADIUS;
      const y2 = ((lat2 * Math.PI) / 180) * EARTH_RADIUS;
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area / 2);
  };

  if (geometry.type === "Polygon") {
    const [outerRing, ...holes] = geometry.coordinates;
    if (!outerRing || outerRing.length === 0) return 0;
    const meanLat = outerRing.reduce((sum, c) => sum + (c[1] ?? 0), 0) / outerRing.length;
    const latRad0 = (meanLat * Math.PI) / 180;
    const outerArea = ringAreaSqm(outerRing, latRad0);
    const holesArea = holes.reduce((sum, hole) => sum + ringAreaSqm(hole, latRad0), 0);
    return outerArea - holesArea;
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce(
      (sum, polygonCoords) =>
        sum + calculatePolygonAreaSqm({ type: "Polygon", coordinates: polygonCoords }),
      0
    );
  }

  return 0;
}

// Computes the [[minLng, minLat], [maxLng, maxLat]] bounding box of a Polygon/MultiPolygon,
// for framing the camera on a clicked state via map.fitBounds.
function boundsOfGeometry(geometry: GeoJSON.Geometry): [[number, number], [number, number]] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const visitRing = (ring: GeoJSON.Position[]) => {
    for (const [lng, lat] of ring) {
      if (lng === undefined || lat === undefined) continue;
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
  };

  if (geometry.type === "Polygon") {
    geometry.coordinates.forEach(visitRing);
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((polygon) => polygon.forEach(visitRing));
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

// Reads the first non-empty string property among the given keys (e.g. ["KGISTalukName",
// "subdist_nm", "name"]), mirroring the fallback chains the map's click handlers use.
function firstNamedProperty(
  properties: GeoJSON.GeoJsonProperties,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = properties?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

// Ray-casting point-in-ring test (point ON the boundary counts as outside, which is fine -
// the grid fallback in labelAnchorFeatures then picks a strictly interior point).
function pointInRing(point: GeoJSON.Position, ring: GeoJSON.Position[]): boolean {
  const [x, y] = point;
  if (x === undefined || y === undefined) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i];
    const pj = ring[j];
    if (!pi || !pj) continue;
    const xi = pi[0] ?? 0;
    const yi = pi[1] ?? 0;
    const xj = pj[0] ?? 0;
    const yj = pj[1] ?? 0;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// True when [lng, lat] is inside the polygon: within the outer ring and not inside any hole.
function pointInsidePolygon(point: GeoJSON.Position, polygon: GeoJSON.Position[][]): boolean {
  const outerRing = polygon[0];
  if (!outerRing || outerRing.length === 0) return false;
  if (!pointInRing(point, outerRing)) return false;
  for (let i = 1; i < polygon.length; i++) {
    const hole = polygon[i];
    if (hole && pointInRing(point, hole)) return false;
  }
  return true;
}

// A concave polygon's area-weighted centroid can fall OUTSIDE the shape (the label would float
// over a neighbouring area). When that happens, grid-search the polygon's bounding box for the
// interior point closest to `target`. Progressively denser grids cover extremely thin shapes.
function nearestInteriorPoint(
  target: GeoJSON.Position,
  polygon: GeoJSON.Position[][]
): GeoJSON.Position | null {
  const outerRing = polygon[0];
  if (!outerRing || outerRing.length === 0) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const c of outerRing) {
    const lng = c[0];
    const lat = c[1];
    if (lng === undefined || lat === undefined) continue;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(maxLat)
  ) {
    return null;
  }

  for (const resolution of [16, 32, 64]) {
    let best: GeoJSON.Position | null = null;
    let bestDistSq = Infinity;
    const targetLng = target[0] ?? 0;
    const targetLat = target[1] ?? 0;
    for (let i = 0; i <= resolution; i++) {
      for (let j = 0; j <= resolution; j++) {
        const lng = minLng + ((maxLng - minLng) * i) / resolution;
        const lat = minLat + ((maxLat - minLat) * j) / resolution;
        if (!pointInsidePolygon([lng, lat], polygon)) continue;
        const distSq = (lng - targetLng) ** 2 + (lat - targetLat) ** 2;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          best = [lng, lat];
        }
      }
    }
    if (best) return best;
  }
  return null;
}

// Signed planar ring area (shoelace): positive = counter-clockwise. MapLibre's fill bucket
// classifies a GeoJSON polygon's rings by winding sign (classifyRings) - the first ring of
// the feature fixes the exterior orientation, and only rings wound OPPOSITELY are treated
// as holes. Appending a same-wound ring as-is would silently be filled as a second exterior.
function ringSignedArea(ring: GeoJSON.Position[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0] ?? 0;
    const yi = ring[i]?.[1] ?? 0;
    const xj = ring[j]?.[0] ?? 0;
    const yj = ring[j]?.[1] ?? 0;
    area += xj * yi - xi * yj;
  }
  return area / 2;
}

// Returns a copy of `data` with the given village polygon punched into every ancestor
// fill that contains it: the village's outer ring is appended as a hole ring of the
// containing polygon, wound opposite to that polygon's outer ring so MapLibre renders the
// cutout, while the rest of the feature stays filled. MultiPolygon village geometries punch
// one hole per part. Used by applyVillageCutout to clear the state/district/taluk/hobli
// overlays only inside the selected village.
function withVillageHole(
  data: GeoJSON.FeatureCollection,
  villageGeometry: GeoJSON.Geometry
): GeoJSON.FeatureCollection {
  // One (outer ring, strictly-interior probe) pair per village part. The probe can't be a
  // boundary vertex: the ray-cast test treats points ON the ring as outside, and edge
  // villages legitimately share boundary vertices with their containing ancestor.
  const partProbes: Array<{ part: GeoJSON.Position[]; probe: GeoJSON.Position }> = [];
  const villageParts: GeoJSON.Position[][] =
    villageGeometry.type === "MultiPolygon"
      ? villageGeometry.coordinates.map((poly) => poly[0] ?? [])
      : villageGeometry.type === "Polygon"
        ? [villageGeometry.coordinates[0] ?? []]
        : [];
  for (const part of villageParts) {
    if (!part.length) continue;
    const probe = nearestInteriorPoint(part[0] ?? [0, 0], [part]);
    if (probe) partProbes.push({ part, probe });
  }
  if (partProbes.length === 0) return data;

  const features = data.features.map((feature) => {
    const geom = feature.geometry;
    if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) return feature;

    const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;

    // Which village parts does this ancestor feature contain? (Each part is inside exactly
    // one polygon at each level.)
    const hits: typeof partProbes = [];
    for (const pp of partProbes) {
      for (const polygon of polygons) {
        if (pointInsidePolygon(pp.probe, polygon)) {
          hits.push(pp);
          break;
        }
      }
    }
    if (hits.length === 0) return feature;

    // Deep-copy only the features that actually get a hole punched - setData never mutates
    // its input, so untouched features (e.g. the other ~27 Indian states) can be shared by
    // reference instead of re-copying the whole collection on every village click.
    const copy = JSON.parse(JSON.stringify(feature)) as GeoJSON.Feature;
    const copyPolygons =
      copy.geometry && copy.geometry.type === "Polygon"
        ? [copy.geometry.coordinates]
        : copy.geometry && copy.geometry.type === "MultiPolygon"
          ? copy.geometry.coordinates
          : [];

    for (const pp of hits) {
      for (const polygon of copyPolygons) {
        if (pointInsidePolygon(pp.probe, polygon)) {
          const outerRing = polygon[0] ?? [];
          // Same winding as the outer ring would render as a second exterior, not a hole -
          // reverse it when the signs match (and when either sign is zero/degenerate).
          const holeRing =
            outerRing.length && ringSignedArea(outerRing) * ringSignedArea(pp.part) >= 0
              ? [...pp.part].reverse()
              : pp.part;
          polygon.push(holeRing);
          break;
        }
      }
    }
    return copy;
  });

  return { type: "FeatureCollection", features } as GeoJSON.FeatureCollection;
}

// Builds a GeoJSON Point feature per unique boundary name (state, district, taluk or hobli),
// anchored at the area-weighted centroid of the name's largest polygon. MapLibre symbol layers
// place one label on every polygon of a MultiPolygon (and every same-named feature), so without
// this, states like Andaman & Nicobar (8 islands), Puducherry (4 enclaves) or a multi-part
// district scatters duplicate labels. Each emitted feature carries the name under nameKeys[0],
// which the label layer's text-field reads.
function labelAnchorFeatures(
  data: GeoJSON.FeatureCollection,
  nameKeys: string[]
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const nameKey = nameKeys[0] ?? "name";

  // Collect every polygon per boundary name across ALL features - not just the first
  // feature carrying that name. The source data sometimes repeats a name (a hobli's main
  // body plus a tiny sliver feature), and anchoring on the first occurrence would place
  // that name's label on the sliver, kilometres away from the real polygon.
  const polygonsByName = new Map<string, GeoJSON.Position[][][]>();

  for (const feature of data.features) {
    const name = firstNamedProperty(feature.properties, nameKeys);
    if (!name) continue;
    const polygons =
      feature.geometry?.type === "MultiPolygon"
        ? feature.geometry.coordinates
        : feature.geometry?.type === "Polygon"
          ? [feature.geometry.coordinates]
          : null;
    if (!polygons) continue;
    const existing = polygonsByName.get(name);
    if (existing) existing.push(...polygons);
    else polygonsByName.set(name, [...polygons]);
  }

  for (const [name, polygons] of polygonsByName) {
    // Pick the largest polygon by area - the boundary's main body. A sliver's area is
    // ~0 km², so it never wins even when it appears first in the data.
    let largestOuterRing: GeoJSON.Position[] | null = null;
    let largestPolygon: GeoJSON.Position[][] | null = null;
    let largestArea = -1;
    for (const polygon of polygons) {
      const ring = polygon[0] ?? [];
      if (ring.length === 0) continue;
      const area = calculatePolygonAreaSqm({ type: "Polygon", coordinates: polygon });
      if (area > largestArea) {
        largestArea = area;
        largestOuterRing = ring;
        largestPolygon = polygon;
      }
    }
    const outerRing = largestOuterRing;
    if (!outerRing || outerRing.length === 0) continue;

    // Area-weighted centroid (shoelace) with longitude scaled by cos(latitude) so the anchor
    // stays near the polygon's visual center.
    const meanLat = outerRing.reduce((sum, c) => sum + (c[1] ?? 0), 0) / outerRing.length;
    const cosLat = Math.cos((meanLat * Math.PI) / 180) || 1e-9;

    let twiceArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < outerRing.length - 1; i++) {
      const p1 = outerRing[i];
      const p2 = outerRing[i + 1];
      if (!p1 || !p2) continue;
      const lng0 = p1[0] ?? 0;
      const lat0 = p1[1] ?? 0;
      const lng1 = p2[0] ?? 0;
      const lat1 = p2[1] ?? 0;
      const x0 = lng0 * cosLat;
      const x1 = lng1 * cosLat;
      const cross = x0 * lat1 - x1 * lat0;
      twiceArea += cross;
      cx += (x0 + x1) * cross;
      cy += (lat0 + lat1) * cross;
    }

    let lng: number;
    let lat: number;
    if (twiceArea === 0) {
      // Degenerate ring - fall back to the bounding-box center.
      let minLng = Infinity;
      let minLat = Infinity;
      let maxLng = -Infinity;
      let maxLat = -Infinity;
      for (const [lng, lat] of outerRing) {
        if (lng === undefined || lat === undefined) continue;
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      }
      lng = (minLng + maxLng) / 2;
      lat = (minLat + maxLat) / 2;
    } else {
      lng = cx / (3 * twiceArea) / cosLat;
      lat = cy / (3 * twiceArea);
    }

    // A concave polygon's centroid can land outside its own shape - pull the label back to
    // the nearest interior point so it always sits inside its own boundary.
    if (largestPolygon && !pointInsidePolygon([lng, lat], largestPolygon)) {
      const interior = nearestInteriorPoint([lng, lat], largestPolygon);
      if (interior) {
        lng = interior[0] ?? lng;
        lat = interior[1] ?? lat;
      }
    }

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: { [nameKey]: name },
    });
  }

  return { type: "FeatureCollection", features };
}

// text-size (like every other symbol layout property) can't be driven by a feature-state
// expression - MapLibre only allows feature-state in paint properties. So "grow the label
// under the cursor" instead uses two physical layers per label type: the normal-size base
// layer, and a second "-hover" layer on the SAME source, sized hoverScale× bigger, whose
// filter normally matches nothing and is imperatively pointed at whichever single feature id
// is currently hovered (see attachLabelHoverGrow). NO_HOVER_FILTER is that "matches nothing"
// filter - generateId ids are never negative, so -1 never collides with a real feature.
const NO_HOVER_FILTER: any = ["==", ["id"], -1];

// Builds the "-hover" duplicate of a label layer's addLayer spec: same source/text-field/
// font/paint as the base layer, but hoverScale× the text size, starts filtered to nothing,
// and ignores MapLibre's usual collision/overlap culling (text-allow-overlap/ignore-placement)
// so it isn't suppressed for occupying the same spot as the base label it's covering.
function hoverLabelLayerSpec(
  baseLayer: { id: string; source: string; layout: Record<string, unknown>; paint: Record<string, unknown> },
  hoverScale = 1.6
): any {
  const baseSize = baseLayer.layout["text-size"] as number;
  return {
    id: `${baseLayer.id}-hover`,
    type: "symbol" as const,
    source: baseLayer.source,
    layout: {
      ...baseLayer.layout,
      "text-size": Math.round(baseSize * hoverScale * 10) / 10,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      // Always "visible" regardless of the base layer's own visibility layout property
      // (which callers like updateBaseLabelVisibility toggle on the base layer id only,
      // not this one) - safe because this layer only ever shows content once its filter
      // is pointed at a real feature id, which attachLabelHoverGrow only does in response
      // to a mousemove on the base layer, and hidden layers never receive those events.
      visibility: "visible",
    },
    paint: baseLayer.paint,
    filter: NO_HOVER_FILTER,
  };
}

// Wires up the hover half of hoverLabelLayerSpec: points hoverLayerId's filter at whichever
// single label anchor point is under the cursor on baseLayerId, so its enlarged duplicate
// renders over just that one label. baseLayerId's source needs generateId: true (or a stable
// id) so features have the numeric id this filters on.
function attachLabelHoverGrow(map: MapLibreMap, baseLayerId: string, hoverLayerId: string) {
  let hoveredLabelId: string | number | null = null;

  map.on("mousemove", baseLayerId, (e) => {
    const feature = e.features?.[0];
    if (!feature || feature.id === undefined || feature.id === hoveredLabelId) return;
    // The hover layer can be removed while the cursor is still over a label (e.g. when
    // boundaries are cleared) - guard so setFilter never throws on a missing layer.
    if (!map.getLayer(hoverLayerId)) return;
    hoveredLabelId = feature.id;
    map.setFilter(hoverLayerId, ["==", ["id"], hoveredLabelId] as any);
  });

  map.on("mouseleave", baseLayerId, () => {
    if (hoveredLabelId === null) return;
    hoveredLabelId = null;
    // Same guard: clearing boundaries can remove the hover layer before this fires.
    if (!map.getLayer(hoverLayerId)) return;
    map.setFilter(hoverLayerId, NO_HOVER_FILTER);
  });
}

// Removes a label layer added via addLayer + hoverLabelLayerSpec together - both the base
// layer and its "-hover" enlarge-on-hover sibling.
function removeLabelLayer(map: MapLibreMap, layerId: string) {
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getLayer(`${layerId}-hover`)) map.removeLayer(`${layerId}-hover`);
}

const WARD_RATE_PER_SQM = 0.25; // ₹ per square meter, KML/KMZ ward boundaries only

export interface WardSelection {
  name: string;
  areaSqKm: number;
  price: number;
}

// The three "Draw AOI" tools selectable from the dropdown menu.
export type AOITool = "freehand" | "polygon" | "rectangle";

// A completed drawn AOI polygon plus its geodesic area, reported via onAOIChange.
export interface AOIResult {
  geometry: GeoJSON.Polygon;
  areaSqKm: number;
}

// One key/value row of the right-click attribute-info window (boundary type badge + title +
// attribute rows), reported via onAttributeInfo. The rows are rendered by the caller's side
// panel, so the viewer only reports plain data - no HTML.
export interface AttributeRow {
  label: string;
  value: string;
  bold?: boolean;
}

// Identifies a cadastral parcel in Bhoomi's land-records system. Set only for cadastral
// features - it's what /api/land-records/rtc needs to look the parcel's owners up, since
// owner names are not part of the cadastral GeoJSON itself.
export interface ParcelLandRecordKey {
  district: string;
  taluk: string;
  hobli: string;
  village: string;
  survey: string;
  surnoc: string;
  hissa: string;
}

// The five admin-hierarchy levels the Explore page's bulk export can walk. Assembly/
// Parliamentary constituencies and cadastral parcels are separate hierarchies (or leaves) -
// constituencies only ever get the single-feature export. Cadastral parcels are the
// survey-plot leaf below village.
export type AdminLevel = "state" | "district" | "taluk" | "hobli" | "village" | "survey_plot";

// The clicked feature's place in the admin hierarchy, reported alongside AttributeInfo so
// the Export dialog knows which levels it can offer (the clicked level plus everything
// below it) and has the ancestor names it needs to fetch them. Ancestor names come from
// whatever the user last drilled into (see selectedStateNameRef & co.) - reliable because
// each drill-down layer only ever holds the children of one single parent at a time.
export interface AttributeHierarchy {
  level: AdminLevel;
  state?: string;
  district?: string;
  taluk?: string;
  hobli?: string;
  village?: string;
}

export interface AttributeInfo {
  typeLabel: string;
  title: string;
  rows: AttributeRow[];
  parcel?: ParcelLandRecordKey;
  /** The clicked feature's raw geometry + properties, kept alongside the display-formatted
   * `rows` so the caller's Export action can send full-fidelity GeoJSON to the export API
   * instead of the humanized/stringified row values. Undefined only if the feature had no
   * geometry (shouldn't happen for boundary/cadastral layers, but keep the panel usable). */
  geometry?: GeoJSON.Geometry;
  properties?: Record<string, unknown>;
  hierarchy?: AttributeHierarchy;
}

// Live state of an in-progress drawing. `points` holds [lng, lat] positions: the freehand
// stroke, the rectangle's anchor corner (plus its live opposite corner), or the polygon's
// placed vertices, depending on the tool.
interface AOIDrawSession {
  tool: AOITool;
  points: [number, number][];
  /** True while the mouse is held down (freehand/rectangle capture). */
  dragging: boolean;
  /** Last recorded pixel position, used to decimate freehand strokes. */
  lastPixel: [number, number] | null;
}

// One level of the administrative-boundary drill-down (districts/taluks/hoblies/villages)
// as captured for undo/redo. `parent` is the raw name of the unit this level is loaded
// under (e.g. the district for the taluk level); `selectedId`/`selectedName` describe the
// currently-selected feature on this level's own layer. generateId'd feature ids are
// deterministic for identical data, so a stored id still matches after the layer is rebuilt.
interface DrillLevel {
  parent: string;
  selectedId: string | number | null;
  selectedName: string | null;
  data: GeoJSON.FeatureCollection;
}

// Full undo/redo snapshot of the drill-down state: the selected state, each loaded level's
// data + selection, and the camera (so an undo also reverts the zoom that accompanied the
// selection).
interface DrillSnapshot {
  state: string | null; // raw selected state name
  stateId: string | number | null;
  districts: DrillLevel | null;
  taluks: DrillLevel | null;
  hoblies: DrillLevel | null;
  villages: DrillLevel | null;
  cadastrals: DrillLevel | null;
  camera: { center: [number, number]; zoom: number; bearing: number; pitch: number };
}

// Which single Boundary Layers filter option is active. "administrative" shows every loaded
// boundary layer; "assembly" shows the default india_states.geojson (neon-blue states) plus
// any loaded assembly constituency boundaries; "parliamentary" shows the states plus any
// loaded parliamentary constituency boundaries; "gram_panchayat" shows the states too (its
// own panchayat boundaries aren't wired to map data yet, so no extra layers load).
export type BoundaryLayerMode =
  | "administrative"
  | "assembly"
  | "parliamentary"
  | "gram_panchayat"
  | "police_station"
  | "civic_amenities";

export interface IndiaMapViewerHandle {
  /** Sets the active Boundary Layers filter option (single-select). "administrative" shows
   * every loaded administrative boundary layer; "assembly" shows the default india_states
   * geojson (neon-blue states) plus loaded assembly constituency boundaries; "parliamentary"
   * shows the states plus loaded parliamentary constituency boundaries; "gram_panchayat"
   * shows the states too (panchayat boundaries not wired to data yet). */
  setBoundaryLayerMode: (mode: BoundaryLayerMode) => void;
  /** Loads the Karnataka or Bengaluru boundary when the query matches (case-insensitive). */
  search: (query: string) => void;
  /** Lists every Bengaluru boundary file, grouped by region subfolder (Central, East, ...). */
  listBengaluruFiles: () => Promise<Record<string, string[]>>;
  /** Loads (visible=true) or removes (visible=false) a single Bengaluru boundary file by its
   * full MinIO key, as an extra overlay layer alongside whatever's already on the map. */
  toggleBengaluruFile: (key: string, visible: boolean) => Promise<void>;
  /** Arms (tool) or disarms (null) an AOI drawing tool from the "Draw AOI" menu. While armed,
   * map pan is disabled and pointer input draws a shape instead of selecting boundaries. The
   * last completed AOI stays on the map until clearAOI() or Escape. */
  setDrawingTool: (tool: AOITool | null) => void;
  /** Removes the last completed AOI polygon from the map (no-op if there is none). */
  clearAOI: () => void;
  /** Tells the viewer the attribute-info panel was dismissed by its close button, so the
   * next Escape clears boundaries instead of being treated as "close the panel". */
  clearAttributeInfo: () => void;
}

export interface IndiaMapViewerProps {
  /** Called when a search resolves to a single ward (e.g. "Bengaluru, Banaswadi"). Called with
   * null when the loaded boundaries are cleared (e.g. pressing Escape). */
  onWardSelected?: (ward: WardSelection | null) => void;
  /** Called when Escape clears every loaded boundary, so callers can reset their own UI state
   * (e.g. uncheck any manually-toggled extra files). */
  onBoundariesCleared?: () => void;
  /** Called when a search resolves to a specific region+file (e.g.
   * "Bengaluru, Central, Ward Boundary"), so callers can sync their own checkbox UI. */
  onExtraFileToggled?: (key: string, visible: boolean) => void;
  /** Called when a drawn AOI is completed (with its geodesic area in km²) or cleared (null). */
  onAOIChange?: (aoi: AOIResult | null) => void;
  /** Called when the armed AOI drawing tool changes (e.g. Escape disarms it), so callers can
   * sync their own button UI. */
  onDrawingToolChange?: (tool: AOITool | null) => void;
  /** Called on right-click with the deepest boundary feature's attribute info (for the
   * caller's side panel), or with null when the panel should close (Escape, new right-click
   * on empty map). */
  onAttributeInfo?: (info: AttributeInfo | null) => void;
}

// Source/layer ids for a selected state's district boundaries, loaded on demand from MinIO.
const STATE_DISTRICTS_SOURCE_ID = "state-districts-data";
const STATE_DISTRICTS_FILL_LAYER_ID = "state-districts-fill";
const STATE_DISTRICTS_LINE_LAYER_ID = "state-districts-line";
const STATE_DISTRICTS_LABELS_LAYER_ID = "state-districts-labels";
const STATE_DISTRICTS_LABELS_SOURCE_ID = "state-districts-labels-data";

// Source/layer ids for a selected state's assembly constituency boundaries, loaded on demand
// from MinIO when the "Assembly Constituency Boundaries" filter option is active.
const STATE_ASSEMBLY_SOURCE_ID = "state-assembly-data";
const STATE_ASSEMBLY_FILL_LAYER_ID = "state-assembly-fill";
const STATE_ASSEMBLY_LINE_LAYER_ID = "state-assembly-line";

// Source/layer ids for a selected state's parliamentary constituency boundaries, loaded on
// demand from MinIO when the "Parliamentary Constituency Boundaries" filter option is active.
const STATE_PARLIAMENT_SOURCE_ID = "state-parliament-data";
const STATE_PARLIAMENT_FILL_LAYER_ID = "state-parliament-fill";
const STATE_PARLIAMENT_LINE_LAYER_ID = "state-parliament-line";

// Statewide police-station jurisdiction boundaries loaded from MinIO.
const STATE_POLICE_SOURCE_ID = "state-police-data";
const STATE_POLICE_FILL_LAYER_ID = "state-police-fill";
const STATE_POLICE_LINE_LAYER_ID = "state-police-line";
const STATE_POLICE_LABEL_LAYER_ID = "state-police-labels";
const POLICE_HOBLIES_SOURCE_ID = "police-hoblies-data";
const POLICE_HOBLIES_FILL_LAYER_ID = "police-hoblies-fill";
const POLICE_HOBLIES_LINE_LAYER_ID = "police-hoblies-line";
const POLICE_HOBLIES_LABEL_LAYER_ID = "police-hoblies-labels";
const POLICE_VILLAGES_SOURCE_ID = "police-villages-data";
const POLICE_VILLAGES_FILL_LAYER_ID = "police-villages-fill";
const POLICE_VILLAGES_LINE_LAYER_ID = "police-villages-line";
const POLICE_VILLAGES_LABEL_LAYER_ID = "police-villages-labels";
// Source/layer ids for a selected state's civic amenities district boundaries, loaded on
// demand from MinIO ("Civic Amenities/India/<State>/") when the "Civic Amenities" filter
// option is active. Kept separate from STATE_DISTRICTS_* and GP_DISTRICTS_* so the three
// district datasets (administrative vs GP vs civic) never collide on the map.
const CIVIC_DISTRICTS_SOURCE_ID = "civic-districts-data";
const CIVIC_DISTRICTS_FILL_LAYER_ID = "civic-districts-fill";
const CIVIC_DISTRICTS_LINE_LAYER_ID = "civic-districts-line";
const CIVIC_DISTRICTS_LABELS_LAYER_ID = "civic-districts-labels";
const CIVIC_DISTRICTS_LABELS_SOURCE_ID = "civic-districts-labels-data";

// Source/layer ids for a selected district's civic amenities pincode boundaries, loaded on
// demand from MinIO ("Civic Amenities/India/<State>/Districts/<District>/") when the "Civic
// Amenities" filter option is active.
const CIVIC_PINCODES_SOURCE_ID = "civic-pincodes-data";
const CIVIC_PINCODES_FILL_LAYER_ID = "civic-pincodes-fill";
const CIVIC_PINCODES_LINE_LAYER_ID = "civic-pincodes-line";
const CIVIC_PINCODES_LABELS_LAYER_ID = "civic-pincodes-labels";
const CIVIC_PINCODES_LABELS_SOURCE_ID = "civic-pincodes-labels-data";

// Source/layer ids for a selected state's gram panchayat district boundaries, loaded on
// demand from MinIO ("Gram Panchayat Boundaries/India/<State>/") when the "Gram Panchayat
// Boundaries" filter option is active. Kept separate from STATE_DISTRICTS_* so the two
// district datasets (administrative vs GP) never collide on the map.
const GP_DISTRICTS_SOURCE_ID = "gp-districts-data";
const GP_DISTRICTS_FILL_LAYER_ID = "gp-districts-fill";
const GP_DISTRICTS_LINE_LAYER_ID = "gp-districts-line";
const GP_DISTRICTS_LABELS_LAYER_ID = "gp-districts-labels";
const GP_DISTRICTS_LABELS_SOURCE_ID = "gp-districts-labels-data";

// Source/layer ids for a selected district's gram panchayat taluk boundaries, loaded on
// demand from MinIO ("Gram Panchayat Boundaries/India/<State>/Districts/<District>/").
const GP_TALUKS_SOURCE_ID = "gp-taluks-data";
const GP_TALUKS_FILL_LAYER_ID = "gp-taluks-fill";
const GP_TALUKS_LINE_LAYER_ID = "gp-taluks-line";
const GP_TALUKS_LABELS_LAYER_ID = "gp-taluks-labels";
const GP_TALUKS_LABELS_SOURCE_ID = "gp-taluks-labels-data";

// Source/layer ids for a selected taluk's gram panchayat boundaries, loaded on demand from
// MinIO ("Gram Panchayat Boundaries/India/<State>/Districts/<District>/Taluk_Panchayats/<Taluk>/")
// when the "Gram Panchayat Boundaries" filter option is active.
const GP_BOUNDARIES_SOURCE_ID = "gp-boundaries-data";
const GP_BOUNDARIES_FILL_LAYER_ID = "gp-boundaries-fill";
const GP_BOUNDARIES_LINE_LAYER_ID = "gp-boundaries-line";
const GP_BOUNDARIES_LABELS_LAYER_ID = "gp-boundaries-labels";
const GP_BOUNDARIES_LABELS_SOURCE_ID = "gp-boundaries-labels-data";

// Source/layer ids for a selected district's taluk/subdistrict boundaries
const DISTRICT_TALUKS_SOURCE_ID = "district-taluks-data";
const DISTRICT_TALUKS_FILL_LAYER_ID = "district-taluks-fill";
const DISTRICT_TALUKS_LINE_LAYER_ID = "district-taluks-line";
const DISTRICT_TALUKS_LABELS_LAYER_ID = "district-taluks-labels";
const DISTRICT_TALUKS_LABELS_SOURCE_ID = "district-taluks-labels-data";

// Source/layer ids for a selected taluk's hobli boundaries
const TALUK_HOBLIES_SOURCE_ID = "taluk-hoblies-data";
const TALUK_HOBLIES_FILL_LAYER_ID = "taluk-hoblies-fill";
const TALUK_HOBLIES_LINE_LAYER_ID = "taluk-hoblies-line";
const TALUK_HOBLIES_LABELS_SOURCE_ID = "taluk-hoblies-labels-data";
const TALUK_HOBLIES_LABELS_LAYER_ID = "taluk-hoblies-labels";

// Source/layer ids for a selected hobli's village boundaries
const HOBLI_VILLAGES_SOURCE_ID = "hobli-villages-data";
const HOBLI_VILLAGES_FILL_LAYER_ID = "hobli-villages-fill";
const HOBLI_VILLAGES_LINE_LAYER_ID = "hobli-villages-line";
const HOBLI_VILLAGES_LABELS_SOURCE_ID = "hobli-villages-labels-data";
const HOBLI_VILLAGES_LABELS_LAYER_ID = "hobli-villages-labels";

// Source/layer ids for a selected village's cadastral (survey/parcel) boundaries. Parcels
// stay unfilled (fill-opacity 0) so the basemap (and the terrain beneath) remains clearly
// visible under the survey grid, but the invisible fill still catches pointer events so
// right-clicking anywhere inside a parcel box returns its attributes. The labels layer shows
// each parcel's survey number (the Surveynumber_Old attribute) centered inside its box.
const VILLAGE_CADASTRALS_SOURCE_ID = "village-cadastrals-data";
const VILLAGE_CADASTRALS_FILL_LAYER_ID = "village-cadastrals-fill";
const VILLAGE_CADASTRALS_LINE_LAYER_ID = "village-cadastrals-line";
const VILLAGE_CADASTRALS_LABELS_LAYER_ID = "village-cadastrals-labels";

// Cadastral (survey/parcel) overlay palette: bright white on satellite imagery (so the grid
// pops against the darker aerial backdrop, with survey numbers carrying a dark halo), classic
// navy on the OSM-style/terrain bases. Shared by the addLayer specs in loadVillageCadastrals
// and applyCadastralColors so the two can never drift apart.
const CADASTRAL_COLORS = {
  satellite: {
    line: "#ffffff", lineWidth: 1.1, lineOpacity: 1, text: "#ffffff", halo: "#151a23", haloWidth: 2,
    // Hover highlight: translucent white fill + thicker white border over the aerial backdrop.
    fill: "#ffffff", hoverFill: "#ffffff", hoverOpacity: 0.35, hoverLineWidth: 2.4,
  },
  standard: {
    line: "#000080", lineWidth: 0.8, lineOpacity: 0.9, text: "#000080", halo: "#ffffff", haloWidth: 1.5,
    // Hover highlight: translucent dark-navy fill + thicker border over the light OSM base.
    fill: "#000080", hoverFill: "#000080", hoverOpacity: 0.35, hoverLineWidth: 1.8,
  },
} as const;

// Recolors the cadastral overlay to match the active basemap (see CADASTRAL_COLORS). Paint is
// updated in place, so an already-loaded cadastral view recolors instantly when the user
// switches basemaps; missing layers (nothing loaded yet) are skipped safely.
function applyCadastralColors(map: MapLibreMap, satellite: boolean) {
  const c = CADASTRAL_COLORS[satellite ? "satellite" : "standard"];
  if (map.getLayer(VILLAGE_CADASTRALS_FILL_LAYER_ID)) {
    // The hit-test fill stays invisible unless a parcel is hovered, when it tints the
    // whole parcel box with the mode-appropriate highlight color.
    map.setPaintProperty(VILLAGE_CADASTRALS_FILL_LAYER_ID, "fill-color", [
      "case",
      ["boolean", ["feature-state", "hover"], false],
      c.hoverFill,
      c.fill,
    ]);
    map.setPaintProperty(VILLAGE_CADASTRALS_FILL_LAYER_ID, "fill-opacity", [
      "case",
      ["boolean", ["feature-state", "hover"], false],
      c.hoverOpacity,
      0,
    ]);
  }
  if (map.getLayer(VILLAGE_CADASTRALS_LINE_LAYER_ID)) {
    map.setPaintProperty(VILLAGE_CADASTRALS_LINE_LAYER_ID, "line-color", c.line);
    // The hovered parcel's border thickens so the highlight reads on both basemaps.
    map.setPaintProperty(VILLAGE_CADASTRALS_LINE_LAYER_ID, "line-width", [
      "case",
      ["boolean", ["feature-state", "hover"], false],
      c.hoverLineWidth,
      c.lineWidth,
    ]);
    map.setPaintProperty(VILLAGE_CADASTRALS_LINE_LAYER_ID, "line-opacity", c.lineOpacity);
  }
  if (map.getLayer(VILLAGE_CADASTRALS_LABELS_LAYER_ID)) {
    map.setPaintProperty(VILLAGE_CADASTRALS_LABELS_LAYER_ID, "text-color", c.text);
    map.setPaintProperty(VILLAGE_CADASTRALS_LABELS_LAYER_ID, "text-halo-color", c.halo);
    map.setPaintProperty(VILLAGE_CADASTRALS_LABELS_LAYER_ID, "text-halo-width", c.haloWidth);
  }
}

// Layers queried by the right-click attribute-info popup (deepest boundary under the cursor
// wins). The invisible hit-test fill layers are included - like the click handlers, they are
// rendered (fill-opacity 0) and thus queryable. Order does not matter: queryRenderedFeatures
// returns topmost-first.
const ATTRIBUTE_POPUP_LAYER_IDS = [
  GP_BOUNDARIES_FILL_LAYER_ID,
  VILLAGE_CADASTRALS_FILL_LAYER_ID,
  VILLAGE_CADASTRALS_LINE_LAYER_ID,
  POLICE_VILLAGES_FILL_LAYER_ID,
  POLICE_HOBLIES_FILL_LAYER_ID,
  HOBLI_VILLAGES_FILL_LAYER_ID,
  TALUK_HOBLIES_FILL_LAYER_ID,
  DISTRICT_TALUKS_FILL_LAYER_ID,
  GP_TALUKS_FILL_LAYER_ID,
  STATE_PARLIAMENT_FILL_LAYER_ID,
  STATE_POLICE_FILL_LAYER_ID,
  STATE_ASSEMBLY_FILL_LAYER_ID,
  STATE_DISTRICTS_FILL_LAYER_ID,
  GP_DISTRICTS_FILL_LAYER_ID,
  CIVIC_DISTRICTS_FILL_LAYER_ID,
  CIVIC_PINCODES_FILL_LAYER_ID,
  "states-fill-default",
];

// Maps a right-clickable layer id to its place in the admin hierarchy - the drill-down
// levels are listed (constituency layers have no entry, so the export dialog's hierarchy
// checklist never shows for them; cadastral parcels map to the survey-plot leaf).
const ATTRIBUTE_POPUP_ADMIN_LEVEL: Record<string, AdminLevel> = {
  "states-fill-default": "state",
  [STATE_DISTRICTS_FILL_LAYER_ID]: "district",
  [DISTRICT_TALUKS_FILL_LAYER_ID]: "taluk",
  [TALUK_HOBLIES_FILL_LAYER_ID]: "hobli",
  [HOBLI_VILLAGES_FILL_LAYER_ID]: "village",
  [VILLAGE_CADASTRALS_FILL_LAYER_ID]: "survey_plot",
};

// Friendly boundary-type names for the popup's badge, keyed by layer id.
const ATTRIBUTE_POPUP_TYPE_LABELS: Record<string, string> = {
  "states-fill-default": "State",
  [STATE_DISTRICTS_FILL_LAYER_ID]: "District",
  [GP_DISTRICTS_FILL_LAYER_ID]: "District",
  [CIVIC_DISTRICTS_FILL_LAYER_ID]: "District",
  [CIVIC_PINCODES_FILL_LAYER_ID]: "Pincode",
  [GP_TALUKS_FILL_LAYER_ID]: "Taluk",
  [GP_BOUNDARIES_FILL_LAYER_ID]: "Gram Panchayat",
  [STATE_ASSEMBLY_FILL_LAYER_ID]: "Assembly Constituency",
  [STATE_PARLIAMENT_FILL_LAYER_ID]: "Parliamentary Constituency",
  [STATE_POLICE_FILL_LAYER_ID]: "Police Station",
  [POLICE_HOBLIES_FILL_LAYER_ID]: "Police-area Hobli",
  [POLICE_VILLAGES_FILL_LAYER_ID]: "Police-area Village",
  [DISTRICT_TALUKS_FILL_LAYER_ID]: "Taluk",
  [TALUK_HOBLIES_FILL_LAYER_ID]: "Hobli",
  [HOBLI_VILLAGES_FILL_LAYER_ID]: "Village",
  [VILLAGE_CADASTRALS_FILL_LAYER_ID]: "Survey Plot",
  [VILLAGE_CADASTRALS_LINE_LAYER_ID]: "Survey Plot",
};

// Human-readable labels for the attribute keys our boundary layers carry, so the popup shows
// "State Name" instead of "st_nm". Unknown keys fall back to a generic camel/snake-case split.
const ATTRIBUTE_LABELS: Record<string, string> = {
  st_nm: "State Name",
  st_code: "State Code",
  layer: "Layer",
  year: "Census Year",
  dtname: "District Name",
  dt_code: "District Code",
  subdist_nm: "Taluk Name",
  hobli_name: "Hobli Name",
  village_name: "Village Name",
  vill_nm: "Village Name",
  PS_BOUNDName: "Police Station",
  PS_BOUNDCode: "Police Station Code",
  KGISPS_BOUNDID: "Police Boundary ID",
  KGISPS_SUB_DIVID: "Police Subdivision ID",
  pin_code: "Pincode",
  taluk: "Taluk",
  hobli: "Hobli",
  gram_panchayat: "Gram Panchayat",
};

// "st_nm" -> "St Nm" is wrong for display; keys without a known label get a sensible split:
// "KGISTalukName" -> "KGIS Taluk Name", "village_name" -> "Village Name".
function humanizeAttributeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Village-name property keys, in preference order, tried against the actual loaded village
// GeoJSON (the MinIO source files use varying schemas - KGIS-style keys like the taluk/hobli
// files, or plain "village_name"/"vill_nm"/"name"). The first key that exists on the data
// is chosen at load time and drives both the label anchors and the symbol layer's text-field.
const VILLAGE_NAME_KEYS = [
  "KGISVillageName",
  "village_name",
  "Village_Name",
  "vill_nm",
  "village",
  "vname",
  "VILLNAME",
  "name",
];

// Source/layer ids for the "Draw AOI" tools (Free Hand / Polygon / Rectangle). One GeoJSON
// source holds both the in-progress ("draft") polygon and the last finished ("complete")
// polygon; a second source holds the click-placed polygon vertices. Layer order below is
// bottom-to-top (vertex dots end up on top of everything).
const AOI_SOURCE_ID = "aoi-data";
const AOI_VERTICES_SOURCE_ID = "aoi-vertices";
const AOI_LAYER_IDS = [
  "aoi-draft-fill",
  "aoi-draft-line",
  "aoi-complete-fill",
  "aoi-complete-line",
  "aoi-vertex-dots",
];


// Every layer/source id ever added by a boundary-loading flow (Karnataka, manual KML/KMZ
// upload, Bengaluru zones, or a state's districts) — cleared together when the user presses
// Escape.
const BOUNDARY_LAYER_IDS = [
  "kml-fill",
  "kml-line",
  "kml-points",
  "bengaluru-fill",
  "bengaluru-line",
  STATE_DISTRICTS_FILL_LAYER_ID,
  STATE_DISTRICTS_LINE_LAYER_ID,
  STATE_DISTRICTS_LABELS_LAYER_ID,
  STATE_ASSEMBLY_FILL_LAYER_ID,
  STATE_ASSEMBLY_LINE_LAYER_ID,
  STATE_PARLIAMENT_FILL_LAYER_ID,
  STATE_PARLIAMENT_LINE_LAYER_ID,
  STATE_POLICE_FILL_LAYER_ID,
  STATE_POLICE_LINE_LAYER_ID,
  STATE_POLICE_LABEL_LAYER_ID,
  POLICE_HOBLIES_FILL_LAYER_ID,
  POLICE_HOBLIES_LINE_LAYER_ID,
  POLICE_HOBLIES_LABEL_LAYER_ID,
  POLICE_VILLAGES_FILL_LAYER_ID,
  POLICE_VILLAGES_LINE_LAYER_ID,
  POLICE_VILLAGES_LABEL_LAYER_ID,
  GP_DISTRICTS_FILL_LAYER_ID,
  GP_DISTRICTS_LINE_LAYER_ID,
  GP_DISTRICTS_LABELS_LAYER_ID,
  CIVIC_DISTRICTS_FILL_LAYER_ID,
  CIVIC_DISTRICTS_LINE_LAYER_ID,
  CIVIC_DISTRICTS_LABELS_LAYER_ID,
  CIVIC_PINCODES_FILL_LAYER_ID,
  CIVIC_PINCODES_LINE_LAYER_ID,
  CIVIC_PINCODES_LABELS_LAYER_ID,
  GP_TALUKS_FILL_LAYER_ID,
  GP_TALUKS_LINE_LAYER_ID,
  GP_TALUKS_LABELS_LAYER_ID,
  GP_BOUNDARIES_FILL_LAYER_ID,
  GP_BOUNDARIES_LINE_LAYER_ID,
  GP_BOUNDARIES_LABELS_LAYER_ID,
  DISTRICT_TALUKS_FILL_LAYER_ID,
  DISTRICT_TALUKS_LINE_LAYER_ID,
  DISTRICT_TALUKS_LABELS_LAYER_ID,
  TALUK_HOBLIES_FILL_LAYER_ID,
  TALUK_HOBLIES_LINE_LAYER_ID,
  TALUK_HOBLIES_LABELS_LAYER_ID,
  HOBLI_VILLAGES_FILL_LAYER_ID,
  HOBLI_VILLAGES_LINE_LAYER_ID,
  HOBLI_VILLAGES_LABELS_LAYER_ID,
  VILLAGE_CADASTRALS_FILL_LAYER_ID,
  VILLAGE_CADASTRALS_LINE_LAYER_ID,
  VILLAGE_CADASTRALS_LABELS_LAYER_ID,
];
const BOUNDARY_SOURCE_IDS = [
  "kml-data",
  "bengaluru-data",
  STATE_DISTRICTS_SOURCE_ID,
  STATE_DISTRICTS_LABELS_SOURCE_ID,
  STATE_ASSEMBLY_SOURCE_ID,
  STATE_PARLIAMENT_SOURCE_ID,
  STATE_POLICE_SOURCE_ID,
  POLICE_HOBLIES_SOURCE_ID,
  POLICE_VILLAGES_SOURCE_ID,
  GP_DISTRICTS_SOURCE_ID,
  GP_DISTRICTS_LABELS_SOURCE_ID,
  CIVIC_DISTRICTS_SOURCE_ID,
  CIVIC_DISTRICTS_LABELS_SOURCE_ID,
  CIVIC_PINCODES_SOURCE_ID,
  CIVIC_PINCODES_LABELS_SOURCE_ID,
  GP_TALUKS_SOURCE_ID,
  GP_TALUKS_LABELS_SOURCE_ID,
  GP_BOUNDARIES_SOURCE_ID,
  GP_BOUNDARIES_LABELS_SOURCE_ID,
  DISTRICT_TALUKS_SOURCE_ID,
  DISTRICT_TALUKS_LABELS_SOURCE_ID,
  TALUK_HOBLIES_SOURCE_ID,
  TALUK_HOBLIES_LABELS_SOURCE_ID,
  HOBLI_VILLAGES_SOURCE_ID,
  HOBLI_VILLAGES_LABELS_SOURCE_ID,
  VILLAGE_CADASTRALS_SOURCE_ID,
];

// Layer ids of the default india_states.geojson (neon-blue states) - shown both under the
// "Administrative Boundaries" option and standalone under the "Assembly Constituency
// Boundaries" option.
const STATE_BOUNDARY_LAYER_IDS = [
  "india-boundary-line",
  "india-boundary-fill",
  "india-boundary-label",
  "states-fill-default",
  "states-borders-default",
  "states-labels-default",
];

// Every layer id that belongs to the "Administrative Boundaries" group: the default
// india_states.geojson layers (neon-blue states) plus every on-demand boundary layer
// (districts, taluks, hoblies, villages, KML/KMZ, Bengaluru files). Toggled together by the
// filters panel's "Administrative Boundaries" checkbox. The raster basemap layers are
// intentionally excluded.
const ADMIN_BOUNDARY_LAYER_IDS = [
  ...STATE_BOUNDARY_LAYER_IDS,
  ...BOUNDARY_LAYER_IDS,
];

// Source id for the India national boundary (INDIA_BOUNDARY.geojson), loaded on map init.
const INDIA_BOUNDARY_SOURCE_ID = "india-boundary-default";

// Source id for the derived "India" label anchor (one Point at the country's centroid).
const INDIA_BOUNDARY_LABELS_SOURCE_ID = "india-boundary-labels";

// Source id for the default india_states.geojson boundaries, loaded on boundary click.
const STATE_SOURCE_ID = "india-states-default";

// Source id for the derived label anchors (one Point per state, at the centroid of the
// state's largest polygon) - see labelAnchorFeatures. Kept separate from STATE_SOURCE_ID
// so MultiPolygon states render exactly one label instead of one per island/enclave.
const STATE_LABELS_SOURCE_ID = "india-states-labels";

// "india/karnataka/Bengaluru/Central/GBA_Zone_Boundary.kmz" -> { Central: [key, ...], ... }
function groupBengaluruKeysBySubfolder(keys: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const key of keys) {
    const match = key.match(/Bengaluru\/([^/]+)\/([^/]+)$/i);
    const subfolder = match?.[1];
    if (!subfolder) continue;
    if (!groups[subfolder]) groups[subfolder] = [];
    groups[subfolder].push(key);
  }
  return groups;
}

function extraLayerIdFromKey(key: string): string {
  return `extra-${key.replace(/[^a-zA-Z0-9]/g, "-")}`;
}

// Distinct color per boundary type so manually-toggled extra layers are visually distinguishable
function colorForBengaluruFileKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.includes("zone")) return "#3563e9"; // blue
  if (lower.includes("ward")) return "#10b981"; // green
  if (lower.includes("corporation")) return "#f59e0b"; // orange
  if (lower.includes("assembly")) return "#8b5cf6"; // purple
  return "#6b7280"; // gray fallback
}

// Source/layer ids for the default ("OSM-style") base map, split into a labeled variant
// (city/town/village/place names baked into the raster tiles) and a label-free variant.
// Only one is visible at a time - see updateBaseLabelVisibility.
const OSM_LABELED_SOURCE_ID = "osm-tiles-labeled";
const OSM_LABELED_LAYER_ID = "osm-layer-labeled";
const OSM_NOLABELS_SOURCE_ID = "osm-tiles-nolabels";
const OSM_NOLABELS_LAYER_ID = "osm-layer-nolabels";

const OSM_LABELED_TILES = [
  "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
];
// CARTO Voyager, no-labels variant: closest colorful match to the default OSM style
// that ships without any place-name text baked into the tile images.
const OSM_NOLABELS_TILES = [
  "https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png",
  "https://d.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png",
];

// Google satellite imagery tiles, shared by the initial style (when the map starts in
// satellite mode) and the LayersControl "satellite" switch.
//
// How deep real imagery goes varies enormously by location - dense areas hold detail past
// z20, farmland or forest can run dry as early as z16 - and Google's tile endpoint signals
// "no imagery here" with a genuine HTTP 404, not a blank 200 image. So instead of guessing
// one fixed zoom limit, tiles are routed through the "gsat://" protocol registered by
// registerSatelliteProtocol below, which fetches the real tile itself and, the moment it
// sees a 404, clamps the map's maxZoom to one level below the failure and eases the camera
// back if the user had already scrolled past - so the blank tile is never left on screen.
const SATELLITE_PROTOCOL = "gsat";
const SATELLITE_TILES = [
  `${SATELLITE_PROTOCOL}://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}`,
  `${SATELLITE_PROTOCOL}://mt1.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}`,
];

// Starting ceiling for the satellite layer's zoom - generous since real per-location limits
// are discovered live (see above) and only ever pulled down from here, never raised past it.
const SATELLITE_MAX_ZOOM_CEILING = 21;

let satelliteProtocolRegistered = false;

// Registers the "gsat://" protocol used by SATELLITE_TILES (idempotent - MapLibre only
// needs this once per page, even though the map itself may be torn down and re-created).
// getMap is called lazily on each tile fetch so this always clamps whichever map instance
// is currently live, not a stale one captured at registration time.
function registerSatelliteProtocol(
  maplibregl: typeof import("maplibre-gl"),
  getMap: () => MapLibreMap | null
) {
  if (satelliteProtocolRegistered) return;
  satelliteProtocolRegistered = true;

  maplibregl.addProtocol(SATELLITE_PROTOCOL, async (params, abortController) => {
    const realUrl = params.url.replace(`${SATELLITE_PROTOCOL}://`, "https://");
    const failedZoomMatch = realUrl.match(/[?&]z=(\d+)/);
    const requestedZoom = failedZoomMatch ? Number(failedZoomMatch[1]) : null;

    const response = await fetch(realUrl, { signal: abortController.signal });

    if (!response.ok) {
      const map = getMap();
      if (map && requestedZoom !== null) {
        const cappedZoom = requestedZoom - 1;
        if (map.getMaxZoom() > cappedZoom) {
          map.setMaxZoom(cappedZoom);
        }
        if (map.getZoom() > cappedZoom) {
          map.easeTo({ zoom: cappedZoom, duration: 300 });
        }
      }
      throw new Error(`No satellite imagery at zoom ${requestedZoom ?? "?"}`);
    }

    return { data: await response.arrayBuffer() };
  });
}

// Which LayersControl base layer the explore map opens on. "satellite" keeps the default
// map in satellite imagery mode (Google tiles); switch to "default" to restore the OSM-
// style look.
const DEFAULT_MAP_LAYER: MapLayer = "satellite";

// Base map labels (city/town/village/taluk/hobli/other place names, baked into the raster
// tiles) are hidden once the scale bar reads beyond this many km - at or below it, the
// normal fully-labeled tiles show. Beyond it, only our own vector label layers show:
// "states-labels-default" always, STATE_DISTRICTS_LABELS_LAYER_ID in its band below, and
// DISTRICT_TALUKS_LABELS_LAYER_ID / TALUK_HOBLIES_LABELS_LAYER_ID whenever their boundary
// layers are loaded.
const RASTER_LABELS_HIDE_THRESHOLD_KM = 1;

// District name labels (our own vector layer, drawn over a selected state's districts)
// are shown only in this scale-bar range - below it the raster tiles' own place labels
// take over (once past the taluk-label band), above it only the state label remains.
// Taluk and hobli labels are intentionally NOT zoom-banded: they appear as soon as their
// boundary layer is loaded.
const DISTRICT_LABEL_MIN_KM = 10;
const DISTRICT_LABEL_MAX_KM = 100;

// Mirrors MapLibre's own ScaleControl "nice round number" calculation (see
// maplibre-gl's ScaleControl.getRoundNum) so this matches exactly what the scale bar
// in the bottom-right corner displays.
function computeScaleKm(map: MapLibreMap): number {
  const maxWidth = 120; // matches the ScaleControl's own maxWidth option below
  const y = map.getContainer().clientHeight / 2;
  const left = map.unproject([0, y]);
  const right = map.unproject([maxWidth, y]);
  const maxMeters = left.distanceTo(right);
  if (maxMeters <= 0) return 0;

  const pow10 = Math.pow(10, `${Math.floor(maxMeters)}`.length - 1);
  const ratio = maxMeters / pow10;
  const niceDigit = ratio >= 10 ? 10 : ratio >= 5 ? 5 : ratio >= 3 ? 3 : ratio >= 2 ? 2 : 1;
  return (pow10 * niceDigit) / 1000;
}

// Adds both base-map raster layers (idempotent - safe to call again) and syncs their
// visibility to the current zoom via updateBaseLabelVisibility.
function addDefaultBaseLayers(
  map: MapLibreMap,
  beforeId?: string,
  boundariesVisible = true
) {
  if (!map.getSource(OSM_NOLABELS_SOURCE_ID)) {
    map.addSource(OSM_NOLABELS_SOURCE_ID, {
      type: "raster",
      tiles: OSM_NOLABELS_TILES,
      tileSize: 256,
      attribution: "© CARTO, © OpenStreetMap contributors",
    });
  }
  if (!map.getLayer(OSM_NOLABELS_LAYER_ID)) {
    map.addLayer({ id: OSM_NOLABELS_LAYER_ID, type: "raster", source: OSM_NOLABELS_SOURCE_ID }, beforeId);
  }
  if (!map.getSource(OSM_LABELED_SOURCE_ID)) {
    map.addSource(OSM_LABELED_SOURCE_ID, {
      type: "raster",
      tiles: OSM_LABELED_TILES,
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    });
  }
  if (!map.getLayer(OSM_LABELED_LAYER_ID)) {
    map.addLayer({ id: OSM_LABELED_LAYER_ID, type: "raster", source: OSM_LABELED_SOURCE_ID }, beforeId);
  }
  updateBaseLabelVisibility(map, boundariesVisible);
}

// boundariesVisible is true only in "administrative" mode (the filters panel's Boundary
// Layers group): when false, the district label layer stays hidden no matter the zoom band
// (only the base raster labels, which aren't boundary layers, keep following the scale bar).
// Taluk and hobli labels are not handled here - their visibility follows their boundary
// layers' mode visibility in applyBoundaryLayerVisibility.
function updateBaseLabelVisibility(map: MapLibreMap, boundariesVisible = true) {
  const scaleKm = computeScaleKm(map);

  if (map.getLayer(OSM_LABELED_LAYER_ID) && map.getLayer(OSM_NOLABELS_LAYER_ID)) {
    // "1km and less" keeps the default map's labels; anything beyond 1km hides them.
    const hideRasterLabels = scaleKm > RASTER_LABELS_HIDE_THRESHOLD_KM;
    map.setLayoutProperty(OSM_LABELED_LAYER_ID, "visibility", hideRasterLabels ? "none" : "visible");
    map.setLayoutProperty(OSM_NOLABELS_LAYER_ID, "visibility", hideRasterLabels ? "visible" : "none");
  }

  // Only district name labels stay zoom-banded. Taluk and hobli labels are intentionally NOT
  // zoom-gated: they appear the moment their boundary layer is loaded and are hidden only when
  // applyBoundaryLayerVisibility hides that mode's layers.
  if (map.getLayer(STATE_DISTRICTS_LABELS_LAYER_ID)) {
    const showDistrictLabels =
      boundariesVisible &&
      scaleKm >= DISTRICT_LABEL_MIN_KM &&
      scaleKm <= DISTRICT_LABEL_MAX_KM;
    map.setLayoutProperty(
      STATE_DISTRICTS_LABELS_LAYER_ID,
      "visibility",
      showDistrictLabels ? "visible" : "none"
    );
  }
}

export const IndiaMapViewer = forwardRef<IndiaMapViewerHandle, IndiaMapViewerProps>(
  function IndiaMapViewer(
    {
      onWardSelected,
      onBoundariesCleared,
      onExtraFileToggled,
      onAOIChange,
      onDrawingToolChange,
      onAttributeInfo,
    },
    ref
  ) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const onWardSelectedRef = useRef(onWardSelected);
  useEffect(() => {
    onWardSelectedRef.current = onWardSelected;
  }, [onWardSelected]);
  const onBoundariesClearedRef = useRef(onBoundariesCleared);
  useEffect(() => {
    onBoundariesClearedRef.current = onBoundariesCleared;
  }, [onBoundariesCleared]);
  const onExtraFileToggledRef = useRef(onExtraFileToggled);
  useEffect(() => {
    onExtraFileToggledRef.current = onExtraFileToggled;
  }, [onExtraFileToggled]);
  // Keys of any manually-toggled extra Bengaluru files currently on the map (for Escape cleanup)
  const extraLayerKeysRef = useRef<Set<string>>(new Set());
  // Which Boundary Layers filter option is active (filters panel). Defaults to
  // "administrative" so the india states / districts / taluks / hoblies / villages layers
  // show initially. Layers added later follow the active mode.
  const boundaryLayerModeRef = useRef<BoundaryLayerMode>("administrative");
  // Mirrors the active base layer ("satellite" | "terrain" | "default") for refs that run
  // outside React (async cadastral loads), so the parcel grid recolors correctly even when
  // the basemap switched while a village's cadastrals were still loading.
  const currentLayerRef = useRef<MapLayer>(DEFAULT_MAP_LAYER);

  // Shows/hides every existing boundary layer to match the active mode, including any
  // manually-toggled Bengaluru extra files. In the constituency modes the neon-blue
  // india_states layers and that mode's loaded constituency boundaries stay visible; the
  // gram panchayat mode keeps the neon-blue states visible too (its own boundaries aren't
  // wired to data yet). Only the district label layer is handed back to
  // updateBaseLabelVisibility (which applies its zoom-based band); taluk and hobli labels
  // simply follow their layers' visibility.
  const applyBoundaryLayerVisibility = (map: MapLibreMap) => {
    const mode = boundaryLayerModeRef.current;
    const showAll = mode === "administrative";

    ADMIN_BOUNDARY_LAYER_IDS.forEach((layerId) => {
      if (!map.getLayer(layerId)) return;
      const isStatesLayer = STATE_BOUNDARY_LAYER_IDS.includes(layerId);
      const isAssemblyLayer =
        layerId === STATE_ASSEMBLY_FILL_LAYER_ID || layerId === STATE_ASSEMBLY_LINE_LAYER_ID;
      const isParliamentLayer =
        layerId === STATE_PARLIAMENT_FILL_LAYER_ID || layerId === STATE_PARLIAMENT_LINE_LAYER_ID;
      const isPoliceLayer =
        layerId === STATE_POLICE_FILL_LAYER_ID ||
        layerId === STATE_POLICE_LINE_LAYER_ID ||
        layerId === STATE_POLICE_LABEL_LAYER_ID ||
        layerId.startsWith("police-");
      const isCivicLayer =
        layerId === CIVIC_DISTRICTS_FILL_LAYER_ID ||
        layerId === CIVIC_DISTRICTS_LINE_LAYER_ID ||
        layerId === CIVIC_DISTRICTS_LABELS_LAYER_ID ||
        layerId === CIVIC_PINCODES_FILL_LAYER_ID ||
        layerId === CIVIC_PINCODES_LINE_LAYER_ID ||
        layerId === CIVIC_PINCODES_LABELS_LAYER_ID;
      const isGpLayer =
        layerId === GP_DISTRICTS_FILL_LAYER_ID ||
        layerId === GP_DISTRICTS_LINE_LAYER_ID ||
        layerId === GP_DISTRICTS_LABELS_LAYER_ID ||
        layerId === GP_TALUKS_FILL_LAYER_ID ||
        layerId === GP_TALUKS_LINE_LAYER_ID ||
        layerId === GP_TALUKS_LABELS_LAYER_ID ||
        layerId === GP_BOUNDARIES_FILL_LAYER_ID ||
        layerId === GP_BOUNDARIES_LINE_LAYER_ID ||
        layerId === GP_BOUNDARIES_LABELS_LAYER_ID;
      const visible =
        showAll ||
        (mode === "assembly" && (isStatesLayer || isAssemblyLayer)) ||
        (mode === "parliamentary" && (isStatesLayer || isParliamentLayer)) ||
        (mode === "police_station" && (isStatesLayer || isPoliceLayer)) ||
        (mode === "gram_panchayat" && (isStatesLayer || isGpLayer)) ||
        (mode === "civic_amenities" && (isStatesLayer || isCivicLayer));
      // Once the India states are loaded (by clicking the national boundary), the
      // India boundary itself stays hidden - the states replace it.
      const isIndiaBoundaryLayer =
        layerId === "india-boundary-line" ||
        layerId === "india-boundary-fill" ||
        layerId === "india-boundary-label";
      const isVisible =
        visible && !(isIndiaBoundaryLayer && loadedStatesDataRef.current !== null);
      map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
    });

    extraLayerKeysRef.current.forEach((key) => {
      const baseId = extraLayerIdFromKey(key);
      if (map.getLayer(`${baseId}-fill`)) {
        map.setLayoutProperty(`${baseId}-fill`, "visibility", showAll ? "visible" : "none");
      }
      if (map.getLayer(`${baseId}-line`)) {
        map.setLayoutProperty(`${baseId}-line`, "visibility", showAll ? "visible" : "none");
      }
    });

    updateBaseLabelVisibility(map, showAll);
  };

  // --- AOI drawing (Free Hand / Polygon / Rectangle) ---
  // Currently-armed "Draw AOI" tool (from the dropdown), or null when not drawing.
  const drawingToolRef = useRef<AOITool | null>(null);
  // In-progress drawing session (see AOIDrawSession), or null when nothing is being drawn.
  const drawSessionRef = useRef<AOIDrawSession | null>(null);
  // The last completed AOI polygon, kept so a new draw can replace it and so
  // clearAOI()/Escape can remove it from the map.
  const completedAOIRef = useRef<AOIResult | null>(null);
  // Whether the attribute-info side panel is currently open (a right-click reported info and
  // it hasn't been dismissed yet). Escape gives the panel first priority: it closes the panel
  // without clearing the loaded boundaries.
  const attributeInfoOpenRef = useRef(false);
  // Pixel position + timestamp of the previous polygon vertex click, used to tell the second
  // click of a double-click (which closes the polygon) apart from a genuine new vertex.
  const lastVertexClickRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const onAOIChangeRef = useRef(onAOIChange);
  useEffect(() => {
    onAOIChangeRef.current = onAOIChange;
  }, [onAOIChange]);
  const onDrawingToolChangeRef = useRef(onDrawingToolChange);
  useEffect(() => {
    onDrawingToolChangeRef.current = onDrawingToolChange;
  }, [onDrawingToolChange]);
  const onAttributeInfoRef = useRef(onAttributeInfo);
  useEffect(() => {
    onAttributeInfoRef.current = onAttributeInfo;
  }, [onAttributeInfo]);

  // Adds the AOI sources/layers the first time a tool is armed (idempotent - safe to re-run).
  const ensureAOILayers = (map: MapLibreMap) => {
    if (!map.getSource(AOI_SOURCE_ID)) {
      map.addSource(AOI_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.getSource(AOI_VERTICES_SOURCE_ID)) {
      map.addSource(AOI_VERTICES_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.getLayer("aoi-draft-fill")) {
      map.addLayer({
        id: "aoi-draft-fill",
        type: "fill",
        source: AOI_SOURCE_ID,
        filter: ["==", ["get", "kind"], "draft"],
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.12 },
      });
    }
    if (!map.getLayer("aoi-draft-line")) {
      map.addLayer({
        id: "aoi-draft-line",
        type: "line",
        source: AOI_SOURCE_ID,
        filter: ["==", ["get", "kind"], "draft"],
        paint: {
          "line-color": "#2563eb",
          "line-width": 2,
          "line-dasharray": [2, 1.5],
          "line-opacity": 0.9,
        },
      });
    }
    if (!map.getLayer("aoi-complete-fill")) {
      map.addLayer({
        id: "aoi-complete-fill",
        type: "fill",
        source: AOI_SOURCE_ID,
        filter: ["==", ["get", "kind"], "complete"],
        paint: { "fill-color": "#10b981", "fill-opacity": 0.22 },
      });
    }
    if (!map.getLayer("aoi-complete-line")) {
      map.addLayer({
        id: "aoi-complete-line",
        type: "line",
        source: AOI_SOURCE_ID,
        filter: ["==", ["get", "kind"], "complete"],
        paint: { "line-color": "#10b981", "line-width": 2.5 },
      });
    }
    if (!map.getLayer("aoi-vertex-dots")) {
      map.addLayer({
        id: "aoi-vertex-dots",
        type: "circle",
        source: AOI_VERTICES_SOURCE_ID,
        paint: {
          "circle-radius": 4,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#2563eb",
          "circle-stroke-width": 2,
        },
      });
    }
  };

  // Re-renders the AOI sources: the in-progress draft polygon (if any), the last completed
  // AOI polygon (if any), and the polygon's placed vertex dots (if any).
  const publishAOIData = (
    map: MapLibreMap,
    draft: GeoJSON.Polygon | null,
    vertices: [number, number][] | null
  ) => {
    const features: GeoJSON.Feature[] = [];
    if (draft) {
      features.push({ type: "Feature", geometry: draft, properties: { kind: "draft" } });
    }
    const complete = completedAOIRef.current;
    if (complete) {
      features.push({
        type: "Feature",
        geometry: complete.geometry,
        properties: { kind: "complete" },
      });
    }
    (map.getSource(AOI_SOURCE_ID) as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features,
    });

    const vertexFeatures: GeoJSON.Feature[] = (vertices ?? []).map((position) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: position },
      properties: {},
    }));
    (map.getSource(AOI_VERTICES_SOURCE_ID) as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: vertexFeatures,
    });
  };

  const clearDraft = (map: MapLibreMap) => publishAOIData(map, null, null);

  // Abandons the in-progress drawing, keeping any previously completed AOI on the map.
  const cancelDrawing = (map: MapLibreMap) => {
    drawSessionRef.current = null;
    clearDraft(map);
  };

  // Turns the current drawing into the completed AOI and reports it to the caller. Shapes
  // with effectively zero area (a click without a drag, a 2-vertex "polygon") are discarded
  // rather than shown as a ~0 m² AOI.
  const completeAOI = (map: MapLibreMap, polygon: GeoJSON.Polygon) => {
    const areaSqKm = calculatePolygonAreaSqm(polygon) / 1_000_000;
    if (areaSqKm < 1e-6) {
      cancelDrawing(map);
      return;
    }
    completedAOIRef.current = { geometry: polygon, areaSqKm };
    drawSessionRef.current = null;
    onAOIChangeRef.current?.({ geometry: polygon, areaSqKm });
    publishAOIData(map, null, null);
  };

  // Builds the live draft polygon for a session: freehand strokes and polygons close back to
  // their first point (plus the cursor's current position while in progress); rectangles are
  // axis-aligned corner-to-corner between the anchor and the live point.
  const draftPolygonFor = (
    tool: AOITool,
    session: AOIDrawSession,
    live: [number, number] | null
  ): GeoJSON.Polygon | null => {
    if (tool === "rectangle") {
      const start = session.points[0];
      if (!start || !live) return null;
      return {
        type: "Polygon",
        coordinates: [[start, [live[0], start[1]], live, [start[0], live[1]], start]],
      };
    }
    const pts = live ? [...session.points, live] : session.points;
    if (pts.length < 2) return null;
    // Non-null assertion: pts.length >= 2 is checked above, so pts[0] is defined.
    return { type: "Polygon", coordinates: [[...pts, pts[0]!]] };
  };

  // Removes the completed AOI from the map (and the caller's state).
  const clearCompletedAOI = (map: MapLibreMap) => {
    completedAOIRef.current = null;
    onAOIChangeRef.current?.(null);
    if (map.getSource(AOI_SOURCE_ID)) clearDraft(map);
  };

  // Arms a tool: disables the pan/zoom gestures that would fight the drawing input and shows
  // a crosshair cursor. Layer creation waits for the style to be loaded. The last completed
  // AOI stays on the map so the user can compare it against the new draft.
  const armDrawingTool = (map: MapLibreMap, tool: AOITool) => {
    drawingToolRef.current = tool;
    drawSessionRef.current = null;
    lastVertexClickRef.current = null;
    map.dragPan.disable();
    map.boxZoom.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disable();
    map.getCanvas().style.cursor = "crosshair";
    onDrawingToolChangeRef.current?.(tool);
    const ensure = () => {
      ensureAOILayers(map);
      clearDraft(map);
    };
    if (map.isStyleLoaded()) ensure();
    else map.once("load", ensure);
  };

  // Disarms the current tool: restores pan/zoom and the normal cursor. The last completed
  // AOI (if any) stays on the map.
  const disarmDrawingTool = (map: MapLibreMap) => {
    drawingToolRef.current = null;
    drawSessionRef.current = null;
    map.dragPan.enable();
    map.boxZoom.enable();
    map.doubleClickZoom.enable();
    map.touchZoomRotate.enable();
    map.getCanvas().style.cursor = "";
    onDrawingToolChangeRef.current?.(null);
    if (map.getSource(AOI_SOURCE_ID)) clearDraft(map);
  };

  // Currently-selected feature id in the default states layer (shared between click and search)
  const selectedStateIdRef = useRef<string | number | null>(null);

  const clearStateSelection = (map: MapLibreMap) => {
    if (selectedStateIdRef.current !== null) {
      map.setFeatureState(
        { source: STATE_SOURCE_ID, id: selectedStateIdRef.current },
        { selected: false }
      );
      selectedStateIdRef.current = null;
    }
  };

  const selectStateFeature = (map: MapLibreMap, feature: GeoJSONFeature) => {
    if (feature.id === undefined) return;
    clearStateSelection(map);
    selectedStateIdRef.current = feature.id;
    map.setFeatureState({ source: STATE_SOURCE_ID, id: feature.id }, { selected: true });
    if (feature.geometry) {
      map.fitBounds(boundsOfGeometry(feature.geometry), {
        padding: 60,
        duration: 800,
        maxZoom: 7,
      });
    }
  };

  // Selects a state already present in the default india_states.geojson layer by name
  // (case-insensitive), e.g. from a "Karnataka" search. Returns false if the boundaries
  // haven't finished loading yet or no state with that name exists.
  const selectStateByName = (map: MapLibreMap, name: string): boolean => {
    if (!map.getSource(STATE_SOURCE_ID)) return false;
    const normalized = name.trim().toLowerCase();
    const features = map.querySourceFeatures(STATE_SOURCE_ID, {
      filter: ["==", ["downcase", ["get", "st_nm"]], normalized],
    });
    const feature = features[0];
    if (!feature) return false;
    selectStateFeature(map, feature);
    return true;
  };

  // Name (lowercased) of the state whose districts are currently loaded, if any.
  const loadedDistrictsStateRef = useRef<string | null>(null);
  // Currently-selected district feature id (mirrors selectedStateIdRef, one level down).
  const selectedDistrictIdRef = useRef<string | number | null>(null);

  // Name of the state whose assembly constituencies are currently loaded, if any.
  const loadedAssemblyStateRef = useRef<string | null>(null);
  // Currently-selected assembly constituency feature id.
  const selectedAssemblyIdRef = useRef<string | number | null>(null);

  // Name of the state whose parliamentary constituencies are currently loaded, if any.
  const loadedParliamentStateRef = useRef<string | null>(null);
  // Currently-selected parliamentary constituency feature id.

  // Name of the state whose civic amenities district boundaries are currently loaded, if any.
  const loadedCivicDistrictsStateRef = useRef<string | null>(null);
  // Currently-selected civic district feature id (mirrors selectedStateIdRef, one level down).
  const selectedCivicDistrictIdRef = useRef<string | number | null>(null);
  // Name (lowercased) of the district whose civic pincode boundaries are currently loaded.
  const loadedCivicPincodesDistrictRef = useRef<string | null>(null);

  // Name of the state whose gram panchayat district boundaries are currently loaded, if any.
  const loadedGpDistrictsStateRef = useRef<string | null>(null);
  // Currently-selected GP district feature id (mirrors selectedStateIdRef, one level down).
  const selectedGpDistrictIdRef = useRef<string | number | null>(null);
  // Name (lowercased) of the district whose GP taluk boundaries are currently loaded, if any.
  const loadedGpTaluksDistrictRef = useRef<string | null>(null);
  // Currently-selected GP taluk feature id (one level below the GP district selection).
  const selectedGpTalukIdRef = useRef<string | number | null>(null);
  // Name (lowercased) of the taluk whose gram panchayat boundaries are currently loaded.
  const loadedGpBoundariesTalukRef = useRef<string | null>(null);
  const selectedParliamentIdRef = useRef<string | number | null>(null);

  // Name of the state whose police-station jurisdictions are currently loaded, if any.
  const loadedPoliceStateRef = useRef<string | null>(null);
  const selectedPoliceIdRef = useRef<string | number | null>(null);
  
  // Name of the district whose taluks are currently loaded, if any.
  const loadedTaluksDistrictRef = useRef<string | null>(null);
  // Currently-selected taluk feature id.
  const selectedTalukIdRef = useRef<string | number | null>(null);
  // Currently-selected taluk name.
  const selectedTalukNameRef = useRef<string | null>(null);

  // Name of the taluk whose hoblies are currently loaded, if any.
  const loadedHobliesTalukRef = useRef<string | null>(null);
  // Currently-selected hobli feature id.
  const selectedHobliIdRef = useRef<string | number | null>(null);

  // Name of the hobli whose villages are currently loaded, if any.
  const loadedVillagesHobliRef = useRef<string | null>(null);
  // Currently-selected village feature id.
  const selectedVillageIdRef = useRef<string | number | null>(null);
  // Name of the village whose cadastral boundaries are currently loaded, if any.
  const loadedCadastralsVillageRef = useRef<string | null>(null);
  // Name of the currently-selected village, kept in sync at selection time so the village
  // click handler can pass it when fetching cadastral boundaries.
  const selectedVillageNameRef = useRef<string | null>(null);

  // Names of the currently-selected state/district, kept in sync at selection time so the
  // taluk click handler (which only has the taluk feature itself) can look them up when
  // fetching hobli boundaries.
  const selectedStateNameRef = useRef<string | null>(null);
  const selectedDistrictNameRef = useRef<string | null>(null);

  // Raw feature collections behind the currently-loaded district/taluk layers, kept around
  // so search() can look up a feature by name directly (its array index doubles as its
  // generateId'd feature id) without depending on querySourceFeatures' timing.
  // Raw india_states.geojson loaded once at init - kept so applyVillageCutout can punch the
  // selected village out of the state fill and restoreAncestorFills can put it back.
  const loadedStatesDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const loadedDistrictsDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const loadedTaluksDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  // Same for the hobli/village layers - used by undo/redo to rebuild them from stored data
  // without refetching from MinIO.
  const loadedHobliesDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const loadedVillagesDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  // Same for the village cadastral layer - used by undo/redo to rebuild from stored data.
  const loadedCadastralsDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  // Currently-selected hobli name (parent lookup when rebuilding the village level).
  const selectedHobliNameRef = useRef<string | null>(null);
  // Bumped on every undo/redo (and Escape-clear) so boundary fetches that were in flight
  // before the state change can't repopulate the map with stale layers afterwards.
  const drillGenerationRef = useRef(0);
  // Undo/redo history stacks for the administrative drill-down (capped to bound memory).
  const drillUndoStackRef = useRef<DrillSnapshot[]>([]);
  const drillRedoStackRef = useRef<DrillSnapshot[]>([]);

  const clearStateDistricts = (map: MapLibreMap) => {
    if (map.getLayer(STATE_DISTRICTS_FILL_LAYER_ID)) map.removeLayer(STATE_DISTRICTS_FILL_LAYER_ID);
    if (map.getLayer(STATE_DISTRICTS_LINE_LAYER_ID)) map.removeLayer(STATE_DISTRICTS_LINE_LAYER_ID);
    removeLabelLayer(map, STATE_DISTRICTS_LABELS_LAYER_ID);
    if (map.getSource(STATE_DISTRICTS_SOURCE_ID)) map.removeSource(STATE_DISTRICTS_SOURCE_ID);
    if (map.getSource(STATE_DISTRICTS_LABELS_SOURCE_ID)) map.removeSource(STATE_DISTRICTS_LABELS_SOURCE_ID);
    loadedDistrictsStateRef.current = null;
    selectedDistrictIdRef.current = null;
    loadedDistrictsDataRef.current = null;
  };

  const clearStateAssembly = (map: MapLibreMap) => {
    if (map.getLayer(STATE_ASSEMBLY_FILL_LAYER_ID)) map.removeLayer(STATE_ASSEMBLY_FILL_LAYER_ID);
    if (map.getLayer(STATE_ASSEMBLY_LINE_LAYER_ID)) map.removeLayer(STATE_ASSEMBLY_LINE_LAYER_ID);
    if (map.getSource(STATE_ASSEMBLY_SOURCE_ID)) map.removeSource(STATE_ASSEMBLY_SOURCE_ID);
    loadedAssemblyStateRef.current = null;
    selectedAssemblyIdRef.current = null;
  };

  const clearStateParliament = (map: MapLibreMap) => {
    if (map.getLayer(STATE_PARLIAMENT_FILL_LAYER_ID)) map.removeLayer(STATE_PARLIAMENT_FILL_LAYER_ID);
    if (map.getLayer(STATE_PARLIAMENT_LINE_LAYER_ID)) map.removeLayer(STATE_PARLIAMENT_LINE_LAYER_ID);
    if (map.getSource(STATE_PARLIAMENT_SOURCE_ID)) map.removeSource(STATE_PARLIAMENT_SOURCE_ID);
    loadedParliamentStateRef.current = null;
    selectedParliamentIdRef.current = null;
  };

  const clearPoliceCoverage = (map: MapLibreMap) => {
    [
      POLICE_VILLAGES_LABEL_LAYER_ID,
      POLICE_VILLAGES_LINE_LAYER_ID,
      POLICE_VILLAGES_FILL_LAYER_ID,
      POLICE_HOBLIES_LABEL_LAYER_ID,
      POLICE_HOBLIES_LINE_LAYER_ID,
      POLICE_HOBLIES_FILL_LAYER_ID,
    ].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    [POLICE_VILLAGES_SOURCE_ID, POLICE_HOBLIES_SOURCE_ID].forEach((id) => {
      if (map.getSource(id)) map.removeSource(id);
    });
  };

  const clearStatePolice = (map: MapLibreMap) => {
    clearPoliceCoverage(map);
    if (map.getLayer(STATE_POLICE_FILL_LAYER_ID)) map.removeLayer(STATE_POLICE_FILL_LAYER_ID);
    if (map.getLayer(STATE_POLICE_LINE_LAYER_ID)) map.removeLayer(STATE_POLICE_LINE_LAYER_ID);
    if (map.getLayer(STATE_POLICE_LABEL_LAYER_ID)) map.removeLayer(STATE_POLICE_LABEL_LAYER_ID);
    if (map.getSource(STATE_POLICE_SOURCE_ID)) map.removeSource(STATE_POLICE_SOURCE_ID);
    loadedPoliceStateRef.current = null;
    selectedPoliceIdRef.current = null;
  };

  const clearGpBoundaries = (map: MapLibreMap) => {
    if (map.getLayer(GP_BOUNDARIES_FILL_LAYER_ID)) map.removeLayer(GP_BOUNDARIES_FILL_LAYER_ID);
    if (map.getLayer(GP_BOUNDARIES_LINE_LAYER_ID)) map.removeLayer(GP_BOUNDARIES_LINE_LAYER_ID);
    removeLabelLayer(map, GP_BOUNDARIES_LABELS_LAYER_ID);
    if (map.getSource(GP_BOUNDARIES_SOURCE_ID)) map.removeSource(GP_BOUNDARIES_SOURCE_ID);
    if (map.getSource(GP_BOUNDARIES_LABELS_SOURCE_ID)) map.removeSource(GP_BOUNDARIES_LABELS_SOURCE_ID);
    loadedGpBoundariesTalukRef.current = null;
  };

  const clearGpTaluks = (map: MapLibreMap) => {
    if (map.getLayer(GP_TALUKS_FILL_LAYER_ID)) map.removeLayer(GP_TALUKS_FILL_LAYER_ID);
    if (map.getLayer(GP_TALUKS_LINE_LAYER_ID)) map.removeLayer(GP_TALUKS_LINE_LAYER_ID);
    removeLabelLayer(map, GP_TALUKS_LABELS_LAYER_ID);
    if (map.getSource(GP_TALUKS_SOURCE_ID)) map.removeSource(GP_TALUKS_SOURCE_ID);
    if (map.getSource(GP_TALUKS_LABELS_SOURCE_ID)) map.removeSource(GP_TALUKS_LABELS_SOURCE_ID);
    loadedGpTaluksDistrictRef.current = null;
    selectedGpTalukIdRef.current = null;
    // Taluks can't outlive their gram panchayat boundaries - clear the deeper level too.
    clearGpBoundaries(map);
  };

  const clearCivicPincodes = (map: MapLibreMap) => {
    if (map.getLayer(CIVIC_PINCODES_FILL_LAYER_ID)) map.removeLayer(CIVIC_PINCODES_FILL_LAYER_ID);
    if (map.getLayer(CIVIC_PINCODES_LINE_LAYER_ID)) map.removeLayer(CIVIC_PINCODES_LINE_LAYER_ID);
    removeLabelLayer(map, CIVIC_PINCODES_LABELS_LAYER_ID);
    if (map.getSource(CIVIC_PINCODES_SOURCE_ID)) map.removeSource(CIVIC_PINCODES_SOURCE_ID);
    if (map.getSource(CIVIC_PINCODES_LABELS_SOURCE_ID)) map.removeSource(CIVIC_PINCODES_LABELS_SOURCE_ID);
    loadedCivicPincodesDistrictRef.current = null;
  };

  const clearCivicDistricts = (map: MapLibreMap) => {
    if (map.getLayer(CIVIC_DISTRICTS_FILL_LAYER_ID)) map.removeLayer(CIVIC_DISTRICTS_FILL_LAYER_ID);
    if (map.getLayer(CIVIC_DISTRICTS_LINE_LAYER_ID)) map.removeLayer(CIVIC_DISTRICTS_LINE_LAYER_ID);
    removeLabelLayer(map, CIVIC_DISTRICTS_LABELS_LAYER_ID);
    if (map.getSource(CIVIC_DISTRICTS_SOURCE_ID)) map.removeSource(CIVIC_DISTRICTS_SOURCE_ID);
    if (map.getSource(CIVIC_DISTRICTS_LABELS_SOURCE_ID)) map.removeSource(CIVIC_DISTRICTS_LABELS_SOURCE_ID);
    loadedCivicDistrictsStateRef.current = null;
    selectedCivicDistrictIdRef.current = null;
    // Pincodes can't outlive their district - clear the deeper civic level too.
    clearCivicPincodes(map);
  };

  const clearGpDistricts = (map: MapLibreMap) => {
    if (map.getLayer(GP_DISTRICTS_FILL_LAYER_ID)) map.removeLayer(GP_DISTRICTS_FILL_LAYER_ID);
    if (map.getLayer(GP_DISTRICTS_LINE_LAYER_ID)) map.removeLayer(GP_DISTRICTS_LINE_LAYER_ID);
    removeLabelLayer(map, GP_DISTRICTS_LABELS_LAYER_ID);
    if (map.getSource(GP_DISTRICTS_SOURCE_ID)) map.removeSource(GP_DISTRICTS_SOURCE_ID);
    if (map.getSource(GP_DISTRICTS_LABELS_SOURCE_ID)) map.removeSource(GP_DISTRICTS_LABELS_SOURCE_ID);
    loadedGpDistrictsStateRef.current = null;
    selectedGpDistrictIdRef.current = null;
    // Districts can't outlive their taluks - clear the deeper GP level too.
    clearGpTaluks(map);
  };

  // Clears whichever state-level boundary layer is loaded (districts, assembly
  // constituencies, parliamentary constituencies, or gram panchayat districts), used when
  // switching states, deselecting a state, or changing the Boundary Layers filter option.
  const clearStateBoundaryLayers = (map: MapLibreMap) => {
    clearStateDistricts(map);
    clearStateAssembly(map);
    clearStateParliament(map);
    clearStatePolice(map);
    clearGpDistricts(map);
    clearCivicDistricts(map);
  };

  // Fetches and renders a state's district boundaries from MinIO (via /api/datasets/state-districts).
  // Triggered by clicking an already-selected state a second time. Hover/click handlers for the
  // resulting layer are registered once, up front, in the map's "load" handler below.
  const loadStateDistricts = async (
    map: MapLibreMap,
    stateName: string,
    data?: GeoJSON.FeatureCollection
  ) => {
    const normalized = stateName.trim().toLowerCase();
    if (loadedDistrictsStateRef.current === normalized) return; // already showing
    const generation = drillGenerationRef.current; // stale-load guard for undo/redo

    try {
      let districtsData: GeoJSON.FeatureCollection;
      if (data) {
        districtsData = data; // restore path: rebuild from the stored snapshot
      } else {
        const response = await fetch(`/api/datasets/state-districts?state=${encodeURIComponent(stateName)}`);
        if (!response.ok) {
          console.warn(`No district data available for "${stateName}"`);
          return;
        }
        districtsData = await response.json();
      }
      // An undo/redo happened while this load was in flight - the restored snapshot already
      // rebuilt (or cleared) this level, so drop the stale result.
      if (generation !== drillGenerationRef.current) return;

      clearStateBoundaryLayers(map);
      // clearStateBoundaryLayers resets this ref - set it back after the clear so search()
      // and the undo/redo snapshots can look the data up.
      loadedDistrictsDataRef.current = districtsData;

      // generateId assigns each district a numeric id, addressable via setFeatureState for
      // hover/selection highlighting (same technique as the state layer above).
      map.addSource(STATE_DISTRICTS_SOURCE_ID, {
        type: "geojson",
        data: districtsData,
        generateId: true,
      });

      // Separate anchor-point source for the district name labels (one Point per district,
      // at the centroid of its largest polygon) so multi-part districts render one label.
      map.addSource(STATE_DISTRICTS_LABELS_SOURCE_ID, {
        type: "geojson",
        data: labelAnchorFeatures(districtsData, ["dtname"]),
        generateId: true,
      });

      map.addLayer({
        id: STATE_DISTRICTS_FILL_LAYER_ID,
        type: "fill",
        source: STATE_DISTRICTS_SOURCE_ID,
        paint: {
          "fill-color": "#FF6600",
          // Districts are lines-only: the base opacity is 0 (no orange wash over the
          // basemap), hover still highlights unselected districts, and the selected
          // district gets no fill either - only its boundary line thickens.
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0,
            ["boolean", ["feature-state", "hover"], false],
            0.2,
            0,
          ],
        },
      });

      map.addLayer({
        id: STATE_DISTRICTS_LINE_LAYER_ID,
        type: "line",
        source: STATE_DISTRICTS_SOURCE_ID,
        paint: {
          // Vivid neon orange at full opacity with a slightly thicker stroke so district
          // borders glow clearly against the satellite imagery.
          "line-color": "#FF6600",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3.5,
            2,
          ],
          "line-opacity": 1,
        },
      });

      // District name labels - visibility toggled by updateBaseLabelVisibility, shown only
      // in the DISTRICT_LABEL_MIN_KM..DISTRICT_LABEL_MAX_KM scale-bar range.
      const districtLabelLayer: any = {
        id: STATE_DISTRICTS_LABELS_LAYER_ID,
        type: "symbol" as const,
        source: STATE_DISTRICTS_LABELS_SOURCE_ID,
        layout: {
          "text-field": ["get", "dtname"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-anchor": "center",
          visibility: "none",
        },
        paint: {
          "text-color": "#7c2d12",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      };
      map.addLayer(districtLabelLayer);
      map.addLayer(hoverLabelLayerSpec(districtLabelLayer));

      loadedDistrictsStateRef.current = normalized;
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error(`Failed to load district boundaries for "${stateName}":`, error);
    }
  };

  // Fetches and renders a state's assembly constituency boundaries from MinIO (via
  // /api/datasets/state-assembly). Triggered by clicking a state while the "Assembly
  // Constituency Boundaries" filter option is active. Hover/click handlers for the
  // resulting layer are registered once, up front, in the map's "load" handler below.
  const loadStateAssembly = async (map: MapLibreMap, stateName: string) => {
    const normalized = stateName.trim().toLowerCase();
    if (loadedAssemblyStateRef.current === normalized) return; // already showing

    try {
      const response = await fetch(`/api/datasets/state-assembly?state=${encodeURIComponent(stateName)}`);
      if (!response.ok) {
        console.warn(`No assembly constituency data available for "${stateName}"`);
        return;
      }
      const assemblyData = await response.json();

      clearStateBoundaryLayers(map);

      // generateId assigns each constituency a numeric id, addressable via setFeatureState
      // for hover/selection highlighting (same technique as the state/district layers).
      map.addSource(STATE_ASSEMBLY_SOURCE_ID, {
        type: "geojson",
        data: assemblyData,
        generateId: true,
      });

      map.addLayer({
        id: STATE_ASSEMBLY_FILL_LAYER_ID,
        type: "fill",
        source: STATE_ASSEMBLY_SOURCE_ID,
        paint: {
          "fill-color": "#22c55e",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.4,
            ["boolean", ["feature-state", "hover"], false],
            0.25,
            0.08,
          ],
        },
      });

      map.addLayer({
        id: STATE_ASSEMBLY_LINE_LAYER_ID,
        type: "line",
        source: STATE_ASSEMBLY_SOURCE_ID,
        paint: {
          "line-color": "#22c55e",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            2.5,
            1,
          ],
          "line-opacity": 0.9,
        },
      });

      loadedAssemblyStateRef.current = normalized;
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error(`Failed to load assembly constituency boundaries for "${stateName}":`, error);
    }
  };

  // Fetches and renders a state's parliamentary constituency boundaries from MinIO (via
  // /api/datasets/state-parliament). Triggered by clicking a state while the
  // "Parliamentary Constituency Boundaries" filter option is active. Hover/click handlers
  // for the resulting layer are registered once, up front, in the map's "load" handler below.
  const loadStateParliament = async (map: MapLibreMap, stateName: string) => {
    const normalized = stateName.trim().toLowerCase();
    if (loadedParliamentStateRef.current === normalized) return; // already showing

    try {
      const response = await fetch(`/api/datasets/state-parliament?state=${encodeURIComponent(stateName)}`);
      if (!response.ok) {
        console.warn(`No parliamentary constituency data available for "${stateName}"`);
        return;
      }
      const parliamentData = await response.json();

      clearStateBoundaryLayers(map);

      map.addSource(STATE_PARLIAMENT_SOURCE_ID, {
        type: "geojson",
        data: parliamentData,
        generateId: true,
      });

      map.addLayer({
        id: STATE_PARLIAMENT_FILL_LAYER_ID,
        type: "fill",
        source: STATE_PARLIAMENT_SOURCE_ID,
        paint: {
          "fill-color": "#ec4899",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.4,
            ["boolean", ["feature-state", "hover"], false],
            0.25,
            0.08,
          ],
        },
      });

      map.addLayer({
        id: STATE_PARLIAMENT_LINE_LAYER_ID,
        type: "line",
        source: STATE_PARLIAMENT_SOURCE_ID,
        paint: {
          "line-color": "#ec4899",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            2.5,
            1,
          ],
          "line-opacity": 0.9,
        },
      });

      loadedParliamentStateRef.current = normalized;
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error(`Failed to load parliamentary constituency boundaries for "${stateName}":`, error);
    }
  };

  // Loads all police-station jurisdiction polygons for a state from the same MinIO
  // administrative-boundary hierarchy used by the constituency layers.
  const loadStatePolice = async (map: MapLibreMap, stateName: string) => {
    const normalized = stateName.trim().toLowerCase();
    if (loadedPoliceStateRef.current === normalized) return;

    try {
      const response = await fetch(
        `/api/datasets/state-police-stations?state=${encodeURIComponent(stateName)}`,
      );
      if (!response.ok) {
        console.warn(`No police station boundary data available for "${stateName}"`);
        return;
      }
      const policeData = await response.json();

      clearStateBoundaryLayers(map);
      map.addSource(STATE_POLICE_SOURCE_ID, {
        type: "geojson",
        data: policeData,
        generateId: true,
      });
      map.addLayer({
        id: STATE_POLICE_FILL_LAYER_ID,
        type: "fill",
        source: STATE_POLICE_SOURCE_ID,
        paint: {
          "fill-color": "#8b5cf6",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.4,
            ["boolean", ["feature-state", "hover"], false],
            0.24,
            0.07,
          ],
        },
      });
      map.addLayer({
        id: STATE_POLICE_LINE_LAYER_ID,
        type: "line",
        source: STATE_POLICE_SOURCE_ID,
        paint: {
          "line-color": "#7c3aed",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            1.25,
          ],
          "line-opacity": 0.95,
        },
      });
      map.addLayer({
        id: STATE_POLICE_LABEL_LAYER_ID,
        type: "symbol",
        source: STATE_POLICE_SOURCE_ID,
        minzoom: 7,
        layout: {
          "text-field": ["coalesce", ["get", "PS_BOUNDName"], ["get", "_police_station"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 7, 10, 11, 13, 15, 16],
          "text-anchor": "center",
          "text-max-width": 12,
          "text-padding": 3,
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": "#32105f",
          "text-halo-color": "rgba(255, 255, 255, 0.96)",
          "text-halo-width": 2,
          "text-halo-blur": 0.4,
        },
      });

      loadedPoliceStateRef.current = normalized;
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error(`Failed to load police station boundaries for "${stateName}":`, error);
    }
  };

  const loadPoliceCoverage = async (map: MapLibreMap, folder: string) => {
    try {
      const response = await fetch(
        `/api/datasets/police-station-coverage?folder=${encodeURIComponent(folder)}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { hoblis, villages } = (await response.json()) as {
        hoblis: GeoJSON.FeatureCollection;
        villages: GeoJSON.FeatureCollection;
      };
      clearPoliceCoverage(map);

      map.addSource(POLICE_HOBLIES_SOURCE_ID, { type: "geojson", data: hoblis });
      map.addLayer({
        id: POLICE_HOBLIES_FILL_LAYER_ID,
        type: "fill",
        source: POLICE_HOBLIES_SOURCE_ID,
        minzoom: 8,
        paint: { "fill-color": "#f59e0b", "fill-opacity": 0.06 },
      });
      map.addLayer({
        id: POLICE_HOBLIES_LINE_LAYER_ID,
        type: "line",
        source: POLICE_HOBLIES_SOURCE_ID,
        minzoom: 8,
        paint: { "line-color": "#f59e0b", "line-width": 1.5, "line-opacity": 0.95 },
      });
      map.addLayer({
        id: POLICE_HOBLIES_LABEL_LAYER_ID,
        type: "symbol",
        source: POLICE_HOBLIES_SOURCE_ID,
        minzoom: 9,
        layout: {
          "text-field": ["get", "KGISHobliName"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-max-width": 10,
        },
        paint: {
          "text-color": "#7c2d12",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      map.addSource(POLICE_VILLAGES_SOURCE_ID, { type: "geojson", data: villages });
      map.addLayer({
        id: POLICE_VILLAGES_FILL_LAYER_ID,
        type: "fill",
        source: POLICE_VILLAGES_SOURCE_ID,
        minzoom: 10,
        paint: { "fill-color": "#06b6d4", "fill-opacity": 0.035 },
      });
      map.addLayer({
        id: POLICE_VILLAGES_LINE_LAYER_ID,
        type: "line",
        source: POLICE_VILLAGES_SOURCE_ID,
        minzoom: 10,
        paint: { "line-color": "#06b6d4", "line-width": 1, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: POLICE_VILLAGES_LABEL_LAYER_ID,
        type: "symbol",
        source: POLICE_VILLAGES_SOURCE_ID,
        minzoom: 11,
        layout: {
          "text-field": ["get", "KGISVillageName"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 11, 9, 15, 13],
          "text-max-width": 10,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#164e63",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.4,
        },
      });
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error(`Failed to load administrative coverage for ${folder}:`, error);
    }
  };

  // Fetches and renders a state's gram panchayat district boundaries from MinIO (via
  // /api/datasets/gram-panchayat-districts), e.g. Karnataka's KARNATAKA_DISTRICTS.geojson.
  // Triggered by clicking a state while the "Gram Panchayat Boundaries" filter option is
  // active. Hover handlers for the resulting layer are registered once, up front, in the
  // map's "load" handler below.
  const loadStateGramPanchayatDistricts = async (map: MapLibreMap, stateName: string) => {
    const normalized = stateName.trim().toLowerCase();
    if (loadedGpDistrictsStateRef.current === normalized) return; // already showing

    try {
      const response = await fetch(
        `/api/datasets/gram-panchayat-districts?state=${encodeURIComponent(stateName)}`
      );
      if (!response.ok) {
        console.warn(`No gram panchayat district data available for "${stateName}"`);
        return;
      }
      const districtsData = await response.json();

      clearGpDistricts(map);

      // generateId assigns each district a numeric id, addressable via setFeatureState for
      // hover highlighting (same technique as the other boundary layers).
      map.addSource(GP_DISTRICTS_SOURCE_ID, {
        type: "geojson",
        data: districtsData,
        generateId: true,
      });

      // Separate anchor-point source for the district name labels (one Point per district,
      // at the centroid of its largest polygon). The GP district files carry the same
      // dtname property as the administrative district files.
      map.addSource(GP_DISTRICTS_LABELS_SOURCE_ID, {
        type: "geojson",
        data: labelAnchorFeatures(districtsData, ["dtname"]),
        generateId: true,
      });

      map.addLayer({
        id: GP_DISTRICTS_FILL_LAYER_ID,
        type: "fill",
        source: GP_DISTRICTS_SOURCE_ID,
        paint: {
          "fill-color": "#FF6600",
          // Lines-only: the base opacity is 0 (no orange wash over the basemap), hover
          // still highlights an unselected district under the cursor. The selected
          // district gets NO fill and no hover highlight (checked first), so only its
          // boundary line thickens.
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0,
            ["boolean", ["feature-state", "hover"], false],
            0.2,
            0,
          ],
        },
      });

      map.addLayer({
        id: GP_DISTRICTS_LINE_LAYER_ID,
        type: "line",
        source: GP_DISTRICTS_SOURCE_ID,
        paint: {
          // Bright neon orange at full opacity with a slightly thicker stroke so the GP
          // district borders glow clearly against the satellite imagery.
          "line-color": "#FF6600",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3.5,
            2.5,
          ],
          "line-opacity": 1,
        },
      });

      // District name labels - visibility follows the GP mode in applyBoundaryLayerVisibility.
      const gpDistrictLabelLayer: any = {
        id: GP_DISTRICTS_LABELS_LAYER_ID,
        type: "symbol" as const,
        source: GP_DISTRICTS_LABELS_SOURCE_ID,
        layout: {
          "text-field": ["get", "dtname"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-anchor": "center",
          visibility: "none",
        },
        paint: {
          "text-color": "#7c2d12",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      };
      map.addLayer(gpDistrictLabelLayer);
      map.addLayer(hoverLabelLayerSpec(gpDistrictLabelLayer));

      loadedGpDistrictsStateRef.current = normalized;
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error(`Failed to load gram panchayat district boundaries for "${stateName}":`, error);
    }
  };

  // Fetches and renders a state's civic amenities district boundaries from MinIO (via
  // /api/datasets/civic-districts), e.g. Karnataka's KARNATAKA_DISTRICTS.geojson under
  // "Civic Amenities/India/Karnataka/". Triggered by clicking a state while the "Civic
  // Amenities" filter option is active. Hover handlers for the resulting layer are
  // registered once, up front, in the map's "load" handler below.
  const loadStateCivicDistricts = async (map: MapLibreMap, stateName: string) => {
    const normalized = stateName.trim().toLowerCase();
    if (loadedCivicDistrictsStateRef.current === normalized) return; // already showing

    try {
      const response = await fetch(
        `/api/datasets/civic-districts?state=${encodeURIComponent(stateName)}`
      );
      if (!response.ok) {
        console.warn(`No civic amenities district data available for "${stateName}"`);
        return;
      }
      const districtsData = await response.json();

      clearCivicDistricts(map);

      // generateId assigns each district a numeric id, addressable via setFeatureState for
      // hover highlighting (same technique as the other boundary layers).
      map.addSource(CIVIC_DISTRICTS_SOURCE_ID, {
        type: "geojson",
        data: districtsData,
        generateId: true,
      });

      // Separate anchor-point source for the district name labels (one Point per district,
      // at the centroid of its largest polygon). The civic district files carry the same
      // dtname property as the administrative district files.
      map.addSource(CIVIC_DISTRICTS_LABELS_SOURCE_ID, {
        type: "geojson",
        data: labelAnchorFeatures(districtsData, ["dtname"]),
        generateId: true,
      });

      map.addLayer({
        id: CIVIC_DISTRICTS_FILL_LAYER_ID,
        type: "fill",
        source: CIVIC_DISTRICTS_SOURCE_ID,
        paint: {
          "fill-color": "#FF6600",
          // Lines-only: the base opacity is 0 (no orange wash over the basemap), hover
          // still highlights an unselected district under the cursor. The selected
          // district gets NO fill and no hover highlight (checked first), so only its
          // boundary line thickens.
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0,
            ["boolean", ["feature-state", "hover"], false],
            0.2,
            0,
          ],
        },
      });

      map.addLayer({
        id: CIVIC_DISTRICTS_LINE_LAYER_ID,
        type: "line",
        source: CIVIC_DISTRICTS_SOURCE_ID,
        paint: {
          // Bright neon orange at full opacity with a slightly thicker stroke so the
          // civic district borders glow clearly against the satellite imagery.
          "line-color": "#FF6600",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3.5,
            2.5,
          ],
          "line-opacity": 1,
        },
      });

      // District name labels - visibility follows the civic mode in applyBoundaryLayerVisibility.
      const civicDistrictLabelLayer: any = {
        id: CIVIC_DISTRICTS_LABELS_LAYER_ID,
        type: "symbol" as const,
        source: CIVIC_DISTRICTS_LABELS_SOURCE_ID,
        layout: {
          "text-field": ["get", "dtname"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-anchor": "center",
          visibility: "none",
        },
        paint: {
          "text-color": "#7c2d12",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      };
      map.addLayer(civicDistrictLabelLayer);
      map.addLayer(hoverLabelLayerSpec(civicDistrictLabelLayer));

      loadedCivicDistrictsStateRef.current = normalized;
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error(`Failed to load civic amenities district boundaries for "${stateName}":`, error);
    }
  };

  // Fetches and renders a district's civic amenities pincode boundaries from MinIO (via
  // /api/datasets/civic-pincode-boundaries), e.g. Chikkamagaluru's
  // Chikkamagaluru_pincode_boundary.geojson under "Civic Amenities/India/<State>/Districts/".
  // Triggered by clicking a civic district while the "Civic Amenities" filter option is active.
  const loadDistrictCivicPincodes = async (
    map: MapLibreMap,
    districtName: string,
    stateName: string
  ) => {
    const normalized = districtName.trim().toLowerCase();
    if (loadedCivicPincodesDistrictRef.current === normalized) return; // already showing

    try {
      const response = await fetch(
        `/api/datasets/civic-pincode-boundaries?district=${encodeURIComponent(districtName)}&state=${encodeURIComponent(stateName)}`
      );
      if (!response.ok) {
        console.warn(`No civic amenities pincode data available for district "${districtName}"`);
        return;
      }
      const pincodesData = await response.json();

      clearCivicPincodes(map);

      map.addSource(CIVIC_PINCODES_SOURCE_ID, {
        type: "geojson",
        data: pincodesData,
        generateId: true,
      });

      // Separate anchor-point source for the pincode labels (one Point per pincode polygon,
      // at the centroid of its largest polygon). The pincode files carry a pin_code property.
      map.addSource(CIVIC_PINCODES_LABELS_SOURCE_ID, {
        type: "geojson",
        data: labelAnchorFeatures(pincodesData, ["pin_code"]),
        generateId: true,
      });

      map.addLayer({
        id: CIVIC_PINCODES_FILL_LAYER_ID,
        type: "fill",
        source: CIVIC_PINCODES_SOURCE_ID,
        paint: {
          "fill-color": "#EC4899",
          // Lines-only: the base opacity is 0 (no magenta wash over the basemap), hover
          // still highlights a pincode under the cursor.
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.2,
            0,
          ],
        },
      });

      map.addLayer({
        id: CIVIC_PINCODES_LINE_LAYER_ID,
        type: "line",
        source: CIVIC_PINCODES_SOURCE_ID,
        paint: {
          // Bright neon magenta at full opacity - one step deeper than the districts' neon
          // orange, so the civic hierarchy reads clearly.
          "line-color": "#EC4899",
          "line-width": 1.5,
          "line-opacity": 1,
        },
      });

      // Pincode labels - visible as soon as the pincode layer is loaded.
      const civicPincodeLabelLayer: any = {
        id: CIVIC_PINCODES_LABELS_LAYER_ID,
        type: "symbol" as const,
        source: CIVIC_PINCODES_LABELS_SOURCE_ID,
        layout: {
          "text-field": ["get", "pin_code"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10,
          "text-anchor": "center",
          visibility: "visible",
        },
        paint: {
          "text-color": "#831843",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      };
      map.addLayer(civicPincodeLabelLayer);
      map.addLayer(hoverLabelLayerSpec(civicPincodeLabelLayer));

      loadedCivicPincodesDistrictRef.current = normalized;
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error(`Failed to load civic amenities pincode boundaries for "${districtName}":`, error);
    }
  };

  // Fetches and renders a district's gram panchayat taluk boundaries from MinIO (via
  // /api/datasets/gram-panchayat-taluks). Triggered by clicking a GP district while the
  // "Gram Panchayat Boundaries" filter option is active.
  const loadDistrictGramPanchayatTaluks = async (
    map: MapLibreMap,
    districtName: string,
    stateName: string
  ) => {
    const normalized = districtName.trim().toLowerCase();
    if (loadedGpTaluksDistrictRef.current === normalized) return; // already showing

    try {
      const response = await fetch(
        `/api/datasets/gram-panchayat-taluks?district=${encodeURIComponent(districtName)}&state=${encodeURIComponent(stateName)}`
      );
      if (!response.ok) {
        console.warn(`No gram panchayat taluk data available for district "${districtName}"`);
        return;
      }
      const taluksData = await response.json();

      clearGpTaluks(map);

      map.addSource(GP_TALUKS_SOURCE_ID, {
        type: "geojson",
        data: taluksData,
        generateId: true,
      });

      // The GP taluk files carry both a taluk_panchayat name and a civil taluk name - use
      // the civil taluk name for the label anchor points (same name shown in the label).
      map.addSource(GP_TALUKS_LABELS_SOURCE_ID, {
        type: "geojson",
        data: labelAnchorFeatures(taluksData, ["kgis_civil_taluk_name", "taluk_panchayat"]),
        generateId: true,
      });

      map.addLayer({
        id: GP_TALUKS_FILL_LAYER_ID,
        type: "fill",
        source: GP_TALUKS_SOURCE_ID,
        paint: {
          "fill-color": "#A855F7",
          // Lines-only: the base opacity is 0 (no purple wash over the basemap), hover
          // still highlights an unselected taluk under the cursor. The selected taluk
          // gets NO fill and no hover highlight (checked first), so only its boundary
          // line thickens.
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0,
            ["boolean", ["feature-state", "hover"], false],
            0.2,
            0,
          ],
        },
      });

      map.addLayer({
        id: GP_TALUKS_LINE_LAYER_ID,
        type: "line",
        source: GP_TALUKS_SOURCE_ID,
        paint: {
          // Bright neon purple at full opacity - one step deeper than the districts' neon
          // orange, so the GP hierarchy reads clearly.
          "line-color": "#A855F7",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3.5,
            2,
          ],
          "line-opacity": 1,
        },
      });

      // Taluk name labels - visible as soon as the taluk layer is loaded.
      const gpTalukLabelLayer: any = {
        id: GP_TALUKS_LABELS_LAYER_ID,
        type: "symbol" as const,
        source: GP_TALUKS_LABELS_SOURCE_ID,
        layout: {
          "text-field": ["get", "kgis_civil_taluk_name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-anchor": "center",
          visibility: "visible",
        },
        paint: {
          "text-color": "#4c1d95",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      };
      map.addLayer(gpTalukLabelLayer);
      map.addLayer(hoverLabelLayerSpec(gpTalukLabelLayer));

      loadedGpTaluksDistrictRef.current = normalized;
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error(`Failed to load gram panchayat taluk boundaries for "${districtName}":`, error);
    }
  };

  // Fetches and renders a taluk's gram panchayat boundaries from MinIO (via
  // /api/datasets/gram-panchayat-boundaries). Triggered by clicking a GP taluk while the
  // "Gram Panchayat Boundaries" filter option is active.
  const loadTalukGramPanchayatBoundaries = async (
    map: MapLibreMap,
    talukName: string,
    districtName: string,
    stateName: string
  ) => {
    const normalized = talukName.trim().toLowerCase();
    if (loadedGpBoundariesTalukRef.current === normalized) return; // already showing

    try {
      const response = await fetch(
        `/api/datasets/gram-panchayat-boundaries?taluk=${encodeURIComponent(talukName)}&district=${encodeURIComponent(districtName)}&state=${encodeURIComponent(stateName)}`
      );
      if (!response.ok) {
        console.warn(`No gram panchayat boundaries data available for taluk "${talukName}"`);
        return;
      }
      const boundariesData = await response.json();

      clearGpBoundaries(map);

      map.addSource(GP_BOUNDARIES_SOURCE_ID, {
        type: "geojson",
        data: boundariesData,
        generateId: true,
      });

      // One label anchor point per gram panchayat, at the centroid of its largest polygon.
      map.addSource(GP_BOUNDARIES_LABELS_SOURCE_ID, {
        type: "geojson",
        data: labelAnchorFeatures(boundariesData, ["gram_panchayat", "name"]),
        generateId: true,
      });

      map.addLayer({
        id: GP_BOUNDARIES_FILL_LAYER_ID,
        type: "fill",
        source: GP_BOUNDARIES_SOURCE_ID,
        paint: {
          "fill-color": "#FFEA00",
          // Lines-only: the base opacity is 0 (no yellow wash over the basemap), hover
          // still highlights the gram panchayat under the cursor.
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.2,
            0,
          ],
        },
      });

      map.addLayer({
        id: GP_BOUNDARIES_LINE_LAYER_ID,
        type: "line",
        source: GP_BOUNDARIES_SOURCE_ID,
        paint: {
          // Bright neon yellow at full opacity - one step deeper than the taluks' neon
          // purple, so the GP hierarchy reads clearly (orange districts -> purple taluks
          // -> neon yellow gram panchayats).
          "line-color": "#FFEA00",
          "line-width": 2,
          "line-opacity": 1,
        },
      });

      // Gram panchayat name labels - visible as soon as the layer is loaded.
      const gpBoundaryLabelLayer: any = {
        id: GP_BOUNDARIES_LABELS_LAYER_ID,
        type: "symbol" as const,
        source: GP_BOUNDARIES_LABELS_SOURCE_ID,
        layout: {
          "text-field": ["get", "gram_panchayat"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10,
          "text-anchor": "center",
          visibility: "visible",
        },
        paint: {
          "text-color": "#7c5e00",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      };
      map.addLayer(gpBoundaryLabelLayer);
      map.addLayer(hoverLabelLayerSpec(gpBoundaryLabelLayer));

      loadedGpBoundariesTalukRef.current = normalized;
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error(`Failed to load gram panchayat boundaries for taluk "${talukName}":`, error);
    }
  };

  const clearTalukHoblies = (map: MapLibreMap) => {
    clearHobliVillages(map);
    if (map.getLayer(TALUK_HOBLIES_FILL_LAYER_ID)) map.removeLayer(TALUK_HOBLIES_FILL_LAYER_ID);
    if (map.getLayer(TALUK_HOBLIES_LINE_LAYER_ID)) map.removeLayer(TALUK_HOBLIES_LINE_LAYER_ID);
    removeLabelLayer(map, TALUK_HOBLIES_LABELS_LAYER_ID);
    if (map.getSource(TALUK_HOBLIES_SOURCE_ID)) map.removeSource(TALUK_HOBLIES_SOURCE_ID);
    if (map.getSource(TALUK_HOBLIES_LABELS_SOURCE_ID)) map.removeSource(TALUK_HOBLIES_LABELS_SOURCE_ID);
    loadedHobliesTalukRef.current = null;
    selectedHobliIdRef.current = null;
    loadedHobliesDataRef.current = null;
  };

  // Restores the pristine (hole-free) ancestor fill data when the cadastral view clears.
  const restoreAncestorFills = (map: MapLibreMap) => {
    const sources: Array<[string, GeoJSON.FeatureCollection | null]> = [
      [STATE_SOURCE_ID, loadedStatesDataRef.current],
      [STATE_DISTRICTS_SOURCE_ID, loadedDistrictsDataRef.current],
      [DISTRICT_TALUKS_SOURCE_ID, loadedTaluksDataRef.current],
      [TALUK_HOBLIES_SOURCE_ID, loadedHobliesDataRef.current],
    ];
    for (const [sourceId, pristine] of sources) {
      if (!pristine) continue;
      const source = map.getSource(sourceId);
      if (source && "setData" in source) {
        (source as GeoJSONSource).setData(pristine);
      }
    }
  };

  // Punches the selected village polygon as a hole into each ancestor fill layer's geometry
  // (state → district → taluk → hobli), so those fills stay visible everywhere EXCEPT inside
  // the selected village - where the cadastral grid and the basemap underneath show through
  // clearly. Only the source data is swapped (from the pristine refs), so feature ids and
  // hover/selection states are untouched; restoreAncestorFills reverses it on clear.
  const applyVillageCutout = (map: MapLibreMap, villageGeometry: GeoJSON.Geometry) => {
    const sources: Array<[string, GeoJSON.FeatureCollection | null]> = [
      [STATE_SOURCE_ID, loadedStatesDataRef.current],
      [STATE_DISTRICTS_SOURCE_ID, loadedDistrictsDataRef.current],
      [DISTRICT_TALUKS_SOURCE_ID, loadedTaluksDataRef.current],
      [TALUK_HOBLIES_SOURCE_ID, loadedHobliesDataRef.current],
    ];
    for (const [sourceId, pristine] of sources) {
      if (!pristine) continue;
      const source = map.getSource(sourceId);
      if (!source || !("setData" in source)) continue;
      (source as GeoJSONSource).setData(withVillageHole(pristine, villageGeometry));
    }
  };

  const clearVillageCadastrals = (map: MapLibreMap) => {
    if (map.getLayer(VILLAGE_CADASTRALS_FILL_LAYER_ID)) map.removeLayer(VILLAGE_CADASTRALS_FILL_LAYER_ID);
    if (map.getLayer(VILLAGE_CADASTRALS_LINE_LAYER_ID)) map.removeLayer(VILLAGE_CADASTRALS_LINE_LAYER_ID);
    if (map.getLayer(VILLAGE_CADASTRALS_LABELS_LAYER_ID)) map.removeLayer(VILLAGE_CADASTRALS_LABELS_LAYER_ID);
    if (map.getSource(VILLAGE_CADASTRALS_SOURCE_ID)) map.removeSource(VILLAGE_CADASTRALS_SOURCE_ID);
    loadedCadastralsVillageRef.current = null;
    loadedCadastralsDataRef.current = null;
    // Restore the ancestor drill fills now that the cadastral view is gone.
    restoreAncestorFills(map);
  };

  const clearHobliVillages = (map: MapLibreMap) => {
    clearVillageCadastrals(map);
    if (map.getLayer(HOBLI_VILLAGES_FILL_LAYER_ID)) map.removeLayer(HOBLI_VILLAGES_FILL_LAYER_ID);
    if (map.getLayer(HOBLI_VILLAGES_LINE_LAYER_ID)) map.removeLayer(HOBLI_VILLAGES_LINE_LAYER_ID);
    removeLabelLayer(map, HOBLI_VILLAGES_LABELS_LAYER_ID);
    if (map.getSource(HOBLI_VILLAGES_SOURCE_ID)) map.removeSource(HOBLI_VILLAGES_SOURCE_ID);
    if (map.getSource(HOBLI_VILLAGES_LABELS_SOURCE_ID)) map.removeSource(HOBLI_VILLAGES_LABELS_SOURCE_ID);
    loadedVillagesHobliRef.current = null;
    selectedVillageIdRef.current = null;
    selectedVillageNameRef.current = null;
    loadedVillagesDataRef.current = null;
    selectedHobliNameRef.current = null;
  };

  const clearDistrictTaluks = (map: MapLibreMap) => {
    clearTalukHoblies(map);
    if (map.getLayer(DISTRICT_TALUKS_FILL_LAYER_ID)) map.removeLayer(DISTRICT_TALUKS_FILL_LAYER_ID);
    if (map.getLayer(DISTRICT_TALUKS_LINE_LAYER_ID)) map.removeLayer(DISTRICT_TALUKS_LINE_LAYER_ID);
    removeLabelLayer(map, DISTRICT_TALUKS_LABELS_LAYER_ID);
    if (map.getSource(DISTRICT_TALUKS_SOURCE_ID)) map.removeSource(DISTRICT_TALUKS_SOURCE_ID);
    if (map.getSource(DISTRICT_TALUKS_LABELS_SOURCE_ID)) map.removeSource(DISTRICT_TALUKS_LABELS_SOURCE_ID);
    loadedTaluksDistrictRef.current = null;
    selectedTalukIdRef.current = null;
    loadedTaluksDataRef.current = null;
  };

  // Fetches and renders a district's taluk/subdistrict boundaries from MinIO
  // (via /api/datasets/district-taluks). Triggered by clicking an already-selected
  // district a second time.
  const loadDistrictTaluks = async (
    map: MapLibreMap,
    districtName: string,
    stateName: string,
    data?: GeoJSON.FeatureCollection
  ) => {
    const normalized = districtName.trim().toLowerCase();
    if (loadedTaluksDistrictRef.current === normalized) return; // already showing
    const generation = drillGenerationRef.current; // stale-load guard for undo/redo

    console.log(`Loading taluks for district: ${districtName}, state: ${stateName}`);

    try {
      const url = `/api/datasets/district-taluks?district=${encodeURIComponent(districtName)}&state=${encodeURIComponent(stateName)}`;
      console.log(`Fetching taluks from: ${url}`);
      
      let taluksData: GeoJSON.FeatureCollection;
      if (data) {
        taluksData = data; // restore path: rebuild from the stored snapshot
      } else {
        const response = await fetch(url);
        
        console.log(`Taluk fetch response status: ${response.status}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`No taluk data available for district "${districtName}":`, errorText);
          return;
        }
        
        taluksData = await response.json();
        console.log(`Taluk data loaded, features count:`, taluksData.features?.length);
        
        // Log all taluk feature names and their codes for debugging
        if (taluksData.features) {
          console.log(`[DEBUG] All loaded taluk features:`);
          taluksData.features.forEach((f: any, idx: number) => {
            console.log(`  ${idx + 1}. KGISTalukName="${f.properties?.KGISTalukName}", KGISTalukCode="${f.properties?.KGISTalukCode}", subdist_nm="${f.properties?.subdist_nm}"`);
          });
        }
      }
      // An undo/redo happened while this load was in flight - drop the stale result.
      if (generation !== drillGenerationRef.current) return;

      clearDistrictTaluks(map);
      // clearDistrictTaluks resets this ref - set it back after the clear so
      // selectTalukByName and the undo/redo snapshots can look the data up.
      loadedTaluksDataRef.current = taluksData;

      map.addSource(DISTRICT_TALUKS_SOURCE_ID, {
        type: "geojson",
        data: taluksData,
        generateId: true,
      });

      // Separate anchor-point source for the taluk name labels (one Point per taluk, at the
      // centroid of its largest polygon) so multi-part taluks render one label.
      map.addSource(DISTRICT_TALUKS_LABELS_SOURCE_ID, {
        type: "geojson",
        data: labelAnchorFeatures(taluksData, ["KGISTalukName", "subdist_nm", "name"]),
        generateId: true,
      });

      map.addLayer({
        id: DISTRICT_TALUKS_FILL_LAYER_ID,
        type: "fill",
        source: DISTRICT_TALUKS_SOURCE_ID,
        paint: {
          "fill-color": "#C084FC",
          // Base and selected states stay fill-free (no purple wash over the satellite
          // basemap), but hovering a taluk shows the same subtle highlight the district
          // layer uses, so taluks read as hoverable. The invisible base fill still catches
          // pointer events for hover/click.
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0,
            ["boolean", ["feature-state", "hover"], false],
            0.2,
            0,
          ],
        },
      });

      map.addLayer({
        id: DISTRICT_TALUKS_LINE_LAYER_ID,
        type: "line",
        source: DISTRICT_TALUKS_SOURCE_ID,
        paint: {
          // Bright neon purple (matching the brightness treatment of the state and district
          // borders) at full opacity with a slightly thicker stroke so taluk borders glow
          // clearly against the satellite imagery.
          "line-color": "#C084FC",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3.5,
            2,
          ],
          "line-opacity": 1,
        },
      });

      // Taluk name labels - visible as soon as the taluk layer is loaded (no zoom band;
      // hidden only when applyBoundaryLayerVisibility hides the taluk layers themselves).
      const talukLabelLayer: any = {
        id: DISTRICT_TALUKS_LABELS_LAYER_ID,
        type: "symbol" as const,
        source: DISTRICT_TALUKS_LABELS_SOURCE_ID,
        layout: {
          "text-field": ["get", "KGISTalukName"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-anchor": "center",
          visibility: "visible",
        },
        paint: {
          "text-color": "#4c1d95",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      };
      map.addLayer(talukLabelLayer);
      map.addLayer(hoverLabelLayerSpec(talukLabelLayer));

      loadedTaluksDistrictRef.current = normalized;
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error(`Failed to load taluk boundaries for "${districtName}":`, error);
    }
  };

  // Fetches and renders a taluk's hobli boundaries from MinIO (via
  // /api/datasets/taluk-hoblies). Triggered by clicking a taluk once its district's
  // taluk layer is loaded.
  const loadTalukHoblies = async (
    map: MapLibreMap,
    talukName: string,
    districtName: string,
    stateName: string,
    clickedGeometry?: GeoJSON.Geometry,
    data?: GeoJSON.FeatureCollection
  ) => {
    const normalized = talukName.trim().toLowerCase();
    if (loadedHobliesTalukRef.current === normalized) return; // already showing
    const generation = drillGenerationRef.current; // stale-load guard for undo/redo

    console.log(`Loading hoblies for taluk: ${talukName}, district: ${districtName}, state: ${stateName}`);

    // If we have clicked geometry, include it in the request for better matching
    // Add cache-busting timestamp to prevent stale data
    const cacheBust = Date.now();
    const url = `/api/datasets/taluk-hoblies?taluk=${encodeURIComponent(talukName)}&district=${encodeURIComponent(districtName)}&state=${encodeURIComponent(stateName)}&_t=${cacheBust}`;
    
    try {
      let hobliesData: GeoJSON.FeatureCollection;
      if (data) {
        hobliesData = data; // restore path: rebuild from the stored snapshot
      } else {
        const response = await fetch(url, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`No hobli data available for taluk "${talukName}":`, errorText);
          return;
        }

        hobliesData = await response.json();
        console.log(`Hobli data loaded, features count:`, hobliesData.features?.length);
      }
      // An undo/redo happened while this load was in flight - drop the stale result.
      if (generation !== drillGenerationRef.current) return;

      clearTalukHoblies(map);
      // clearTalukHoblies resets this ref - set it back so the undo/redo snapshots
      // capture the hoblie data.
      loadedHobliesDataRef.current = hobliesData;

      map.addSource(TALUK_HOBLIES_SOURCE_ID, {
        type: "geojson",
        data: hobliesData,
        generateId: true,
      });

      map.addLayer({
        id: TALUK_HOBLIES_FILL_LAYER_ID,
        type: "fill",
        source: TALUK_HOBLIES_SOURCE_ID,
        paint: {
          "fill-color": "#ffff00",
          // Base and selected states stay fill-free (no yellow wash over the satellite
          // basemap), but hovering a hobli shows the same subtle highlight the district
          // and taluk layers use, so hoblies read as hoverable. The invisible base fill
          // still catches pointer events for hover/click.
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0,
            ["boolean", ["feature-state", "hover"], false],
            0.2,
            0,
          ],
        },
      });

      map.addLayer({
        id: TALUK_HOBLIES_LINE_LAYER_ID,
        type: "line",
        source: TALUK_HOBLIES_SOURCE_ID,
        paint: {
          // Bright neon yellow, fully opaque with a thicker stroke so hobli borders pop
          // against both the beige default basemap and satellite terrain.
          "line-color": "#FFFF00",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3.5,
            2,
          ],
          "line-opacity": 1,
        },
      });

      // Hobli name labels - one anchor Point per hobli (see labelAnchorFeatures), visible
      // as soon as the hobli layer is loaded (no zoom band; hidden only when
      // applyBoundaryLayerVisibility hides the hobli layers themselves).
      map.addSource(TALUK_HOBLIES_LABELS_SOURCE_ID, {
        type: "geojson",
        data: labelAnchorFeatures(hobliesData, ["KGISHobliName", "hobli_name", "name"]),
        generateId: true,
      });

      const hobliLabelLayer: any = {
        id: TALUK_HOBLIES_LABELS_LAYER_ID,
        type: "symbol" as const,
        source: TALUK_HOBLIES_LABELS_SOURCE_ID,
        layout: {
          "text-field": ["get", "KGISHobliName"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10,
          "text-anchor": "center",
          visibility: "visible",
        },
        paint: {
          "text-color": "#854d0e",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      };
      map.addLayer(hobliLabelLayer);
      map.addLayer(hoverLabelLayerSpec(hobliLabelLayer));

      loadedHobliesTalukRef.current = normalized;
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error(`Failed to load hobli boundaries for "${talukName}":`, error);
    }
  };

  // Fetches and renders a hobli's village boundaries from MinIO (via
  // /api/datasets/hobli-villages). Triggered by clicking a hobli once its taluk's
  // hobli layer is loaded.
  const loadHobliVillages = async (
    map: MapLibreMap,
    hobliName: string,
    talukName: string,
    districtName: string,
    stateName: string,
    data?: GeoJSON.FeatureCollection
  ) => {
    const normalized = hobliName.trim().toLowerCase();
    if (loadedVillagesHobliRef.current === normalized) return; // already showing
    const generation = drillGenerationRef.current; // stale-load guard for undo/redo

    console.log(`Loading villages for hobli: ${hobliName}, taluk: ${talukName}, district: ${districtName}, state: ${stateName}`);

    // Add cache-busting timestamp to prevent stale data
    const cacheBust = Date.now();
    const url = `/api/datasets/hobli-villages?hobli=${encodeURIComponent(hobliName)}&taluk=${encodeURIComponent(talukName)}&district=${encodeURIComponent(districtName)}&state=${encodeURIComponent(stateName)}&_t=${cacheBust}`;
    
    try {
      let villagesData: GeoJSON.FeatureCollection;
      if (data) {
        villagesData = data; // restore path: rebuild from the stored snapshot
      } else {
        const response = await fetch(url, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`No village data available for hobli "${hobliName}":`, errorText);
          return;
        }

        villagesData = await response.json();
        console.log(`Village data loaded, features count:`, villagesData.features?.length);
      }
      // An undo/redo happened while this load was in flight - drop the stale result.
      if (generation !== drillGenerationRef.current) return;

      clearHobliVillages(map);
      // clearHobliVillages resets these refs - set them back after the clear so the
      // undo/redo snapshots capture the village data and the parent hobli name.
      loadedVillagesDataRef.current = villagesData;
      selectedHobliNameRef.current = hobliName;

      map.addSource(HOBLI_VILLAGES_SOURCE_ID, {
        type: "geojson",
        data: villagesData,
        generateId: true,
      });

      map.addLayer({
        id: HOBLI_VILLAGES_FILL_LAYER_ID,
        type: "fill",
        source: HOBLI_VILLAGES_SOURCE_ID,
        paint: {
          "fill-color": "#ff073a",
          // Base and selected states stay fill-free (no red wash over the satellite basemap
          // or the cadastral survey grid beneath), but hovering a village shows the same
          // subtle highlight the other boundary layers use, so villages read as hoverable.
          // The invisible base fill still catches pointer events for hover/click.
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0,
            ["boolean", ["feature-state", "hover"], false],
            0.2,
            0,
          ],
        },
      });

      map.addLayer({
        id: HOBLI_VILLAGES_LINE_LAYER_ID,
        type: "line",
        source: HOBLI_VILLAGES_SOURCE_ID,
        paint: {
          "line-color": "#ff073a",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            1.5,
          ],
          "line-opacity": 0.95,
        },
      });

      // Village name labels - the MinIO source files use varying schemas, so pick the
      // first name property that actually exists on the data (preference order in
      // VILLAGE_NAME_KEYS), then drive both the anchor source and the text-field with it.
      const firstVillageProps = villagesData.features[0]?.properties ?? {};
      const villageNameKey =
        VILLAGE_NAME_KEYS.find((key) => typeof firstVillageProps[key] === "string") ?? "name";

      map.addSource(HOBLI_VILLAGES_LABELS_SOURCE_ID, {
        type: "geojson",
        data: labelAnchorFeatures(villagesData, [villageNameKey]),
        generateId: true,
      });

      const villageLabelLayer: any = {
        id: HOBLI_VILLAGES_LABELS_LAYER_ID,
        type: "symbol" as const,
        source: HOBLI_VILLAGES_LABELS_SOURCE_ID,
        layout: {
          "text-field": ["get", villageNameKey],
          "text-font": ["Noto Sans Regular"],
          "text-size": 9.5,
          "text-anchor": "center",
          visibility: "visible",
        },
        paint: {
          "text-color": "#7f1d1d",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      };
      map.addLayer(villageLabelLayer);
      map.addLayer(hoverLabelLayerSpec(villageLabelLayer));

      loadedVillagesHobliRef.current = normalized;
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error(`Failed to load village boundaries for "${hobliName}":`, error);
    }
  };

  // Loads a village's cadastral (survey/parcel) boundaries from MinIO (via
  // /api/datasets/village-cadastrals) and renders them as a thin-line overlay. Cadastral
  // files can be large (thousands of parcels), so only line + a faint fill are used - no
  // labels. `data` is the undo/redo restore path: rebuild the layer from a stored snapshot
  // without refetching.
  const loadVillageCadastrals = async (
    map: MapLibreMap,
    villageName: string,
    hobliName: string,
    talukName: string,
    districtName: string,
    stateName: string,
    data?: GeoJSON.FeatureCollection
  ) => {
    const normalized = villageName.trim().toLowerCase();
    if (loadedCadastralsVillageRef.current === normalized) return; // already showing
    const generation = drillGenerationRef.current; // stale-load guard for undo/redo

    console.log(`Loading cadastrals for village: ${villageName}, hobli: ${hobliName}, taluk: ${talukName}, district: ${districtName}, state: ${stateName}`);

    const cacheBust = Date.now();
    const url = `/api/datasets/village-cadastrals?village=${encodeURIComponent(villageName)}&hobli=${encodeURIComponent(hobliName)}&taluk=${encodeURIComponent(talukName)}&district=${encodeURIComponent(districtName)}&state=${encodeURIComponent(stateName)}&_t=${cacheBust}`;

    try {
      let cadastralData: GeoJSON.FeatureCollection;
      if (data) {
        cadastralData = data; // restore path: rebuild from the stored snapshot
      } else {
        const response = await fetch(url, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`No cadastral data available for village "${villageName}":`, errorText);
          return;
        }

        cadastralData = await response.json();
        console.log(`Cadastral data loaded, features count:`, cadastralData.features?.length);
      }
      // An undo/redo happened while this load was in flight - drop the stale result.
      if (generation !== drillGenerationRef.current) return;

      clearVillageCadastrals(map);
      // clearVillageCadastrals resets these refs - set them back after the clear so the
      // undo/redo snapshots capture the cadastral data and the parent village name.
      loadedCadastralsDataRef.current = cadastralData;
      loadedCadastralsVillageRef.current = normalized;

      map.addSource(VILLAGE_CADASTRALS_SOURCE_ID, {
        type: "geojson",
        data: cadastralData,
        generateId: true,
      });

      // Invisible hit-test fill: fill-opacity 0 keeps the satellite basemap visible while
      // still letting right-clicks (and the attribute popup's queryRenderedFeatures) hit
      // any point inside a parcel box, not just the 0.8px border lines.
      map.addLayer({
        id: VILLAGE_CADASTRALS_FILL_LAYER_ID,
        type: "fill",
        source: VILLAGE_CADASTRALS_SOURCE_ID,
        paint: {
          // Invisible until a parcel is hovered, then tints the parcel box (see
          // applyCadastralColors for the mode-dependent highlight color).
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            CADASTRAL_COLORS.standard.hoverFill,
            CADASTRAL_COLORS.standard.fill,
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            CADASTRAL_COLORS.standard.hoverOpacity,
            0,
          ],
        },
      });

      map.addLayer({
        id: VILLAGE_CADASTRALS_LINE_LAYER_ID,
        type: "line",
        source: VILLAGE_CADASTRALS_SOURCE_ID,
        paint: {
          "line-color": CADASTRAL_COLORS.standard.line,
          // The hovered parcel's border thickens so the highlight reads on both basemaps.
          "line-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            CADASTRAL_COLORS.standard.hoverLineWidth,
            CADASTRAL_COLORS.standard.lineWidth,
          ],
          "line-opacity": CADASTRAL_COLORS.standard.lineOpacity,
        },
      });

      // Survey-number labels: one per parcel, centered inside its box, reading the
      // Surveynumber_Old attribute (e.g. "535"). The symbol layer shares the cadastral
      // source, so MapLibre places each label at the parcel polygon's centroid. Tiny
      // parcels whose labels would collide with a neighbor's get dropped by MapLibre's
      // collision detection rather than overlapping.
      map.addLayer({
        id: VILLAGE_CADASTRALS_LABELS_LAYER_ID,
        type: "symbol",
        source: VILLAGE_CADASTRALS_SOURCE_ID,
        layout: {
          "text-field": ["get", "Surveynumber_Old"],
          "text-font": ["Noto Sans Regular"],
          // Survey numbers scale with the cadastral zoom range: small at the village
          // overview (so dense parcels don't collide), growing at deep zoom where parcels
          // fill the screen.
          "text-size": ["interpolate", ["linear"], ["zoom"], 13, 6, 15, 9, 17, 12],
          "text-anchor": "center",
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          visibility: "visible",
        },
        paint: {
          "text-color": CADASTRAL_COLORS.standard.text,
          "text-halo-color": CADASTRAL_COLORS.standard.halo,
          "text-halo-width": CADASTRAL_COLORS.standard.haloWidth,
        },
      });

      // Cut the selected village polygon out of the ancestor fill layers (state/district/
      // taluk/hobli) so its cadastral grid and the basemap underneath stay clearly visible
      // inside the village - while the overlays remain everywhere else. The village geometry
      // is looked up from the loaded village layer by name (restore path included).
      if (loadedVillagesDataRef.current) {
        const firstProps = loadedVillagesDataRef.current.features[0]?.properties ?? {};
        const villageKey =
          VILLAGE_NAME_KEYS.find((key) => typeof firstProps[key] === "string") ?? "name";
        const villageFeature = loadedVillagesDataRef.current.features.find(
          (f) => (f.properties?.[villageKey] ?? "").trim().toLowerCase() === normalized
        );
        if (villageFeature?.geometry) {
          applyVillageCutout(map, villageFeature.geometry);
        }
      }
      // Recolor the parcel grid for the active basemap (white/bright on satellite).
      applyCadastralColors(map, currentLayerRef.current === "satellite");
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error(`Failed to load cadastral boundaries for "${villageName}":`, error);
    }
  };

  // --- Undo/redo for the administrative-boundary drill-down (Ctrl+Z / Ctrl+Y) ---
  // Captures the current drill state (selection at every level + camera). A level is only
  // included once its layer is actually loaded, so an undo naturally walks the drill back
  // one step at a time.
  const captureDrillSnapshot = (map: MapLibreMap): DrillSnapshot => {
    const center = map.getCenter();
    const level = (
      loaded: string | null,
      parent: string,
      selectedId: string | number | null,
      selectedName: string | null,
      data: GeoJSON.FeatureCollection | null
    ): DrillLevel | null =>
      loaded && data ? { parent, selectedId, selectedName, data } : null;

    return {
      state: selectedStateNameRef.current,
      stateId: selectedStateIdRef.current,
      districts: level(
        loadedDistrictsStateRef.current,
        selectedStateNameRef.current ?? "",
        selectedDistrictIdRef.current,
        selectedDistrictNameRef.current,
        loadedDistrictsDataRef.current
      ),
      taluks: level(
        loadedTaluksDistrictRef.current,
        selectedDistrictNameRef.current ?? "",
        selectedTalukIdRef.current,
        selectedTalukNameRef.current,
        loadedTaluksDataRef.current
      ),
      hoblies: level(
        loadedHobliesTalukRef.current,
        selectedTalukNameRef.current ?? "",
        selectedHobliIdRef.current,
        selectedHobliNameRef.current,
        loadedHobliesDataRef.current
      ),
      villages: level(
        loadedVillagesHobliRef.current,
        selectedHobliNameRef.current ?? "",
        selectedVillageIdRef.current,
        selectedVillageNameRef.current,
        loadedVillagesDataRef.current
      ),
      cadastrals: level(
        loadedCadastralsVillageRef.current,
        selectedVillageNameRef.current ?? "",
        null,
        null,
        loadedCadastralsDataRef.current
      ),
      camera: {
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      },
    };
  };

  // Compact fingerprint of one level for snapshot comparison (camera is deliberately
  // excluded so a failed search - which moves the camera but changes no selection - doesn't
  // leave a no-op undo step).
  const drillLevelFingerprint = (level: DrillLevel | null): string =>
    level
      ? `${level.parent}|${level.selectedId}|${level.selectedName}|${level.data.features.length}`
      : "∅";

  const drillSnapshotsEqual = (a: DrillSnapshot, b: DrillSnapshot): boolean =>
    a.state === b.state &&
    a.stateId === b.stateId &&
    drillLevelFingerprint(a.districts) === drillLevelFingerprint(b.districts) &&
    drillLevelFingerprint(a.taluks) === drillLevelFingerprint(b.taluks) &&
    drillLevelFingerprint(a.hoblies) === drillLevelFingerprint(b.hoblies) &&
    drillLevelFingerprint(a.villages) === drillLevelFingerprint(b.villages) &&
    drillLevelFingerprint(a.cadastrals) === drillLevelFingerprint(b.cadastrals);

  // Records the current state as the undo target before a drill action runs. A new action
  // invalidates the redo branch.
  const recordDrillAction = (map: MapLibreMap) => {
    const stack = drillUndoStackRef.current;
    stack.push(captureDrillSnapshot(map));
    if (stack.length > 50) stack.shift();
    drillRedoStackRef.current = [];
  };

  // Rebuilds the drill layers/selection from a snapshot without refetching (the raw data is
  // stored in the snapshot itself). Clears everything first, then re-applies each loaded
  // level and re-selects the same features (generateId'd ids are deterministic for
  // identical data).
  const applyDrillSnapshot = (map: MapLibreMap, snap: DrillSnapshot) => {
    // Drop any boundary fetch that was in flight before the undo/redo started.
    drillGenerationRef.current++;

    // Reset every drill layer + selection ref.
    clearStateBoundaryLayers(map);
    clearDistrictTaluks(map);

    if (snap.state) {
      selectedStateNameRef.current = snap.state;
      if (snap.stateId !== null) {
        selectedStateIdRef.current = snap.stateId;
        map.setFeatureState(
          { source: STATE_SOURCE_ID, id: snap.stateId },
          { selected: true }
        );
      } else if (!selectStateByName(map, snap.state)) {
        selectedStateNameRef.current = null;
      }
    }

    if (snap.districts) {
      void loadStateDistricts(map, snap.state ?? snap.districts.parent, snap.districts.data);
      selectedDistrictIdRef.current = snap.districts.selectedId;
      selectedDistrictNameRef.current = snap.districts.selectedName;
      if (snap.districts.selectedId !== null) {
        map.setFeatureState(
          { source: STATE_DISTRICTS_SOURCE_ID, id: snap.districts.selectedId },
          { selected: true }
        );
      }
    }

    if (snap.taluks) {
      void loadDistrictTaluks(map, snap.taluks.parent, snap.state ?? "", snap.taluks.data);
      selectedTalukIdRef.current = snap.taluks.selectedId;
      selectedTalukNameRef.current = snap.taluks.selectedName;
      if (snap.taluks.selectedId !== null) {
        map.setFeatureState(
          { source: DISTRICT_TALUKS_SOURCE_ID, id: snap.taluks.selectedId },
          { selected: true }
        );
      }
    }

    if (snap.hoblies) {
      void loadTalukHoblies(
        map,
        snap.hoblies.parent,
        snap.taluks?.parent ?? "",
        snap.state ?? "",
        undefined,
        snap.hoblies.data
      );
      selectedHobliIdRef.current = snap.hoblies.selectedId;
      selectedHobliNameRef.current = snap.hoblies.selectedName;
      if (snap.hoblies.selectedId !== null) {
        map.setFeatureState(
          { source: TALUK_HOBLIES_SOURCE_ID, id: snap.hoblies.selectedId },
          { selected: true }
        );
      }
    }

    if (snap.villages) {
      void loadHobliVillages(
        map,
        snap.villages.parent,
        snap.hoblies?.parent ?? "",
        snap.taluks?.parent ?? "",
        snap.state ?? "",
        snap.villages.data
      );
      selectedVillageIdRef.current = snap.villages.selectedId;
      selectedVillageNameRef.current = snap.villages.selectedName;
      if (snap.villages.selectedId !== null) {
        map.setFeatureState(
          { source: HOBLI_VILLAGES_SOURCE_ID, id: snap.villages.selectedId },
          { selected: true }
        );
      }
    }

    if (snap.cadastrals) {
      void loadVillageCadastrals(
        map,
        snap.cadastrals.parent,
        snap.villages?.parent ?? "",
        snap.hoblies?.parent ?? "",
        snap.taluks?.parent ?? "",
        snap.state ?? "",
        snap.cadastrals.data
      );
    }

    const { center, zoom, bearing, pitch } = snap.camera;
    map.jumpTo({ center, zoom, bearing, pitch });
    applyBoundaryLayerVisibility(map);
  };

  const undoDrillAction = (map: MapLibreMap) => {
    const stack = drillUndoStackRef.current;
    let previous = stack.pop();
    // Skip entries that don't actually change the drill (e.g. a search that resolved to
    // nothing) so one undo never appears to do nothing.
    while (previous && drillSnapshotsEqual(previous, captureDrillSnapshot(map))) {
      previous = stack.pop();
    }
    if (!previous) return;
    drillRedoStackRef.current.push(captureDrillSnapshot(map));
    applyDrillSnapshot(map, previous);
  };

  const redoDrillAction = (map: MapLibreMap) => {
    const stack = drillRedoStackRef.current;
    let next = stack.pop();
    while (next && drillSnapshotsEqual(next, captureDrillSnapshot(map))) {
      next = stack.pop();
    }
    if (!next) return;
    drillUndoStackRef.current.push(captureDrillSnapshot(map));
    applyDrillSnapshot(map, next);
  };

  // Selects a district by name within a state already present in the default states layer
  // (e.g. from a "Karnataka, Hassan" search): selects/zooms the state, loads its districts if
  // needed, then finds and selects the matching district feature by name - mirroring what
  // clicking that district on the map does, including auto-loading its taluks. Returns false
  // if the state or district can't be resolved.
  const selectDistrictByName = async (
    map: MapLibreMap,
    stateName: string,
    districtName: string
  ): Promise<boolean> => {
    if (!selectStateByName(map, stateName)) return false;
    selectedStateNameRef.current = stateName;

    await loadStateDistricts(map, stateName);
    const data = loadedDistrictsDataRef.current;
    if (!data) return false;

    const normalized = districtName.trim().toLowerCase();
    const index = data.features.findIndex(
      (f) => ((f.properties?.dtname as string | undefined) ?? "").trim().toLowerCase() === normalized
    );
    if (index === -1) return false;
    const feature = data.features[index];
    if (!feature) return false;

    if (selectedDistrictIdRef.current !== null && selectedDistrictIdRef.current !== index) {
      map.setFeatureState(
        { source: STATE_DISTRICTS_SOURCE_ID, id: selectedDistrictIdRef.current },
        { selected: false }
      );
      clearDistrictTaluks(map);
    }
    selectedDistrictIdRef.current = index;
    map.setFeatureState({ source: STATE_DISTRICTS_SOURCE_ID, id: index }, { selected: true });

    if (feature.geometry) {
      map.fitBounds(boundsOfGeometry(feature.geometry), {
        padding: 100,
        duration: 800,
        maxZoom: 11,
      });
    }

    const actualDistrictName = (feature.properties?.dtname as string | undefined) ?? districtName;
    selectedDistrictNameRef.current = actualDistrictName;
    await loadDistrictTaluks(map, actualDistrictName, stateName);
    return true;
  };

  // Selects a taluk by name within a district/state (e.g. from a "Karnataka, Hassan, Belur"
  // search): resolves the state+district first via selectDistrictByName, then finds and
  // selects the matching taluk feature by name - mirroring a taluk click, including
  // auto-loading its hoblies. Returns false if any part of the chain can't be resolved.
  const selectTalukByName = async (
    map: MapLibreMap,
    stateName: string,
    districtName: string,
    talukName: string
  ): Promise<boolean> => {
    if (!(await selectDistrictByName(map, stateName, districtName))) return false;

    const data = loadedTaluksDataRef.current;
    if (!data) return false;

    const normalized = talukName.trim().toLowerCase();
    const index = data.features.findIndex(
      (f) => ((f.properties?.KGISTalukName as string | undefined) ?? "").trim().toLowerCase() === normalized
    );
    if (index === -1) return false;
    const feature = data.features[index];
    if (!feature) return false;

    if (selectedTalukIdRef.current !== null && selectedTalukIdRef.current !== index) {
      map.setFeatureState(
        { source: DISTRICT_TALUKS_SOURCE_ID, id: selectedTalukIdRef.current },
        { selected: false }
      );
    }
    selectedTalukIdRef.current = index;
    map.setFeatureState({ source: DISTRICT_TALUKS_SOURCE_ID, id: index }, { selected: true });

    if (feature.geometry) {
      map.fitBounds(boundsOfGeometry(feature.geometry), {
        padding: 120,
        duration: 800,
        maxZoom: 12,
      });
    }

    const actualTalukName = (feature.properties?.KGISTalukName as string | undefined) ?? talukName;
    const actualDistrictName = selectedDistrictNameRef.current ?? districtName;
    // Keep the name ref in sync so clicking a hobli after a search-selected taluk still
    // auto-loads its villages (mirrors the map-click path and selectDistrictByName).
    selectedTalukNameRef.current = actualTalukName;
    await loadTalukHoblies(map, actualTalukName, actualDistrictName, stateName);
    return true;
  };

  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  // The map opens on DEFAULT_MAP_LAYER (satellite) instead of the plain OSM base.
  const [currentLayer, setCurrentLayer] = useState<MapLayer>(DEFAULT_MAP_LAYER);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!containerRef.current) return;

      try {
        // Initialize MapLibre with a colorful vector basemap
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        registerSatelliteProtocol(maplibregl, () => mapRef.current);

        // Get appropriate style based on current layer
        const getMapStyle = () => {
          // When the map starts on satellite, build the initial style around the same
          // Google satellite raster the LayersControl "satellite" switch uses, so the map
          // opens directly in satellite mode (no flash of the OSM base). The OSM variants
          // are added later via addDefaultBaseLayers when the user switches to "default".
          if (DEFAULT_MAP_LAYER === "satellite") {
            return {
              version: 8,
              sources: {
                "satellite-base": {
                  type: "raster",
                  tiles: SATELLITE_TILES,
                  tileSize: 256,
                  attribution: "© Google",
                  minzoom: 0,
                  maxzoom: SATELLITE_MAX_ZOOM_CEILING,
                },
              },
              layers: [
                {
                  id: "satellite-base-layer",
                  type: "raster",
                  source: "satellite-base",
                  minzoom: 0,
                  maxzoom: SATELLITE_MAX_ZOOM_CEILING,
                },
              ],
              glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
            };
          }

          // Start with a minimal OpenStreetMap style that we'll build upon. Starts on the
          // label-free tiles since the initial zoom (whole-India view) is well past the
          // 1km label-hiding threshold anyway; the labeled variant is added in the "load"
          // handler below and toggled in as the user zooms in.
          return {
            version: 8,
            sources: {
              [OSM_NOLABELS_SOURCE_ID]: {
                type: "raster",
                tiles: OSM_NOLABELS_TILES,
                tileSize: 256,
                attribution: "© CARTO, © OpenStreetMap contributors",
              },
            },
            layers: [
              {
                id: OSM_NOLABELS_LAYER_ID,
                type: "raster",
                source: OSM_NOLABELS_SOURCE_ID,
              },
            ],
            glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
          };
        };

        configureMaplibreWorker();
        // OpenFreeMap "Liberty" style: MapLibre's classic look (parks, land, water, roads all colored)
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: getMapStyle() as any,
          center: [78.9629, 20.5937], // Center of India
          zoom: 4.5,
          // Starts capped for the default satellite base layer; handleLayerChange raises this
          // back to MapLibre's default when the user switches to a layer with fuller coverage.
          maxZoom: DEFAULT_MAP_LAYER === "satellite" ? SATELLITE_MAX_ZOOM_CEILING : 22,
          attributionControl: false,
        });

        mapRef.current = map;

        // --- AOI drawing handlers (Free Hand / Polygon / Rectangle). These all no-op unless
        // a tool is armed via setDrawingTool. The layer-specific boundary handlers are
        // guarded with the same check so a click/drag while drawing doesn't also select
        // states/districts.
        map.on("mousedown", (e) => {
          const tool = drawingToolRef.current;
          if (!tool || tool === "polygon") return;
          const button = e.originalEvent.button;
          if (button !== undefined && button !== 0) return; // left button (or touch) only
          drawSessionRef.current = {
            tool,
            points: [[e.lngLat.lng, e.lngLat.lat]],
            dragging: true,
            lastPixel: [e.point.x, e.point.y],
          };
          publishAOIData(map, draftPolygonFor(tool, drawSessionRef.current, null), null);
        });

        map.on("mousemove", (e) => {
          const tool = drawingToolRef.current;
          const session = drawSessionRef.current;
          if (!tool || !session) return;
          const live: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          if (session.dragging && tool === "freehand") {
            // Decimate the stroke: only keep points >= 3px apart so a long drag doesn't
            // produce a ring with thousands of vertices.
            const dx = e.point.x - (session.lastPixel?.[0] ?? 0);
            const dy = e.point.y - (session.lastPixel?.[1] ?? 0);
            if (Math.hypot(dx, dy) >= 3) {
              session.points.push(live);
              session.lastPixel = [e.point.x, e.point.y];
            }
          } else if (session.dragging && tool === "rectangle") {
            session.points[1] = live;
          }
          // While a polygon is open, keep the rubber-band preview + cursor dot updated even
          // without a mouse-down (the live point closes the shape visually).
          publishAOIData(
            map,
            draftPolygonFor(tool, session, live),
            tool === "polygon" ? [...session.points, live] : null
          );
        });

        map.on("mouseup", (e) => {
          const tool = drawingToolRef.current;
          const session = drawSessionRef.current;
          if (!tool || !session || !session.dragging) return;
          session.dragging = false;

          if (tool === "freehand") {
            if (session.points.length >= 3) {
              completeAOI(map, {
                type: "Polygon",
                coordinates: [[...session.points, session.points[0]!]],
              });
            } else {
              cancelDrawing(map);
            }
          } else if (tool === "rectangle") {
            const start = session.points[0]!;
            const end = session.points[1] ?? [e.lngLat.lng, e.lngLat.lat];
            // A click without a drag is a degenerate rectangle - ignore it.
            const startPixel = map.project(start);
            if (Math.hypot(e.point.x - startPixel.x, e.point.y - startPixel.y) < 6) {
              cancelDrawing(map);
              return;
            }
            completeAOI(map, {
              type: "Polygon",
              coordinates: [[start, [end[0], start[1]], end, [start[0], end[1]], start]],
            });
          }
        });

        map.on("click", (e) => {
          const tool = drawingToolRef.current;
          if (tool !== "polygon") return;
          const live: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          const session =
            drawSessionRef.current ?? {
              tool,
              points: [] as [number, number][],
              dragging: false,
              lastPixel: null,
            };

          // Clicking on/near the first vertex closes and finishes the polygon.
          const first = session.points[0];
          if (first && session.points.length >= 3) {
            const firstPixel = map.project(first);
            if (Math.hypot(e.point.x - firstPixel.x, e.point.y - firstPixel.y) < 14) {
              completeAOI(map, {
                type: "Polygon",
                coordinates: [[...session.points, first]],
              });
              return;
            }
          }

          // A click arriving within 300ms AND ~10px of the previous one is the second half
          // of a double-click (the dblclick handler closes the polygon) - don't add a vertex
          // for it. The proximity check keeps fast-but-deliberate vertex clicks (placed at
          // different spots) from being dropped.
          const last = lastVertexClickRef.current;
          if (
            last &&
            Date.now() - last.t < 300 &&
            Math.hypot(e.point.x - last.x, e.point.y - last.y) < 10
          ) {
            lastVertexClickRef.current = null;
            return;
          }
          lastVertexClickRef.current = { t: Date.now(), x: e.point.x, y: e.point.y };

          session.points.push(live);
          drawSessionRef.current = session;
          publishAOIData(map, draftPolygonFor(tool, session, live), [...session.points, live]);
        });

        map.on("dblclick", () => {
          const tool = drawingToolRef.current;
          const session = drawSessionRef.current;
          if (tool !== "polygon" || !session || session.points.length < 3) return;
          completeAOI(map, {
            type: "Polygon",
            coordinates: [[...session.points, session.points[0]!]],
          });
        });

        map.on("contextmenu", (e) => {
          // While an AOI drawing tool is armed, right-click cancels the in-progress shape.
          if (drawingToolRef.current) {
            if (drawSessionRef.current) {
              e.preventDefault();
              cancelDrawing(map);
            }
            return;
          }

          // Otherwise: report the attribute info of the deepest boundary feature under the
          // cursor (state / district / taluk / hobli / village / cadastral parcel) so the
          // caller's side panel can render it. The native browser context menu is suppressed
          // only when a feature was actually hit.
          attributeInfoOpenRef.current = false;

          // queryRenderedFeatures throws if any listed layer doesn't exist yet - and most
          // drill-down layers (districts/taluks/hoblies/villages/cadastrals) only appear
          // once loaded - so query only the layers currently on the map.
          const layers = ATTRIBUTE_POPUP_LAYER_IDS.filter((id) => map.getLayer(id));
          const features = layers.length > 0
            ? queryRenderedFeaturesSafe(map, e.point, { layers })
            : [];
          const feature = features[0];
          if (!feature || !feature.properties) {
            onAttributeInfoRef.current?.(null);
            return;
          }
          e.preventDefault();

          const layerId = feature.layer?.id ?? "";
          const typeLabel = ATTRIBUTE_POPUP_TYPE_LABELS[layerId] ?? "Feature";
          const props = feature.properties;

          // Display title: the first known name-key property, else the boundary type.
          const nameKeys = [
            "st_nm",
            "dtname",
            "pin_code",
            "KGISTalukName",
            "subdist_nm",
            "KGISHobliName",
            "hobli_name",
            "KGISVillageName",
            "village_name",
            "vill_nm",
            "name",
          ];
          const title =
            nameKeys
              .map((k) => props[k])
              .find((v) => typeof v === "string" && v.trim()) ?? typeLabel;

          // Preferred display order for the attribute rows (pincodes first: Pincode,
          // District, Taluk, Hobli, Gram Panchayat). Keys not in the list keep their
          // original property order (stable sort).
          const ATTRIBUTE_ROW_ORDER = [
            "pin_code",
            "district",
            "taluk",
            "hobli",
            "gram_panchayat",
          ];
          const rows: AttributeRow[] = Object.entries(props)
            .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
            .sort(([a], [b]) => {
              const ia = ATTRIBUTE_ROW_ORDER.indexOf(a);
              const ib = ATTRIBUTE_ROW_ORDER.indexOf(b);
              if (ia === -1 && ib === -1) return 0;
              if (ia === -1) return 1;
              if (ib === -1) return -1;
              return ia - ib;
            })
            .map(([k, v]) => ({
              label: ATTRIBUTE_LABELS[k] ?? humanizeAttributeKey(k),
              value: String(v),
            }));

          // Karnataka's on-platform hierarchy counts, cross-checked against the remote MinIO
          // bucket (see scripts/count-karnataka-hierarchy.mjs). Shown only for the state
          // feature itself, as extra read-only rows below its native attributes.
          const KARNATAKA_HIERARCHY: AttributeRow[] = [
            { label: "Districts", value: "31", bold: true },
            { label: "Taluks", value: "240", bold: true },
            { label: "Hoblis", value: "852", bold: true },
            { label: "Villages", value: "30,335", bold: true },
          ];
          const isKarnatakaState =
            layerId === "states-fill-default" &&
            typeof props.st_nm === "string" &&
            props.st_nm.trim().toLowerCase() === "karnataka";
          if (isKarnatakaState) rows.push(...KARNATAKA_HIERARCHY);

          // Cadastral parcels carry no owner names - those come from Bhoomi, keyed by the
          // parcel's administrative chain plus survey/surnoc/hissa. Hand that key to the
          // caller so its panel can fetch and append the owner rows.
          const survey = String(props.Surveynumber_Old ?? props.surveynumberi ?? "").trim();
          const parcel: ParcelLandRecordKey | undefined =
            layerId === VILLAGE_CADASTRALS_FILL_LAYER_ID ||
            layerId === VILLAGE_CADASTRALS_LINE_LAYER_ID
              ? survey
                ? {
                    district: String(props._parent_district ?? ""),
                    taluk: String(props._parent_subdistrict ?? ""),
                    hobli: String(props._parent_hobli ?? ""),
                    village: String(props._parent_village_name ?? ""),
                    survey,
                    surnoc: String(props.Surnoc ?? "*").trim() || "*",
                    hissa: String(props.HissaNo ?? "*").trim() || "*",
                  }
                : undefined
              : undefined;

          // Ancestor names for the bulk-export hierarchy walk. Each drill-down layer only
          // ever holds the children of one currently-selected parent, so whichever ancestor
          // refs are set are reliably this feature's own ancestors - except at the feature's
          // own level, where its own name (`title`) is used instead of the (possibly stale,
          // possibly unset) selection ref for that same level.
          const adminLevel = ATTRIBUTE_POPUP_ADMIN_LEVEL[layerId];
          const hierarchy: AttributeInfo["hierarchy"] = adminLevel
            ? {
                level: adminLevel,
                state: adminLevel === "state" ? title : (selectedStateNameRef.current ?? undefined),
                district:
                  adminLevel === "district"
                    ? title
                    : (selectedDistrictNameRef.current ?? undefined),
                taluk:
                  adminLevel === "taluk" ? title : (selectedTalukNameRef.current ?? undefined),
                hobli:
                  adminLevel === "hobli" ? title : (selectedHobliNameRef.current ?? undefined),
                village:
                  adminLevel === "village"
                    ? title
                    : adminLevel === "survey_plot"
                      ? (selectedVillageNameRef.current ?? undefined)
                      : undefined,
              }
            : undefined;

          attributeInfoOpenRef.current = true;
          onAttributeInfoRef.current?.({
            typeLabel,
            title,
            rows,
            parcel,
            geometry: feature.geometry,
            properties: props,
            hierarchy,
          });
        });

        // Distance scale bar
        map.addControl(
          new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }),
          "bottom-right"
        );

        // Keep the base map's place labels (city/town/village names baked into the raster
        // tiles) in sync with the scale bar: shown at 1km and below, hidden beyond 1km so
        // only our own vector labels show, restored once the user zooms in past that.
        map.on("zoom", () =>
          updateBaseLabelVisibility(map, boundaryLayerModeRef.current === "administrative")
        );
        map.on("moveend", () =>
          updateBaseLabelVisibility(map, boundaryLayerModeRef.current === "administrative")
        );

        map.on("load", async () => {
          if (cancelled) return;

          // Adds the labeled base-map variant alongside the label-free one already in the
          // initial style, below all the vector overlays added further down. Skipped when
          // the map starts on the satellite base - the OSM variants are added instead if
          // the user switches to "default" via the LayersControl.
          if (DEFAULT_MAP_LAYER === "default") addDefaultBaseLayers(map);

          // Load the India national boundary by default (INDIA_BOUNDARY.geojson). The India
          // states load only after the boundary is clicked, mirroring the drill-down of the
          // other administrative layers.
          try {
            let boundaryResponse: Response;
            try {
              boundaryResponse = await fetch("/api/datasets/india-boundary?file=boundary");
            } catch {
              boundaryResponse = await fetch("/geodata/india-boundary.geojson");
            }
            if (!boundaryResponse.ok) {
              boundaryResponse = await fetch("/geodata/india-boundary.geojson");
            }
            const boundaryData = await boundaryResponse.json();

            // Add the national boundary source. generateId assigns each feature a numeric id
            // so we can address it with setFeatureState for hover/selection below.
            map.addSource(INDIA_BOUNDARY_SOURCE_ID, {
              type: "geojson",
              data: boundaryData,
              generateId: true,
            });

            // Visible national outline line. On hover (feature-state) the border thickens and
            // brightens so only the boundary line itself highlights - never a fill over the
            // country. The selected state also thickens it (kept for consistency, though the
            // boundary hides once the states load).
            map.addLayer({
              id: "india-boundary-line",
              type: "line",
              source: INDIA_BOUNDARY_SOURCE_ID,
              paint: {
                "line-color": [
                  "case",
                  ["boolean", ["feature-state", "hover"], false],
                  "#FFFFFF",
                  "#00FFFF",
                ],
                "line-width": [
                  "case",
                  ["boolean", ["feature-state", "hover"], false],
                  6,
                  ["boolean", ["feature-state", "selected"], false],
                  5,
                  2.5,
                ],
                "line-opacity": 1,
              },
            });

            // Fully transparent fill so the whole country stays clickable to load the states.
            // It never paints anything - the hover highlight lives on the boundary line.
            map.addLayer({
              id: "india-boundary-fill",
              type: "fill",
              source: INDIA_BOUNDARY_SOURCE_ID,
              paint: {
                "fill-color": "#00FFFF",
                "fill-opacity": 0,
              },
            });

            // Derived "India" label anchor - one Point at the country's centroid.
            map.addSource(INDIA_BOUNDARY_LABELS_SOURCE_ID, {
              type: "geojson",
              data: labelAnchorFeatures(boundaryData, ["name"]),
              generateId: true,
            });

            // "India" text label centered on the country. The anchor source is the
            // area-weighted centroid (see labelAnchorFeatures), so the label sits at the
            // visual center of the national boundary.
            const indiaLabelLayer: any = {
              id: "india-boundary-label",
              type: "symbol" as const,
              source: INDIA_BOUNDARY_LABELS_SOURCE_ID,
              layout: {
                "text-field": ["get", "name"],
                "text-font": ["Noto Sans Regular"],
                "text-size": 24,
                "text-anchor": "center",
                "text-letter-spacing": 0.05,
                "text-max-width": 9,
              },
              paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#000000",
                "text-halo-width": 2.5,
              },
            };
            map.addLayer(indiaLabelLayer);
            map.addLayer(hoverLabelLayerSpec(indiaLabelLayer));
            attachLabelHoverGrow(map, "india-boundary-label", "india-boundary-label-hover");

            // Hover highlight + cursor over the country.
            let hoveredBoundaryId: string | number | null = null;
            map.on("mousemove", "india-boundary-fill", (e) => {
              const feature = e.features?.[0];
              if (feature && feature.id !== undefined && feature.id !== hoveredBoundaryId) {
                if (hoveredBoundaryId !== null) {
                  map.setFeatureState(
                    { source: INDIA_BOUNDARY_SOURCE_ID, id: hoveredBoundaryId },
                    { hover: false }
                  );
                }
                hoveredBoundaryId = feature.id;
                map.setFeatureState(
                  { source: INDIA_BOUNDARY_SOURCE_ID, id: hoveredBoundaryId },
                  { hover: true }
                );
              }
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", "india-boundary-fill", () => {
              if (hoveredBoundaryId !== null) {
                map.setFeatureState(
                  { source: INDIA_BOUNDARY_SOURCE_ID, id: hoveredBoundaryId },
                  { hover: false }
                );
              }
              hoveredBoundaryId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            });

            // Clicking the India boundary loads the India states and marks it selected, so
            // it no longer highlights on hover (matching the state-selection behavior).
            map.on("click", "india-boundary-fill", (e) => {
              if (drawingToolRef.current) return;
              const feature = e.features?.[0];
              if (feature && feature.id !== undefined) {
                map.setFeatureState(
                  { source: INDIA_BOUNDARY_SOURCE_ID, id: feature.id },
                  { selected: true }
                );
              }
              void loadIndiaStates();
              e.preventDefault?.();
              if (e.originalEvent) e.originalEvent.stopPropagation();
            });

            // Loads the India states (INDIA_STATES.geojson) and wires up the full state
            // drill-down (hover/click, districts, taluks, ...). Defined here so the boundary
            // click handler above can call it; runs once when the boundary is clicked.
            const loadIndiaStates = async () => {
              // Guard against re-entry: the boundary click handler can fire again after the
              // states are already loaded (e.g. a second click on the country), which would
              // otherwise throw "Source already exists".
              if (map.getSource(STATE_SOURCE_ID)) return;
            try {
            let statesResponse: Response;
            try {
              statesResponse = await fetch("/api/datasets/india-boundary?file=states");
            } catch {
              statesResponse = await fetch("/data/india_states.geojson");
            }
            if (!statesResponse.ok) {
              statesResponse = await fetch("/data/india_states.geojson");
            }
            const statesData = await statesResponse.json();
            loadedStatesDataRef.current = statesData;

            // Add state boundaries source. generateId assigns each feature a numeric id so we
            // can address it with setFeatureState for hover/selection highlighting below.
            map.addSource(STATE_SOURCE_ID, {
              type: "geojson",
              data: statesData,
              generateId: true,
            });

            // Derived label-anchor source: exactly one Point per state (centroid of the
            // state's largest polygon). MapLibre otherwise labels every polygon of a
            // MultiPolygon, scattering duplicates across Andaman & Nicobar, Puducherry, etc.
            map.addSource(STATE_LABELS_SOURCE_ID, {
              type: "geojson",
              data: labelAnchorFeatures(statesData, ["st_nm"]),
              generateId: true,
            });

            // Invisible-by-default fill so hovering/clicking anywhere inside a state's
            // boundary (not just on its border line) triggers the highlight. The selected
            // state gets NO fill and also no hover highlight (checked first), so the
            // satellite/OSM basemap stays fully visible - only its boundary line thickens.
            map.addLayer({
              id: "states-fill-default",
              type: "fill",
              source: STATE_SOURCE_ID,
              paint: {
                "fill-color": "#00FFFF",
                "fill-opacity": [
                  "case",
                  ["boolean", ["feature-state", "selected"], false],
                  0,
                  ["boolean", ["feature-state", "hover"], false],
                  0.18,
                  0,
                ],
              },
            });

            // Add state boundary lines - pure neon cyan at full opacity and a slightly
            // thicker stroke so the borders glow brightly against the satellite imagery.
            map.addLayer({
              id: "states-borders-default",
              type: "line",
              source: STATE_SOURCE_ID,
              paint: {
                "line-color": "#00FFFF",
                "line-width": [
                  "case",
                  ["boolean", ["feature-state", "selected"], false],
                  3.5,
                  2,
                ],
                "line-opacity": 1,
              },
            });

            // Label-grow-on-hover for every boundary-name label layer (states, districts,
            // taluks, hoblies, villages). Registered once here - like the hover/click
            // bindings below - rather than inside each layer's load function, since those
            // reload the layer (and would otherwise stack duplicate listeners) every time the
            // user drills into a different state/district/taluk/hobli. MapLibre's delegated
            // listeners tolerate binding to a layer id that doesn't exist yet, so this works
            // fine even before the deeper layers have ever been loaded.
            attachLabelHoverGrow(map, "states-labels-default", "states-labels-default-hover");
            attachLabelHoverGrow(
              map,
              STATE_DISTRICTS_LABELS_LAYER_ID,
              `${STATE_DISTRICTS_LABELS_LAYER_ID}-hover`
            );
            attachLabelHoverGrow(
              map,
              DISTRICT_TALUKS_LABELS_LAYER_ID,
              `${DISTRICT_TALUKS_LABELS_LAYER_ID}-hover`
            );
            attachLabelHoverGrow(
              map,
              TALUK_HOBLIES_LABELS_LAYER_ID,
              `${TALUK_HOBLIES_LABELS_LAYER_ID}-hover`
            );
            attachLabelHoverGrow(
              map,
              HOBLI_VILLAGES_LABELS_LAYER_ID,
              `${HOBLI_VILLAGES_LABELS_LAYER_ID}-hover`
            );
            attachLabelHoverGrow(
              map,
              GP_DISTRICTS_LABELS_LAYER_ID,
              `${GP_DISTRICTS_LABELS_LAYER_ID}-hover`
            );
            attachLabelHoverGrow(
              map,
              GP_TALUKS_LABELS_LAYER_ID,
              `${GP_TALUKS_LABELS_LAYER_ID}-hover`
            );
            attachLabelHoverGrow(
              map,
              GP_BOUNDARIES_LABELS_LAYER_ID,
              `${GP_BOUNDARIES_LABELS_LAYER_ID}-hover`
            );

            let hoveredStateId: string | number | null = null;

            map.on("mousemove", "states-fill-default", (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredStateId !== null && hoveredStateId !== feature.id) {
                map.setFeatureState(
                  { source: STATE_SOURCE_ID, id: hoveredStateId },
                  { hover: false }
                );
              }
              hoveredStateId = feature.id;
              map.setFeatureState(
                { source: STATE_SOURCE_ID, id: hoveredStateId },
                { hover: true }
              );
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", "states-fill-default", () => {
              if (hoveredStateId !== null) {
                map.setFeatureState(
                  { source: STATE_SOURCE_ID, id: hoveredStateId },
                  { hover: false }
                );
              }
              hoveredStateId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            });

            map.on("click", "states-fill-default", (e) => {
              // While an AOI drawing tool is armed, clicks belong to the drawing, not to
              // boundary selection.
              if (drawingToolRef.current) return;
              console.log("=== STATE CLICK EVENT ===");
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              const clickedStateName = (feature.properties?.st_nm as string | undefined)
                ?.trim()
                .toLowerCase();
              const isAssemblyMode = boundaryLayerModeRef.current === "assembly";
              const isParliamentMode = boundaryLayerModeRef.current === "parliamentary";
              const isPoliceMode = boundaryLayerModeRef.current === "police_station";
              const isGramPanchayatMode = boundaryLayerModeRef.current === "gram_panchayat";
              const isCivicAmenitiesMode = boundaryLayerModeRef.current === "civic_amenities";

              // If the click landed within the boundary layer currently on top for this
              // state (assembly/parliamentary constituencies in their respective modes,
              // districts otherwise), ignore it here — that layer's own click handler
              // already manages it. Only the boundary type relevant to the active mode
              // swallows clicks, so a state whose districts were loaded in a previous mode
              // still responds to a fresh click (which loads the constituency layer instead).
              // Gram panchayat boundaries aren't wired to data yet, so nothing is loaded
              // for a state in that mode.
              const boundaryLoadedForState = isAssemblyMode
                ? loadedAssemblyStateRef.current === clickedStateName
                : isParliamentMode
                  ? loadedParliamentStateRef.current === clickedStateName
                  : isPoliceMode
                    ? loadedPoliceStateRef.current === clickedStateName
                    : isGramPanchayatMode
                      ? loadedGpDistrictsStateRef.current === clickedStateName
                      : isCivicAmenitiesMode
                        ? loadedCivicDistrictsStateRef.current === clickedStateName
                        : loadedDistrictsStateRef.current === clickedStateName;

              if (boundaryLoadedForState) {
                console.log("Boundaries are loaded for this state - ignoring state click (click was on boundary layer)");
                return;
              }

              const wasSelected = selectedStateIdRef.current === feature.id;

              // In the constituency modes (and gram panchayat mode), a click on a state
              // always selects it — even if the state is already selected from a previous
              // session — instead of toggling it off. Assembly/parliamentary also (re)load
              // that mode's boundaries; gram panchayat has no data wired yet, so the click
              // just highlights the state.
              if (isAssemblyMode || isParliamentMode || isGramPanchayatMode || isPoliceMode || isCivicAmenitiesMode) {
                if (!wasSelected) {
                  if (selectedStateIdRef.current !== null) {
                    clearStateSelection(map);
                    clearStateBoundaryLayers(map);
                    clearDistrictTaluks(map);
                  }
                  selectStateFeature(map, feature);
                }
                const stateName = feature.properties?.st_nm as string | undefined;
                selectedStateNameRef.current = stateName ?? null;
                if (stateName) {
                  if (isAssemblyMode) {
                    console.log(`Auto-loading assembly constituencies for state: ${stateName}`);
                    void loadStateAssembly(map, stateName);
                  } else if (isParliamentMode) {
                    console.log(`Auto-loading parliamentary constituencies for state: ${stateName}`);
                    void loadStateParliament(map, stateName);
                  } else if (isPoliceMode) {
                    console.log(`Auto-loading police station boundaries for state: ${stateName}`);
                    void loadStatePolice(map, stateName);
                  } else if (isGramPanchayatMode) {
                    console.log(`Auto-loading gram panchayat districts for state: ${stateName}`);
                    void loadStateGramPanchayatDistricts(map, stateName);
                  } else if (isCivicAmenitiesMode) {
                    console.log(`Auto-loading civic amenities districts for state: ${stateName}`);
                    void loadStateCivicDistricts(map, stateName);
                  }
                }
                return;
              }

              // Record the pre-click drill state so Ctrl+Z can undo this selection action.
              recordDrillAction(map);

              // Default ("administrative") mode: a click on a state always selects it and
              // auto-loads its districts, even when the state is already highlighted from a
              // previous session (e.g. after switching over from a constituency mode, whose
              // layer switch clears the district layers but leaves the state selected). This
              // mirrors the constituency modes above, so a single click always works.
              // Once districts are loaded, the boundaryLoadedForState early-return above
              // defers clicks to the district layer's own drill-down handler.
              if (!wasSelected) {
                // Deselect previous state if any
                if (selectedStateIdRef.current !== null) {
                  clearStateSelection(map);
                  clearStateBoundaryLayers(map);
                  clearDistrictTaluks(map);
                }

                // Select new state and auto-load its districts
                selectStateFeature(map, feature);
              }

              const stateName = feature.properties?.st_nm as string | undefined;
              selectedStateNameRef.current = stateName ?? null;
              if (stateName) {
                console.log(`Auto-loading districts for state: ${stateName}`);
                void loadStateDistricts(map, stateName);
              }
            });

            // Hover/click highlighting for a state's districts, once loaded. Registered once
            // here (rather than inside loadStateDistricts) so re-loading districts for a
            // different state doesn't stack up duplicate listeners.
            let hoveredDistrictId: string | number | null = null;

            map.on("mousemove", STATE_DISTRICTS_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredDistrictId !== null && hoveredDistrictId !== feature.id) {
                map.setFeatureState(
                  { source: STATE_DISTRICTS_SOURCE_ID, id: hoveredDistrictId },
                  { hover: false }
                );
              }
              hoveredDistrictId = feature.id;
              map.setFeatureState(
                { source: STATE_DISTRICTS_SOURCE_ID, id: hoveredDistrictId },
                { hover: true }
              );
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", STATE_DISTRICTS_FILL_LAYER_ID, () => {
              if (hoveredDistrictId !== null) {
                map.setFeatureState(
                  { source: STATE_DISTRICTS_SOURCE_ID, id: hoveredDistrictId },
                  { hover: false }
                );
              }
              hoveredDistrictId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            });

            // Hover highlighting for a state's gram panchayat districts, once loaded (GP
            // mode). No click handler yet - the panchayat drill-down isn't wired to data.
            let hoveredGpDistrictId: string | number | null = null;

            map.on("mousemove", GP_DISTRICTS_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredGpDistrictId !== null && hoveredGpDistrictId !== feature.id) {
                map.setFeatureState(
                  { source: GP_DISTRICTS_SOURCE_ID, id: hoveredGpDistrictId },
                  { hover: false }
                );
              }
              hoveredGpDistrictId = feature.id;
              map.setFeatureState(
                { source: GP_DISTRICTS_SOURCE_ID, id: hoveredGpDistrictId },
                { hover: true }
              );
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", GP_DISTRICTS_FILL_LAYER_ID, () => {
              if (hoveredGpDistrictId !== null) {
                map.setFeatureState(
                  { source: GP_DISTRICTS_SOURCE_ID, id: hoveredGpDistrictId },
                  { hover: false }
                );
              }
              hoveredGpDistrictId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            });

            // Click-to-drill: clicking a GP district loads its gram panchayat taluk
            // boundaries. Clicking the same district again toggles the taluks off.
            map.on("click", GP_DISTRICTS_FILL_LAYER_ID, (e) => {
              if (drawingToolRef.current) return;
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              // If the click actually landed on a loaded GP taluk, let that layer's own
              // (future) handler manage it - don't re-toggle the district underneath.
              if (
                map.getLayer(GP_TALUKS_FILL_LAYER_ID) &&
                queryRenderedFeaturesSafe(map, e.point, { layers: [GP_TALUKS_FILL_LAYER_ID] }).length > 0
              ) {
                return;
              }

              const districtName = feature.properties?.dtname as string | undefined;
              const normalizedDistrictName = districtName?.trim().toLowerCase();
              const taluksAlreadyLoaded =
                loadedGpTaluksDistrictRef.current === normalizedDistrictName;

              // Clicking the same district that already has taluks loaded: toggle off.
              if (selectedGpDistrictIdRef.current === feature.id && taluksAlreadyLoaded) {
                map.setFeatureState(
                  { source: GP_DISTRICTS_SOURCE_ID, id: selectedGpDistrictIdRef.current },
                  { selected: false }
                );
                selectedGpDistrictIdRef.current = null;
                clearGpTaluks(map);
                e.preventDefault();
                if (e.originalEvent) e.originalEvent.stopPropagation();
                return;
              }

              // Deselect the previous district if clicking a different one.
              if (selectedGpDistrictIdRef.current !== null && selectedGpDistrictIdRef.current !== feature.id) {
                map.setFeatureState(
                  { source: GP_DISTRICTS_SOURCE_ID, id: selectedGpDistrictIdRef.current },
                  { selected: false }
                );
                clearGpTaluks(map);
              }

              selectedGpDistrictIdRef.current = feature.id;
              map.setFeatureState(
                { source: GP_DISTRICTS_SOURCE_ID, id: selectedGpDistrictIdRef.current },
                { selected: true }
              );

              // Zoom to the district before drilling in.
              if (feature.geometry) {
                map.fitBounds(boundsOfGeometry(feature.geometry), {
                  padding: 100,
                  duration: 800,
                  maxZoom: 11,
                });
              }

              const stateName = feature.properties?.stname as string | undefined;
              if (districtName && stateName) {
                console.log(`Loading GP taluks for ${districtName}, ${stateName}`);
                void loadDistrictGramPanchayatTaluks(map, districtName, stateName);
              }

              // Stop this click from also reaching the states-fill-default handler.
              e.preventDefault();
              if (e.originalEvent) e.originalEvent.stopPropagation();
            });

            // Hover highlighting for a state's civic amenities districts, once loaded.
            let hoveredCivicDistrictId: string | number | null = null;

            map.on("mousemove", CIVIC_DISTRICTS_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredCivicDistrictId !== null && hoveredCivicDistrictId !== feature.id) {
                map.setFeatureState(
                  { source: CIVIC_DISTRICTS_SOURCE_ID, id: hoveredCivicDistrictId },
                  { hover: false }
                );
              }
              hoveredCivicDistrictId = feature.id;
              map.setFeatureState(
                { source: CIVIC_DISTRICTS_SOURCE_ID, id: hoveredCivicDistrictId },
                { hover: true }
              );
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", CIVIC_DISTRICTS_FILL_LAYER_ID, () => {
              if (hoveredCivicDistrictId !== null) {
                map.setFeatureState(
                  { source: CIVIC_DISTRICTS_SOURCE_ID, id: hoveredCivicDistrictId },
                  { hover: false }
                );
              }
              hoveredCivicDistrictId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            });

            // Click-to-drill: clicking a civic district loads its pincode boundaries.
            // Clicking the same district again toggles the pincodes off.
            map.on("click", CIVIC_DISTRICTS_FILL_LAYER_ID, (e) => {
              if (drawingToolRef.current) return;
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              // If the click actually landed on a loaded civic pincode, let that layer's
              // own (future) handler manage it - don't re-toggle the district underneath.
              if (
                map.getLayer(CIVIC_PINCODES_FILL_LAYER_ID) &&
                queryRenderedFeaturesSafe(map, e.point, { layers: [CIVIC_PINCODES_FILL_LAYER_ID] }).length > 0
              ) {
                return;
              }

              const districtName = feature.properties?.dtname as string | undefined;
              const normalizedDistrictName = districtName?.trim().toLowerCase();
              const pincodesAlreadyLoaded =
                loadedCivicPincodesDistrictRef.current === normalizedDistrictName;

              // Clicking the same district that already has pincodes loaded: toggle off.
              if (selectedCivicDistrictIdRef.current === feature.id && pincodesAlreadyLoaded) {
                map.setFeatureState(
                  { source: CIVIC_DISTRICTS_SOURCE_ID, id: selectedCivicDistrictIdRef.current },
                  { selected: false }
                );
                selectedCivicDistrictIdRef.current = null;
                clearCivicPincodes(map);
                e.preventDefault();
                if (e.originalEvent) e.originalEvent.stopPropagation();
                return;
              }

              // Deselect the previous district if clicking a different one.
              if (selectedCivicDistrictIdRef.current !== null && selectedCivicDistrictIdRef.current !== feature.id) {
                map.setFeatureState(
                  { source: CIVIC_DISTRICTS_SOURCE_ID, id: selectedCivicDistrictIdRef.current },
                  { selected: false }
                );
                clearCivicPincodes(map);
              }

              selectedCivicDistrictIdRef.current = feature.id;
              map.setFeatureState(
                { source: CIVIC_DISTRICTS_SOURCE_ID, id: selectedCivicDistrictIdRef.current },
                { selected: true }
              );

              // Zoom to the district before drilling in.
              if (feature.geometry) {
                map.fitBounds(boundsOfGeometry(feature.geometry), {
                  padding: 100,
                  duration: 800,
                  maxZoom: 11,
                });
              }

              const stateName = feature.properties?.stname as string | undefined;
              if (districtName && stateName) {
                console.log(`Loading civic pincodes for ${districtName}, ${stateName}`);
                void loadDistrictCivicPincodes(map, districtName, stateName);
              }

              // Stop this click from also reaching the states-fill-default handler.
              e.preventDefault();
              if (e.originalEvent) e.originalEvent.stopPropagation();
            });

            // Hover highlighting for a district's civic pincodes, once loaded.
            let hoveredCivicPincodeId: string | number | null = null;

            map.on("mousemove", CIVIC_PINCODES_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredCivicPincodeId !== null && hoveredCivicPincodeId !== feature.id) {
                map.setFeatureState(
                  { source: CIVIC_PINCODES_SOURCE_ID, id: hoveredCivicPincodeId },
                  { hover: false }
                );
              }
              hoveredCivicPincodeId = feature.id;
              map.setFeatureState(
                { source: CIVIC_PINCODES_SOURCE_ID, id: hoveredCivicPincodeId },
                { hover: true }
              );
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", CIVIC_PINCODES_FILL_LAYER_ID, () => {
              if (hoveredCivicPincodeId !== null) {
                map.setFeatureState(
                  { source: CIVIC_PINCODES_SOURCE_ID, id: hoveredCivicPincodeId },
                  { hover: false }
                );
              }
              hoveredCivicPincodeId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            });

            // Hover highlighting for a district's gram panchayat taluks, once loaded.
            let hoveredGpTalukId: string | number | null = null;

            map.on("mousemove", GP_TALUKS_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredGpTalukId !== null && hoveredGpTalukId !== feature.id) {
                map.setFeatureState(
                  { source: GP_TALUKS_SOURCE_ID, id: hoveredGpTalukId },
                  { hover: false }
                );
              }
              hoveredGpTalukId = feature.id;
              map.setFeatureState(
                { source: GP_TALUKS_SOURCE_ID, id: hoveredGpTalukId },
                { hover: true }
              );
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", GP_TALUKS_FILL_LAYER_ID, () => {
              if (hoveredGpTalukId !== null) {
                map.setFeatureState(
                  { source: GP_TALUKS_SOURCE_ID, id: hoveredGpTalukId },
                  { hover: false }
                );
              }
              hoveredGpTalukId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            });

            // Click-to-drill: clicking a GP taluk loads its gram panchayat boundaries.
            // Clicking the same taluk again toggles them off.
            map.on("click", GP_TALUKS_FILL_LAYER_ID, (e) => {
              if (drawingToolRef.current) return;
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              const talukName =
                (feature.properties?.kgis_civil_taluk_name as string | undefined) ??
                (feature.properties?.taluk_panchayat as string | undefined);
              const normalizedTalukName = talukName?.trim().toLowerCase();
              const boundariesAlreadyLoaded =
                loadedGpBoundariesTalukRef.current === normalizedTalukName;

              // Clicking the same taluk that already has GP boundaries loaded: toggle off.
              if (selectedGpTalukIdRef.current === feature.id && boundariesAlreadyLoaded) {
                map.setFeatureState(
                  { source: GP_TALUKS_SOURCE_ID, id: selectedGpTalukIdRef.current },
                  { selected: false }
                );
                selectedGpTalukIdRef.current = null;
                clearGpBoundaries(map);
                e.preventDefault();
                if (e.originalEvent) e.originalEvent.stopPropagation();
                return;
              }

              // Deselect the previous taluk if clicking a different one.
              if (selectedGpTalukIdRef.current !== null && selectedGpTalukIdRef.current !== feature.id) {
                map.setFeatureState(
                  { source: GP_TALUKS_SOURCE_ID, id: selectedGpTalukIdRef.current },
                  { selected: false }
                );
                clearGpBoundaries(map);
              }

              selectedGpTalukIdRef.current = feature.id;
              map.setFeatureState(
                { source: GP_TALUKS_SOURCE_ID, id: selectedGpTalukIdRef.current },
                { selected: true }
              );

              // Zoom to the taluk before drilling in.
              if (feature.geometry) {
                map.fitBounds(boundsOfGeometry(feature.geometry), {
                  padding: 100,
                  duration: 800,
                  maxZoom: 12,
                });
              }

              // The taluk files don't carry a state name - use the state selected when the
              // GP districts were loaded. The district name comes from the feature itself.
              const districtName =
                (feature.properties?.district as string | undefined) ??
                (feature.properties?.kgis_civil_district_name as string | undefined);
              const stateName = selectedStateNameRef.current;
              if (talukName && districtName && stateName) {
                console.log(`Loading GP boundaries for taluk ${talukName}, ${districtName}, ${stateName}`);
                void loadTalukGramPanchayatBoundaries(map, talukName, districtName, stateName);
              }

              // Stop this click from also reaching the district/state handlers below.
              e.preventDefault();
              if (e.originalEvent) e.originalEvent.stopPropagation();
            });

            // Hover highlighting for a taluk's gram panchayat boundaries, once loaded.
            let hoveredGpBoundaryId: string | number | null = null;

            map.on("mousemove", GP_BOUNDARIES_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredGpBoundaryId !== null && hoveredGpBoundaryId !== feature.id) {
                map.setFeatureState(
                  { source: GP_BOUNDARIES_SOURCE_ID, id: hoveredGpBoundaryId },
                  { hover: false }
                );
              }
              hoveredGpBoundaryId = feature.id;
              map.setFeatureState(
                { source: GP_BOUNDARIES_SOURCE_ID, id: hoveredGpBoundaryId },
                { hover: true }
              );
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", GP_BOUNDARIES_FILL_LAYER_ID, () => {
              if (hoveredGpBoundaryId !== null) {
                map.setFeatureState(
                  { source: GP_BOUNDARIES_SOURCE_ID, id: hoveredGpBoundaryId },
                  { hover: false }
                );
              }
              hoveredGpBoundaryId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            });

            map.on("click", STATE_DISTRICTS_FILL_LAYER_ID, (e) => {
              if (drawingToolRef.current) return;
              console.log("=== DISTRICT CLICK EVENT ===");
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              // MapLibre invokes every layer's click handler independently for a single
              // click (it doesn't stop at the topmost layer, and preventDefault() here
              // has no effect on sibling handlers) - so a click on a taluk, which sits
              // geometrically inside this district's polygon too, would otherwise also
              // reach this handler and toggle the district (and its taluks/hoblies) off
              // right after the taluk handler selects it. If the click actually landed on
              // a taluk feature, let that layer's own handler manage it exclusively.
              if (
                map.getLayer(DISTRICT_TALUKS_FILL_LAYER_ID) &&
                queryRenderedFeaturesSafe(map, e.point, { layers: [DISTRICT_TALUKS_FILL_LAYER_ID] }).length > 0
              ) {
                return;
              }

              // Record the pre-click drill state so Ctrl+Z can undo this selection action.
              recordDrillAction(map);

              // Check if this district already has taluks loaded
              const districtName = feature.properties?.dtname as string | undefined;
              const normalizedDistrictName = districtName?.trim().toLowerCase();
              const taluksAlreadyLoaded = loadedTaluksDistrictRef.current === normalizedDistrictName;
              
              console.log(`District: ${districtName}, Already loaded: ${taluksAlreadyLoaded}, Selected ID: ${selectedDistrictIdRef.current}, Feature ID: ${feature.id}`);

              // If clicking the same district that already has taluks loaded, toggle (deselect)
              if (selectedDistrictIdRef.current === feature.id && taluksAlreadyLoaded) {
                // Toggle off - deselect district and clear taluks
                map.setFeatureState(
                  { source: STATE_DISTRICTS_SOURCE_ID, id: selectedDistrictIdRef.current },
                  { selected: false }
                );
                selectedDistrictIdRef.current = null;
                clearDistrictTaluks(map);
                e.preventDefault();
                if (e.originalEvent) {
                  e.originalEvent.stopPropagation();
                }
                return;
              }

              // Deselect previous district if clicking a different one
              if (selectedDistrictIdRef.current !== null && selectedDistrictIdRef.current !== feature.id) {
                map.setFeatureState(
                  { source: STATE_DISTRICTS_SOURCE_ID, id: selectedDistrictIdRef.current },
                  { selected: false }
                );
                // Clear taluks from previous district
                clearDistrictTaluks(map);
              }

              // Select the new district
              selectedDistrictIdRef.current = feature.id;
              map.setFeatureState(
                { source: STATE_DISTRICTS_SOURCE_ID, id: selectedDistrictIdRef.current },
                { selected: true }
              );
              
              // Zoom to district
              if (feature.geometry) {
                map.fitBounds(boundsOfGeometry(feature.geometry), {
                  padding: 100,
                  duration: 800,
                  maxZoom: 11,
                });
              }

              // Automatically load taluks when district is selected. The district geojson
              // only carries dtname (no stname), so fall back to the state the user clicked
              // into (selectedStateNameRef) - without it the taluk load would never fire.
              const stateName =
                (feature.properties?.stname as string | undefined) ??
                selectedStateNameRef.current;
              selectedDistrictNameRef.current = districtName ?? null;
              if (districtName && stateName) {
                console.log(`Loading taluks automatically for ${districtName}, ${stateName}`);
                void loadDistrictTaluks(map, districtName, stateName);
              }
              
              // Prevent this click from bubbling to the states-fill-default handler
              e.preventDefault();
              if (e.originalEvent) {
                e.originalEvent.stopPropagation();
              }
            });

            // Hover/click highlighting for assembly constituencies, once loaded. Registered
            // once here (rather than inside loadStateAssembly) so re-loading for a
            // different state doesn't stack up duplicate listeners.
            let hoveredAssemblyId: string | number | null = null;

            map.on("mousemove", STATE_ASSEMBLY_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredAssemblyId !== null && hoveredAssemblyId !== feature.id) {
                map.setFeatureState(
                  { source: STATE_ASSEMBLY_SOURCE_ID, id: hoveredAssemblyId },
                  { hover: false }
                );
              }
              hoveredAssemblyId = feature.id;
              map.setFeatureState(
                { source: STATE_ASSEMBLY_SOURCE_ID, id: hoveredAssemblyId },
                { hover: true }
              );
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", STATE_ASSEMBLY_FILL_LAYER_ID, () => {
              if (hoveredAssemblyId !== null) {
                map.setFeatureState(
                  { source: STATE_ASSEMBLY_SOURCE_ID, id: hoveredAssemblyId },
                  { hover: false }
                );
              }
              hoveredAssemblyId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            });

            map.on("click", STATE_ASSEMBLY_FILL_LAYER_ID, (e) => {
              if (drawingToolRef.current) return;
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (selectedAssemblyIdRef.current !== null) {
                map.setFeatureState(
                  { source: STATE_ASSEMBLY_SOURCE_ID, id: selectedAssemblyIdRef.current },
                  { selected: false }
                );
              }

              const wasSelected = selectedAssemblyIdRef.current === feature.id;
              selectedAssemblyIdRef.current = wasSelected ? null : feature.id;

              if (selectedAssemblyIdRef.current !== null) {
                map.setFeatureState(
                  { source: STATE_ASSEMBLY_SOURCE_ID, id: selectedAssemblyIdRef.current },
                  { selected: true }
                );

                if (feature.geometry) {
                  map.fitBounds(boundsOfGeometry(feature.geometry), {
                    padding: 80,
                    duration: 800,
                    maxZoom: 13,
                  });
                }
              }

              // Prevent bubbling to the states-fill-default handler beneath this layer
              e.preventDefault();
              if (e.originalEvent) {
                e.originalEvent.stopPropagation();
              }
            });

            // Hover/click highlighting for parliamentary constituencies, once loaded.
            // Registered once here (rather than inside loadStateParliament) so re-loading
            // for a different state doesn't stack up duplicate listeners.
            let hoveredParliamentId: string | number | null = null;

            map.on("mousemove", STATE_PARLIAMENT_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredParliamentId !== null && hoveredParliamentId !== feature.id) {
                map.setFeatureState(
                  { source: STATE_PARLIAMENT_SOURCE_ID, id: hoveredParliamentId },
                  { hover: false }
                );
              }
              hoveredParliamentId = feature.id;
              map.setFeatureState(
                { source: STATE_PARLIAMENT_SOURCE_ID, id: hoveredParliamentId },
                { hover: true }
              );
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", STATE_PARLIAMENT_FILL_LAYER_ID, () => {
              if (hoveredParliamentId !== null) {
                map.setFeatureState(
                  { source: STATE_PARLIAMENT_SOURCE_ID, id: hoveredParliamentId },
                  { hover: false }
                );
              }
              hoveredParliamentId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            });

            map.on("click", STATE_PARLIAMENT_FILL_LAYER_ID, (e) => {
              if (drawingToolRef.current) return;
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (selectedParliamentIdRef.current !== null) {
                map.setFeatureState(
                  { source: STATE_PARLIAMENT_SOURCE_ID, id: selectedParliamentIdRef.current },
                  { selected: false }
                );
              }

              const wasSelected = selectedParliamentIdRef.current === feature.id;
              selectedParliamentIdRef.current = wasSelected ? null : feature.id;

              if (selectedParliamentIdRef.current !== null) {
                map.setFeatureState(
                  { source: STATE_PARLIAMENT_SOURCE_ID, id: selectedParliamentIdRef.current },
                  { selected: true }
                );

                if (feature.geometry) {
                  map.fitBounds(boundsOfGeometry(feature.geometry), {
                    padding: 80,
                    duration: 800,
                    maxZoom: 11,
                  });
                }
              }

              // Prevent bubbling to the states-fill-default handler beneath this layer
              e.preventDefault();
              if (e.originalEvent) {
                e.originalEvent.stopPropagation();
              }
            });

            // Hover/click interaction for police-station jurisdiction boundaries.
            let hoveredPoliceId: string | number | null = null;
            map.on("mousemove", STATE_POLICE_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;
              if (hoveredPoliceId !== null && hoveredPoliceId !== feature.id) {
                map.setFeatureState(
                  { source: STATE_POLICE_SOURCE_ID, id: hoveredPoliceId },
                  { hover: false },
                );
              }
              hoveredPoliceId = feature.id;
              map.setFeatureState(
                { source: STATE_POLICE_SOURCE_ID, id: hoveredPoliceId },
                { hover: true },
              );
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", STATE_POLICE_FILL_LAYER_ID, () => {
              if (hoveredPoliceId !== null) {
                map.setFeatureState(
                  { source: STATE_POLICE_SOURCE_ID, id: hoveredPoliceId },
                  { hover: false },
                );
              }
              hoveredPoliceId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            });
            map.on("click", STATE_POLICE_FILL_LAYER_ID, (e) => {
              if (drawingToolRef.current) return;
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;
              if (selectedPoliceIdRef.current !== null) {
                map.setFeatureState(
                  { source: STATE_POLICE_SOURCE_ID, id: selectedPoliceIdRef.current },
                  { selected: false },
                );
              }
              const wasSelected = selectedPoliceIdRef.current === feature.id;
              selectedPoliceIdRef.current = wasSelected ? null : feature.id;
              if (selectedPoliceIdRef.current !== null) {
                map.setFeatureState(
                  { source: STATE_POLICE_SOURCE_ID, id: selectedPoliceIdRef.current },
                  { selected: true },
                );
                if (feature.geometry) {
                  map.fitBounds(boundsOfGeometry(feature.geometry), {
                    padding: 80,
                    duration: 800,
                    maxZoom: 13,
                  });
                }
                const folder = feature.properties?._storage_folder as string | undefined;
                if (folder) void loadPoliceCoverage(map, folder);
              } else {
                clearPoliceCoverage(map);
              }
              e.preventDefault();
              e.originalEvent?.stopPropagation();
            });

            // Hover/click highlighting for taluks, once loaded. Registered once here
            // (rather than inside loadDistrictTaluks) so re-loading taluks for a
            // different district doesn't stack up duplicate listeners.
            let hoveredTalukId: string | number | null = null;

            map.on("mousemove", DISTRICT_TALUKS_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredTalukId !== null && hoveredTalukId !== feature.id) {
                map.setFeatureState(
                  { source: DISTRICT_TALUKS_SOURCE_ID, id: hoveredTalukId },
                  { hover: false }
                );
              }
              hoveredTalukId = feature.id;
              map.setFeatureState(
                { source: DISTRICT_TALUKS_SOURCE_ID, id: hoveredTalukId },
                { hover: true }
              );
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", DISTRICT_TALUKS_FILL_LAYER_ID, () => {
              if (hoveredTalukId !== null) {
                map.setFeatureState(
                  { source: DISTRICT_TALUKS_SOURCE_ID, id: hoveredTalukId },
                  { hover: false }
                );
              }
              hoveredTalukId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            });

            map.on("click", DISTRICT_TALUKS_FILL_LAYER_ID, (e) => {
              if (drawingToolRef.current) return;
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              // Same reasoning as the district handler above: a click on a hobli sits
              // inside this taluk's polygon too, and MapLibre would otherwise also run
              // this handler and toggle the taluk (and its hoblies) off right after the
              // hobli handler selects it. Defer to the hobli layer's own handler instead.
              if (
                map.getLayer(TALUK_HOBLIES_FILL_LAYER_ID) &&
                queryRenderedFeaturesSafe(map, e.point, { layers: [TALUK_HOBLIES_FILL_LAYER_ID] }).length > 0
              ) {
                return;
              }

              // Record the pre-click drill state so Ctrl+Z can undo this selection action.
              recordDrillAction(map);

              if (selectedTalukIdRef.current !== null) {
                map.setFeatureState(
                  { source: DISTRICT_TALUKS_SOURCE_ID, id: selectedTalukIdRef.current },
                  { selected: false }
                );
              }

              // Toggle selection
              const wasSelected = selectedTalukIdRef.current === feature.id;
              selectedTalukIdRef.current = wasSelected ? null : feature.id;

              if (selectedTalukIdRef.current !== null) {
                map.setFeatureState(
                  { source: DISTRICT_TALUKS_SOURCE_ID, id: selectedTalukIdRef.current },
                  { selected: true }
                );

                // Zoom to taluk boundary
                if (feature.geometry) {
                  map.fitBounds(boundsOfGeometry(feature.geometry), {
                    padding: 120,
                    duration: 800,
                    maxZoom: 12,
                  });
                }

                // Get taluk name for loading hobli boundaries
                // Try multiple property keys in order of preference
                let talukName =
                  (feature.properties?.KGISTalukName as string | undefined) ||
                  (feature.properties?.subdist_nm as string | undefined) ||
                  (feature.properties?.name as string | undefined) ||
                  (feature.properties?.taluk_name as string | undefined) ||
                  (feature.properties?.TALUK_NAME as string | undefined) ||
                  (feature.properties?.TalukName as string | undefined) ||
                  "Unknown Taluk";
                
                console.log(`[Taluk Click] Feature properties:`, JSON.stringify(feature.properties, null, 2));
                console.log(`[Taluk Click] Extracted talukName="${talukName}" from properties`);

                // Store the selected taluk name for hobli-to-village loading
                selectedTalukNameRef.current = talukName;

                // Automatically load hobli boundaries for the selected taluk
                const districtName = selectedDistrictNameRef.current;
                const stateName = selectedStateNameRef.current;
                if (talukName !== "Unknown Taluk" && districtName && stateName) {
                  console.log(`[Taluk Hoblies] Requesting hoblies for taluk="${talukName}", district="${districtName}", state="${stateName}"`);
                  // Pass the clicked geometry for better matching
                  void loadTalukHoblies(map, talukName, districtName, stateName, feature.geometry as GeoJSON.Geometry);
                }
              } else {
                // Deselected the taluk - clear its hobli boundaries and taluk name
                selectedTalukNameRef.current = null;
                clearTalukHoblies(map);
              }

              // Prevent bubbling to district handler
              e.preventDefault();
            });

            // Hover/click highlighting for hoblies, once loaded. Registered once here
            // (rather than inside loadTalukHoblies) so re-loading hoblies for a
            // different taluk doesn't stack up duplicate listeners.
            let hoveredHobliId: string | number | null = null;

            map.on("mousemove", TALUK_HOBLIES_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredHobliId !== null && hoveredHobliId !== feature.id) {
                map.setFeatureState(
                  { source: TALUK_HOBLIES_SOURCE_ID, id: hoveredHobliId },
                  { hover: false }
                );
              }
              hoveredHobliId = feature.id;
              map.setFeatureState(
                { source: TALUK_HOBLIES_SOURCE_ID, id: hoveredHobliId },
                { hover: true }
              );
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", TALUK_HOBLIES_FILL_LAYER_ID, () => {
              if (hoveredHobliId !== null) {
                map.setFeatureState(
                  { source: TALUK_HOBLIES_SOURCE_ID, id: hoveredHobliId },
                  { hover: false }
                );
              }
              hoveredHobliId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            });

            map.on("click", TALUK_HOBLIES_FILL_LAYER_ID, (e) => {
              if (drawingToolRef.current) return;
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              // A click on a village sits inside this hobli's polygon too, and MapLibre
              // would otherwise also run this handler and toggle the hobli (and its
              // villages) off right after the village handler selects it. Defer to the
              // village layer's own handler instead.
              if (
                map.getLayer(HOBLI_VILLAGES_FILL_LAYER_ID) &&
                queryRenderedFeaturesSafe(map, e.point, { layers: [HOBLI_VILLAGES_FILL_LAYER_ID] }).length > 0
              ) {
                return;
              }

              // Record the pre-click drill state so Ctrl+Z can undo this selection action.
              recordDrillAction(map);

              if (selectedHobliIdRef.current !== null) {
                map.setFeatureState(
                  { source: TALUK_HOBLIES_SOURCE_ID, id: selectedHobliIdRef.current },
                  { selected: false }
                );
              }

              const wasSelected = selectedHobliIdRef.current === feature.id;
              selectedHobliIdRef.current = wasSelected ? null : feature.id;

              if (selectedHobliIdRef.current !== null) {
                map.setFeatureState(
                  { source: TALUK_HOBLIES_SOURCE_ID, id: selectedHobliIdRef.current },
                  { selected: true }
                );

                // Zoom to the hobli so the village boundaries it loads land centered
                // in the viewport (mirrors the state/district/taluk drill-down levels).
                if (feature.geometry) {
                  map.fitBounds(boundsOfGeometry(feature.geometry), {
                    padding: 140,
                    duration: 800,
                    maxZoom: 14,
                  });
                }

                const hobliName =
                  (feature.properties?.KGISHobliName as string | undefined) ||
                  (feature.properties?.hobli_name as string | undefined) ||
                  (feature.properties?.name as string | undefined) ||
                  "Unknown Hobli";

                console.log(`[Hobli Click] Feature properties:`, JSON.stringify(feature.properties, null, 2));
                console.log(`[Hobli Click] Extracted hobliName="${hobliName}"`);
                selectedHobliNameRef.current = hobliName;

                // Automatically load village boundaries for the selected hobli
                const talukName = selectedTalukNameRef.current;
                const districtName = selectedDistrictNameRef.current;
                const stateName = selectedStateNameRef.current;
                if (hobliName !== "Unknown Hobli" && talukName && districtName && stateName) {
                  console.log(`[Hobli Villages] Requesting villages for hobli="${hobliName}", taluk="${talukName}", district="${districtName}", state="${stateName}"`);
                  void loadHobliVillages(map, hobliName, talukName, districtName, stateName);
                }
              } else {
                // Deselected the hobli - clear its village boundaries
                clearHobliVillages(map);
              }

              // Prevent bubbling to the taluk handler beneath this layer
              e.preventDefault();
              if (e.originalEvent) {
                e.originalEvent.stopPropagation();
              }
            });

            // Hover/click highlighting for villages, once loaded. Registered once here
            // (rather than inside loadHobliVillages) so re-loading villages for a
            // different hobli doesn't stack up duplicate listeners.
            let hoveredVillageId: string | number | null = null;

            map.on("mousemove", HOBLI_VILLAGES_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredVillageId !== null && hoveredVillageId !== feature.id) {
                map.setFeatureState(
                  { source: HOBLI_VILLAGES_SOURCE_ID, id: hoveredVillageId },
                  { hover: false }
                );
              }
              hoveredVillageId = feature.id;
              map.setFeatureState(
                { source: HOBLI_VILLAGES_SOURCE_ID, id: hoveredVillageId },
                { hover: true }
              );
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", HOBLI_VILLAGES_FILL_LAYER_ID, () => {
              if (hoveredVillageId !== null) {
                map.setFeatureState(
                  { source: HOBLI_VILLAGES_SOURCE_ID, id: hoveredVillageId },
                  { hover: false }
                );
              }
              hoveredVillageId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            });

            // Cadastral parcel hover highlight: the invisible hit-test fill, the border
            // lines and the survey-number labels all share the same source (generateId), so
            // any of the three can be the topmost feature under the cursor. Bind the same
            // handler to all three layers so hovering anywhere on a parcel box (interior,
            // border or label) lights that parcel up with a translucent fill + thicker
            // border, colored per basemap by applyCadastralColors. Registered once here so
            // re-loading cadastrals for a different village doesn't stack duplicate
            // listeners.
            let hoveredCadastralId: string | number | null = null;
            const onCadastralHover = (e: MapLayerMouseEvent) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredCadastralId !== null && hoveredCadastralId !== feature.id) {
                map.setFeatureState(
                  { source: VILLAGE_CADASTRALS_SOURCE_ID, id: hoveredCadastralId },
                  { hover: false }
                );
              }
              hoveredCadastralId = feature.id;
              map.setFeatureState(
                { source: VILLAGE_CADASTRALS_SOURCE_ID, id: hoveredCadastralId },
                { hover: true }
              );
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "pointer";
            };
            const onCadastralHoverEnd = () => {
              if (hoveredCadastralId !== null) {
                map.setFeatureState(
                  { source: VILLAGE_CADASTRALS_SOURCE_ID, id: hoveredCadastralId },
                  { hover: false }
                );
              }
              hoveredCadastralId = null;
              if (!drawingToolRef.current) map.getCanvas().style.cursor = "";
            };
            for (const id of [
              VILLAGE_CADASTRALS_FILL_LAYER_ID,
              VILLAGE_CADASTRALS_LINE_LAYER_ID,
              VILLAGE_CADASTRALS_LABELS_LAYER_ID,
            ]) {
              map.on("mousemove", id, onCadastralHover);
              map.on("mouseleave", id, onCadastralHoverEnd);
            }

            map.on("click", HOBLI_VILLAGES_FILL_LAYER_ID, (e) => {
              if (drawingToolRef.current) return;
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              // Once a village's cadastral parcels are loaded they cover the village
              // polygon, and a click on a parcel shouldn't toggle the village (and clear
              // the cadastrals) underneath. The invisible cadastral fill layer (on top of
              // the village fill) already makes parcel-interior clicks inert; this check
              // covers any click that still lands on the village fill - the deepest level
              // of the drill-down.
              if (
                (map.getLayer(VILLAGE_CADASTRALS_FILL_LAYER_ID) ||
                  map.getLayer(VILLAGE_CADASTRALS_LINE_LAYER_ID)) &&
                queryRenderedFeaturesSafe(map, e.point, {
                  layers: [VILLAGE_CADASTRALS_FILL_LAYER_ID, VILLAGE_CADASTRALS_LINE_LAYER_ID].filter((id) =>
                    map.getLayer(id)
                  ),
                }).length > 0
              ) {
                return;
              }

              // Record the pre-click drill state so Ctrl+Z can undo this selection action.
              recordDrillAction(map);

              if (selectedVillageIdRef.current !== null) {
                map.setFeatureState(
                  { source: HOBLI_VILLAGES_SOURCE_ID, id: selectedVillageIdRef.current },
                  { selected: false }
                );
              }

              const wasSelected = selectedVillageIdRef.current === feature.id;
              selectedVillageIdRef.current = wasSelected ? null : feature.id;

              if (selectedVillageIdRef.current !== null) {
                map.setFeatureState(
                  { source: HOBLI_VILLAGES_SOURCE_ID, id: selectedVillageIdRef.current },
                  { selected: true }
                );

                // Zoom to the village so the cadastral parcels it loads land centered
                // in the viewport (mirrors the other drill-down levels).
                if (feature.geometry) {
                  map.fitBounds(boundsOfGeometry(feature.geometry), {
                    padding: 140,
                    duration: 800,
                    maxZoom: 15,
                  });
                }

                const villageName =
                  (feature.properties?.KGISVillageName as string | undefined) ||
                  (feature.properties?.village_name as string | undefined) ||
                  (feature.properties?.Village_Name as string | undefined) ||
                  (feature.properties?.vill_nm as string | undefined) ||
                  (feature.properties?.village as string | undefined) ||
                  (feature.properties?.vname as string | undefined) ||
                  (feature.properties?.VILLNAME as string | undefined) ||
                  (feature.properties?.name as string | undefined) ||
                  "Unknown Village";

                console.log(`[Village Click] Feature properties:`, JSON.stringify(feature.properties, null, 2));
                console.log(`[Village Click] Extracted villageName="${villageName}"`);
                selectedVillageNameRef.current = villageName;

                // Automatically load cadastral boundaries for the selected village
                const hobliName = selectedHobliNameRef.current;
                const talukName = selectedTalukNameRef.current;
                const districtName = selectedDistrictNameRef.current;
                const stateName = selectedStateNameRef.current;
                if (villageName !== "Unknown Village" && hobliName && talukName && districtName && stateName) {
                  console.log(`[Village Cadastrals] Requesting cadastrals for village="${villageName}", hobli="${hobliName}", taluk="${talukName}", district="${districtName}", state="${stateName}"`);
                  void loadVillageCadastrals(map, villageName, hobliName, talukName, districtName, stateName);
                }
              } else {
                // Deselected the village - clear its cadastral boundaries
                selectedVillageNameRef.current = null;
                clearVillageCadastrals(map);
              }

              // Prevent bubbling to the hobli handler beneath this layer
              e.preventDefault();
              if (e.originalEvent) {
                e.originalEvent.stopPropagation();
              }
            });

            // Add state labels - one clean label per state, anchored on the derived
            // point source (see labelAnchorFeatures) instead of the full geojson.
            const stateLabelLayer: any = {
              id: "states-labels-default",
              type: "symbol" as const,
              source: STATE_LABELS_SOURCE_ID,
              layout: {
                "text-field": ["get", "st_nm"],
                "text-font": ["Noto Sans Regular"],
                "text-size": 12,
                "text-anchor": "center",
                // Wrap long names like "Andaman and Nicobar Islands" so they stay inside
                // small states instead of spilling over their neighbours.
                "text-max-width": 9,
              },
              paint: {
                "text-color": "#475569",
                "text-halo-color": "#ffffff",
                "text-halo-width": 2,
              },
            };
            map.addLayer(stateLabelLayer);
            map.addLayer(hoverLabelLayerSpec(stateLabelLayer));

            // The India states are now loaded and rendered - hide the national
            // boundary (outline line, clickable fill and "India" label) so it no
            // longer overlaps the state boundaries.
            for (const boundaryLayerId of [
              "india-boundary-line",
              "india-boundary-fill",
              "india-boundary-label",
              "india-boundary-label-hover",
            ]) {
              if (map.getLayer(boundaryLayerId)) {
                map.setLayoutProperty(boundaryLayerId, "visibility", "none");
              }
            }
            } catch (error) {
              console.error("Failed to load India state boundaries:", error);
            }
            };
          } catch (error) {
            console.error("Failed to load India boundary:", error);
          }

          setIsLoading(false);
        });

        // Note: Removed label_state and CITY_LABEL_LAYERS event handlers since we're now
        // using raster tiles instead of vector tiles. Users can click states directly
        // from the states-fill-default layer, or use the search bar.

        // Note: bengaluru-fill layer handlers are registered dynamically when that layer
        // is added (in loadBengaluruBoundaryFromMinIO function), not here at initialization.

        map.on("error", (e) => {
          // Only treat this as fatal (show "Map temporarily unavailable") if the base style
          // itself never loaded. A post-load error (e.g. a missing glyph/tile for an overlay
          // layer) shouldn't take down an already-working map.
          if (!cancelled && !map.isStyleLoaded()) {
            console.error("Map error (fatal, style never loaded):", e.error ?? e);
            setLoadError(true);
            setIsLoading(false);
          } else {
            // Non-fatal errors (missing tiles, glyphs, etc.) - just log and continue
            console.warn("Map error (non-fatal):", e.error ?? e);
          }
        });
      } catch (error) {
        console.error("Failed to initialize map:", error);
        if (!cancelled) {
          setLoadError(true);
          setIsLoading(false);
        }
      }
    }

    void initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Removed currentLayer dependency - layer changes handled separately

  // Handle layer changes
  const handleLayerChange = async (layer: MapLayer) => {
    if (!mapRef.current) return;
    
    const map = mapRef.current;

    // A raster-dem source cannot be removed while MapLibre is still using it for 3D terrain.
    removeIndiaTerrain(map);
    
    // Get the current style to preserve custom sources and layers
    const style = map.getStyle();
    const currentLayers = style.layers;
    
    // Identify custom layers we want to keep
    const customLayerIds = currentLayers
      .filter((l) => 
        l.id === "states-fill-default" ||
        l.id === "states-borders-default" ||
        l.id === "states-labels-default" ||
        l.id === STATE_DISTRICTS_FILL_LAYER_ID ||
        l.id === STATE_DISTRICTS_LINE_LAYER_ID ||
        l.id === STATE_DISTRICTS_LABELS_LAYER_ID ||
        l.id === STATE_ASSEMBLY_FILL_LAYER_ID ||
        l.id === STATE_ASSEMBLY_LINE_LAYER_ID ||
        l.id === STATE_PARLIAMENT_FILL_LAYER_ID ||
        l.id === STATE_PARLIAMENT_LINE_LAYER_ID ||
        l.id === STATE_POLICE_FILL_LAYER_ID ||
        l.id === STATE_POLICE_LINE_LAYER_ID ||
        l.id === STATE_POLICE_LABEL_LAYER_ID ||
        l.id.startsWith("police-") ||
        l.id === DISTRICT_TALUKS_FILL_LAYER_ID ||
        l.id === DISTRICT_TALUKS_LINE_LAYER_ID ||
        l.id === DISTRICT_TALUKS_LABELS_LAYER_ID ||
        l.id === TALUK_HOBLIES_FILL_LAYER_ID ||
        l.id === TALUK_HOBLIES_LINE_LAYER_ID ||
        l.id === TALUK_HOBLIES_LABELS_LAYER_ID ||
        l.id === HOBLI_VILLAGES_FILL_LAYER_ID ||
        l.id === HOBLI_VILLAGES_LINE_LAYER_ID ||
        l.id === HOBLI_VILLAGES_LABELS_LAYER_ID ||
        l.id === VILLAGE_CADASTRALS_FILL_LAYER_ID ||
        l.id === VILLAGE_CADASTRALS_LINE_LAYER_ID ||
        l.id === VILLAGE_CADASTRALS_LABELS_LAYER_ID ||
        l.id.startsWith("kml-") ||
        l.id.startsWith("bengaluru-") ||
        l.id.startsWith("extra-") ||
        AOI_LAYER_IDS.includes(l.id)
      )
      .map((l) => l.id);

    // Identify custom sources we want to keep
    const customSourceIds = Object.keys(style.sources).filter(
      (sourceId) =>
        sourceId === STATE_SOURCE_ID ||
        sourceId === STATE_LABELS_SOURCE_ID ||
        sourceId === STATE_DISTRICTS_SOURCE_ID ||
        sourceId === STATE_DISTRICTS_LABELS_SOURCE_ID ||
        sourceId === STATE_ASSEMBLY_SOURCE_ID ||
        sourceId === STATE_PARLIAMENT_SOURCE_ID ||
        sourceId === STATE_POLICE_SOURCE_ID ||
        sourceId.startsWith("police-") ||
        sourceId === DISTRICT_TALUKS_SOURCE_ID ||
        sourceId === DISTRICT_TALUKS_LABELS_SOURCE_ID ||
        sourceId === TALUK_HOBLIES_SOURCE_ID ||
        sourceId === TALUK_HOBLIES_LABELS_SOURCE_ID ||
        sourceId === HOBLI_VILLAGES_SOURCE_ID ||
        sourceId === HOBLI_VILLAGES_LABELS_SOURCE_ID ||
        sourceId === VILLAGE_CADASTRALS_SOURCE_ID ||
        sourceId === "kml-data" ||
        sourceId === "bengaluru-data" ||
        sourceId.startsWith("extra-") ||
        sourceId === AOI_SOURCE_ID ||
        sourceId === AOI_VERTICES_SOURCE_ID
    );
    
    // Get custom sources data
    const customSources: Record<string, any> = {};
    customSourceIds.forEach((sourceId) => {
      customSources[sourceId] = style.sources[sourceId];
    });
    
    // Remove base map layers (everything except our custom layers)
    currentLayers.forEach((l) => {
      if (!customLayerIds.includes(l.id) && map.getLayer(l.id)) {
        map.removeLayer(l.id);
      }
    });
    
    // Remove base map sources
    Object.keys(style.sources).forEach((sourceId) => {
      if (!customSourceIds.includes(sourceId) && map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    });
    
    // Add new base layer based on selection
    const firstCustomLayerId = customLayerIds.length > 0 ? customLayerIds[0] : undefined;
    
    switch (layer) {
      case "satellite":
        map.addSource("satellite-base", {
          type: "raster",
          tiles: SATELLITE_TILES,
          tileSize: 256,
          attribution: "© Google",
          minzoom: 0,
          maxzoom: SATELLITE_MAX_ZOOM_CEILING,
        });

        map.addLayer(
          {
            id: "satellite-base-layer",
            type: "raster",
            source: "satellite-base",
            minzoom: 0,
            maxzoom: SATELLITE_MAX_ZOOM_CEILING,
          },
          firstCustomLayerId
        );
        // Satellite imagery commonly runs out of real coverage past this zoom (rural areas
        // go blank first) - cap the camera so users can't scroll/pinch past the empty tiles.
        map.setMaxZoom(SATELLITE_MAX_ZOOM_CEILING);
        break;

      case "terrain":
        addIndiaTerrain(map, firstCustomLayerId);
        map.setMaxZoom(22);
        break;

      case "default":
        // Add default OSM-style tiles (labeled + label-free variants, toggled by zoom)
        addDefaultBaseLayers(map, firstCustomLayerId, boundaryLayerModeRef.current === "administrative");
        map.setMaxZoom(22);
        break;
    }

    setCurrentLayer(layer);
    currentLayerRef.current = layer;
    // Recolor the cadastral overlay for the new basemap (white on satellite, navy otherwise).
    applyCadastralColors(map, layer === "satellite");
  };

  // Pressing Escape clears any loaded boundary (Karnataka, Bengaluru wards, or a manually
  // uploaded KML/KMZ) so the user can freshly load a new one. While an AOI drawing tool is
  // armed, Escape/Enter/Backspace control the drawing instead (cancel, finish, undo vertex)
  // and never touch the loaded boundaries.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const map = mapRef.current;
      if (!map) return;

      // Never hijack keys while the user is typing (e.g. in the search box).
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (drawingToolRef.current) {
        const session = drawSessionRef.current;
        if (event.key === "Escape") {
          // Escape cancels the in-progress shape, or disarms the tool if nothing is being
          // drawn - in both cases the loaded boundaries stay put. preventDefault also stops
          // Escape from triggering unrelated browser/button behavior.
          event.preventDefault();
          if (session) cancelDrawing(map);
          else disarmDrawingTool(map);
        } else if (session && session.tool === "polygon") {
          if (event.key === "Enter") {
            // Enter finishes the polygon (same as double-clicking). preventDefault keeps a
            // focused button (e.g. the Draw AOI pill) from also activating on Enter.
            event.preventDefault();
            if (session.points.length >= 3) {
              completeAOI(map, {
                type: "Polygon",
                coordinates: [[...session.points, session.points[0]!]],
              });
            }
          } else if (event.key === "Backspace") {
            // Backspace removes the most recently placed vertex.
            event.preventDefault();
            session.points.pop();
            if (session.points.length === 0) cancelDrawing(map);
            else {
              publishAOIData(
                map,
                draftPolygonFor(session.tool, session, null),
                [...session.points]
              );
            }
          }
        }
        return;
      }

      // Ctrl+Z / Ctrl+Y undo and redo the administrative-boundary drill-down
      // (state → district → taluk → hobli → village selections). Ctrl+Shift+Z also redoes.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoDrillAction(map);
        else undoDrillAction(map);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoDrillAction(map);
        return;
      }

      if (event.key !== "Escape") return;

      // The right-click attribute panel has Escape priority: the first Escape closes just
      // the panel; only the next Escape press clears the loaded boundaries. This way a
      // user inspecting a district/taluk attribute table can dismiss it without losing
      // the layers beneath it.
      if (attributeInfoOpenRef.current) {
        event.preventDefault();
        attributeInfoOpenRef.current = false;
        onAttributeInfoRef.current?.(null);
        return;
      }

      BOUNDARY_LAYER_IDS.forEach((layerId) => {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      });
      BOUNDARY_SOURCE_IDS.forEach((sourceId) => {
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      });

      // Clear any manually-toggled extra Bengaluru files too
      extraLayerKeysRef.current.forEach((key) => {
        const baseId = extraLayerIdFromKey(key);
        if (map.getLayer(`${baseId}-fill`)) map.removeLayer(`${baseId}-fill`);
        if (map.getLayer(`${baseId}-line`)) map.removeLayer(`${baseId}-line`);
        if (map.getSource(`${baseId}-data`)) map.removeSource(`${baseId}-data`);
      });
      extraLayerKeysRef.current.clear();
      loadedDistrictsStateRef.current = null;
      loadedAssemblyStateRef.current = null;
      selectedAssemblyIdRef.current = null;
      loadedParliamentStateRef.current = null;
      selectedParliamentIdRef.current = null;
      loadedPoliceStateRef.current = null;
      selectedPoliceIdRef.current = null;
      loadedGpDistrictsStateRef.current = null;
      selectedGpDistrictIdRef.current = null;
      loadedGpTaluksDistrictRef.current = null;
      selectedGpTalukIdRef.current = null;
      loadedGpBoundariesTalukRef.current = null;
      loadedCadastralsVillageRef.current = null;
      loadedCadastralsDataRef.current = null;
      selectedVillageNameRef.current = null;
      // The states source survives the boundary wipe (it's not in BOUNDARY_SOURCE_IDS), so
      // undo any village cutout that was punched into it.
      restoreAncestorFills(map);
      clearStateSelection(map);
      // Bump the generation so a boundary fetch that was in flight when Escape was pressed
      // can't re-add its layers over the cleared map.
      drillGenerationRef.current++;
      // A full clear is a reset - drop the drill history so a later Ctrl+Z doesn't restore
      // a stale selection from before the Escape.
      drillUndoStackRef.current = [];
      drillRedoStackRef.current = [];
      // The drawn AOI is also a user-added overlay - Escape clears it along with the
      // loaded boundaries. (The attribute popup never reaches here: if it was open, the
      // Escape priority block above already closed it and returned.)
      clearCompletedAOI(map);

      setUploadedFileName(null);
      onWardSelectedRef.current?.(null);
      onBoundariesClearedRef.current?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Loads/removes a single Bengaluru boundary file as an extra overlay layer (used by both the
  // Type filter's checkboxes and a 3-part search like "Bengaluru, Central, Ward Boundary").
  // Returns true if a layer ends up visible on the map.
  const applyBengaluruExtraFile = async (
    map: MapLibreMap,
    key: string,
    visible: boolean
  ): Promise<boolean> => {
    const baseId = extraLayerIdFromKey(key);
    if (map.getLayer(`${baseId}-fill`)) map.removeLayer(`${baseId}-fill`);
    if (map.getLayer(`${baseId}-line`)) map.removeLayer(`${baseId}-line`);
    if (map.getSource(`${baseId}-data`)) map.removeSource(`${baseId}-data`);
    extraLayerKeysRef.current.delete(key);

    if (!visible) return false;

    const features = await loadBengaluruFileFeatures(key);
    if (features.length === 0) {
      console.warn(`No features found in ${key}`);
      return false;
    }

    const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    const color = colorForBengaluruFileKey(key);

    map.addSource(`${baseId}-data`, { type: "geojson", data: geojson });
    map.addLayer({
      id: `${baseId}-fill`,
      type: "fill",
      source: `${baseId}-data`,
      filter: ["==", "$type", "Polygon"],
      paint: { "fill-color": color, "fill-opacity": 0.2 },
    });
    map.addLayer({
      id: `${baseId}-line`,
      type: "line",
      source: `${baseId}-data`,
      filter: ["==", "$type", "Polygon"],
      paint: { "line-color": color, "line-width": 1.5 },
    });
    extraLayerKeysRef.current.add(key);
    applyBoundaryLayerVisibility(map);

    // Fit bounds so a freshly-searched file is actually visible
    const maplibregl = await import("maplibre-gl");
    const bounds = new maplibregl.LngLatBounds();
    let hasBounds = false;
    const extendWithCoords = (coords: unknown): void => {
      if (Array.isArray(coords) && typeof coords[0] === "number") {
        bounds.extend(coords as [number, number]);
        hasBounds = true;
      } else if (Array.isArray(coords)) {
        coords.forEach(extendWithCoords);
      }
    };
    features.forEach((feature) => {
      if (feature.geometry && "coordinates" in feature.geometry) {
        extendWithCoords(feature.geometry.coordinates);
      }
    });
    if (hasBounds) map.fitBounds(bounds, { padding: 50, duration: 1000 });

    return true;
  };

  // Finds the file key for a "Bengaluru, <Region>, <File Type>" search, e.g.
  // ("Central", "Ward Boundary") -> "india/karnataka/Bengaluru/Central/Ward Boundary.kmz"
  const findBengaluruFileKey = async (
    regionQuery: string,
    fileQuery: string
  ): Promise<string | null> => {
    const listResponse = await fetch('/api/datasets/bengaluru-boundary-list');
    if (!listResponse.ok) return null;
    const { keys } = (await listResponse.json()) as { keys: string[] };
    const grouped = groupBengaluruKeysBySubfolder(keys ?? []);

    const region = Object.keys(grouped).find(
      (name) => name.toLowerCase() === regionQuery.trim().toLowerCase()
    );
    if (!region) return null;

    const normalizedFileQuery = fileQuery.trim().toLowerCase();
    return (
      grouped[region]?.find((key) => {
        const displayName = (key.split("/").pop() ?? "")
          .replace(/\.kmz$/i, "")
          .replace(/_/g, " ")
          .toLowerCase();
        return displayName.includes(normalizedFileQuery);
      }) ?? null
    );
  };

  useImperativeHandle(ref, () => ({
    search: (query: string) => {
      const map = mapRef.current;
      if (!map) return;

      // Supports:
      //  "<State>" - any state name from the default states layer, e.g. "Karnataka"
      //  "<State>, <District>" - e.g. "Karnataka, Hassan"
      //  "<State>, <District>, <Taluk>" - e.g. "Karnataka, Hassan, Belur"
      //  "Bengaluru" (all zones) / "Bengaluru, <ward name>" (a single ward)
      //  "Bengaluru, <Region>, <File type>" (e.g. "Bengaluru, Central, Ward Boundary")
      const parts = query.split(",").map((part) => part.trim()).filter(Boolean);
      const place = parts[0]?.toLowerCase() ?? "";

      if (place === "bengaluru" || place === "bangalore") {
        const [, regionQuery, fileQuery] = parts;
        if (regionQuery && fileQuery) {
          void (async () => {
            const key = await findBengaluruFileKey(regionQuery, fileQuery);
            if (!key) {
              console.warn(`No file matching "${fileQuery}" found in Bengaluru/${regionQuery}`);
              return;
            }
            const loaded = await applyBengaluruExtraFile(map, key, true);
            if (loaded) onExtraFileToggledRef.current?.(key, true);
          })();
          return;
        }
        loadBengaluruBoundaryFromMinIO(map, regionQuery);
        return;
      }

      if (parts.length === 0) return;

      // Record the pre-search drill state so Ctrl+Z can undo the search's selection
      // actions (a search that resolves to nothing is skipped at undo time via the
      // snapshot comparison in undoDrillAction).
      recordDrillAction(map);

      if (parts.length === 1) {
        // Any state name (Karnataka included) already lives in the default
        // india_states.geojson layer — select it there instead of fetching a separate KMZ
        // from MinIO. Fall back to the Karnataka-specific KMZ only as a legacy safety net.
        if (selectStateByName(map, parts[0] ?? "")) return;
        if (place === "karnataka") loadKarnatakaStateFromMinIO(map);
        return;
      }

      if (parts.length === 2) {
        void selectDistrictByName(map, parts[0] ?? "", parts[1] ?? "");
        return;
      }

      void selectTalukByName(map, parts[0] ?? "", parts[1] ?? "", parts[2] ?? "");
    },
    listBengaluruFiles: async () => {
      const listResponse = await fetch('/api/datasets/bengaluru-boundary-list');
      if (!listResponse.ok) return {};
      const { keys } = (await listResponse.json()) as { keys: string[] };
      return groupBengaluruKeysBySubfolder(keys ?? []);
    },
    toggleBengaluruFile: async (key: string, visible: boolean) => {
      const map = mapRef.current;
      if (!map) return;
      await applyBengaluruExtraFile(map, key, visible);
    },
    setBoundaryLayerMode: (mode: BoundaryLayerMode) => {
      const map = mapRef.current;
      if (!map) return;
      boundaryLayerModeRef.current = mode;
      // Align the loaded state-level boundary layer to the new mode so a click always
      // loads the right boundary type: switching to a constituency mode drops leftover
      // district/taluk layers (and the other constituency's layers), switching back to
      // "administrative" drops the constituency layers.
      // loads the right boundary type: switching to a constituency (or gram panchayat)
      // mode drops leftover district/taluk layers (and the other modes' layers), switching
      // back to "administrative" drops the constituency layers.
      if (
        mode === "assembly" ||
        mode === "parliamentary" ||
        mode === "gram_panchayat" ||
        mode === "police_station" ||
        mode === "civic_amenities"
      ) {
        clearStateDistricts(map);
        clearDistrictTaluks(map);
        clearGpDistricts(map);
        clearCivicDistricts(map);
        if (mode === "gram_panchayat" || mode === "civic_amenities") {
          clearStateAssembly(map);
          clearStateParliament(map);
        } else if (mode === "assembly") {
          clearStateParliament(map);
          clearStatePolice(map);
        } else if (mode === "parliamentary") {
          clearStateAssembly(map);
          clearStatePolice(map);
        } else {
          clearStateAssembly(map);
          clearStateParliament(map);
          const selectedState = selectedStateNameRef.current;
          if (selectedState) void loadStatePolice(map, selectedState);
        }
      } else if (mode === "administrative") {
        clearStateAssembly(map);
        clearStateParliament(map);
        clearStatePolice(map);
        clearGpDistricts(map);
        clearCivicDistricts(map);
      }
      applyBoundaryLayerVisibility(map);
    },
    setDrawingTool: (tool: AOITool | null) => {
      const map = mapRef.current;
      if (!map) return;
      if (tool) armDrawingTool(map, tool);
      else disarmDrawingTool(map);
    },
    clearAOI: () => {
      const map = mapRef.current;
      if (!map) return;
      clearCompletedAOI(map);
    },
    clearAttributeInfo: () => {
      attributeInfoOpenRef.current = false;
    },
  }));

  // Loads Karnataka's boundary from MinIO when the user clicks its label on the map
  const loadKarnatakaStateFromMinIO = async (map: MapLibreMap) => {
    try {
      console.log("Loading Karnataka State boundary from MinIO...");
      
      // Fetch KMZ from our Next.js API route (which proxies to backend → MinIO)
      const response = await fetch('/api/datasets/karnataka-boundary-kmz');
      
      if (!response.ok) {
        // Silently fail - user can still use manual upload
        // const errorData = await response.json().catch(() => ({}));
        // console.error('Failed to fetch KMZ:', errorData);
        return;
      }
      
      const kmzBlob = await response.blob();
      
      // Process KMZ same way as manual upload
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(kmzBlob);
      
      // Find the main KML file
      let kmlFile = zipContent.file("doc.kml");
      if (!kmlFile) {
        const kmlFiles = Object.keys(zipContent.files).filter((name) =>
          name.toLowerCase().endsWith(".kml")
        );
        const firstKmlFile = kmlFiles[0];
        if (!firstKmlFile) {
          throw new Error("No KML file found in KMZ archive");
        }
        kmlFile = zipContent.file(firstKmlFile);
      }
      
      if (!kmlFile) {
        throw new Error("Could not read KML from KMZ");
      }
      
      const kmlText = await kmlFile.async("text");
      const geojson = parseKMLToGeoJSON(kmlText);
      
      // Remove existing KML layer if any
      if (map.getLayer("kml-fill")) map.removeLayer("kml-fill");
      if (map.getLayer("kml-line")) map.removeLayer("kml-line");
      if (map.getLayer("kml-points")) map.removeLayer("kml-points");
      if (map.getSource("kml-data")) map.removeSource("kml-data");
      
      // Add KML data to map
      map.addSource("kml-data", {
        type: "geojson",
        data: geojson,
      });
      
      // Add polygon fill layer
      map.addLayer({
        id: "kml-fill",
        type: "fill",
        source: "kml-data",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "fill-color": "#f59e0b",
          "fill-opacity": 0.3,
        },
      });
      
      // Add line layer
      map.addLayer({
        id: "kml-line",
        type: "line",
        source: "kml-data",
        filter: ["in", "$type", "LineString", "Polygon"],
        paint: {
          "line-color": "#f59e0b",
          "line-width": 2,
        },
      });
      
      // Add points layer
      map.addLayer({
        id: "kml-points",
        type: "circle",
        source: "kml-data",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#f59e0b",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      
      // Fit map to KML bounds
      if (geojson.features.length > 0) {
        const maplibregl = await import("maplibre-gl");
        const bounds = geojson.features.reduce(
          (bounds, feature) => {
            const geometry = feature.geometry;
            if (geometry.type === "Point") {
              bounds.extend(geometry.coordinates as [number, number]);
            } else if (geometry.type === "LineString") {
              geometry.coordinates.forEach((coord) =>
                bounds.extend(coord as [number, number])
              );
            } else if (geometry.type === "Polygon") {
              geometry.coordinates[0]?.forEach((coord) =>
                bounds.extend(coord as [number, number])
              );
            }
            return bounds;
          },
          new maplibregl.LngLatBounds()
        );
        
        map.fitBounds(bounds, { padding: 50, duration: 1000 });
      }
      
      setUploadedFileName("State.kmz (Auto-loaded from MinIO)");
      console.log(`Successfully auto-loaded Karnataka State boundary with ${geojson.features.length} feature(s)`);
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error("Could not auto-load KMZ:", error);
      // Fail silently - user can still manually upload if needed
    }
  };

  // Each Bengaluru boundary file (Assembly Constituency, Corporation, Zone, or Ward Boundary)
  // is a single-purpose KMZ where every polygon placemark has a real, unique name.
  const parseNamedPolygonsFromKML = (kmlText: string): GeoJSON.FeatureCollection => {
    const parser = new DOMParser();
    const kmlDoc = parser.parseFromString(kmlText, "text/xml");

    const placemarks = kmlDoc.getElementsByTagName("Placemark");
    const features: GeoJSON.Feature[] = [];

    for (let i = 0; i < placemarks.length; i++) {
      const placemark = placemarks[i];
      if (!placemark) continue;
      const name = placemark.getElementsByTagName("name")[0]?.textContent?.trim();
      if (!name) continue; // skip unnamed placemarks from other boundary layers

      const polygon = placemark.getElementsByTagName("Polygon")[0];
      if (!polygon) continue;

      const outerBoundary = polygon.getElementsByTagName("outerBoundaryIs")[0];
      const linearRing = outerBoundary?.getElementsByTagName("LinearRing")[0];
      const coordsText = linearRing?.getElementsByTagName("coordinates")[0]?.textContent?.trim();
      if (!coordsText) continue;

      const coordinates = coordsText
        .split(/\s+/)
        .map((coord) => {
          const [lng, lat] = coord.split(",").map(Number);
          return [lng ?? NaN, lat ?? NaN];
        })
        .filter((coord): coord is [number, number] => !isNaN(coord[0] ?? NaN) && !isNaN(coord[1] ?? NaN));

      if (coordinates.length === 0) continue;

      features.push({
        type: "Feature",
        properties: { name },
        geometry: {
          type: "Polygon",
          coordinates: [coordinates],
        },
      });
    }

    return { type: "FeatureCollection", features };
  };

  // Parses a single Bengaluru boundary file (KMZ, KML, or GeoJSON) into GeoJSON features
  const loadBengaluruFileFeatures = async (key: string): Promise<GeoJSON.Feature[]> => {
    const response = await fetch(`/api/datasets/bengaluru-boundary-file?key=${encodeURIComponent(key)}`);
    if (!response.ok) {
      // Silently fail - optional boundary files
      // const errorData = await response.json().catch(() => ({}));
      // console.error(`Failed to fetch ${key}:`, errorData);
      return [];
    }

    const lowerKey = key.toLowerCase();

    if (lowerKey.endsWith(".kmz")) {
      const blob = await response.blob();
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(blob);

      let kmlFile = zipContent.file("doc.kml");
      if (!kmlFile) {
        const kmlFiles = Object.keys(zipContent.files).filter((name) =>
          name.toLowerCase().endsWith(".kml")
        );
        const firstKmlFile = kmlFiles[0];
        if (!firstKmlFile) return [];
        kmlFile = zipContent.file(firstKmlFile);
      }
      if (!kmlFile) return [];

      const kmlText = await kmlFile.async("text");
      return parseNamedPolygonsFromKML(kmlText).features;
    }

    if (lowerKey.endsWith(".kml")) {
      const kmlText = await response.text();
      return parseNamedPolygonsFromKML(kmlText).features;
    }

    if (lowerKey.endsWith(".geojson") || lowerKey.endsWith(".json")) {
      const geojson = await response.json();
      return geojson.features ?? [];
    }

    console.warn(`Skipping unsupported file type: ${key}`);
    return [];
  };

  // By default, loads each region subfolder's Zone Boundary file when the user clicks
  // Bengaluru's label on the map. If wardQuery is given (e.g. from searching
  // "Bengaluru, Banaswadi"), each subfolder's Ward Boundary file is loaded instead and
  // filtered down to the matching ward.
  const loadBengaluruBoundaryFromMinIO = async (map: MapLibreMap, wardQuery?: string) => {
    try {
      console.log("Loading Bengaluru boundary files from MinIO...");

      const listResponse = await fetch('/api/datasets/bengaluru-boundary-list');
      if (!listResponse.ok) {
        const errorData = await listResponse.json().catch(() => ({}));
        console.error('Failed to list Bengaluru boundary files:', errorData);
        return; // Fail silently, user can still use manual upload
      }

      const { keys } = (await listResponse.json()) as { keys: string[] };
      if (!keys || keys.length === 0) {
        console.warn("No files found in Bengaluru folder");
        return;
      }

      // Pick one file per subfolder: the ward boundary when searching for a ward,
      // otherwise the zone boundary (the default overview shown on a plain city click)
      const typeKeyword = wardQuery ? "ward" : "zone";
      const grouped = groupBengaluruKeysBySubfolder(keys);
      const selectedKeys = Object.values(grouped)
        .map((filesInSubfolder) =>
          filesInSubfolder.find((key) => key.toLowerCase().includes(typeKeyword))
        )
        .filter((key): key is string => Boolean(key));

      if (selectedKeys.length === 0) {
        console.warn(`No "${typeKeyword}" boundary files found across Bengaluru's subfolders`);
        return;
      }

      const featureLists = await Promise.all(selectedKeys.map(loadBengaluruFileFeatures));
      let features = featureLists.flat();

      if (features.length === 0) {
        console.warn("No usable features found across Bengaluru boundary files");
        return;
      }

      if (wardQuery) {
        const normalizedWard = wardQuery.trim().toLowerCase();
        const matched = features.filter((feature) => {
          const name = feature.properties?.name;
          return typeof name === "string" && name.toLowerCase().includes(normalizedWard);
        });

        if (matched.length > 0) {
          features = matched;

          const totalAreaSqm = matched.reduce(
            (sum, feature) =>
              sum + (feature.geometry ? calculatePolygonAreaSqm(feature.geometry) : 0),
            0
          );
          const wardName =
            (matched[0]?.properties?.name as string | undefined) ?? wardQuery;

          onWardSelectedRef.current?.({
            name: wardName,
            areaSqKm: totalAreaSqm / 1_000_000,
            price: totalAreaSqm * WARD_RATE_PER_SQM,
          });
        } else {
          console.warn(`No ward matching "${wardQuery}" found; showing all wards instead`);
        }
      }

      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features,
      };

      // Remove existing Bengaluru layers if any
      if (map.getLayer("bengaluru-fill")) map.removeLayer("bengaluru-fill");
      if (map.getLayer("bengaluru-line")) map.removeLayer("bengaluru-line");
      if (map.getLayer("bengaluru-points")) map.removeLayer("bengaluru-points");
      if (map.getSource("bengaluru-data")) map.removeSource("bengaluru-data");

      map.addSource("bengaluru-data", {
        type: "geojson",
        data: geojson,
      });

      // Add polygon fill layer
      map.addLayer({
        id: "bengaluru-fill",
        type: "fill",
        source: "bengaluru-data",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "fill-color": "#3563e9",
          "fill-opacity": 0.25,
        },
      });

      // Add outline layer (polygons only — point placemarks are intentionally not rendered)
      map.addLayer({
        id: "bengaluru-line",
        type: "line",
        source: "bengaluru-data",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "line-color": "#3563e9",
          "line-width": 1.5,
        },
      });

      // Fit map to the combined bounds of every loaded file
      const maplibregl = await import("maplibre-gl");
      const bounds = new maplibregl.LngLatBounds();
      let hasBounds = false;

      const extendWithCoords = (coords: unknown): void => {
        if (Array.isArray(coords) && typeof coords[0] === "number") {
          bounds.extend(coords as [number, number]);
          hasBounds = true;
        } else if (Array.isArray(coords)) {
          coords.forEach(extendWithCoords);
        }
      };

      features.forEach((feature) => {
        if (feature.geometry && "coordinates" in feature.geometry) {
          extendWithCoords(feature.geometry.coordinates);
        }
      });

      if (hasBounds) {
        map.fitBounds(bounds, { padding: 50, duration: 1000 });
      }

      console.log(
        `Successfully loaded ${features.length} feature(s) from ${selectedKeys.length} Bengaluru boundary file(s)`
      );
      applyBoundaryLayerVisibility(map);
    } catch (error) {
      console.error("Could not load Bengaluru boundary files:", error);
      // Fail silently - user can still manually upload if needed
    }
  };

  const handleDownloadKML = () => {
    // Simple India boundary for KML download
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>India Boundary</name>
    <description>India country boundary - simplified</description>
    <Placemark>
      <name>India</name>
      <Point>
        <coordinates>78.9629,20.5937,0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;

    const blob = new Blob([kml], {
      type: "application/vnd.google-earth.kml+xml",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "india-location.kml";
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseKMLToGeoJSON = (kmlText: string): GeoJSON.FeatureCollection => {
    const parser = new DOMParser();
    const kmlDoc = parser.parseFromString(kmlText, "text/xml");
    
    const features: GeoJSON.Feature[] = [];
    
    // Parse Placemarks
    const placemarks = kmlDoc.getElementsByTagName("Placemark");
    
    for (let i = 0; i < placemarks.length; i++) {
      const placemark = placemarks[i];
      if (!placemark) continue;
      const name = placemark.getElementsByTagName("name")[0]?.textContent || `Feature ${i + 1}`;
      const description = placemark.getElementsByTagName("description")[0]?.textContent || "";
      
      // Parse Point
      const point = placemark.getElementsByTagName("Point")[0];
      if (point) {
        const coordsText = point.getElementsByTagName("coordinates")[0]?.textContent?.trim();
        if (coordsText) {
          const [lng, lat] = coordsText.split(",").map(Number);
          features.push({
            type: "Feature",
            properties: { name, description },
            geometry: {
              type: "Point",
              coordinates: [lng ?? 0, lat ?? 0],
            },
          });
        }
      }
      
      // Parse LineString
      const lineString = placemark.getElementsByTagName("LineString")[0];
      if (lineString) {
        const coordsText = lineString.getElementsByTagName("coordinates")[0]?.textContent?.trim();
        if (coordsText) {
          const coordinates = coordsText
            .split(/\s+/)
            .map((coord) => {
              const [lng, lat] = coord.split(",").map(Number);
              return [lng, lat];
            })
            .filter((coord): coord is [number, number] => !isNaN(coord[0] ?? NaN) && !isNaN(coord[1] ?? NaN));
          
          if (coordinates.length > 0) {
            features.push({
              type: "Feature",
              properties: { name, description },
              geometry: {
                type: "LineString",
                coordinates,
              },
            });
          }
        }
      }
      
      // Parse Polygon
      const polygon = placemark.getElementsByTagName("Polygon")[0];
      if (polygon) {
        const outerBoundary = polygon.getElementsByTagName("outerBoundaryIs")[0];
        if (outerBoundary) {
          const linearRing = outerBoundary.getElementsByTagName("LinearRing")[0];
          if (linearRing) {
            const coordsText = linearRing.getElementsByTagName("coordinates")[0]?.textContent?.trim();
            if (coordsText) {
              const coordinates = coordsText
                .split(/\s+/)
                .map((coord) => {
                  const [lng, lat] = coord.split(",").map(Number);
                  return [lng, lat];
                })
                .filter((coord): coord is [number, number] => !isNaN(coord[0] ?? NaN) && !isNaN(coord[1] ?? NaN));
              
              if (coordinates.length > 0) {
                features.push({
                  type: "Feature",
                  properties: { name, description },
                  geometry: {
                    type: "Polygon",
                    coordinates: [coordinates],
                  },
                });
              }
            }
          }
        }
      }
    }
    
    return {
      type: "FeatureCollection",
      features,
    };
  };

  const handleLoadKML = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      let kmlText: string;

      // Check if file is KMZ (compressed) or KML
      if (file.name.toLowerCase().endsWith(".kmz")) {
        // Handle KMZ - it's a ZIP file containing KML
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);

        // Find the main KML file (usually doc.kml or first .kml file)
        let kmlFile = zipContent.file("doc.kml");
        if (!kmlFile) {
          // Find any .kml file
          const kmlFiles = Object.keys(zipContent.files).filter((name) =>
            name.toLowerCase().endsWith(".kml")
          );
          const firstKmlFile = kmlFiles[0];
          if (!firstKmlFile) {
            throw new Error("No KML file found in KMZ archive");
          }
          kmlFile = zipContent.file(firstKmlFile);
        }

        if (!kmlFile) {
          throw new Error("Could not read KML from KMZ");
        }

        kmlText = await kmlFile.async("text");
      } else {
        // Handle regular KML file
        kmlText = await file.text();
      }

      const geojson = parseKMLToGeoJSON(kmlText);

      if (!mapRef.current) {
        alert("Map not initialized yet. Please wait and try again.");
        return;
      }

      const map = mapRef.current;

      // Remove existing KML layer if any
      if (map.getLayer("kml-fill")) map.removeLayer("kml-fill");
      if (map.getLayer("kml-line")) map.removeLayer("kml-line");
      if (map.getLayer("kml-points")) map.removeLayer("kml-points");
      if (map.getSource("kml-data")) map.removeSource("kml-data");

      // Add new KML data
      map.addSource("kml-data", {
        type: "geojson",
        data: geojson,
      });

      // Add polygon fill layer
      map.addLayer({
        id: "kml-fill",
        type: "fill",
        source: "kml-data",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "fill-color": "#f59e0b",
          "fill-opacity": 0.3,
        },
      });

      // Add line layer
      map.addLayer({
        id: "kml-line",
        type: "line",
        source: "kml-data",
        filter: ["in", "$type", "LineString", "Polygon"],
        paint: {
          "line-color": "#f59e0b",
          "line-width": 2,
        },
      });

      // Add points layer
      map.addLayer({
        id: "kml-points",
        type: "circle",
        source: "kml-data",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#f59e0b",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Fit map to KML bounds
      if (geojson.features.length > 0) {
        const maplibregl = await import("maplibre-gl");
        const bounds = geojson.features.reduce(
          (bounds, feature) => {
            const geometry = feature.geometry;
            if (geometry.type === "Point") {
              bounds.extend(geometry.coordinates as [number, number]);
            } else if (geometry.type === "LineString") {
              geometry.coordinates.forEach((coord) =>
                bounds.extend(coord as [number, number])
              );
            } else if (geometry.type === "Polygon") {
              geometry.coordinates[0]?.forEach((coord) =>
                bounds.extend(coord as [number, number])
              );
            }
            return bounds;
          },
          new maplibregl.LngLatBounds()
        );

        map.fitBounds(bounds, { padding: 50, duration: 1000 });
      }

      setUploadedFileName(file.name);
      alert(
        `Successfully loaded ${file.name}\nFound ${geojson.features.length} feature(s)`
      );
    } catch (error) {
      console.error("Error loading KML/KMZ:", error);
      alert(
        `Failed to load file: ${error instanceof Error ? error.message : "Unknown error"}\nPlease ensure it's a valid KML or KMZ format.`
      );
    }

    // Reset file input
    if (event.target) {
      event.target.value = "";
    }
  };

  return (
    <div className="relative w-full h-full explore-map-root">
      {/* Fixes the scale control's box to a constant width sized for its longest possible
          label (e.g. "1000 km"), overriding MapLibre's default of resizing the box itself
          on every zoom step - only the text inside should change. */}
      <style>{`
        .explore-map-root .maplibregl-ctrl-scale {
          width: 90px !important;
        }
      `}</style>
      {/* Map Viewer - Full Size */}
      <div className="absolute inset-0">
        {isLoading && !loadError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50/90">
            <div className="text-center">
              <div className="mb-2 inline-block h-8 w-8 animate-spin rounded-full border-4 border-atlas-cobalt border-t-transparent"></div>
              <p className="text-sm text-gray-600">Loading map...</p>
            </div>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50">
            <div className="text-center px-4">
              <p className="text-sm text-gray-600">
                Map temporarily unavailable
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Please check your internet connection and refresh
              </p>
            </div>
          </div>
        )}
        <div
          ref={containerRef}
          style={{ width: "100%", height: "100%" }}
          role="img"
          aria-label="Interactive map of India"
        />
      </div>

      {/* Hidden file input for KML upload (can be triggered programmatically if needed) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".kml,.kmz"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Layers Control */}
      {!isLoading && !loadError && (
        <LayersControl
          currentLayer={currentLayer}
          onLayerChange={handleLayerChange}
        />
      )}
    </div>
  );
});
