"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import type { KeyboardEvent } from "react";
import {
  IndiaMapViewer,
  type IndiaMapViewerHandle,
  type WardSelection,
  type BoundaryLayerMode,
  type AOITool,
  type AOIResult,
  type AttributeInfo,
} from "./IndiaMapViewer";
import type { RtcOwner } from "@/app/api/land-records/_bhoomi";
import { ExportFeatureModal } from "./ExportFeatureModal";
import { UserProfile } from "./UserProfile";
import { FreeHandIcon, PolygonIcon, RectangleIcon, DrawAOIIcon } from "./AOIIcons";
import { ChevronDown, ChevronUp, MapPin, Search, Menu, X } from "lucide-react";

const AOI_TOOLS: { id: AOITool; label: string; Icon: typeof FreeHandIcon }[] = [
  { id: "freehand", label: "Free Hand", Icon: FreeHandIcon },
  { id: "polygon", label: "Polygon", Icon: PolygonIcon },
  { id: "rectangle", label: "Rectangle", Icon: RectangleIcon },
];

// The Boundary Layers group is single-select: exactly one option is active at a time
// (radio-like behavior, rendered as checkboxes). "administrative" shows every loaded
// administrative boundary layer; "assembly" and "parliamentary" show the neon-blue
// india_states geojson plus their loaded constituency boundaries; "gram panchayat" shows
// the neon-blue states too (panchayat boundaries aren't wired to data yet).

const BOUNDARY_LAYER_OPTIONS: { id: BoundaryLayerMode; label: string }[] = [
  { id: "administrative", label: "Administrative Boundaries" },
  { id: "assembly", label: "Assembly Constituency Boundaries" },
  { id: "parliamentary", label: "Parliamentary Constituency Boundaries" },
  { id: "gram_panchayat", label: "Gram Panchayat Boundaries" },
  { id: "police_station", label: "Police Station Boundaries" },
  { id: "civic_amenities", label: "Civic Amenities" },
];

const BENGALURU_REGIONS = ["Central", "East", "North", "South", "West"] as const;

// Static Bengaluru-specific suggestions (ward/zone drill-down search, e.g.
// "Bengaluru, Central, Ward Boundary"). State/district/taluk suggestions are built
// dynamically below from real data instead of being hardcoded here.
const PLACE_SUGGESTIONS = {
  regions: ["Bengaluru", "Bangalore"],
  bengaluruZones: [...BENGALURU_REGIONS],
  villages: [
    "Banaswadi",
    "Koramangala",
    "Indiranagar",
    "Koramangala 1st Block",
    "Koramangala 2nd Block",
    "Koramangala 3rd Block",
    "Koramangala 4th Block",
    "Koramangala 5th Block",
    "Hebbal",
    "Malleshwaram",
    "Brindavan Nagar",
    "Hombegowda Nagar",
    "Vinayaka Nagar",
    "Srinivasa Nagar",
    "Chennamma Nagar",
    "Muthanamakki",
    "Kengeri",
    "Attibele",
    "Hosakote",
    "Devanahalli",
    "Yelahanka",
    "Kenchapura",
    "Varthur",
    "Sarjapur",
    "Electronic City",
    "Bannerghatta",
    "Jayanagar",
    "JP Nagar",
    "BTM Layout",
    "Ulsoor",
    "Shivaji Nagar",
    "Panathur",
    "Vijay Nagar",
  ],
  wards: [
    "Banaswadi",
    "Koramangala",
    "Indiranagar",
    "Malleshwaram",
    "Hebbal",
    "Yelahanka",
    "Whitefield",
    "Electronics City",
    "Hosur Road",
    "BTM Layout",
    "Jayanagar",
    "JP Nagar",
    "BTM 2nd Stage",
    "BTM 4th Stage",
    "BTM 6th Stage",
    "Malleswaram",
    "R V Nagar",
    "Kaduvalli",
    "Goraguntepalya",
    "Punjai Palaya",
    "Dasarahalli",
    "Tadpalya",
    "Pai Layout",
    "Veerabhadra Nagar",
    "Hoskote",
    "Sud Flatten",
    "Varthur",
    "Sarjapur",
    "Kundalahalli",
    "Kaikondrahalli",
    "Hegde Nagar",
    "Vasanth Nagar",
    "Kempapura",
    "Kadugodi",
    "Leelavathi Nagar",
    "Konena Agrahara",
    "Maruthi Seve Nagar",
    "Prarthana Circle",
    "Gopala Nagar",
    "Garudacharpalya",
    "Hoodi",
    "Harlur",
    "Bellandur",
    "Yelahanka",
  ],
};

function filterSuggestions(query: string, category: string) {
  const searchTerm = query.toLowerCase();
  if (!searchTerm) return [];

  const allItems = PLACE_SUGGESTIONS[category as keyof typeof PLACE_SUGGESTIONS] || [];
  return (
    allItems
      .filter((item) => item.toLowerCase().includes(searchTerm))
      // Prefix matches ("Ban..." -> "Banaswadi") rank above mid-word matches ("...swadi").
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(searchTerm);
        const bStarts = b.toLowerCase().startsWith(searchTerm);
        if (aStarts === bStarts) return a.localeCompare(b);
        return aStarts ? -1 : 1;
      })
      .slice(0, 6)
  ); // Limit to top 6 suggestions per category
}

// Wraps the portion of `text` that matches `query` in <mark> for visual emphasis.
function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-transparent font-semibold text-atlas-cobalt">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

// Display name for each PLACE_SUGGESTIONS key, since some (like "bengaluruZones") don't
// read well through a naive capitalize-first-letter.
const CATEGORY_LABELS: Record<string, string> = {
  regions: "Regions",
  bengaluruZones: "Bengaluru Zones",
  villages: "Villages",
  wards: "Wards",
};

// A selectable state/district/taluk, built from real data (see the fetch effect below).
// `label` is both what's shown in the dropdown and the exact string passed to
// mapViewerRef.current.search() on selection (e.g. "Karnataka, Hassan"); `leaf` is just the
// place's own name (e.g. "Hassan"), used to rank prefix matches on the specific place typed
// above matches that only happen to occur earlier in the full label.
interface LocationEntry {
  label: string;
  leaf: string;
}

// Filters/ranks LocationEntry[] by a typed query, matching either the full label
// ("Karnataka, Hassan") or just the leaf name ("Hassan"), and returns plain label strings
// ready to drop straight into the existing {category, items: string[]} suggestion shape.
function filterLocationEntries(entries: LocationEntry[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return entries
    .filter((e) => e.label.toLowerCase().includes(q))
    .sort((a, b) => {
      const aLeafStarts = a.leaf.toLowerCase().startsWith(q);
      const bLeafStarts = b.leaf.toLowerCase().startsWith(q);
      if (aLeafStarts !== bLeafStarts) return aLeafStarts ? -1 : 1;

      const aLabelStarts = a.label.toLowerCase().startsWith(q);
      const bLabelStarts = b.label.toLowerCase().startsWith(q);
      if (aLabelStarts !== bLabelStarts) return aLabelStarts ? -1 : 1;

      return a.label.localeCompare(b.label);
    })
    .slice(0, 6)
    .map((e) => e.label);
}

// Formats a geodesic area in km² for the AOI chip: km² (up to 2 decimals), switching to m²
// for shapes smaller than 0.01 km² (e.g. a drawn building footprint).
function formatAreaSqKm(areaSqKm: number): string {
  if (areaSqKm < 0.01) {
    return `${Math.max(Math.round(areaSqKm * 1_000_000), 1).toLocaleString("en-IN")} m²`;
  }
  if (areaSqKm >= 100) {
    return `${Math.round(areaSqKm).toLocaleString("en-IN")} km²`;
  }
  return `${areaSqKm.toLocaleString("en-IN", { maximumFractionDigits: 2 })} km²`;
}

export function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedWard, setSelectedWard] = useState<WardSelection | null>(null);
  const mapViewerRef = useRef<IndiaMapViewerHandle>(null);
  const [expandedFilters, setExpandedFilters] = useState({
    type: true,
  });
  // The single active Boundary Layers option ("administrative" by default, so the
  // india states / districts / taluks / hoblies / villages layers show initially).
  const [selectedBoundaryLayer, setSelectedBoundaryLayer] =
    useState<BoundaryLayerMode>("administrative");
  const [searchSuggestions, setSearchSuggestions] = useState<
    { category: string; items: string[] }[]
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  // "Draw AOI" tool dropdown
  const [showAOIMenu, setShowAOIMenu] = useState(false);
  const [activeAOITool, setActiveAOITool] = useState<AOITool | null>(null);
  // The last completed drawn AOI (area + geometry), reported by the map viewer; null until
  // the user finishes drawing a shape.
  const [aoiInfo, setAoiInfo] = useState<AOIResult | null>(null);
  const aoiMenuRef = useRef<HTMLDivElement>(null);

  // Right-click attribute info for the side panel (boundary type + title + rows), reported
  // by the map viewer; null when no feature is shown.
  const [attributeInfo, setAttributeInfo] = useState<AttributeInfo | null>(null);

  // Whether the export-format picker (opened from the attribute panel's "Export" action) is
  // showing. It reads geometry/properties off `attributeInfo`, so it closes itself whenever
  // the panel closes rather than tracking its own copy of the feature.
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Owner names for the selected cadastral parcel. They aren't in the cadastral GeoJSON, so
  // they're fetched from Bhoomi (via /api/land-records/rtc) once a parcel is selected - a
  // slow, multi-step lookup against the state portal, hence the explicit loading state.
  const [owners, setOwners] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ok"; rows: RtcOwner[] }
  >({ status: "loading" });

  const parcel = attributeInfo?.parcel;
  useEffect(() => {
    if (!parcel) return;
    const controller = new AbortController();
    setOwners({ status: "loading" });
    (async () => {
      try {
        const res = await fetch(
          `/api/land-records/rtc?${new URLSearchParams({ ...parcel }).toString()}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
        setOwners({ status: "ok", rows: data.owners ?? [] });
      } catch (error) {
        if (controller.signal.aborted) return;
        setOwners({
          status: "error",
          message: error instanceof Error ? error.message : "Lookup failed",
        });
      }
    })();
    return () => controller.abort();
    // A parcel object is rebuilt on every right-click, so key the effect on its values.
  }, [
    parcel?.district,
    parcel?.taluk,
    parcel?.hobli,
    parcel?.village,
    parcel?.survey,
    parcel?.surnoc,
    parcel?.hissa,
  ]);

  // Real state/district/taluk names, fetched once on mount, that back the dynamic
  // suggestion categories below (as opposed to the hardcoded Bengaluru ward/zone lists).
  const [statesList, setStatesList] = useState<string[]>([]);
  const [districtsList, setDistrictsList] = useState<string[]>([]); // Karnataka only, for now
  const [taluksList, setTaluksList] = useState<{ district: string; taluk: string }[]>([]);
  // All-Karnataka hobli index (district/taluk/hobli triples from
  // /data/karnataka_hoblis.json), so a bare hobli name can suggest every matching hobli
  // across the state - not just the ones in the currently-selected taluk.
  const [hoblisList, setHoblisList] = useState<
    { district: string; taluk: string; hobli: string }[]
  >([]);
  // All-Karnataka village index (district/taluk/hobli/village quadruples from
  // /data/karnataka_villages.json), so a bare village name can suggest every matching
  // village across the state. ~27k villages, loaded once on mount.
  const [villagesList, setVillagesList] = useState<
    { district: string; taluk: string; hobli: string; village: string }[]
  >([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/geodata/india-states.geojson");
        if (res.ok) {
          const geo = await res.json();
          const names = Array.from(
            new Set(
              (geo.features as Array<{ properties?: { st_nm?: string } }>)
                .map((f) => f.properties?.st_nm)
                .filter((n): n is string => Boolean(n)),
            ),
          ).sort();
          setStatesList(names);
        }
      } catch (error) {
        console.error("Failed to load state names for search suggestions:", error);
      }
    })();

    (async () => {
      try {
        const res = await fetch("/api/datasets/state-districts?state=Karnataka");
        if (res.ok) {
          const geo = await res.json();
          const names = Array.from(
            new Set(
              (geo.features as Array<{ properties?: { dtname?: string } }>)
                .map((f) => f.properties?.dtname)
                .filter((n): n is string => Boolean(n)),
            ),
          ).sort();
          setDistrictsList(names);
        }
      } catch (error) {
        console.error("Failed to load Karnataka district names for search suggestions:", error);
      }
    })();

    (async () => {
      try {
        const res = await fetch("/data/karnataka_taluks.json");
        if (res.ok) {
          setTaluksList(await res.json());
        }
      } catch (error) {
        console.error("Failed to load Karnataka taluk names for search suggestions:", error);
      }
    })();

    (async () => {
      try {
        const res = await fetch("/data/karnataka_hoblis.json");
        if (res.ok) {
          setHoblisList(await res.json());
        }
      } catch (error) {
        console.error("Failed to load Karnataka hobli names for search suggestions:", error);
      }
    })();

    (async () => {
      try {
        const res = await fetch("/data/karnataka_villages.json");
        if (res.ok) {
          setVillagesList(await res.json());
        }
      } catch (error) {
        console.error("Failed to load Karnataka village names for search suggestions:", error);
      }
    })();
  }, []);

  const stateEntries = useMemo<LocationEntry[]>(
    () => statesList.map((name) => ({ label: name, leaf: name })),
    [statesList],
  );
  const districtEntries = useMemo<LocationEntry[]>(
    () => districtsList.map((name) => ({ label: `Karnataka, ${name}`, leaf: name })),
    [districtsList],
  );
  const talukEntries = useMemo<LocationEntry[]>(
    () =>
      taluksList.map(({ district, taluk }) => ({
        label: `Karnataka, ${district}, ${taluk}`,
        leaf: taluk,
      })),
    [taluksList],
  );
  // One entry per hobli, labeled with its full "State, District, Taluk, Hobli" chain so a
  // bare hobli name lists every matching hobli across the state (Kasaba has ~95 of them).
  const hobliEntries = useMemo<LocationEntry[]>(
    () =>
      hoblisList.map(({ district, taluk, hobli }) => ({
        label: `Karnataka, ${district}, ${taluk}, ${hobli}`,
        leaf: hobli,
      })),
    [hoblisList],
  );
  // One entry per village, labeled with its full "State, District, Taluk, Hobli, Village"
  // chain so a bare village name lists every matching village across the state.
  const villageEntries = useMemo<LocationEntry[]>(
    () =>
      villagesList.map(({ district, taluk, hobli, village }) => ({
        label: `Karnataka, ${district}, ${taluk}, ${hobli}, ${village}`,
        leaf: village,
      })),
    [villagesList],
  );

  // Close the suggestions dropdown when clicking anywhere outside the search bar.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close the "Draw AOI" tool dropdown when clicking anywhere outside it.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (aoiMenuRef.current && !aoiMenuRef.current.contains(e.target as Node)) {
        setShowAOIMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // The map's current state/district/taluk drill-down (reported by IndiaMapViewer), used
  // to scope bare hobli-name suggestions to the taluk the user is currently looking at.
  const [drillContext, setDrillContext] = useState<{
    state: string;
    district: string;
    taluk: string;
  } | null>(null);

  // Hobli names are fetched on demand from the taluk-hoblies API (no static list exists),
  // keyed by "district|taluk", to back the hobli search suggestions - both the 4-part
  // "Karnataka, <district>, <taluk>, ..." queries and bare hobli names while a taluk is
  // selected on the map.
  const [hobliesByTaluk, setHobliesByTaluk] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const parts = searchQuery.split(",").map((p) => p.trim());
    let district = "";
    let taluk = "";
    if (
      parts.length >= 3 &&
      parts[0]?.toLowerCase() === "karnataka" &&
      parts[1] &&
      parts[2]
    ) {
      district = parts[1];
      taluk = parts[2];
    } else if (parts.length === 1 && parts[0] && drillContext) {
      // Bare hobli-name query - scope it to the map's currently-selected taluk.
      district = drillContext.district;
      taluk = drillContext.taluk;
    }
    if (!district || !taluk) return;
    const key = `${district}|${taluk}`;
    if (hobliesByTaluk[key]) return; // already fetched
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/datasets/taluk-hoblies?taluk=${encodeURIComponent(taluk)}&district=${encodeURIComponent(district)}&state=Karnataka`
        );
        if (!res.ok || cancelled) return;
        const geo = await res.json();
        if (cancelled) return;
        const names = Array.from(
          new Set(
            (geo.features as Array<{
              properties?: { KGISHobliName?: string; hobli_name?: string; name?: string };
            }>)
              .map(
                (f) =>
                  f.properties?.KGISHobliName ??
                  f.properties?.hobli_name ??
                  f.properties?.name
              )
              .filter((n): n is string => Boolean(n)),
          ),
        );
        setHobliesByTaluk((prev) => ({ ...prev, [key]: names }));
      } catch (error) {
        console.error("Failed to load hobli names for search suggestions:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchQuery, hobliesByTaluk, drillContext]);

  // Generate search suggestions based on current query
  useEffect(() => {
    if (!searchQuery) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const suggestions: { category: string; items: string[] }[] = [];

    // The country itself is always searchable ("India") - it isn't a state, so it
    // would otherwise never match the state/district/taluk lists below.
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (normalizedQuery && "india".includes(normalizedQuery)) {
      suggestions.push({ category: "Country", items: ["India"] });
    }

    // Real state/district/taluk matches take priority over the static Bengaluru lists.
    const stateMatches = filterLocationEntries(stateEntries, searchQuery);
    if (stateMatches.length > 0) suggestions.push({ category: "States", items: stateMatches });

    const districtMatches = filterLocationEntries(districtEntries, searchQuery);
    if (districtMatches.length > 0)
      suggestions.push({ category: "Districts", items: districtMatches });

    const talukMatches = filterLocationEntries(talukEntries, searchQuery);
    if (talukMatches.length > 0) suggestions.push({ category: "Taluks", items: talukMatches });

    // Hobli suggestions - labeled with the full "State, District, Taluk, Hobli" chain.
    // A bare hobli name matches against the all-Karnataka hobli index so EVERY matching
    // hobli across the state is offered (e.g. "kasaba" lists all ~95 Kasaba hoblies,
    // each with its own district/taluk).
    const queryParts = searchQuery.split(",").map((p) => p.trim());
    if (queryParts.length === 1 && queryParts[0]) {
      // Match against the hobli name itself (the leaf), not the whole chain - the
      // state/district/taluk categories already cover chain-queries, and matching the
      // full label would flood this category with every "Karnataka, ..." entry.
      const hobliQuery = queryParts[0].toLowerCase();
      const hobliMatches = hobliEntries
        .filter((e) => e.leaf.toLowerCase().includes(hobliQuery))
        .sort((a, b) => {
          const aStarts = a.leaf.toLowerCase().startsWith(hobliQuery);
          const bStarts = b.leaf.toLowerCase().startsWith(hobliQuery);
          if (aStarts === bStarts) return a.label.localeCompare(b.label);
          return aStarts ? -1 : 1;
        })
        .map((e) => e.label);
      if (hobliMatches.length > 0)
        suggestions.push({ category: "Hoblies", items: hobliMatches });

      // Villages: same treatment, matching the village name itself (leaf). A 1-char
      // query would match tens of thousands of villages, so require 2+ chars and cap the
      // list so the dropdown doesn't freeze.
      if (hobliQuery.length >= 2) {
        const villageMatches = villageEntries
          .filter((e) => e.leaf.toLowerCase().includes(hobliQuery))
          .sort((a, b) => {
            const aStarts = a.leaf.toLowerCase().startsWith(hobliQuery);
            const bStarts = b.leaf.toLowerCase().startsWith(hobliQuery);
            if (aStarts === bStarts) return a.label.localeCompare(b.label);
            return aStarts ? -1 : 1;
          })
          .slice(0, 100)
          .map((e) => e.label);
        if (villageMatches.length > 0)
          suggestions.push({ category: "Villages", items: villageMatches });
      }
    } else if (queryParts.length >= 4 && queryParts[0]?.toLowerCase() === "karnataka") {
      // Full "Karnataka, <district>, <taluk>, <hobli>, ..." chain - match the 5th
      // segment (the village name) against the entries whose chain matches parts 1-3.
      const chainDistrict = queryParts[1] ?? "";
      const chainTaluk = queryParts[2] ?? "";
      const chainHobli = queryParts[3] ?? "";
      const villageQuery = (queryParts[4] ?? "").toLowerCase();
      const villageMatches = villageEntries
        .filter((e) => {
          const parts = e.label.split(", ");
          return (
            parts[1] === chainDistrict &&
            parts[2] === chainTaluk &&
            parts[3] === chainHobli &&
            e.leaf.toLowerCase().includes(villageQuery)
          );
        })
        .slice(0, 50)
        .map((e) => e.label);
      if (villageMatches.length > 0)
        suggestions.push({ category: "Villages", items: villageMatches });
    } else if (queryParts.length >= 3 && queryParts[0]?.toLowerCase() === "karnataka") {
      // Full "Karnataka, <district>, <taluk>, ..." chain - fetch that taluk's hoblies on
      // demand (fresh from the actual boundary data) and match the 4th segment.
      const hobliDistrict = queryParts[1] ?? "";
      const hobliTaluk = queryParts[2] ?? "";
      const hobliNames = hobliesByTaluk[`${hobliDistrict}|${hobliTaluk}`];
      if (hobliNames && hobliNames.length > 0) {
        const hobliQuery = (queryParts[3] ?? "").toLowerCase();
        const hobliMatches = hobliNames
          .filter((hobli) => hobli.toLowerCase().includes(hobliQuery))
          .sort((a, b) => {
            const aStarts = a.toLowerCase().startsWith(hobliQuery);
            const bStarts = b.toLowerCase().startsWith(hobliQuery);
            if (aStarts === bStarts) return a.localeCompare(b);
            return aStarts ? -1 : 1;
          })
          .map((hobli) => `Karnataka, ${hobliDistrict}, ${hobliTaluk}, ${hobli}`);
        if (hobliMatches.length > 0)
          suggestions.push({ category: "Hoblies", items: hobliMatches });
      }
    }

    // Search across the remaining (static, Bengaluru-specific) categories
    Object.keys(PLACE_SUGGESTIONS).forEach((category) => {
      const filtered = filterSuggestions(searchQuery, category);
      if (filtered.length > 0) {
        suggestions.push({
          category: CATEGORY_LABELS[category] ?? category,
          items: filtered,
        });
      }
    });

    // Merge categories that share a label (e.g. the dynamic all-Karnataka "Villages" and
    // the static Bengaluru "Villages") so the dropdown never renders duplicate keys.
    const merged: { category: string; items: string[] }[] = [];
    for (const cat of suggestions) {
      const existing = merged.find((m) => m.category === cat.category);
      if (existing) existing.items = [...existing.items, ...cat.items];
      else merged.push(cat);
    }

    setSearchSuggestions(merged);
    setShowSuggestions(merged.length > 0);
    setSelectedSuggestionIndex(-1);
  }, [
    searchQuery,
    stateEntries,
    districtEntries,
    talukEntries,
    hobliEntries,
    villageEntries,
    hobliesByTaluk,
    drillContext,
  ]);

  // Handle keyboard navigation for suggestions
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => Math.min(prev + 1, getTotalSuggestions() - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => Math.max(prev - 1, -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          const suggestion = getSuggestionByIndex(selectedSuggestionIndex);
          if (suggestion) {
            setSearchQuery(suggestion);
            setShowSuggestions(false);
            mapViewerRef.current?.search(suggestion);
          }
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  };

  const getTotalSuggestions = () =>
    searchSuggestions.reduce((total, cat) => total + cat.items.length, 0);

  const getSuggestionByIndex = (index: number) => {
    let currentIndex = 0;
    for (const category of searchSuggestions) {
      if (index < currentIndex + category.items.length) {
        return category.items[index - currentIndex];
      }
      currentIndex += category.items.length;
    }
    return null;
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
    mapViewerRef.current?.search(suggestion);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setShowSuggestions(false);
    mapViewerRef.current?.search("");
  };

  // "Type" filter: Bengaluru's region subfolders, each expandable to show/load its files
  const [bengaluruFileTree, setBengaluruFileTree] = useState<Record<string, string[]> | null>(null);
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({});
  const [loadedExtraFiles, setLoadedExtraFiles] = useState<Record<string, boolean>>({});

  const toggleFilter = (filter: keyof typeof expandedFilters) => {
    setExpandedFilters((prev) => ({ ...prev, [filter]: !prev[filter] }));
  };

  const toggleRegion = async (region: string) => {
    const willExpand = !expandedRegions[region];
    setExpandedRegions((prev) => ({ ...prev, [region]: willExpand }));

    if (willExpand && !bengaluruFileTree) {
      const tree = await mapViewerRef.current?.listBengaluruFiles();
      if (tree) setBengaluruFileTree(tree);
    }
  };

  const handleToggleExtraFile = async (key: string, checked: boolean) => {
    setLoadedExtraFiles((prev) => ({ ...prev, [key]: checked }));
    await mapViewerRef.current?.toggleBengaluruFile(key, checked);
  };

  const filenameFromKey = (key: string) =>
    key
      .split("/")
      .pop()
      ?.replace(/\.kmz$/i, "")
      .replace(/_/g, " ") ?? key;

  const regionFromKey = (key: string) => key.match(/Bengaluru\/([^/]+)\//i)?.[1];

  // Keeps the Type filter's checkboxes/expansion in sync when a search (e.g.
  // "Bengaluru, Central, Ward Boundary") loads a file directly, bypassing the checkboxes.
  const handleExtraFileToggledFromSearch = async (key: string, visible: boolean) => {
    setLoadedExtraFiles((prev) => ({ ...prev, [key]: visible }));

    const region = regionFromKey(key);
    if (!region) return;

    setExpandedRegions((prev) => ({ ...prev, [region]: true }));
    if (!bengaluruFileTree) {
      const tree = await mapViewerRef.current?.listBengaluruFiles();
      if (tree) setBengaluruFileTree(tree);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-100">
      {/* Main Content - map fills the full page, everything else floats on top */}
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <IndiaMapViewer
          ref={mapViewerRef}
          onWardSelected={setSelectedWard}
          onBoundariesCleared={() => setLoadedExtraFiles({})}
          onExtraFileToggled={handleExtraFileToggledFromSearch}
          onAOIChange={setAoiInfo}
          onDrawingToolChange={setActiveAOITool}
          onAttributeInfo={setAttributeInfo}
          onDrillContextChange={setDrillContext}
        />

        {/* Floating search bar */}
        <div className="absolute left-4 right-4 top-4 z-20 flex items-center gap-3">
          {/* Search Bar */}
          <div ref={searchWrapperRef} className="relative max-w-md flex-1">
            <div className="flex items-center gap-1 rounded-full bg-white py-1 pl-1 pr-2 shadow-md">
              <button
                onClick={() => setShowFilters((prev) => !prev)}
                className={`flex-shrink-0 rounded-full p-2 transition-colors ${
                  showFilters
                    ? "bg-gray-100 text-obsidian-graphite"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
                aria-label="Toggle filters"
                aria-pressed={showFilters}
              >
                <Menu className="h-4 w-4" />
              </button>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (selectedSuggestionIndex >= 0) {
                      const suggestion = getSuggestionByIndex(selectedSuggestionIndex);
                      if (suggestion) {
                        setSearchQuery(suggestion);
                        setShowSuggestions(false);
                        mapViewerRef.current?.search(suggestion);
                      }
                    } else {
                      setShowSuggestions(false);
                      mapViewerRef.current?.search(searchQuery);
                    }
                  } else {
                    handleKeyDown(e);
                  }
                }}
                onFocus={() =>
                  searchQuery && searchSuggestions.length > 0 && setShowSuggestions(true)
                }
                placeholder="Search location, village, taluk, district..."
                role="combobox"
                aria-expanded={showSuggestions}
                aria-autocomplete="list"
                aria-controls="search-suggestions-listbox"
                className="min-w-0 flex-1 bg-transparent py-1 text-sm focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="flex-shrink-0 rounded-full p-2 text-gray-500 hover:bg-gray-100"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => {
                  setShowSuggestions(false);
                  mapViewerRef.current?.search(searchQuery);
                }}
                className="flex-shrink-0 rounded-full p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && searchSuggestions.length > 0 && (
              <div
                id="search-suggestions-listbox"
                role="listbox"
                className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-lg"
              >
                {searchSuggestions.map((cat, catIdx) => {
                  const offset = searchSuggestions
                    .slice(0, catIdx)
                    .reduce((sum, c) => sum + c.items.length, 0);
                  return (
                    <div key={cat.category}>
                      <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        {cat.category}
                      </div>
                      {cat.items.map((item, i) => {
                        const idx = offset + i;
                        const isActive = idx === selectedSuggestionIndex;
                        return (
                          <button
                            type="button"
                            key={`${cat.category}-${item}-${i}`}
                            role="option"
                            aria-selected={isActive}
                            // Prevents the input's blur (and its click-outside-triggered
                            // dropdown close) from firing before the click is registered.
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSuggestionClick(item)}
                            onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                            className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                              isActive
                                ? "bg-gray-100 text-obsidian-graphite"
                                : "text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                            <span className="truncate">{highlightMatch(item, searchQuery)}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Spacer to push items to the right */}
          <div className="flex-1" />

          {/* Draw AOI Button */}
          <div ref={aoiMenuRef} className="relative">
            {/* Pill container: a "open menu" button plus, while a tool is active, a separate
                close button to deselect it - kept as siblings so no button nests inside a
                button (valid HTML, and clicking the X never toggles the menu). */}
            <div
              className={`flex items-center overflow-hidden rounded-full border shadow-md transition-colors ${
                activeAOITool ? "border-atlas-cobalt bg-atlas-cobalt" : "border-gray-200 bg-white"
              }`}
            >
              <button
                type="button"
                onClick={() => setShowAOIMenu((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={showAOIMenu}
                className={`flex items-center gap-2 whitespace-nowrap py-2.5 text-sm font-medium transition-colors ${
                  activeAOITool
                    ? "hover:bg-atlas-cobalt/90 pl-4 pr-2 text-white"
                    : "px-4 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {activeAOITool ? (
                  (() => {
                    const ActiveIcon = AOI_TOOLS.find((t) => t.id === activeAOITool)!.Icon;
                    return <ActiveIcon className="h-4 w-4" />;
                  })()
                ) : (
                  <DrawAOIIcon className="h-5 w-5" />
                )}
                {activeAOITool ? AOI_TOOLS.find((t) => t.id === activeAOITool)!.label : "Draw AOI"}
                {/* Chevron spins 180° clockwise when the menu opens, and smoothly back on close.
                    Hidden while a tool is active - the close button replaces it. */}
                {!activeAOITool && (
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-300 ease-in-out ${
                      showAOIMenu ? "rotate-180" : ""
                    }`}
                  />
                )}
              </button>

              {/* Close button: shown instead of the chevron while a tool is selected, so the
                  tool can be deselected (button reverts to "Draw AOI") without opening the menu. */}
              {activeAOITool && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveAOITool(null);
                    setShowAOIMenu(false);
                    mapViewerRef.current?.setDrawingTool(null);
                  }}
                  aria-label={`Deselect ${AOI_TOOLS.find((t) => t.id === activeAOITool)!.label}`}
                  className="flex items-center self-stretch px-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {showAOIMenu && (
              <div
                role="menu"
                // Stretched left-0/right-0 (instead of w-full) so the dropdown, borders
                // included, is exactly as wide as the button it hangs from
                className="aoi-menu-in absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg"
              >
                {AOI_TOOLS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveAOITool(id);
                      setShowAOIMenu(false);
                      mapViewerRef.current?.setDrawingTool(id);
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                      activeAOITool === id
                        ? "bg-gray-100 text-obsidian-graphite"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User Profile Icon — reads the signed-in user from the session */}
          <UserProfile />
        </div>

        {/* Attribute info panel - appears below the Draw AOI / User Profile buttons, on the
            right side, when the user right-clicks a boundary feature on the map. No height
            limit: all attribute rows are shown in full. */}
        {attributeInfo && (
          <aside className="attr-panel-in scrollbar-hide absolute right-4 top-20 z-20 max-h-[calc(100vh-120px)] w-80 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex-shrink-0 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-600">
                  {attributeInfo.typeLabel}
                </span>
                <h3 className="truncate text-sm font-semibold text-slate-900">
                  {attributeInfo.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAttributeInfo(null);
                  setExportModalOpen(false);
                  mapViewerRef.current?.clearAttributeInfo();
                }}
                aria-label="Close attribute panel"
                className="flex-shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <table className="w-full border-collapse text-xs">
              <tbody>
                {/* Owner names (Bhoomi RTC) sit above the parcel's own attributes - they're
                    what the parcel is usually looked up for. */}
                {attributeInfo.parcel && (
                  <>
                    {owners.status === "loading" && (
                      <tr className="border-b border-slate-100">
                        <td className="w-1 whitespace-nowrap border-r border-slate-200 px-3 py-1.5 align-top text-slate-500">
                          Owner
                        </td>
                        <td className="px-3 py-1.5 text-slate-400">Loading land records…</td>
                      </tr>
                    )}
                    {owners.status === "error" && (
                      <tr className="border-b border-slate-100">
                        <td className="w-1 whitespace-nowrap border-r border-slate-200 px-3 py-1.5 align-top text-slate-500">
                          Owner
                        </td>
                        <td className="break-words px-3 py-1.5 text-amber-600">
                          Land records unavailable ({owners.message})
                        </td>
                      </tr>
                    )}
                    {owners.status === "ok" && owners.rows.length === 0 && (
                      <tr className="border-b border-slate-100">
                        <td className="w-1 whitespace-nowrap border-r border-slate-200 px-3 py-1.5 align-top text-slate-500">
                          Owner
                        </td>
                        <td className="px-3 py-1.5 text-slate-400">No records found</td>
                      </tr>
                    )}
                    {owners.status === "ok" &&
                      owners.rows.map((owner, i) => (
                        <tr key={`owner-${i}`} className="border-b border-slate-100">
                          <td className="w-1 whitespace-nowrap border-r border-slate-200 px-3 py-1.5 align-top text-slate-500">
                            {i === 0 ? (owners.rows.length > 1 ? "Owners" : "Owner") : ""}
                          </td>
                          <td className="break-words px-3 py-1.5 font-semibold text-slate-900">
                            {owner.name}
                            {owner.hissa && (
                              <span className="ml-1 font-normal text-slate-500">
                                [Hissa {owner.hissa}]
                              </span>
                            )}
                            {owner.extent && (
                              <span className="ml-1 font-normal text-slate-500">
                                ({owner.extent}
                                {owner.category ? `, ${owner.category}` : ""})
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </>
                )}
                {attributeInfo.rows.map((row, i) => (
                  <tr
                    key={`${row.label}-${i}`}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <td className="w-1 whitespace-nowrap border-r border-slate-200 px-3 py-1.5 align-top text-slate-500">
                      {row.label}
                    </td>
                    <td
                      className={`break-words px-3 py-1.5 ${
                        row.bold ? "font-semibold" : "font-medium"
                      } text-slate-900`}
                    >
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-gray-100 p-3">
              <button
                type="button"
                onClick={() => setExportModalOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-gray-50"
              >
                Export
              </button>
            </div>
          </aside>
        )}

        {exportModalOpen && attributeInfo && (
          <ExportFeatureModal
            title={attributeInfo.title}
            geometry={attributeInfo.geometry}
            properties={attributeInfo.properties}
            hierarchy={attributeInfo.hierarchy}
            onClose={() => setExportModalOpen(false)}
          />
        )}

        {/* FLOATING - Filters, toggled via the search bar's menu icon */}
        {showFilters && (
          <aside className="scrollbar-hide absolute left-4 top-20 z-10 max-h-[calc(100vh-200px)] w-64 flex-shrink-0 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-obsidian-graphite">Filters</h2>
                <button className="text-sm text-atlas-cobalt hover:underline">Reset all</button>
              </div>

              {/* Boundary Layers Filter */}
              <div className="mb-4 border-b border-gray-200 pb-4">
                <button
                  onClick={() => toggleFilter("type")}
                  className="mb-2 flex w-full items-center justify-between text-sm font-semibold text-obsidian-graphite"
                >
                  Boundary Layers
                  {expandedFilters.type ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </button>
                {expandedFilters.type && (
                  <div className="space-y-2">
                    {/* Single-select: picking a new option deselects the previous one.
                      "administrative" shows every loaded boundary layer; "assembly" and
                      "parliamentary" show the neon-blue india_states geojson plus their
                      loaded constituency boundaries; "gram panchayat" isn't wired to data
                      yet (no extra layers). */}
                    {BOUNDARY_LAYER_OPTIONS.map(({ id, label }) => (
                      <label key={id} className="flex items-center text-sm text-gray-600">
                        <input
                          type="checkbox"
                          className="mr-2 accent-atlas-cobalt"
                          checked={selectedBoundaryLayer === id}
                          onChange={() => {
                            setSelectedBoundaryLayer(id);
                            mapViewerRef.current?.setBoundaryLayerMode(id);
                          }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* Floating chip: shows the completed AOI's area (with a clear button), or - while a
            drawing tool is armed - a hint for how to use it. */}
        {(activeAOITool || aoiInfo) && (
          <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
            <div className="flex items-center gap-3 rounded-full border border-gray-200 bg-white/95 px-4 py-2 shadow-lg backdrop-blur">
              {aoiInfo ? (
                <>
                  <span className="flex items-center gap-2 text-sm font-medium text-obsidian-graphite">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                    AOI area: {formatAreaSqKm(aoiInfo.areaSqKm)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      mapViewerRef.current?.clearAOI();
                      setAoiInfo(null);
                    }}
                    className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Clear drawn area of interest"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <span className="text-sm text-gray-600">
                  {activeAOITool === "polygon"
                    ? "Click to add points · double-click or Enter to finish"
                    : activeAOITool === "freehand"
                      ? "Drag on the map to free-draw your area"
                      : "Drag on the map to draw a rectangle"}
                </span>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
