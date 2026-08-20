"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import type { KeyboardEvent } from "react";
import {
  IndiaMapViewer,
  type IndiaMapViewerHandle,
  type WardSelection,
  type BoundaryLayerMode,
  type PoliceType,
  type AOITool,
  type AOIResult,
  type AttributeInfo,
} from "./IndiaMapViewer";
import type { RtcOwner } from "@/app/api/land-records/_bhoomi";
import { LocationEnvironmentPanel } from "@/components/environment/LocationEnvironmentPanel";
import {
  getStoredUserSession,
  type StoredUserSession,
} from "@/lib/userSession";
import { ExportFeatureModal } from "./ExportFeatureModal";
import { UserProfile } from "./UserProfile";
import { FreeHandIcon, PolygonIcon, RectangleIcon, DrawAOIIcon } from "./AOIIcons";
import { ChevronDown, ChevronUp, Download, MapPin, Search, Menu, Mic, X } from "lucide-react";
import { WeatherLayerToolbar, type WeatherLayerKey } from "../weather/WeatherLayerToolbar";
import { rankLocationEntries, rankStaticSuggestions } from "@/lib/geosearch";

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
  { id: "gba", label: "Bengaluru Boundaries" },
  { id: "roads", label: "Roads" },
];
const POLICE_TYPE_OPTIONS: { id: PoliceType; label: string }[] = [
  { id: "all", label: "All Police Types" },
  { id: "law_and_order", label: "Law and Order" },
  { id: "women_police", label: "Women Police" },
  { id: "traffic_police", label: "Traffic Police" },
  { id: "railway_police", label: "Railway Police" },
  { id: "railway_police_outpost", label: "Railway Police Outpost" },
  { id: "police_outpost", label: "Police Outpost" },
  { id: "police_check_post", label: "Police Check Post" },
  { id: "police_forest_cell", label: "Police Forest Cell" },
  { id: "district_armed_reserve", label: "District Armed Reserve" },
  { id: "city_armed_reserve", label: "City Armed Reserve" },
  { id: "city_crime_branch", label: "City Crime Branch" },
  { id: "coastal_security", label: "Coastal Security" },
  { id: "cyber_crime", label: "Cyber Crime" },
  { id: "ksisf", label: "KSISF" },
  { id: "ksrp", label: "KSRP" },
];
const POLICE_DISTRICTS = ["Bagalkote", "Ballari", "Belagavi", "Bengaluru (Rural)", "Bengaluru (Urban)", "Bengaluru South", "Bidar", "Chamarajanagara", "Chikkaballapura", "Chikkamagaluru", "Chitradurga", "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburgi", "Kodagu", "Kolara", "Koppal", "Mandya", "Mysuru", "Raichur", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayanagara", "Vijayapura", "Yadgir"];

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
  const allItems = PLACE_SUGGESTIONS[category as keyof typeof PLACE_SUGGESTIONS] || [];
  // Ranked by the geosearch engine (prefix > substring > fuzzy), not raw substring order.
  return rankStaticSuggestions(allItems, query);
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

// Filters/ranks LocationEntry[] by a typed query via the geosearch engine
// (exact > prefix > token-prefix > substring > bounded fuzzy), returning plain
// label strings ready for the {category, items: string[]} suggestion shape.
// `boostLabel` biases toward the map's current drill context; `fuzzy` enables
// typo tolerance for the leaf tier.
function filterLocationEntries(
  entries: LocationEntry[],
  query: string,
  opts: { boostLabel?: string; fuzzy?: boolean; limit?: number } = {},
): string[] {
  return rankLocationEntries(entries, query, opts);
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

// Minimal typing for the Web Speech API. SpeechRecognition isn't part of TypeScript's
// DOM lib yet, so the browser-specific constructors (webkit prefix included) are cast
// through this shape instead of polluting the rest of the file with `any`.
interface SpeechRecognitionResultItem {
  transcript: string;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult:
    | ((event: { resultIndex: number; results: ArrayLike<SpeechRecognitionResultItem[]> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Shared body of the attribute info panel - header (type badge + title + close), the
// attribute table (Bhoomi owner rows above the feature's own rows), and the Export
// action. Rendered by both the desktop floating card and the mobile bottom sheet so
// the two always show the same content.
function AttributePanelBody({
  info,
  owners,
  onClose,
  onExport,
}: {
  info: AttributeInfo;
  owners:
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ok"; rows: RtcOwner[] };
  // Optional: when omitted (mobile bottom sheet), the header shows no close button.
  onClose?: () => void;
  onExport: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex-shrink-0 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-600">
            {info.typeLabel}
          </span>
          <h3 className="truncate text-sm font-semibold text-slate-900">{info.title}</h3>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close attribute panel"
            className="flex-shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {/* Owner names (Bhoomi RTC) sit above the parcel's own attributes - they're
              what the parcel is usually looked up for. */}
          {info.parcel && (
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
          {info.rows.map((row, i) => (
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
          onClick={onExport}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-gray-50"
        >
          Export
        </button>
      </div>
    </>
  );
}

export function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");
  // Voice search state: true while the browser's speech recognizer is actively listening.
  const [isListening, setIsListening] = useState(false);
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
  const [selectedPoliceType, setSelectedPoliceType] = useState<PoliceType>("all");
  const [selectedPoliceDistrict, setSelectedPoliceDistrict] = useState("all");
  // What a district click does in Roads mode - "none" (default, neither button pressed) is
  // fast/boundaries-only, matching taluk/hobli/village's own lightweight click behavior.
  // "district" makes a single click also fetch that district's full roads immediately;
  // "state" loads every district's roads combined on the next click, since districts tile
  // the whole state with no separate clickable "state" area.
  const [selectedRoadsScope, setSelectedRoadsScope] = useState<"none" | "district" | "state">("none");
  const [searchSuggestions, setSearchSuggestions] = useState<
    { category: string; items: string[] }[]
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  // Refs backing the Filters panel's outside-click-to-close: the panel itself (clicks
  // inside it are ignored) and the hamburger toggle (excluded so it keeps toggling
  // instead of close-then-reopen).
  const filtersPanelRef = useRef<HTMLElement | null>(null);
  const filtersToggleRef = useRef<HTMLButtonElement | null>(null);
  // Mobile drawer swipe-to-close: while the Filters drawer is open, a leftward swipe
  // drags it off-screen; releasing past a threshold closes it, otherwise it snaps back.
  const [drawerDragX, setDrawerDragX] = useState(0);
  const drawerDragRef = useRef<{
    startX: number;
    startY: number;
    dragging: boolean;
    current: number;
  }>({ startX: 0, startY: 0, dragging: false, current: 0 });

  const handleDrawerTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    drawerDragRef.current = { startX: touch.clientX, startY: touch.clientY, dragging: false, current: 0 };
  };

  const handleDrawerTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const { startX, startY } = drawerDragRef.current;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    // Only engage for a clearly-leftward, mostly-horizontal drag; the drawer is 80vw
    // wide, so cap the drag at its own width.
    if (dx < -20 && Math.abs(dx) > Math.abs(dy)) {
      const clamped = Math.max(dx, -window.innerWidth * 0.8);
      drawerDragRef.current.dragging = true;
      drawerDragRef.current.current = clamped;
      setDrawerDragX(clamped);
    }
  };

  const handleDrawerTouchEnd = () => {
    const { dragging, current } = drawerDragRef.current;
    // Closing past ~20% of the screen width counts as a dismiss; otherwise snap back.
    if (dragging && current < -window.innerWidth * 0.2) {
      setShowFilters(false);
    }
    drawerDragRef.current.dragging = false;
    drawerDragRef.current.current = 0;
    setDrawerDragX(0);
  };

  // Mobile attribute sheet swipe-to-close: while the sheet is open, a downward swipe
  // drags it off-screen; releasing past a threshold closes it, otherwise it snaps back.
  // (Mirrors the Filters drawer's swipe handling.)
  const [attrSheetDragY, setAttrSheetDragY] = useState(0);
  const attrSheetDragRef = useRef({
    startX: 0,
    startY: 0,
    dragging: false,
    current: 0,
  });

  const handleAttrSheetTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    attrSheetDragRef.current = { startX: touch.clientX, startY: touch.clientY, dragging: false, current: 0 };
  };

  const handleAttrSheetTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const { startX, startY } = attrSheetDragRef.current;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    // Only engage for a clearly-downward, mostly-vertical drag, and only while the
    // sheet's content is scrolled to the top (a downward swipe mid-list should scroll
    // the list back up instead of closing the sheet). Cap at the sheet height (30vh).
    if (dy > 20 && Math.abs(dy) > Math.abs(dx)) {
      if ((e.currentTarget as HTMLElement).scrollTop > 0) return;
      const clamped = Math.min(dy, window.innerHeight * 0.5);
      attrSheetDragRef.current.dragging = true;
      attrSheetDragRef.current.current = clamped;
      setAttrSheetDragY(clamped);
    }
  };

  const handleAttrSheetTouchEnd = () => {
    const { dragging, current } = attrSheetDragRef.current;
    // Closing past ~15% of the screen height counts as a dismiss; otherwise snap back.
    if (dragging && current > window.innerHeight * 0.15) {
      setAttributePanelOpen(false);
    }
    attrSheetDragRef.current.dragging = false;
    attrSheetDragRef.current.current = 0;
    setAttrSheetDragY(0);
  };
  // Holds the live speech-recognition instance so tapping the mic again (or leaving the
  // page) can stop it cleanly.
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // "Draw AOI" tool dropdown
  const [showAOIMenu, setShowAOIMenu] = useState(false);
  const [activeAOITool, setActiveAOITool] = useState<AOITool | null>(null);
  // The last completed drawn AOI (area + geometry), reported by the map viewer; null until
  // the user finishes drawing a shape.
  const [aoiInfo, setAoiInfo] = useState<AOIResult | null>(null);
  const aoiMenuRef = useRef<HTMLDivElement>(null);

  // Weather toolbar - appears beside search bar when weather is active.
  const [showWeatherToolbar, setShowWeatherToolbar] = useState(false);
  const [weatherToolbarMode, setWeatherToolbarMode] = useState<WeatherLayerKey | null>(null);

  // Right-click attribute info for the side panel (boundary type + title + rows), reported
  // by the map viewer; null when no feature is shown.
  const [attributeInfo, setAttributeInfo] = useState<AttributeInfo | null>(null);
  // Whether the attribute panel is open. On mobile the panel starts collapsed until a
  // feature is tapped; on desktop the panel opens immediately. Initialized from the current
  // screen size (false on phones) so a first selection never flashes the panel open for a
  // frame before the effect below closes it. The `typeof window` guard keeps SSR safe; the
  // server value (false) is irrelevant because nothing renders until a feature is picked.
  const [attributePanelOpen, setAttributePanelOpen] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 768px)").matches
      : false
  );
  useEffect(() => {
    if (!attributeInfo) return;
    // Each new selection starts in the default state for the current screen size:
    // open on desktop (md and up), closed (chip-only) on mobile.
    setAttributePanelOpen(window.matchMedia("(min-width: 768px)").matches);
  }, [attributeInfo]);
  const [storedUser, setStoredUser] = useState<StoredUserSession | null>(null);
  const [showLocationEnvironment, setShowLocationEnvironment] = useState(false);

  // Whether the export-format picker (opened from the attribute panel's "Export" action) is
  // showing. It reads geometry/properties off `attributeInfo`, so it closes itself whenever
  // the panel closes rather than tracking its own copy of the feature.
  const [exportModalOpen, setExportModalOpen] = useState(false);
  // Controls the export modal for a drawn AOI (separate from the attribute-panel export).
  const [aoiExportOpen, setAoiExportOpen] = useState(false);
  const [aoiOwners, setAoiOwners] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ok"; rows: RtcOwner[] }
  >({ status: "idle" });

  // Owner names for the selected cadastral parcel. They aren't in the cadastral GeoJSON, so
  // they're fetched from Bhoomi (via /api/land-records/rtc) once a parcel is selected - a
  // slow, multi-step lookup against the state portal, hence the explicit loading state.
  const [owners, setOwners] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ok"; rows: RtcOwner[] }
  >({ status: "loading" });

  const parcel = attributeInfo?.parcel;
  const storedLocation = storedUser?.preferredLocation ?? null;

  useEffect(() => {
    setStoredUser(getStoredUserSession());
  }, []);

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

  // Fetch Bhoomi owner details for a drawn AOI's cadastral parcel when the export
  // modal opens. The parcel key is extracted from the intersecting cadastral layer
  // in IndiaMapViewer.completeAOI.
  useEffect(() => {
    if (!aoiExportOpen || !aoiInfo?.aoiParcel) {
      setAoiOwners({ status: "idle" });
      return;
    }
    const parcel = aoiInfo.aoiParcel;
    const controller = new AbortController();
    setAoiOwners({ status: "loading" });
    (async () => {
      try {
        const res = await fetch(
          `/api/land-records/rtc?${new URLSearchParams({ ...parcel }).toString()}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
        setAoiOwners({ status: "ok", rows: data.owners ?? [] });
      } catch (error) {
        if (controller.signal.aborted) return;
        setAoiOwners({
          status: "error",
          message: error instanceof Error ? error.message : "Lookup failed",
        });
      }
    })();
    return () => controller.abort();
  }, [aoiExportOpen, aoiInfo?.aoiParcel?.district, aoiInfo?.aoiParcel?.taluk, aoiInfo?.aoiParcel?.hobli, aoiInfo?.aoiParcel?.village, aoiInfo?.aoiParcel?.survey, aoiInfo?.aoiParcel?.surnoc, aoiInfo?.aoiParcel?.hissa]);

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

  // Close the Filters panel when clicking anywhere outside it - the map, the search
  // bar (input, voice icon, profile icon) all dismiss it. The hamburger toggle itself
  // is excluded so it keeps toggling instead of close-then-reopen.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (filtersPanelRef.current?.contains(target)) return;
      if (filtersToggleRef.current?.contains(target)) return;
      setShowFilters(false);
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
    // All are ranked by the geosearch engine: exact > prefix > token-prefix >
    // substring > bounded fuzzy, with aliases (blr/bangalore/bengaluru) expanded.
    const boostLabel = drillContext?.district
      ? `Karnataka, ${drillContext.district}${drillContext.taluk ? `, ${drillContext.taluk}` : ""}`
      : undefined;

    const stateMatches = filterLocationEntries(stateEntries, searchQuery, {
      boostLabel,
      fuzzy: true,
    });
    if (stateMatches.length > 0) suggestions.push({ category: "States", items: stateMatches });

    const districtMatches = filterLocationEntries(districtEntries, searchQuery, {
      boostLabel,
      fuzzy: true,
    });
    if (districtMatches.length > 0)
      suggestions.push({ category: "Districts", items: districtMatches });

    const talukMatches = filterLocationEntries(talukEntries, searchQuery, {
      boostLabel,
      fuzzy: true,
    });
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
      const hobliMatches = filterLocationEntries(hobliEntries, hobliQuery, {
        boostLabel,
        fuzzy: true,
        limit: 8,
      });
      if (hobliMatches.length > 0)
        suggestions.push({ category: "Hoblies", items: hobliMatches });

      // Villages: same treatment, matching the village name itself (leaf). A 1-char
      // query would match tens of thousands of villages, so require 2+ chars and cap the
      // list so the dropdown doesn't freeze.
      if (hobliQuery.length >= 2) {
        const villageMatches = filterLocationEntries(villageEntries, hobliQuery, {
          boostLabel,
          fuzzy: true,
          limit: 100,
        });
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

  // Voice search (mobile only): the spoken place name is transcribed live into the search
  // bar, and the normal suggestion dropdown then appears so the user can confirm the text
  // before running the search. Uses the Web Speech API (Chrome/Android WebView support it).
  const stopVoiceSearch = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  };

  // Native app (Capacitor WebView): make sure Android's microphone permission is
  // granted before the WebView starts speech recognition - otherwise the WebView
  // reports "not-allowed" even after the user granted access at the consent screen.
  // On the web this resolves immediately without doing anything.
  const ensureNativeVoicePermission = (): Promise<boolean> => {
    if (typeof window === "undefined") return Promise.resolve(true);
    const w = window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        Plugins?: {
          NativePermissions?: {
            ensureVoicePermission?: () => Promise<{ granted?: boolean }>;
          };
        };
      };
    };
    if (w.Capacitor?.isNativePlatform?.() !== true) return Promise.resolve(true);
    const ensure = w.Capacitor.Plugins?.NativePermissions?.ensureVoicePermission;
    return (ensure?.() ?? Promise.resolve({ granted: true }))
      .then((r) => r.granted !== false)
      .catch(() => true); // plugin missing/failed - let the WebView's own flow decide
  };

  const toggleVoiceSearch = async () => {
    if (isListening) {
      stopVoiceSearch();
      return;
    }
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) {
      alert("Voice search isn't supported in this browser. Please type your search instead.");
      return;
    }
    const voiceAllowed = await ensureNativeVoicePermission();
    if (!voiceAllowed) {
      alert("Microphone access was denied. Please allow microphone access to use voice search.");
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    // Live transcription: every interim result updates the input as the user speaks, and
    // the final result stays put - exactly like typing it in by hand.
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript ?? "")
        .join("")
        .trim();
      if (transcript) setSearchQuery(transcript);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };
    recognition.onerror = (event) => {
      // "no-speech" / "aborted" fire on normal stops; only surface permission problems.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        alert("Microphone access was denied. Please allow microphone access to use voice search.");
      }
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      // Double-start can throw in some browsers; keep the button usable.
      recognitionRef.current = null;
      setIsListening(false);
    }
  };

  // Stop any in-flight recognition when the page unmounts so the mic indicator never
  // stays stuck on.
  useEffect(() => () => recognitionRef.current?.abort(), []);

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
          onAttributeInfo={(info) => {
            setAttributeInfo(info);
            // The attribute-info panel and My Environment share the same
            // right-side anchor point - selecting a feature on the map must
            // close My Environment so the two never render on top of each other.
            if (info) {
              setShowLocationEnvironment(false);
              mapViewerRef.current?.setActiveMapPanel("none");
            }
          }}
          onDrillContextChange={setDrillContext}
          hideWeatherControl={showFilters}
          onWeatherToolbarChange={(visible) => {
            setShowWeatherToolbar(visible);
            if (visible) {
              // Sync toolbar mode from map viewer
              setWeatherToolbarMode(mapViewerRef.current?.getWeatherMode() as WeatherLayerKey | null);
              // A left-click can't simultaneously drill into a boundary layer AND open the
              // weather click-to-inspect popup - once any weather control is active, drop
              // back to the plain administrative boundaries and close every other floating
              // panel (Filters, My Environment, AOI) so the two features never fight over
              // the same click, and no two floating panels ever render on top of each
              // other. Also dismiss any attribute-info panel a click opened *before*
              // weather was turned on - the map's own click handler only stops new ones
              // from opening, it doesn't know to close one already showing.
              setShowFilters(false);
              setShowAOIMenu(false);
              setShowLocationEnvironment(false);
              setAttributeInfo(null);
              mapViewerRef.current?.clearAttributeInfo();
              if (selectedBoundaryLayer !== "administrative") {
                setSelectedBoundaryLayer("administrative");
                mapViewerRef.current?.setBoundaryLayerMode("administrative");
                setSelectedRoadsScope("none");
              }
            }
          }}
          highlightedLocation={
            showLocationEnvironment && storedLocation
              ? {
                  latitude: storedLocation.latitude,
                  longitude: storedLocation.longitude,
                  label: "My Environment",
                  focusOnShow: true,
                }
              : null
          }
        />

        {/* Floating search bar */}
        <div ref={aoiMenuRef} className="absolute left-4 right-4 top-4 z-20">
        <div className="flex items-center gap-3">
          {/* Search Bar - takes the full width on mobile (common phone resolutions) where
              the Draw AOI and User Profile controls are hidden. */}
          {/* min-w-0 is critical: without it the wrapper's min-width defaults to auto,
              so if the input ever fails to shrink (Android WebView quirk) the wrapper
              grows with the input's intrinsic width and the bar visibly widens while
              typing. min-w-0 lets the wrapper stay put and clip inside instead. */}
          <div ref={searchWrapperRef} className="relative min-w-0 max-w-md flex-1">
            {/* Taller on mobile (common phone resolutions) for easier touch; the
                compact desktop size is restored at md and up. On mobile the profile
                avatar is absolutely positioned over the pill's right edge (and space
                reserved via pr-14) so it never participates in the flex layout - this
                keeps the pill width constant no matter what the user types, even on
                Android WebViews that refuse to shrink the input. */}
            {/* overflow-hidden guarantees the pill never visually grows even if some
                engine refuses to shrink the input - content clips at the pill edge. */}
            <div className="relative flex items-center gap-1 overflow-hidden rounded-full bg-white py-2.5 pl-1 pr-28 shadow-md md:py-1 md:pr-2">
              <button
                ref={filtersToggleRef}
                onClick={() => {
                  if (showWeatherToolbar) return;
                  const next = !showFilters;
                  setShowFilters(next);
                  if (next) {
                    // Only one floating panel is shown at a time - opening Filters
                    // closes My Environment and Draw AOI so they never overlap.
                    setShowAOIMenu(false);
                    setShowLocationEnvironment(false);
                    mapViewerRef.current?.setActiveMapPanel("none");
                  }
                }}
                disabled={showWeatherToolbar}
                title={showWeatherToolbar ? "Boundary layers are disabled while Weather is active" : undefined}
                className={`flex-shrink-0 rounded-full p-2.5 transition-colors md:p-2 ${
                  showWeatherToolbar
                    ? "cursor-not-allowed text-gray-300"
                    : showFilters
                      ? "bg-gray-100 text-obsidian-graphite"
                      : "text-gray-500 hover:bg-gray-100"
                }`}
                aria-label="Toggle filters"
                aria-pressed={showFilters}
              >
                <Menu className="h-5 w-5 md:h-4 md:w-4" />
              </button>
              <input
                type="text"
                // size={1} collapses the input's intrinsic min-content width (the
                // default size=20 is what Android WebViews fall back to when they
                // ignore min-width:0, inflating the bar). flex-1 + min-w-0 then grow
                // it to fill the remaining space normally.
                size={1}
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
                className="min-w-0 flex-1 bg-transparent py-1.5 text-base md:py-1 md:text-sm focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="flex-shrink-0 rounded-full p-2.5 text-gray-500 hover:bg-gray-100 md:p-2"
                  aria-label="Clear search"
                >
                  <X className="h-5 w-5 md:h-4 md:w-4" />
                </button>
              )}
              <button
                onClick={() => {
                  setShowSuggestions(false);
                  mapViewerRef.current?.search(searchQuery);
                }}
                className="hidden flex-shrink-0 rounded-full p-2.5 text-gray-500 hover:bg-gray-100 md:flex md:p-2"
                aria-label="Search"
              >
                <Search className="h-5 w-5 md:h-4 md:w-4" />
              </button>
              {/* Voice search icon - mobile only (common phone resolutions), sitting
                  just left of the profile avatar. Absolutely positioned (outside the
                  flex flow) so typing never moves it; the pill's pr-28 reserves its
                  space. While listening it turns red so the state is obvious. */}
              <button
                onClick={toggleVoiceSearch}
                className={`absolute right-14 top-1/2 -translate-y-1/2 rounded-full p-2.5 transition-colors md:hidden ${
                  isListening
                    ? "bg-red-50 text-red-500"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
                aria-label={isListening ? "Stop voice search" : "Search by voice"}
                aria-pressed={isListening}
              >
                <Mic className="h-5 w-5" />
              </button>
              {/* User Profile replaces the search icon on mobile (common phone
                  resolutions); desktop keeps the search icon in the pill. Absolutely
                  positioned over the pill's right edge (outside the flex flow) so the
                  pill's width can't change while typing. The menu is a fixed overlay
                  that matches the search bar's bounds. Opening the profile menu closes
                  the Filters panel so the two fixed overlays never stack. */}
              {/* No transform here on purpose: a transform (e.g. -translate-y-1/2)
                  would make this wrapper the containing block for the menu's `fixed`
                  positioning, collapsing it to a sliver. Centering is done with
                  top-1/2 + a negative half-height margin (-mt-5 = half of the 40px
                  avatar), which keeps the exact same position with no transform, so
                  the fixed menu anchors to the viewport and spans the search bar's
                  width. */}
              <div className="absolute right-2 top-1/2 -mt-5 md:hidden">
                <UserProfile
                  onMenuToggle={(open) => {
                    if (open) setShowFilters(false);
                  }}
                />
              </div>
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

          {/* Weather layer toolbar - appears beside search bar when weather is active */}
          {showWeatherToolbar && (
            <WeatherLayerToolbar
              activeLayer={weatherToolbarMode}
              onLayerSelect={(layer) => {
                const mode = layer ?? "none";
                mapViewerRef.current?.setWeatherMode(mode as any);
                setWeatherToolbarMode(layer);
              }}
              className="flex-shrink-0"
            />
          )}

          {/* Spacer to push items to the right */}
          <div className="flex-1" />

          {storedLocation && (
            <button
              type="button"
              onClick={() => {
                const next = !showLocationEnvironment;
                setShowLocationEnvironment(next);
                mapViewerRef.current?.setActiveMapPanel(next ? "my-environment" : "none");
                if (next) {
                  // Only one floating panel is shown at a time - opening My
                  // Environment closes Filters, Draw AOI, and the attribute-info
                  // panel (they all share the same right-side anchor point) so
                  // none of them ever render on top of each other.
                  setShowFilters(false);
                  setShowAOIMenu(false);
                  setAttributeInfo(null);
                  mapViewerRef.current?.clearAttributeInfo();
                }
              }}
              aria-label="My Environment"
              title="My Environment"
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border shadow-md transition-colors ${
                showLocationEnvironment
                  ? "border-atlas-cobalt bg-atlas-cobalt text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <MapPin className="h-4 w-4 flex-shrink-0" />
            </button>
          )}

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
                onClick={() => {
                  const next = !showAOIMenu;
                  setShowAOIMenu(next);
                  setAttributeInfo(null);
                  mapViewerRef.current?.clearAttributeInfo();
                  mapViewerRef.current?.setActiveMapPanel(next ? "draw-aoi" : "none");
                  if (next) {
                    // Only one floating panel is shown at a time - opening Draw AOI
                    // closes Filters and My Environment so they never overlap.
                    setShowFilters(false);
                    setShowLocationEnvironment(false);
                  }
                }}
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
                className="aoi-menu-in absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg"
              >
                {AOI_TOOLS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveAOITool(id);
                      setShowAOIMenu(false);
                      setAttributeInfo(null);
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

          {/* User Profile Icon - reads the signed-in user from the session; hidden on
              mobile (common phone resolutions) so only the search bar stays at the top. */}
          <div className="hidden md:block">
            <UserProfile />
          </div>
        </div>

        {/* Mobile Draw AOI button - round icon below the search bar, aligned right.
            Visible only on common phone resolutions. On tap it shows a small dropdown
            with the same AOI tool options as the desktop pill. */}
        <div className="absolute right-2 top-[4.5rem] z-20 md:hidden">
          <button
            type="button"
            onClick={() => setShowAOIMenu((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={showAOIMenu}
            className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-md transition-colors ${
              activeAOITool
                ? "border-atlas-cobalt bg-atlas-cobalt text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
            aria-label="Draw area of interest"
          >
            {activeAOITool ? (
              (() => {
                const ActiveIcon = AOI_TOOLS.find((t) => t.id === activeAOITool)!.Icon;
                return <ActiveIcon className="h-5 w-5" />;
              })()
            ) : (
              <DrawAOIIcon className="h-5 w-5" />
            )}
          </button>

          {showAOIMenu && (
            <div
              role="menu"
              className="aoi-menu-in absolute right-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg"
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
        </div>

        {/* Attribute info panel - appears below the Draw AOI / User Profile buttons, on the
            right side, when the user right-clicks a boundary feature on the map. No height
            limit: all attribute rows are shown in full. On mobile the panel only opens
            after tapping the "View Details" chip. */}
        {attributeInfo && attributePanelOpen && (
          <aside className="attr-panel-in scrollbar-hide absolute right-4 top-20 z-20 hidden max-h-[calc(100vh-120px)] w-80 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl md:block">
            <AttributePanelBody
              info={attributeInfo}
              owners={owners}
              onClose={() => {
                setAttributeInfo(null);
                setExportModalOpen(false);
                mapViewerRef.current?.clearAttributeInfo();
              }}
              onExport={() => setExportModalOpen(true)}
            />
          </aside>
        )}

        {/* Mobile (common phone resolutions) attribute info bottom sheet - instead of the
            floating card, the info slides up from the bottom as a 30%-height sheet when
            the "View Details" chip is tapped (mirrors the Filters drawer's slide-in). It
            stays mounted while a feature is selected so the slide animates both ways; a
            dimmed scrim closes it back to the chip. Hidden on desktop. */}
        {attributeInfo && (
          <div className="pointer-events-none fixed inset-0 z-40 md:hidden">
            <div
              aria-hidden
              onClick={() => setAttributePanelOpen(false)}
              className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
                attributePanelOpen
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
            />
            <div
              onTouchStart={handleAttrSheetTouchStart}
              onTouchMove={handleAttrSheetTouchMove}
              onTouchEnd={handleAttrSheetTouchEnd}
              style={
                attrSheetDragY > 0
                  ? { transform: `translateY(${attrSheetDragY}px)`, transition: "none" }
                  : undefined
              }
              className={`pointer-events-auto scrollbar-hide absolute inset-x-0 bottom-0 h-[50vh] overflow-y-auto rounded-t-2xl border-t border-gray-200 bg-white shadow-xl transition-transform duration-300 ease-out ${
                attributePanelOpen ? "translate-y-0" : "translate-y-full"
              }`}
            >
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-300" />
              <AttributePanelBody
                info={attributeInfo}
                owners={owners}
                onExport={() => setExportModalOpen(true)}
              />
            </div>
          </div>
        )}

        {/* Info chip - on mobile (common phone resolutions) the attribute panel is hidden
            behind this chip; tapping it opens the panel. Hidden on desktop, where the
            panel opens directly on selection. */}
        {attributeInfo && !attributePanelOpen && (
          <button
            type="button"
            onClick={() => setAttributePanelOpen(true)}
            className={`absolute left-1/2 z-20 flex -translate-x-1/2 items-center rounded-full border border-gray-200 bg-white px-4 py-2.5 shadow-lg transition-colors hover:bg-gray-50 md:hidden ${
              activeAOITool || aoiInfo ? "bottom-20" : "bottom-6"
            }`}
          >
            <span className="text-sm font-medium text-obsidian-graphite">View Details</span>
          </button>
        )}

        {exportModalOpen && attributeInfo && (
          <ExportFeatureModal
            title={attributeInfo.title}
            geometry={attributeInfo.geometry}
            properties={attributeInfo.properties}
            hierarchy={attributeInfo.hierarchy}
            owners={owners}
            onClose={() => setExportModalOpen(false)}
          />
        )}

        {showLocationEnvironment && storedLocation && (
          <aside className="absolute bottom-6 right-4 top-20 z-20 w-[min(28rem,calc(100vw-2rem))] overflow-y-auto">
            <LocationEnvironmentPanel
              latitude={storedLocation.latitude}
              longitude={storedLocation.longitude}
              locationLabel="My Environment"
              locationMeta={{
                accuracyMeters: storedLocation.accuracyMeters,
                capturedAt: storedLocation.capturedAt,
                sourceLabel: "Browser geolocation",
              }}
              onClose={() => setShowLocationEnvironment(false)}
            />
          </aside>
        )}

        {/* FLOATING - Filters, toggled via the search bar's menu icon */}
        {showFilters && (
          <aside
            ref={filtersPanelRef}
            className="scrollbar-hide absolute left-4 top-20 z-10 max-h-[calc(100vh-200px)] w-64 flex-shrink-0 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
          >
            <div className="p-4">
              <h2 className="mb-4 text-lg font-semibold text-obsidian-graphite md:text-base">Filters</h2>

              {/* Boundary Layers Filter */}
              <div className="mb-4 border-b border-gray-200 pb-4">
                <button
                  onClick={() => toggleFilter("type")}
                  className="mb-2 flex w-full items-center justify-between text-base font-semibold text-obsidian-graphite md:text-sm"
                >
                  Boundary Layers
                  {expandedFilters.type ? (
                    <ChevronUp className="h-5 w-5 text-gray-400 md:h-4 md:w-4" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400 md:h-4 md:w-4" />
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
                      <div key={id}>
                      <label className="flex items-center text-base text-gray-600 md:text-sm">
                        <input
                          type="checkbox"
                          className="mr-2 accent-atlas-cobalt"
                          checked={selectedBoundaryLayer === id}
                          onChange={() => {
                            setSelectedBoundaryLayer(id);
                            mapViewerRef.current?.setBoundaryLayerMode(id);
                            if (id !== "roads") setSelectedRoadsScope("none");
                          }}
                        />
                        {label}
                      </label>
                      {id === "police_station" && selectedBoundaryLayer === "police_station" && (
                        <div>
                        <select
                          className="ml-6 mt-2 w-[calc(100%-1.5rem)] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-base text-gray-700 md:text-sm"
                          value={selectedPoliceType}
                          onChange={(event) => {
                            const type = event.target.value as PoliceType;
                            setSelectedPoliceType(type);
                            mapViewerRef.current?.setPoliceType(type);
                          }}
                        >
                          {POLICE_TYPE_OPTIONS.map((type) => (
                            <option key={type.id} value={type.id}>{type.label}</option>
                          ))}
                        </select>
                        <select
                          aria-label="Police district"
                          className="ml-6 mt-2 w-[calc(100%-1.5rem)] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-base text-gray-700 md:text-sm"
                          value={selectedPoliceDistrict}
                          onChange={(event) => {
                            setSelectedPoliceDistrict(event.target.value);
                            mapViewerRef.current?.setPoliceDistrict(event.target.value);
                          }}
                        >
                          <option value="all">All Districts</option>
                          {POLICE_DISTRICTS.map((district) => <option key={district} value={district}>{district}</option>)}
                        </select>
                        </div>
                      )}
                      {id === "roads" && selectedBoundaryLayer === "roads" && (
                        <div className="ml-6 mt-2 flex w-[calc(100%-1.5rem)] gap-2">
                          {(["district", "state"] as const).map((scope) => (
                            <button
                              key={scope}
                              type="button"
                              className={`flex-1 rounded-md border px-2 py-1.5 text-sm capitalize transition-colors ${
                                selectedRoadsScope === scope
                                  ? "border-atlas-cobalt bg-atlas-cobalt text-white"
                                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                              }`}
                              onClick={() => {
                                const next = selectedRoadsScope === scope ? "none" : scope;
                                setSelectedRoadsScope(next);
                                mapViewerRef.current?.setRoadsClickScope(next);
                              }}
                            >
                              {scope}
                            </button>
                          ))}
                        </div>
                      )}
                      </div>
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
                  <button
                    type="button"
                    onClick={() => setAoiExportOpen(true)}
                    className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-atlas-cobalt"
                    aria-label="Export drawn area of interest"
                  >
                    <Download className="h-4 w-4" />
                  </button>
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
