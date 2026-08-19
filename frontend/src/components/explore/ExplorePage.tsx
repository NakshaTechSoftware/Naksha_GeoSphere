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
  type NavigationState,
  type RoutePreview,
  type TravelMode,
  type DirectionsPoint,
} from "./IndiaMapViewer";
import type { RtcOwner } from "@/app/api/land-records/_bhoomi";
import { ExportFeatureModal } from "./ExportFeatureModal";
import { UserProfile } from "./UserProfile";
import { FreeHandIcon, PolygonIcon, RectangleIcon, DrawAOIIcon } from "./AOIIcons";
import {
  ArrowUpDown,
  Bike,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  Footprints,
  LocateFixed,
  MapPin,
  Motorbike,
  Navigation,
  Search,
  Menu,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

// UI-level mode identity for the icon row - distinct from the backend TravelMode, since
// "motorcycle" has no dedicated OSRM profile (no motorbike-specific routing data exists) and
// just reuses the driving routes/times under a different icon, same roads a car would take.
// Real transit (bus/rail) isn't offered at all - it would need GTFS schedule data and a
// separate transit-routing engine (OSRM doesn't do transit), neither of which exist here.
type UiTravelModeId = "driving" | "motorcycle" | "cycling" | "walking";
const TRAVEL_MODES: { id: UiTravelModeId; mode: TravelMode; label: string; Icon: typeof Car }[] = [
  { id: "driving", mode: "driving", label: "Driving", Icon: Car },
  { id: "motorcycle", mode: "driving", label: "Motorcycle", Icon: Motorbike },
  { id: "cycling", mode: "cycling", label: "Cycling", Icon: Bike },
  { id: "walking", mode: "walking", label: "Walking", Icon: Footprints },
];

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} hr ${m} min`;
}

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

// "find_my_way" isn't a real BoundaryLayerMode (it opens the Directions panel, not a map
// boundary layer) - it's listed here anyway because the user wants it selectable in the same
// list, above Administrative Boundaries, and selected by default on load instead of it.
type FilterSelection = "find_my_way" | BoundaryLayerMode;
const BOUNDARY_LAYER_OPTIONS: { id: FilterSelection; label: string }[] = [
  { id: "find_my_way", label: "Find My Way" },
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
  // The single active Boundary Layers option - "find_my_way" by default, so the app opens
  // straight into Directions rather than any boundary layer being pre-applied; boundary
  // layers only turn on once the user explicitly picks one from this list.
  const [selectedBoundaryLayer, setSelectedBoundaryLayer] =
    useState<FilterSelection>("find_my_way");
  const [selectedPoliceType, setSelectedPoliceType] = useState<PoliceType>("all");
  const [selectedPoliceDistrict, setSelectedPoliceDistrict] = useState("all");
  // What a district click does in Roads mode - "none" (default, neither button pressed) is
  // fast/boundaries-only, matching taluk/hobli/village's own lightweight click behavior.
  // "district" makes a single click also fetch that district's full roads immediately;
  // "state" loads every district's roads combined on the next click, since districts tile
  // the whole state with no separate clickable "state" area.
  const [selectedRoadsScope, setSelectedRoadsScope] = useState<"none" | "district" | "state">("none");
  // Matches against our own admin-boundary data (states/districts/taluks/hoblies/villages +
  // the static Bengaluru lists) - computed synchronously from data already loaded client-side.
  const [localSuggestions, setLocalSuggestions] = useState<
    { category: string; items: string[] }[]
  >([]);
  // Free-text place/address matches from Nominatim (see /api/geocode), for anything not in
  // our own boundary data - the "type any address and jump to it" behavior. Fetched with a
  // debounce so we don't hammer Nominatim's public API on every keystroke.
  const [placeSuggestions, setPlaceSuggestions] = useState<
    { label: string; lat: number; lon: number }[]
  >([]);
  const searchSuggestions = useMemo(() => {
    const places =
      placeSuggestions.length > 0
        ? [{ category: "Places", items: placeSuggestions.map((p) => p.label) }]
        : [];
    return [...localSuggestions, ...places];
  }, [localSuggestions, placeSuggestions]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  // True while the debounced /api/geocode fetch for the current query is in flight - drives
  // the "Searching..." row so the dropdown never just sits empty while results are loading.
  const [geocoding, setGeocoding] = useState(false);
  // Set right before selectSuggestion() programmatically rewrites searchQuery to the picked
  // label - both suggestion effects below check this and skip re-opening the dropdown for
  // that one resulting query change, so picking a result doesn't get its own dropdown
  // flashing back open ~400ms later once the geocode debounce fires for the now-selected
  // text. Cleared on the next real keystroke (onChange), not by the effects themselves, so
  // both effects can check it independently without racing to clear it first.
  const suppressSuggestionsRef = useRef(false);

  // "My Location" button - "locating" while waiting on the first GPS fix, "active" once the
  // live blue dot is tracking. IndiaMapViewer reports the real state back via
  // onLiveLocationChange (e.g. it flips back to "off" on a permission denial), rather than
  // this just assuming every click succeeds.
  const [liveLocationState, setLiveLocationState] = useState<"off" | "locating" | "active">("off");
  const handleToggleLiveLocation = () => {
    if (liveLocationState === "off") {
      setLiveLocationState("locating");
      mapViewerRef.current?.startLiveLocation();
    } else if (liveLocationState === "active") {
      setLiveLocationState("off");
      mapViewerRef.current?.stopLiveLocation();
    } else {
      // Already waiting on a fix - re-clicking re-centers once it's active, nothing to do yet.
      mapViewerRef.current?.startLiveLocation();
    }
  };

  // Turn-by-turn directions/navigation (see getRoutePreview/startNavigation on
  // IndiaMapViewer) - a dedicated origin/destination form, separate from the main search
  // bar above (matching Google's actual directions panel: two fields + a swap button, not
  // the single search box repurposed).
  // Closed by default - "Find My Way" is still the default-selected Boundary Layers option
  // (see selectedBoundaryLayer above, and the "none" boundary mode that goes with it), but
  // the app shouldn't force the Directions panel open over the map before the user has
  // actually asked for it. They open it themselves via the Directions button or the Filters
  // checkbox, same as any other option in that list.
  const [showDirections, setShowDirections] = useState(false);
  // Mirrors IndiaMapViewer's own "Place names" preference (see onPlaceLabelsVisibleChange) so
  // it can be shown/toggled here too, nested under "Find My Way" in the Filters list, and
  // stay in sync no matter which of the two UIs (this one, or the on-map LayersControl
  // checkbox) the user actually used to change it.
  const [placeLabelsVisible, setPlaceLabelsVisible] = useState(true);
  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [navigationState, setNavigationState] = useState<NavigationState | null>(null);

  // Voice guidance - speaks the current instruction aloud via the browser's built-in
  // text-to-speech (Web Speech API), same idea as Google's spoken turn-by-turn. No new
  // backend/cost: this is entirely client-side. Muted state persists across sessions (a
  // driving app that suddenly starts talking after you'd turned it off would be startling).
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("naksha_voice_guidance_enabled");
      if (stored !== null) setVoiceEnabled(stored === "true");
    } catch (error) {
      console.error("Failed to load voice guidance preference:", error);
    }
  }, []);
  const toggleVoiceEnabled = () => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      if (!next && typeof window !== "undefined") window.speechSynthesis?.cancel();
      try {
        localStorage.setItem("naksha_voice_guidance_enabled", String(next));
      } catch (error) {
        console.error("Failed to save voice guidance preference:", error);
      }
      return next;
    });
  };
  // Speaks one instruction, working around two real Web Speech API quirks rather than just
  // calling speak() directly: (1) Chrome loads voices asynchronously - getVoices() can be
  // empty on the very first call even though voices exist, and speak() called before they're
  // ready has been known to silently produce no audio; (2) the speech queue can silently
  // stall after periods of inactivity (paused internally without reporting it), which
  // resume() before speaking is the standard workaround for.
  const speakInstruction = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      console.warn("Voice guidance: speechSynthesis unavailable in this browser.");
      return;
    }
    const synth = window.speechSynthesis;

    const doSpeak = () => {
      synth.resume();
      synth.cancel();
      const voices = synth.getVoices();
      const utterance = new SpeechSynthesisUtterance(text);
      const englishVoice = voices.find((v) => v.lang?.toLowerCase().startsWith("en"));
      if (englishVoice) utterance.voice = englishVoice;
      utterance.onerror = (e) => {
        // "interrupted"/"canceled" aren't real failures - they fire on the PREVIOUS
        // utterance precisely because this function just called cancel() to replace it with
        // a newer instruction (e.g. two maneuvers close together during simulation/driving).
        // Logging those as errors made completely normal behavior look like a crash.
        if (e.error === "interrupted" || e.error === "canceled") return;
        console.error("Voice guidance failed to speak:", e.error);
      };
      utterance.onstart = () => console.debug("Voice guidance speaking:", text);
      synth.speak(utterance);
      console.debug("Voice guidance: queued utterance, voices available:", voices.length);
    };

    if (synth.getVoices().length > 0) {
      doSpeak();
      return;
    }
    console.debug("Voice guidance: no voices loaded yet, waiting for voiceschanged...");
    const handleVoicesChanged = () => {
      synth.removeEventListener("voiceschanged", handleVoicesChanged);
      doSpeak();
    };
    synth.addEventListener("voiceschanged", handleVoicesChanged);
    // Fallback in case voiceschanged never fires - some embedded/preview webviews never
    // populate a voice list at all (no TTS engine wired up), which would otherwise leave
    // this waiting forever. Try anyway after a short delay so it's not silently stuck, and
    // warn clearly if voices genuinely never showed up.
    setTimeout(() => {
      synth.removeEventListener("voiceschanged", handleVoicesChanged);
      if (synth.getVoices().length === 0) {
        console.warn(
          "Voice guidance: no voices available after waiting - this browser/environment likely has no TTS engine (common in embedded/preview webviews, not full Chrome/Edge/Firefox). Try a normal browser window."
        );
      }
      doSpeak();
    }, 500);
  };

  // Tracks the last instruction actually spoken, so it announces once per maneuver (when
  // currentInstruction changes) rather than repeating itself on every GPS update while still
  // approaching the same turn.
  const lastAnnouncedInstructionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!navigationState) {
      lastAnnouncedInstructionRef.current = null;
      return;
    }
    if (!voiceEnabled) return;
    if (navigationState.currentInstruction === lastAnnouncedInstructionRef.current) return;
    lastAnnouncedInstructionRef.current = navigationState.currentInstruction;
    speakInstruction(navigationState.currentInstruction);
  }, [navigationState, voiceEnabled]);
  // Stop any in-progress speech if navigation ends or the page unmounts mid-sentence.
  useEffect(() => {
    if (!navigationState && typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, [navigationState]);
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const [uiTravelMode, setUiTravelMode] = useState<UiTravelModeId>("driving");
  const travelMode: TravelMode = TRAVEL_MODES.find((m) => m.id === uiTravelMode)?.mode ?? "driving";

  const [originPoint, setOriginPoint] = useState<DirectionsPoint>({ type: "current" });
  const [originText, setOriginText] = useState("");
  const [destinationPoint, setDestinationPoint] = useState<DirectionsPoint | null>(null);
  const [destinationText, setDestinationText] = useState("");
  const [activeDirectionsField, setActiveDirectionsField] = useState<
    "origin" | "destination" | null
  >(null);
  const [directionsFieldSuggestions, setDirectionsFieldSuggestions] = useState<
    { label: string; lat: number; lon: number }[]
  >([]);
  const [directionsFieldGeocoding, setDirectionsFieldGeocoding] = useState(false);
  const directionsFormRef = useRef<HTMLDivElement>(null);

  // Recently picked destinations (label+lat+lon only - no hours/photos, since that needs a
  // business-listings source we don't have), persisted to localStorage so they survive a
  // reload - shown under a field when it's focused and empty, like Google's "Recents" list.
  const DIRECTIONS_RECENTS_KEY = "naksha_recent_directions";
  const [recentDestinations, setRecentDestinations] = useState<
    { label: string; lat: number; lon: number }[]
  >([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DIRECTIONS_RECENTS_KEY);
      if (raw) setRecentDestinations(JSON.parse(raw));
    } catch (error) {
      console.error("Failed to load recent directions:", error);
    }
  }, []);
  const addRecentDestination = (dest: { label: string; lat: number; lon: number }) => {
    setRecentDestinations((prev) => {
      const next = [dest, ...prev.filter((r) => r.label !== dest.label)].slice(0, 5);
      try {
        localStorage.setItem(DIRECTIONS_RECENTS_KEY, JSON.stringify(next));
      } catch (error) {
        console.error("Failed to save recent directions:", error);
      }
      return next;
    });
  };

  const openDirections = () => {
    setShowDirections(true);
    setOriginPoint({ type: "current" });
    setOriginText("");
    setDestinationPoint(null);
    setDestinationText("");
    setActiveDirectionsField("destination");
    setDirectionsFieldSuggestions([]);
    setRoutePreview(null);
    setRouteError(null);
  };

  const closeDirections = () => {
    setShowDirections(false);
    setActiveDirectionsField(null);
    setDirectionsFieldSuggestions([]);
    setRoutePreview(null);
    setRouteError(null);
    setNavigationState(null);
    mapViewerRef.current?.stopNavigation();
  };

  const selectOriginPoint = (point: DirectionsPoint, label: string) => {
    setOriginPoint(point);
    setOriginText(label);
    setActiveDirectionsField(null);
    setDirectionsFieldSuggestions([]);
  };

  const selectDestinationPoint = (dest: { label: string; lat: number; lon: number }) => {
    setDestinationPoint({ type: "place", ...dest });
    setDestinationText(dest.label);
    setActiveDirectionsField(null);
    setDirectionsFieldSuggestions([]);
    addRecentDestination(dest);
  };

  const handleSwapDirections = () => {
    const prevOrigin = originPoint;
    const prevOriginText = originText;
    setOriginPoint(destinationPoint ?? { type: "current" });
    setOriginText(destinationPoint ? destinationText : "");
    setDestinationPoint(prevOrigin.type === "place" ? prevOrigin : null);
    setDestinationText(prevOrigin.type === "place" ? prevOriginText : "");
  };

  // Free-text search for whichever directions field is currently focused (see
  // activeDirectionsField) - same debounced /api/geocode lookup the main search bar uses,
  // just keyed to origin or destination instead of the top search box.
  useEffect(() => {
    if (!activeDirectionsField) return;
    const text = (activeDirectionsField === "origin" ? originText : destinationText).trim();
    if (text.length < 3) {
      setDirectionsFieldSuggestions([]);
      setDirectionsFieldGeocoding(false);
      return;
    }
    setDirectionsFieldGeocoding(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        setDirectionsFieldSuggestions(await res.json());
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to load directions field suggestions:", error);
      } finally {
        if (!controller.signal.aborted) setDirectionsFieldGeocoding(false);
      }
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activeDirectionsField, originText, destinationText]);

  // Close the directions field dropdown when clicking anywhere outside the form.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (directionsFormRef.current && !directionsFormRef.current.contains(e.target as Node)) {
        setActiveDirectionsField(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-fetches a route the moment both ends are resolved - origin defaults to "current",
  // so this fires as soon as a destination is picked, same as Google (no separate "Go"
  // button needed once both fields have something).
  useEffect(() => {
    if (!showDirections || !destinationPoint) return;
    let cancelled = false;
    (async () => {
      setRoutePreview(null);
      setRouteError(null);
      setRouteLoading(true);
      // Belt-and-suspenders alongside getRoutePreview's own try/catch: a rejection here
      // should never leave the panel stuck on "Getting directions..." forever (that's
      // exactly the bug that motivated adding this - an unhandled rejection skipped
      // setRouteLoading(false) entirely since it's the line right after the await).
      let result: Awaited<ReturnType<NonNullable<IndiaMapViewerHandle["getRoutePreview"]>>> | undefined;
      try {
        result = await mapViewerRef.current?.getRoutePreview(
          originPoint,
          destinationPoint,
          travelMode,
          uiTravelMode
        );
      } catch (error) {
        console.error("Directions request failed:", error);
      }
      if (cancelled) return;
      setRouteLoading(false);
      if (!result || !result.ok) {
        const reason = result?.reason;
        setRouteError(
          reason === "geolocation-denied"
            ? "Location access is blocked. Allow it in your browser's site settings, then try again."
            : reason === "geolocation-unavailable"
              ? "Couldn't determine your current location - check your device's location settings and try again."
              : "Couldn't find a route between these points - one may be outside Karnataka, which is the only area with directions support right now."
        );
        return;
      }
      setRoutePreview(result.preview);
    })();
    return () => {
      cancelled = true;
    };
  }, [showDirections, originPoint, destinationPoint, travelMode]);

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
      setLocalSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (suppressSuggestionsRef.current) return;

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

    setLocalSuggestions(merged);
    // The dropdown panel itself shows for any non-empty query, not just once results exist -
    // that's what lets it show a "Searching..." or "No results found" state instead of just
    // not appearing (which looks like the search box is broken, not that it found nothing).
    setShowSuggestions(true);
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
    placeSuggestions.length,
  ]);

  // Free-text place/address search (Nominatim via /api/geocode), merged into the "Places"
  // category above. Debounced (400ms) and requires 3+ chars so we don't fire on every
  // keystroke - Nominatim's public API is rate-limited to ~1 request/sec.
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 3) {
      setPlaceSuggestions([]);
      setGeocoding(false);
      return;
    }
    if (suppressSuggestionsRef.current) return;

    setGeocoding(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const results = (await res.json()) as { label: string; lat: number; lon: number }[];
        setPlaceSuggestions(results);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to load place search suggestions:", error);
      } finally {
        if (!controller.signal.aborted) setGeocoding(false);
      }
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Handle keyboard navigation for suggestions
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter works whether or not the dropdown is currently open (e.g. it was dismissed with
    // Escape, or hasn't finished loading yet) - same as Google, pressing Enter always tries
    // to go somewhere rather than silently doing nothing.
    if (e.key === "Enter") {
      e.preventDefault();
      if (showSuggestions && selectedSuggestionIndex >= 0) {
        const suggestion = getSuggestionByIndex(selectedSuggestionIndex);
        if (suggestion) selectSuggestion(suggestion);
      } else if (showSuggestions && getTotalSuggestions() > 0) {
        // Nothing explicitly highlighted yet - accept the top suggestion, same as Google
        // (Enter picks the first result, not a separate "raw text" search).
        const suggestion = getSuggestionByIndex(0);
        if (suggestion) selectSuggestion(suggestion);
      } else {
        setShowSuggestions(false);
        mapViewerRef.current?.search(searchQuery);
      }
      return;
    }

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

  // Selecting a suggestion: our own admin-boundary matches go through the existing search()
  // DSL (state/district/taluk/hobli/village chains), but a "Places" entry is an arbitrary
  // geocoded address with no boundary behind it, so it flies straight to its lat/lon and
  // drops a pin instead (see flyToPlace).
  const selectSuggestion = (suggestion: string) => {
    suppressSuggestionsRef.current = true;
    setSearchQuery(suggestion);
    setShowSuggestions(false);
    const place = placeSuggestions.find((p) => p.label === suggestion);
    if (place) {
      mapViewerRef.current?.flyToPlace(place.lat, place.lon, place.label);
    } else {
      mapViewerRef.current?.search(suggestion);
    }
  };

  const handleSuggestionClick = (suggestion: string) => selectSuggestion(suggestion);

  const clearSearch = () => {
    setSearchQuery("");
    setShowSuggestions(false);
    setPlaceSuggestions([]);
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
          onLiveLocationChange={(active) => setLiveLocationState(active ? "active" : "off")}
          onNavigationUpdate={setNavigationState}
          onRequestDirections={(lat, lon, label) => {
            // Same as tapping "Directions" on a place card in Google Maps - switches
            // straight into directions mode with this place already set as the destination
            // (origin defaults to "Your location", same as openDirections) - no need to
            // re-search it.
            setShowDirections(true);
            setOriginPoint({ type: "current" });
            setOriginText("");
            setDestinationPoint({ type: "place", label, lat, lon });
            setDestinationText(label);
            setActiveDirectionsField(null);
            addRecentDestination({ label, lat, lon });
          }}
          onRouteAlternativeSelected={(index) =>
            setRoutePreview((prev) => (prev ? { ...prev, selectedIndex: index } : prev))
          }
          findMyWayActive={selectedBoundaryLayer === "find_my_way"}
          onPlaceLabelsVisibleChange={setPlaceLabelsVisible}
        />

        {/* Floating search bar (or, while showDirections, the directions form in its place -
            only one of the two is ever visible, same as Google switching its single search
            box into a directions panel rather than showing both at once). */}
        {/* pointer-events-none on this row: because it has both left-4 and right-4 set, its
            box stretches the full map width, and its height grows to match its tallest child
            (e.g. the directions panel once a long route/turn-list is showing) - without this,
            that invisible empty space swallows drag/pan input over the map. Each direct child
            opts back in with pointer-events-auto so the actual controls stay clickable. */}
        <div className="pointer-events-none absolute left-4 right-4 top-4 z-20 flex items-center gap-3">
          {showDirections ? (
            <div
              ref={directionsFormRef}
              className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-md"
            >
              {navigationState ? (
                // Live turn-by-turn banner - the big current instruction plus a compact
                // remaining-distance/ETA line, same layout Google Maps uses while driving.
                // Replaces the whole form (mode row/fields) while navigation is active.
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <Navigation className="mt-0.5 h-6 w-6 flex-shrink-0 text-atlas-cobalt" />
                      <div>
                        <p className="text-base font-semibold leading-snug text-slate-900">
                          {navigationState.currentInstruction}
                        </p>
                        {!navigationState.arrived && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            in {formatDistance(navigationState.distanceToNextTurnMeters)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={toggleVoiceEnabled}
                        aria-label={voiceEnabled ? "Mute voice guidance" : "Unmute voice guidance"}
                        aria-pressed={voiceEnabled}
                        className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        {voiceEnabled ? (
                          <Volume2 className="h-4 w-4" />
                        ) : (
                          <VolumeX className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={closeDirections}
                        aria-label="Stop navigation"
                        className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {navigationState.nextInstruction && (
                    <p className="mt-2 truncate border-t border-gray-100 pt-2 text-xs text-gray-400">
                      Then {navigationState.nextInstruction}
                    </p>
                  )}
                  {!navigationState.arrived && (
                    <p className="mt-2 text-sm text-gray-600">
                      {formatDistance(navigationState.distanceRemainingMeters)} ·{" "}
                      {formatDuration(navigationState.durationRemainingSeconds)} to{" "}
                      <span className="font-medium">{navigationState.destinationLabel}</span>
                    </p>
                  )}
                </div>
              ) : (
                <>
              {/* Travel mode row - icon-only pills, same layout as Google's directions panel. */}
              <div className="flex items-center gap-1 px-2 py-2">
                {TRAVEL_MODES.map(({ id, mode, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setUiTravelMode(id)}
                    aria-label={label}
                    aria-pressed={uiTravelMode === id}
                    title={id === "motorcycle" ? `${label} (uses ${mode} routing - no dedicated motorcycle data)` : label}
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                      uiTravelMode === id
                        ? "bg-atlas-cobalt text-white"
                        : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={closeDirections}
                  aria-label="Close directions"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Loading bar - a thin indeterminate strip while a route is being fetched,
                  same spot Google's directions panel uses for its loading state; otherwise
                  just the plain divider under the mode icons. */}
              <div className="relative h-0.5 overflow-hidden bg-gray-100">
                {routeLoading && (
                  <div className="directions-loading-bar absolute inset-y-0 w-1/3 bg-atlas-cobalt" />
                )}
              </div>

              {/* Origin/destination fields - bordered pills (teal when focused) with a
                  vertical dot connector on the left linking them, same visual Google uses
                  (purely decorative here - no multi-stop support), and a swap button on the
                  right. */}
              <div className="relative px-3 py-3">
                <div className="pointer-events-none absolute left-[26px] top-[34px] bottom-[34px] flex flex-col items-center justify-between">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1 w-1 rounded-full bg-gray-300" />
                  ))}
                </div>

                <div
                  className={`flex items-center gap-2 rounded-full border bg-white px-3 py-2 transition-colors ${
                    activeDirectionsField === "origin"
                      ? "border-teal-500 ring-1 ring-teal-500"
                      : "border-gray-200"
                  }`}
                >
                  <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full border-2 border-gray-400" />
                  <input
                    type="text"
                    value={originText}
                    onChange={(e) => setOriginText(e.target.value)}
                    onFocus={() => setActiveDirectionsField("origin")}
                    placeholder="Choose starting point, or click on the map"
                    className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
                  />
                  <Search className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                </div>

                <div className="h-2" />

                <div
                  className={`flex items-center gap-2 rounded-full border bg-white px-3 py-2 transition-colors ${
                    activeDirectionsField === "destination"
                      ? "border-teal-500 ring-1 ring-teal-500"
                      : "border-gray-200"
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                  <input
                    type="text"
                    value={destinationText}
                    onChange={(e) => setDestinationText(e.target.value)}
                    onFocus={() => setActiveDirectionsField("destination")}
                    placeholder="Choose destination"
                    className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSwapDirections}
                  aria-label="Swap starting point and destination"
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Field dropdown - "Your location" (origin only) + recents + live geocode
                  results, for whichever field is currently focused. Only one shows at a
                  time, same as Google's directions fields. */}
              {activeDirectionsField && (
                <div className="max-h-64 overflow-y-auto border-t border-gray-100">
                  {activeDirectionsField === "origin" && !originText.trim() && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectOriginPoint({ type: "current" }, "Your location")}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <LocateFixed className="h-3.5 w-3.5 flex-shrink-0 text-atlas-cobalt" />
                      Your location
                    </button>
                  )}
                  {(activeDirectionsField === "origin" ? originText : destinationText).trim().length < 3 &&
                    recentDestinations.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          activeDirectionsField === "origin"
                            ? selectOriginPoint({ type: "place", ...r }, r.label)
                            : selectDestinationPoint(r)
                        }
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Clock className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                        <span className="truncate">{r.label}</span>
                      </button>
                    ))}
                  {(activeDirectionsField === "origin" ? originText : destinationText).trim().length >= 3 &&
                    (directionsFieldGeocoding ? (
                      <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400">
                        <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
                        Searching...
                      </div>
                    ) : directionsFieldSuggestions.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-400">No results found</div>
                    ) : (
                      directionsFieldSuggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() =>
                            activeDirectionsField === "origin"
                              ? selectOriginPoint({ type: "place", ...s }, s.label)
                              : selectDestinationPoint(s)
                          }
                          className="flex w-full items-start gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                          <span className="truncate">{s.label}</span>
                        </button>
                      ))
                    ))}
                </div>
              )}

              {/* Route results - loading/error, or the alternatives list + step-by-step
                  breakdown + Start Navigation, once a destination is resolved. Fetches
                  automatically (see the auto-fetch effect above) as soon as both ends are
                  set, no separate "Go" button. */}
              {destinationPoint && (
                <div className="border-t border-gray-100 p-3">
                  {routeLoading && (
                    <p className="text-sm text-gray-500">Getting directions...</p>
                  )}
                  {routeError && <p className="text-sm text-red-600">{routeError}</p>}

                  {routePreview && (
                    <div>
                      {/* Route alternatives - Google always shows the fastest first ("Best")
                          plus any other genuinely distinct options, each with its own
                          distance/time; tapping one redraws it on the map. Often there's
                          only one entry (OSRM found no real alternative for this trip), which
                          renders fine as a single, non-interactive-feeling row. */}
                      <div className="space-y-1.5">
                        {routePreview.alternatives.map((alt, i) => {
                          const selected = i === routePreview.selectedIndex;
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                mapViewerRef.current?.selectRouteAlternative(i);
                                setRoutePreview((prev) => (prev ? { ...prev, selectedIndex: i } : prev));
                              }}
                              className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                                selected
                                  ? "border-atlas-cobalt bg-atlas-cobalt/5"
                                  : "border-gray-100 hover:bg-gray-50"
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900">
                                  {formatDuration(alt.durationSeconds)}
                                  {i === 0 && (
                                    <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                                      Best
                                    </span>
                                  )}
                                </p>
                                <p className="truncate text-xs text-gray-500">
                                  {formatDistance(alt.distanceMeters)}
                                  {alt.summary ? ` · ${alt.summary}` : ""}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-gray-100">
                        {routePreview.alternatives[routePreview.selectedIndex]?.steps.map((step, i) => (
                          <div
                            key={i}
                            className="border-b border-gray-50 px-3 py-2 text-xs text-gray-600 last:border-b-0"
                          >
                            {step.instruction}
                            <span className="ml-1 text-gray-400">
                              ({formatDistance(step.distanceMeters)})
                            </span>
                          </div>
                        ))}
                      </div>
                      {/* Compact circular "start" icon, same layout Google's route-preview
                          card uses (trip summary on the left, a round navigate button on
                          the right) rather than a full-width text pill. */}
                      <div className="mt-3 flex items-center justify-between gap-3 px-1">
                        <div className="min-w-0">
                          <p className="text-lg font-semibold text-slate-900">
                            {formatDuration(
                              routePreview.alternatives[routePreview.selectedIndex]?.durationSeconds ?? 0
                            )}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {formatDistance(
                              routePreview.alternatives[routePreview.selectedIndex]?.distanceMeters ?? 0
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => mapViewerRef.current?.startNavigation()}
                          aria-label="Start navigation"
                          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-atlas-cobalt text-white shadow-md transition-colors hover:bg-atlas-cobalt/90"
                        >
                          <Navigation className="h-5 w-5" />
                        </button>
                      </div>
                      {/* Testing tool - fakes GPS movement along the route so voice
                          guidance, the turn banner, and mid-route rerouting/route-switching
                          can all be checked without actually being there or moving. */}
                      <button
                        type="button"
                        onClick={() => mapViewerRef.current?.startSimulatedNavigation()}
                        className="mt-1.5 w-full rounded-full border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                      >
                        Test drive this route (simulate)
                      </button>
                    </div>
                  )}
                </div>
              )}
                </>
              )}
            </div>
          ) : (
            <div ref={searchWrapperRef} className="pointer-events-auto relative max-w-md flex-1">
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
                  onChange={(e) => {
                    suppressSuggestionsRef.current = false;
                    setSearchQuery(e.target.value);
                  }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => searchQuery && setShowSuggestions(true)}
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

              {/* Suggestions dropdown - shown for any non-empty query, not just once results
                  exist, so a still-loading or genuinely empty search shows that state instead
                  of just doing nothing (which reads as broken, not "found nothing"). */}
              {showSuggestions && searchQuery.trim() && (
                <div
                  id="search-suggestions-listbox"
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-lg"
                >
                  {searchSuggestions.length === 0 ? (
                    geocoding ? (
                      <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400">
                        <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
                        Searching...
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-sm text-gray-400">No results found</div>
                    )
                  ) : (
                    searchSuggestions.map((cat, catIdx) => {
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
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* Directions Button - sits right beside the search bar, same as Google's layout
              (not grouped with My Location on the far right). Opens the dedicated
              origin/destination form above in place of the normal search bar. */}
          <button
            type="button"
            onClick={() => (showDirections ? closeDirections() : openDirections())}
            aria-label="Directions"
            aria-pressed={showDirections}
            className={`pointer-events-auto flex flex-shrink-0 items-center justify-center rounded-full border p-2.5 shadow-md transition-colors ${
              showDirections
                ? "border-atlas-cobalt bg-atlas-cobalt text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Navigation className="h-4 w-4" />
          </button>

          {/* Spacer to push items to the right */}
          <div className="flex-1" />

          {/* My Location Button - flies to the device's live GPS position and drops a
              tracking blue dot, same as Google Maps' locate-me control. */}
          <button
            type="button"
            onClick={handleToggleLiveLocation}
            aria-label={liveLocationState === "active" ? "Stop tracking my location" : "Show my location"}
            aria-pressed={liveLocationState !== "off"}
            className={`pointer-events-auto flex flex-shrink-0 items-center justify-center rounded-full border p-2.5 shadow-md transition-colors ${
              liveLocationState === "active"
                ? "border-atlas-cobalt bg-atlas-cobalt text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <LocateFixed
              className={`h-4 w-4 ${liveLocationState === "locating" ? "animate-pulse" : ""}`}
            />
          </button>

          {/* Draw AOI Button */}
          <div ref={aoiMenuRef} className="pointer-events-auto relative">
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

          {/* User Profile Icon */}
          <div className="pointer-events-auto">
            <UserProfile userName="John Doe" userEmail="john.doe@example.com" />
          </div>
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
                      <div key={id}>
                      <label className="flex items-center text-sm text-gray-600">
                        <input
                          type="checkbox"
                          className="mr-2 accent-atlas-cobalt"
                          checked={selectedBoundaryLayer === id}
                          onChange={() => {
                            setSelectedBoundaryLayer(id);
                            if (id === "find_my_way") {
                              // "none" clears whatever boundary layer was previously active
                              // (e.g. switching back to Find My Way after picking
                              // Administrative Boundaries) - it isn't a real boundary layer
                              // itself, it's the absence of one. Selecting it here only marks
                              // it as the active choice - it does NOT open the Directions
                              // panel itself, same as picking any other option here just
                              // changes the map, not other UI. The panel only opens via the
                              // dedicated Directions button.
                              mapViewerRef.current?.setBoundaryLayerMode("none");
                              return;
                            }
                            if (showDirections) closeDirections();
                            mapViewerRef.current?.setBoundaryLayerMode(id);
                            if (id !== "roads") setSelectedRoadsScope("none");
                          }}
                        />
                        {label}
                      </label>
                      {id === "find_my_way" && selectedBoundaryLayer === "find_my_way" && (
                        <div className="ml-6 mt-2">
                          {/* Google-Earth-style independent layer toggle - stays in sync
                              with the same checkbox in the on-map Layers picker (bottom-left)
                              since both drive the same underlying preference. */}
                          <label className="flex items-center text-sm text-gray-600">
                            <input
                              type="checkbox"
                              className="mr-2 accent-atlas-cobalt"
                              checked={placeLabelsVisible}
                              onChange={(e) => mapViewerRef.current?.setPlaceLabelsVisible(e.target.checked)}
                            />
                            Place names
                          </label>
                        </div>
                      )}
                      {id === "police_station" && selectedBoundaryLayer === "police_station" && (
                        <div>
                        <select
                          className="ml-6 mt-2 w-[calc(100%-1.5rem)] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
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
                          className="ml-6 mt-2 w-[calc(100%-1.5rem)] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
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
