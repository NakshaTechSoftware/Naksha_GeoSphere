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
  type AdjacentParcel,
  type NavigationState,
  type RoutePreview,
  type TravelMode,
  type DirectionsPoint,
} from "./IndiaMapViewer";
import type { RtcOwner, RtcUseCase } from "@/app/api/land-records/_bhoomi";
import { config } from "@/lib/config";
import { LocationEnvironmentPanel } from "@/components/environment/LocationEnvironmentPanel";
import {
  getStoredUserSession,
  type StoredUserSession,
} from "@/lib/userSession";
import { ExportFeatureModal } from "./ExportFeatureModal";
import { UserProfile } from "./UserProfile";
import { FreeHandIcon, PolygonIcon, RectangleIcon, DrawAOIIcon, ToolsGridIcon } from "./AOIIcons";
import {
  ArrowUpDown,
  Bike,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  CloudSun,
  Download,
  Footprints,
  LocateFixed,
  MapPin,
  Motorbike,
  Navigation,
  Search,
  Menu,
  Mic,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { WeatherLayerToolbar, type WeatherLayerKey } from "../weather/WeatherLayerToolbar";
import { rankLocationEntries, rankStaticSuggestions } from "@/lib/geosearch";

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

const POLICE_DISTRICTS = [
  "Bagalkote", "Ballari", "Belagavi", "Bengaluru (Rural)", "Bengaluru (Urban)",
  "Bengaluru South", "Bidar", "Chamarajanagara", "Chikkaballapura", "Chikkamagaluru",
  "Chitradurga", "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan",
  "Haveri", "Kalaburgi", "Kodagu", "Kolara", "Koppal", "Mandya", "Mysuru",
  "Raichur", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayanagara",
  "Vijayapura", "Yadgir"
];

const BENGALURU_REGIONS = ["Central", "East", "North", "South", "West"] as const;

const PLACE_SUGGESTIONS = {
  regions: ["Bengaluru", "Bangalore"],
  bengaluruZones: [...BENGALURU_REGIONS],
  villages: [
    "Banaswadi", "Koramangala", "Indiranagar", "Koramangala 1st Block",
    "Koramangala 2nd Block", "Koramangala 3rd Block", "Koramangala 4th Block",
    "Koramangala 5th Block", "Hebbal", "Malleshwaram", "Brindavan Nagar",
    "Hombegowda Nagar", "Vinayaka Nagar", "Srinivasa Nagar", "Chennamma Nagar",
    "Muthanamakki", "Kengeri", "Attibele", "Hosakote", "Devanahalli",
    "Yelahanka", "Kenchapura", "Varthur", "Sarjapur", "Electronic City",
    "Bannerghatta", "Jayanagar", "JP Nagar", "BTM Layout", "Ulsoor",
    "Shivaji Nagar", "Panathur", "Vijay Nagar",
  ],
  wards: [
    "Banaswadi", "Koramangala", "Indiranagar", "Malleshwaram", "Hebbal",
    "Yelahanka", "Whitefield", "Electronics City", "Hosur Road", "BTM Layout",
    "Jayanagar", "JP Nagar", "BTM 2nd Stage", "BTM 4th Stage", "BTM 6th Stage",
    "Malleswaram", "R V Nagar", "Kaduvalli", "Goraguntepalya", "Punjai Palaya",
    "Dasarahalli", "Tadpalya", "Pai Layout", "Veerabhadra Nagar", "Hoskote",
    "Sud Flatten", "Varthur", "Sarjapur", "Kundalahalli", "Kaikondrahalli",
    "Hegde Nagar", "Vasanth Nagar", "Kempapura", "Kadugodi", "Leelavathi Nagar",
    "Konena Agrahara", "Maruthi Seve Nagar", "Prarthana Circle", "Gopala Nagar",
    "Garudacharpalya", "Hoodi", "Harlur", "Bellandur", "Yelahanka",
  ],
};

function filterSuggestions(query: string, category: string) {
  const allItems = PLACE_SUGGESTIONS[category as keyof typeof PLACE_SUGGESTIONS] || [];
  return rankStaticSuggestions(allItems, query);
}

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

const CATEGORY_LABELS: Record<string, string> = {
  regions: "Regions",
  bengaluruZones: "Bengaluru Zones",
  villages: "Villages",
  wards: "Wards",
};

interface LocationEntry {
  label: string;
  leaf: string;
}

function filterLocationEntries(
  entries: LocationEntry[],
  query: string,
  opts: { boostLabel?: string; fuzzy?: boolean; limit?: number } = {},
): string[] {
  return rankLocationEntries(entries, query, opts);
}

function formatAreaSqKm(areaSqKm: number): string {
  if (areaSqKm < 0.01) {
    return `${Math.max(Math.round(areaSqKm * 1_000_000), 1).toLocaleString("en-IN")} m²`;
  }
  if (areaSqKm >= 100) {
    return `${Math.round(areaSqKm).toLocaleString("en-IN")} km²`;
  }
  return `${areaSqKm.toLocaleString("en-IN", { maximumFractionDigits: 2 })} km²`;
}

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

// Karnataka Kaveri Online Services government guideline value ("SR Rate") for a
// cadastral parcel - see /api/v1/pricing/guideline-value (services/api/app/api/v1/pricing.py).
// "unavailable" (no village mapping / no road / no rate) and "error" (the upstream
// request itself failed) are kept distinct from the fetch's own perspective, but both
// render as the backend's own `message` string - the task spec's exact wording either way.
type GuidelineValueState =
  | { status: "loading" }
  | {
      status: "ok";
      standardRate: number;
      rateUnit: string;
      plotAreaSqm: number;
      estimatedLandValue: number;
      landType: string;
      availableRates?: string[] | null;
      source: string;
      roadResolutionMethod: string;
      roadConfidence: number;
      classificationSource: string;
    }
  | {
      status: "unavailable" | "error";
      message: string;
      reason?: string;
      debugDetail?: string | null;
    }
  | {
      status: "road_selection_required";
      message: string;
      candidates: { roadCode: string; roadName: string; rates: string[] }[];
    }
  | {
      status: "classification_unknown";
      message: string;
      candidates: { propertyType: string; rate: number; rateUnit: string }[];
    }
  | {
      status: "rate_category_selection_required";
      message: string;
      landType: string;
      candidates: { propertyType: string; rate: number; rateUnit: string }[];
    };

// "village_default"/"manual_required" are best-guess road resolutions, not a
// confirmed locality match - the popup should say so rather than imply
// certainty (spec Part 6/16's "rate matched using…" line).
const ROAD_RESOLUTION_LABEL: Record<string, string> = {
  exact_road_attribute: "exact cadastral road match",
  only_rated_candidate: "only nearby road with a Kaveri rate",
  locality_name_match: "nearest matching locality name",
  village_default: "village-level default (unconfirmed)",
  manual_required: "unconfirmed (best available guess)",
};

function AttributePanelBody({
  info,
  owners,
  useCase,
  adjacentPlots,
  guidelineValue,
  onClose,
  onExport,
  onSketchClick,
  onViewRtc,
}: {
  info: AttributeInfo;
  owners:
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ok"; rows: RtcOwner[] };
  useCase?: RtcUseCase | null;
  adjacentPlots?: {
    key: AdjacentParcel;
    status: "loading" | "error" | "ok";
    owners?: RtcOwner[];
    message?: string;
  }[];
  guidelineValue?: GuidelineValueState;
  onClose?: () => void;
  onExport: () => void;
  onSketchClick?: (url: string) => void;
  onViewRtc?: (url: string) => void;
}) {
  const handlePanelClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const link = target.closest(".sketch-link") as HTMLElement | null;
    if (link && onSketchClick) {
      e.preventDefault();
      const url = link.getAttribute("data-sketch-url");
      if (url) onSketchClick(url);
    }
  };

  return (
    <>
      <div onClick={handlePanelClick}>
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
              {/* Use case row — cultivation / land-use details from RTC Preview */}
              {useCase && (
                <tr className="border-b border-slate-100">
                  <td className="w-1 whitespace-nowrap border-r border-slate-200 px-3 py-1.5 align-top text-slate-500">
                    Land Use
                  </td>
                  <td className="break-words px-3 py-1.5">
                    <span className="font-semibold text-slate-900">{useCase.landClassification}</span>
                    {useCase.soilType && (
                      <span className="ml-1 font-normal text-slate-600">· {useCase.soilType}</span>
                    )}
                    {useCase.crops && useCase.crops.length > 0 && (
                      <span className="ml-1 font-normal text-slate-600">· Crop: {useCase.crops.join(", ")}</span>
                    )}
                    {useCase.irrigationSource && (
                      <span className="ml-1 font-normal text-slate-600">· Water: {useCase.irrigationSource}</span>
                    )}
                    {useCase.pattaType && (
                      <span className="ml-1 font-normal text-slate-500">· {useCase.pattaType}</span>
                    )}
                    {useCase.season && (
                      <span className="ml-1 font-normal text-slate-500">· {useCase.season}</span>
                    )}
                    {useCase.imageUrl && (
                      <span className="ml-1">
                        {/* Desktop: unchanged, opens the raw image in a new tab. */}
                        <a
                          href={useCase.imageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hidden text-xs text-blue-600 underline hover:text-blue-800 md:inline"
                        >
                          View RTC
                        </a>
                        {/* Mobile: opens the rotated-landscape viewer instead, since RTC
                            scans are wide tables that are illegible in a portrait tab. */}
                        <button
                          type="button"
                          onClick={() => onViewRtc?.(useCase.imageUrl!)}
                          className="text-xs text-blue-600 underline hover:text-blue-800 md:hidden"
                        >
                          View RTC
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              )}
              {!useCase && owners.status === "ok" && (
                <tr className="border-b border-slate-100">
                  <td className="w-1 whitespace-nowrap border-r border-slate-200 px-3 py-1.5 align-top text-slate-500">
                    Land Use
                  </td>
                  <td className="px-3 py-1.5 text-slate-400">Not available</td>
                </tr>
              )}
              {/* Adjacent Plots row — cadastral neighbors touching the selected parcel, with
                  their own survey number + owner (each fetched independently, so one slow
                  neighbor doesn't block the rest from showing). */}
              {info.parcel && info.adjacentParcels && info.adjacentParcels.length > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="w-1 whitespace-nowrap border-r border-slate-200 px-3 py-1.5 align-top text-slate-500">
                    Adjacent Plots
                  </td>
                  <td className="break-words px-3 py-1.5">
                    <ul className="space-y-1">
                      {(adjacentPlots && adjacentPlots.length > 0
                        ? adjacentPlots
                        : info.adjacentParcels.map((key) => ({ key, status: "loading" as const }))
                      ).map((plot, i) => (
                        <li key={`${plot.key.survey}-${plot.key.surnoc}-${plot.key.hissa}-${i}`}>
                          <span className="mr-1 inline-block w-6 flex-shrink-0 font-semibold text-slate-500">
                            {plot.key.direction || "·"}
                          </span>
                          <span className="font-semibold text-slate-900">
                            Survey {plot.key.survey}
                            {plot.key.hissa && plot.key.hissa !== "*" ? ` [Hissa ${plot.key.hissa}]` : ""}
                          </span>
                          {plot.status === "loading" && (
                            <span className="ml-1 text-slate-400">Loading owner…</span>
                          )}
                          {plot.status === "error" && (
                            <span className="ml-1 text-amber-600">Owner unavailable</span>
                          )}
                          {plot.status === "ok" && (
                            <span className="ml-1 font-normal text-slate-600">
                              {plot.owners && plot.owners.length > 0
                                ? `— ${plot.owners.map((o) => o.name).join(", ")}`
                                : "— Owner not on record"}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
              {info.parcel && info.adjacentParcels && info.adjacentParcels.length === 0 && (
                <tr className="border-b border-slate-100">
                  <td className="w-1 whitespace-nowrap border-r border-slate-200 px-3 py-1.5 align-top text-slate-500">
                    Adjacent Plots
                  </td>
                  <td className="px-3 py-1.5 text-slate-400">None found</td>
                </tr>
              )}
              {/* Government Guideline Value — Karnataka Kaveri Online Services SR Rate,
                  see /api/v1/pricing/guideline-value. Loading/unavailable/error states
                  keep the row present so it never looks like the fetch was skipped. */}
              {info.parcel && guidelineValue && (
                <tr className="border-b border-slate-100">
                  <td className="w-1 whitespace-nowrap border-r border-slate-200 px-3 py-1.5 align-top text-slate-500">
                    Guideline Value
                  </td>
                  <td className="break-words px-3 py-1.5">
                    {guidelineValue.status === "loading" && (
                      <span className="text-slate-400">Loading guideline value…</span>
                    )}
                    {(guidelineValue.status === "unavailable" || guidelineValue.status === "error") && (
                      <div className="space-y-0.5">
                        <span className="text-amber-600">{guidelineValue.message}</span>
                        {guidelineValue.reason && (
                          <p className="text-[11px] text-slate-400">Reason: {guidelineValue.reason}</p>
                        )}
                        {guidelineValue.debugDetail && (
                          <p className="text-[11px] text-slate-400 break-words">
                            Debug: {guidelineValue.debugDetail}
                          </p>
                        )}
                      </div>
                    )}
                    {guidelineValue.status === "road_selection_required" && (
                      <div className="space-y-1">
                        <span className="text-amber-600">{guidelineValue.message}</span>
                        <ul className="space-y-0.5 text-[11px] text-slate-500">
                          {guidelineValue.candidates.map((c) => (
                            <li key={c.roadCode}>
                              <span className="font-medium text-slate-700">{c.roadName}</span>
                              {": "}
                              {c.rates.join(", ")}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {guidelineValue.status === "classification_unknown" && (
                      <div className="space-y-1">
                        <span className="text-amber-600">{guidelineValue.message}</span>
                        <ul className="space-y-0.5 text-[11px] text-slate-500">
                          {guidelineValue.candidates.map((c) => (
                            <li key={c.propertyType}>
                              <span className="font-medium text-slate-700">{c.propertyType}</span>
                              {": ₹"}
                              {c.rate.toLocaleString("en-IN")} ({c.rateUnit === "per_acre" ? "/ acre" : "/ sq.m"})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {guidelineValue.status === "rate_category_selection_required" && (
                      <div className="space-y-1">
                        <p>
                          <span className="text-slate-500">Land Type: </span>
                          <span className="font-semibold text-slate-900">{guidelineValue.landType}</span>
                        </p>
                        <span className="text-amber-600">{guidelineValue.message}</span>
                        <ul className="space-y-0.5 text-[11px] text-slate-500">
                          {guidelineValue.candidates.map((c) => (
                            <li key={c.propertyType}>
                              <span className="font-medium text-slate-700">{c.propertyType}</span>
                              {": ₹"}
                              {c.rate.toLocaleString("en-IN")} ({c.rateUnit === "per_acre" ? "/ acre" : "/ sq.m"})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {guidelineValue.status === "ok" && (
                      <div className="space-y-0.5">
                        <p>
                          <span className="text-slate-500">Land Type: </span>
                          <span className="font-semibold text-slate-900">
                            {guidelineValue.landType}
                          </span>
                        </p>
                        <p>
                          <span className="text-slate-500">Standard Rate: </span>
                          <span className="font-semibold text-slate-900">
                            ₹{guidelineValue.standardRate.toLocaleString("en-IN")}
                            {guidelineValue.rateUnit === "per_acre" ? " / acre" : " / Sq.m"}
                          </span>
                        </p>
                        <p>
                          <span className="text-slate-500">Plot Area: </span>
                          <span className="font-semibold text-slate-900">
                            {guidelineValue.plotAreaSqm.toLocaleString("en-IN")} Sq.m
                          </span>
                        </p>
                        <p>
                          <span className="text-slate-500">Estimated Guideline Value: </span>
                          <span className="font-semibold text-slate-900">
                            ₹{Math.round(guidelineValue.estimatedLandValue).toLocaleString("en-IN")}
                          </span>
                        </p>
                        {guidelineValue.availableRates && guidelineValue.availableRates.length > 0 && (
                          <p className="text-[11px] text-slate-400">
                            Available Rates: {guidelineValue.availableRates.join(", ")}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400">
                          Rate matched using:{" "}
                          {ROAD_RESOLUTION_LABEL[guidelineValue.roadResolutionMethod] ??
                            guidelineValue.roadResolutionMethod}
                        </p>
                        <p className="text-[11px] text-slate-400">Source: {guidelineValue.source}</p>
                      </div>
                    )}
                  </td>
                </tr>
              )}
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
      </div>
    </>
  );
}

export function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedWard, setSelectedWard] = useState<WardSelection | null>(null);
  const mapViewerRef = useRef<IndiaMapViewerHandle>(null);
  const [expandedFilters, setExpandedFilters] = useState({
    type: true,
  });
  const [selectedBoundaryLayer, setSelectedBoundaryLayer] =
    useState<FilterSelection>("find_my_way");
  const [selectedPoliceType, setSelectedPoliceType] = useState<PoliceType>("all");
  const [selectedPoliceDistrict, setSelectedPoliceDistrict] = useState("all");
  const [selectedRoadsScope, setSelectedRoadsScope] = useState<"none" | "district" | "state">("none");
  const [localSuggestions, setLocalSuggestions] = useState<
    { category: string; items: string[] }[]
  >([]);
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
  const [geocoding, setGeocoding] = useState(false);
  const suppressSuggestionsRef = useRef(false);

  // Filters Panel Drawer Swipe Handling
  const filtersPanelRef = useRef<HTMLElement | null>(null);
  const filtersToggleRef = useRef<HTMLButtonElement | null>(null);
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
    if (dx < -20 && Math.abs(dx) > Math.abs(dy)) {
      const clamped = Math.max(dx, -window.innerWidth * 0.8);
      drawerDragRef.current.dragging = true;
      drawerDragRef.current.current = clamped;
      setDrawerDragX(clamped);
    }
  };

  const handleDrawerTouchEnd = () => {
    const { dragging, current } = drawerDragRef.current;
    if (dragging && current < -window.innerWidth * 0.2) {
      setShowFilters(false);
    }
    drawerDragRef.current.dragging = false;
    drawerDragRef.current.current = 0;
    setDrawerDragX(0);
  };

  // Attribute Bottom Sheet Swipe Handling
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
    if (dragging && current > window.innerHeight * 0.15) {
      setAttributePanelOpen(false);
    }
    attrSheetDragRef.current.dragging = false;
    attrSheetDragRef.current.current = 0;
    setAttrSheetDragY(0);
  };

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Live Location
  const [liveLocationState, setLiveLocationState] = useState<"off" | "locating" | "active">("off");
  const handleToggleLiveLocation = () => {
    if (liveLocationState === "off") {
      setLiveLocationState("locating");
      mapViewerRef.current?.startLiveLocation();
    } else if (liveLocationState === "active") {
      setLiveLocationState("off");
      mapViewerRef.current?.stopLiveLocation();
    } else {
      mapViewerRef.current?.startLiveLocation();
    }
  };

  // Turn-by-Turn Navigation & Directions
  const [showDirections, setShowDirections] = useState(false);
  const [placeLabelsVisible, setPlaceLabelsVisible] = useState(true);
  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [navigationState, setNavigationState] = useState<NavigationState | null>(null);

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
        if (e.error === "interrupted" || e.error === "canceled") return;
        console.error("Voice guidance failed to speak:", e.error);
      };
      synth.speak(utterance);
    };

    if (synth.getVoices().length > 0) {
      doSpeak();
      return;
    }

    const handleVoicesChanged = () => {
      synth.removeEventListener("voiceschanged", handleVoicesChanged);
      doSpeak();
    };
    synth.addEventListener("voiceschanged", handleVoicesChanged);
    setTimeout(() => {
      synth.removeEventListener("voiceschanged", handleVoicesChanged);
      doSpeak();
    }, 500);
  };

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
  const [activeDirectionsField, setActiveDirectionsField] = useState<"origin" | "destination" | null>(null);
  const [directionsFieldSuggestions, setDirectionsFieldSuggestions] = useState<
    { label: string; lat: number; lon: number }[]
  >([]);
  const [directionsFieldGeocoding, setDirectionsFieldGeocoding] = useState(false);
  const directionsFormRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (directionsFormRef.current && !directionsFormRef.current.contains(e.target as Node)) {
        setActiveDirectionsField(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showDirections || !destinationPoint) return;
    let cancelled = false;
    (async () => {
      setRoutePreview(null);
      setRouteError(null);
      setRouteLoading(true);
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
  }, [showDirections, originPoint, destinationPoint, travelMode, uiTravelMode]);

  // "Draw AOI" tool dropdown
  const [showAOIMenu, setShowAOIMenu] = useState(false);
  const [activeAOITool, setActiveAOITool] = useState<AOITool | null>(null);
  // Mobile-only bottom sheet that bundles Weather and Draw AOI behind a single
  // menu button, since the top toolbar has no room for both on narrow screens.
  const [showMobileTools, setShowMobileTools] = useState(false);
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
    setAttributePanelOpen(window.matchMedia("(min-width: 768px)").matches);
    setSketchUrl(null);
  }, [attributeInfo]);
  const [storedUser, setStoredUser] = useState<StoredUserSession | null>(null);
  const [showLocationEnvironment, setShowLocationEnvironment] = useState(false);

  const [sketchUrl, setSketchUrl] = useState<string | null>(null);
  // RTC document viewer - opened from "View RTC". RTC scans are wide/landscape
  // tables, so on a portrait phone the modal rotates the image 90deg via CSS
  // (portrait:/landscape: media variants) to show it full-size and legible
  // without relying on the unreliable Screen Orientation Lock API.
  const [rtcImageUrl, setRtcImageUrl] = useState<string | null>(null);
  // Pinch-zoom/pan state for the RTC viewer above. Reset whenever a new
  // document is opened (or the viewer is closed) so it never reopens
  // half-zoomed from the last time.
  const [rtcZoom, setRtcZoom] = useState(1);
  const [rtcPan, setRtcPan] = useState({ x: 0, y: 0 });
  const rtcPinchRef = useRef<{ startDistance: number; startZoom: number } | null>(null);
  const rtcPanRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const rtcLastTapRef = useRef(0);

  useEffect(() => {
    setRtcZoom(1);
    setRtcPan({ x: 0, y: 0 });
  }, [rtcImageUrl]);

  const rtcTouchDistance = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handleRtcTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      rtcPinchRef.current = { startDistance: rtcTouchDistance(e.touches), startZoom: rtcZoom };
      rtcPanRef.current = null;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - rtcLastTapRef.current < 300) {
        rtcLastTapRef.current = 0;
        if (rtcZoom > 1) {
          setRtcZoom(1);
          setRtcPan({ x: 0, y: 0 });
        } else {
          setRtcZoom(2.5);
        }
      } else {
        rtcLastTapRef.current = now;
      }
      if (rtcZoom > 1) {
        rtcPanRef.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          startPanX: rtcPan.x,
          startPanY: rtcPan.y,
        };
      }
    }
  };

  const handleRtcTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && rtcPinchRef.current) {
      const distance = rtcTouchDistance(e.touches);
      const ratio = distance / rtcPinchRef.current.startDistance;
      setRtcZoom(Math.min(5, Math.max(1, rtcPinchRef.current.startZoom * ratio)));
    } else if (e.touches.length === 1 && rtcPanRef.current) {
      // Pan is applied in screen space (translate comes after scale in the
      // transform below), so raw screen-pixel deltas are used directly -
      // no need to compensate for the current zoom level.
      const dx = e.touches[0].clientX - rtcPanRef.current.startX;
      const dy = e.touches[0].clientY - rtcPanRef.current.startY;
      setRtcPan({
        x: rtcPanRef.current.startPanX + dx,
        y: rtcPanRef.current.startPanY + dy,
      });
    }
  };

  const handleRtcTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) rtcPinchRef.current = null;
    if (e.touches.length < 1) rtcPanRef.current = null;
  };

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [aoiExportOpen, setAoiExportOpen] = useState(false);
  const [aoiOwners, setAoiOwners] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ok"; rows: RtcOwner[] }
  >({ status: "idle" });

  const [owners, setOwners] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ok"; rows: RtcOwner[] }
  >({ status: "loading" });
  const [useCase, setUseCase] = useState<RtcUseCase | null>(null);

  const [adjacentPlots, setAdjacentPlots] = useState<
    {
      key: AdjacentParcel;
      status: "loading" | "error" | "ok";
      owners?: RtcOwner[];
      message?: string;
    }[]
  >([]);

  const parcel = attributeInfo?.parcel;
  const storedLocation = storedUser?.preferredLocation ?? null;

  useEffect(() => {
    setStoredUser(getStoredUserSession());
  }, []);
  const adjacentParcels = attributeInfo?.adjacentParcels;
  const adjacentParcelsKey = adjacentParcels
    ?.map((p) => `${p.survey}|${p.surnoc}|${p.hissa}`)
    .join(",");

  useEffect(() => {
    if (!parcel) return;
    const controller = new AbortController();
    // RTC's OCR chain (Bhoomi session -> survey/hissa navigation -> preview
    // page -> image download -> OCR) has no bound of its own and must never
    // be allowed to leave this row spinning forever - bounded here so it
    // always reaches a terminal state (spec: "every async code path must
    // settle"). The guideline-value request (below) never waits on this one
    // finishing, so this timeout only affects the Owner/Land-Use row itself.
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60_000);
    setOwners({ status: "loading" });
    setUseCase(null);
    const parcelParams = new URLSearchParams({ ...parcel }).toString();

    (async () => {
      try {
        const res = await fetch(`/api/land-records/rtc?${parcelParams}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
        setOwners({ status: "ok", rows: data.owners ?? [] });
        setUseCase(data.useCase ?? null);
      } catch (error) {
        if (timedOut) {
          setOwners({ status: "error", message: "Land records lookup timed out" });
          setUseCase(null);
          return;
        }
        if (controller.signal.aborted) return;
        setOwners({
          status: "error",
          message: error instanceof Error ? error.message : "Lookup failed",
        });
        setUseCase(null);
      } finally {
        clearTimeout(timeoutId);
      }
    })();
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    parcel?.district,
    parcel?.taluk,
    parcel?.hobli,
    parcel?.village,
    parcel?.survey,
    parcel?.surnoc,
    parcel?.hissa,
  ]);

  // Adjacent-plot owner lookups: one Bhoomi request per touching neighbor, in parallel, with
  // `ownersOnly=1` so each skips the slow RTC-preview/OCR chain — we only need survey number
  // + owner here, not land-use detail, and doing that for a handful of neighbors on every
  // click would be far too slow.
  useEffect(() => {
    const neighbors = adjacentParcels ?? [];
    if (!parcel || neighbors.length === 0) {
      setAdjacentPlots([]);
      return;
    }
    const controller = new AbortController();
    setAdjacentPlots(neighbors.map((key) => ({ key, status: "loading" as const })));

    neighbors.forEach((key, i) => {
      const params = new URLSearchParams({
        district: key.district,
        taluk: key.taluk,
        hobli: key.hobli,
        village: key.village,
        survey: key.survey,
        surnoc: key.surnoc,
        hissa: key.hissa,
        ownersOnly: "1",
      }).toString();
      (async () => {
        try {
          const res = await fetch(`/api/land-records/rtc?${params}`, { signal: controller.signal });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
          if (controller.signal.aborted) return;
          setAdjacentPlots((prev) => {
            const next = [...prev];
            if (next[i]) next[i] = { key, status: "ok", owners: data.owners ?? [] };
            return next;
          });
        } catch (error) {
          if (controller.signal.aborted) return;
          setAdjacentPlots((prev) => {
            const next = [...prev];
            if (next[i]) {
              next[i] = {
                key,
                status: "error",
                message: error instanceof Error ? error.message : "Lookup failed",
              };
            }
            return next;
          });
        }
      })();
    });

    return () => controller.abort();
  }, [
    parcel?.district,
    parcel?.taluk,
    parcel?.hobli,
    parcel?.village,
    parcel?.survey,
    parcel?.surnoc,
    parcel?.hissa,
    adjacentParcelsKey,
  ]);

  const [guidelineValue, setGuidelineValue] = useState<GuidelineValueState | undefined>(undefined);

  // Karnataka Kaveri Online Services guideline value ("SR Rate") for the selected cadastral
  // parcel. Reads the KGIS village code and plot area straight off the parcel's own raw
  // properties (already carried on `attributeInfo.properties` for every cadastral feature -
  // see IndiaMapViewer.tsx's KGISVillageCode/UniqueVillageCode/KGISVill_1 fallback chain used
  // for the same field elsewhere), so no IndiaMapViewer changes were needed for this feature.
  useEffect(() => {
    if (!parcel) {
      setGuidelineValue(undefined);
      return;
    }
    const props = attributeInfo?.properties ?? {};
    const kgisVillageCode = String(
      props.KGISVillageCode ?? props.UniqueVillageCode ?? props.KGISVill_1 ?? "",
    ).split("_")[0];
    const rawArea =
      props["SHAPE.STArea()"] ?? props.Shape_Area ?? props.shape_area ?? props.SHAPE_Area;
    const plotAreaSqm = rawArea !== undefined ? Number(rawArea) : NaN;

    if (!kgisVillageCode || !Number.isFinite(plotAreaSqm) || plotAreaSqm <= 0) {
      setGuidelineValue(undefined);
      return;
    }

    // Location/rate discovery and the Bhoomi/RTC lookup (owners/useCase,
    // fetched above) run INDEPENDENTLY — RTC's OCR chain has no bound on how
    // long it can take (or whether it ever settles) and must never be able
    // to deadlock this request. Fire immediately with whatever evidence is
    // already available; this effect's dependency on `useCase?.landClassification`
    // (below) re-fires it automatically once RTC resolves, upgrading a
    // GIS-only/unknown-classification result to an RTC-backed one. A
    // previous version blocked here on `owners.status !== "loading"`, which
    // left the popup stuck on "Loading guideline value…" forever whenever
    // the RTC fetch hung (observed live for Beltangadi parcels).
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 25_000);
    setGuidelineValue({ status: "loading" });
    const params = new URLSearchParams({
      kgis_village_code: kgisVillageCode,
      plot_area_sqm: String(plotAreaSqm),
    });
    // Send the parcel's own KGIS district/taluk/hobli/village names so the
    // backend can auto-resolve + persist the Kaveri mapping on first click
    // (no pre-seeded crosswalk required).
    if (parcel?.district) params.set("district", String(parcel.district));
    if (parcel?.taluk) params.set("taluk", String(parcel.taluk));
    if (parcel?.hobli) params.set("hobli", String(parcel.hobli));
    if (parcel?.village) params.set("village", String(parcel.village));
    // Land-use GIS attributes (if the cadastral layer carries them) drive the
    // backend's agricultural vs vacant endpoint choice — never a hardcoded rate.
    const gisCategory =
      props.Category ?? props.category ?? props.LandUse ?? props.land_use ?? "";
    const gisLandcode =
      props.Landcode ?? props.landcode ?? props.LandCode ?? props.LANDCODE ?? "";
    if (gisCategory) params.set("category", String(gisCategory));
    if (gisLandcode) params.set("landcode", String(gisLandcode));
    // Bhoomi/RTC land classification (already fetched for this parcel by the
    // Owner/Land-Use effect above, if it's resolved by the time this runs) is
    // the highest-priority classification evidence the backend accepts — see
    // app.modules.pricing.classification. This effect depends on `useCase`
    // below, so once the slow RTC/OCR fetch resolves after this first (fast)
    // call, the request re-fires with the hint included.
    if (useCase?.landClassification) {
      params.set("bhoomi_land_classification", useCase.landClassification);
    }
    // RTC crop/irrigation evidence — used only to disambiguate WHICH
    // agricultural Kaveri rate category applies once classification is
    // already known to be agricultural (e.g. Bagayat Coconut vs Bagayat Dry
    // vs Plantation). Never used to invent a classification on its own.
    if (useCase?.crops && useCase.crops.length > 0) {
      params.set("bhoomi_crop", useCase.crops.join(","));
    }
    if (useCase?.irrigationSource) {
      params.set("bhoomi_irrigation", useCase.irrigationSource);
    }
    (async () => {
      try {
        const res = await fetch(
          `${config.apiUrl}/api/v1/pricing/guideline-value?${params.toString()}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Unable to fetch government guideline value");
        if (data.status === "ok") {
          setGuidelineValue({
            status: "ok",
            standardRate: Number(data.standard_rate),
            rateUnit: data.rate_unit ?? "per_sq_m",
            plotAreaSqm: Number(data.plot_area_sqm),
            estimatedLandValue: Number(data.estimated_land_value),
            landType: data.land_type ?? data.property_type,
            availableRates: data.available_rates ?? null,
            source: data.source,
            roadResolutionMethod: data.road_resolution_method ?? "manual_required",
            roadConfidence: Number(data.road_confidence ?? 0),
            classificationSource: data.classification_source ?? "unknown",
          });
        } else if (data.status === "road_selection_required") {
          setGuidelineValue({
            status: "road_selection_required",
            message: data.message ?? "Multiple Kaveri road/locality rates found.",
            candidates: (data.candidates ?? []).map((c: { road_code: string; road_name: string; rates: string[] }) => ({
              roadCode: c.road_code,
              roadName: c.road_name,
              rates: c.rates,
            })),
          });
        } else if (data.status === "classification_unknown") {
          setGuidelineValue({
            status: "classification_unknown",
            message: data.message ?? "Land classification could not be determined.",
            candidates: (data.candidates ?? []).map(
              (c: { property_type: string; rate: number; rate_unit: string }) => ({
                propertyType: c.property_type,
                rate: Number(c.rate),
                rateUnit: c.rate_unit,
              }),
            ),
          });
        } else if (data.status === "rate_category_selection_required") {
          setGuidelineValue({
            status: "rate_category_selection_required",
            message: data.message ?? "Multiple Kaveri rate categories may apply.",
            landType: data.land_type ?? "Agriculture",
            candidates: (data.candidates ?? []).map(
              (c: { property_type: string; rate: number; rate_unit: string }) => ({
                propertyType: c.property_type,
                rate: Number(c.rate),
                rateUnit: c.rate_unit,
              }),
            ),
          });
        } else {
          setGuidelineValue({
            status: "unavailable",
            message: data.message ?? "Guideline value unavailable for this location",
            reason: data.reason,
            debugDetail: data.debug_detail ?? null,
          });
        }
      } catch (error) {
        if (timedOut) {
          setGuidelineValue({
            status: "error",
            message: "Kaveri temporarily unavailable — please retry",
            reason: "kaveri_timeout",
          });
          return;
        }
        if (controller.signal.aborted) return;
        setGuidelineValue({
          status: "error",
          message:
            error instanceof Error ? error.message : "Unable to fetch government guideline value",
        });
      } finally {
        clearTimeout(timeoutId);
      }
    })();
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    parcel?.district,
    parcel?.taluk,
    parcel?.hobli,
    parcel?.village,
    parcel?.survey,
    parcel?.surnoc,
    parcel?.hissa,
    attributeInfo?.properties,
    owners.status,
    useCase?.landClassification,
    useCase?.crops,
    useCase?.irrigationSource,
  ]);

  useEffect(() => {
    if (!aoiExportOpen || !aoiInfo?.aoiParcel) {
      setAoiOwners({ status: "idle" });
      return;
    }
    const aoiP = aoiInfo.aoiParcel;
    const controller = new AbortController();
    setAoiOwners({ status: "loading" });
    (async () => {
      try {
        const res = await fetch(
          `/api/land-records/rtc?${new URLSearchParams({ ...aoiP }).toString()}`,
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
  }, [
    aoiExportOpen,
    aoiInfo?.aoiParcel?.district,
    aoiInfo?.aoiParcel?.taluk,
    aoiInfo?.aoiParcel?.hobli,
    aoiInfo?.aoiParcel?.village,
    aoiInfo?.aoiParcel?.survey,
    aoiInfo?.aoiParcel?.surnoc,
    aoiInfo?.aoiParcel?.hissa,
  ]);

  const [statesList, setStatesList] = useState<string[]>([]);
  const [districtsList, setDistrictsList] = useState<string[]>([]);
  const [taluksList, setTaluksList] = useState<{ district: string; taluk: string }[]>([]);
  const [hoblisList, setHoblisList] = useState<
    { district: string; taluk: string; hobli: string }[]
  >([]);
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
        if (res.ok) setTaluksList(await res.json());
      } catch (error) {
        console.error("Failed to load Karnataka taluk names for search suggestions:", error);
      }
    })();

    (async () => {
      try {
        const res = await fetch("/data/karnataka_hoblis.json");
        if (res.ok) setHoblisList(await res.json());
      } catch (error) {
        console.error("Failed to load Karnataka hobli names for search suggestions:", error);
      }
    })();

    (async () => {
      try {
        const res = await fetch("/data/karnataka_villages.json");
        if (res.ok) setVillagesList(await res.json());
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
  const hobliEntries = useMemo<LocationEntry[]>(
    () =>
      hoblisList.map(({ district, taluk, hobli }) => ({
        label: `Karnataka, ${district}, ${taluk}, ${hobli}`,
        leaf: hobli,
      })),
    [hoblisList],
  );
  const villageEntries = useMemo<LocationEntry[]>(
    () =>
      villagesList.map(({ district, taluk, hobli, village }) => ({
        label: `Karnataka, ${district}, ${taluk}, ${hobli}, ${village}`,
        leaf: village,
      })),
    [villagesList],
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (aoiMenuRef.current && !aoiMenuRef.current.contains(e.target as Node)) {
        setShowAOIMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const [drillContext, setDrillContext] = useState<{
    state: string;
    district: string;
    taluk: string;
  } | null>(null);

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
      district = drillContext.district;
      taluk = drillContext.taluk;
    }
    if (!district || !taluk) return;
    const key = `${district}|${taluk}`;
    if (hobliesByTaluk[key]) return;
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

  useEffect(() => {
    if (!searchQuery) {
      setLocalSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (suppressSuggestionsRef.current) return;

    const suggestions: { category: string; items: string[] }[] = [];
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (normalizedQuery && "india".includes(normalizedQuery)) {
      suggestions.push({ category: "Country", items: ["India"] });
    }

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

    const queryParts = searchQuery.split(",").map((p) => p.trim());
    if (queryParts.length === 1 && queryParts[0]) {
      const hobliQuery = queryParts[0].toLowerCase();
      const hobliMatches = filterLocationEntries(hobliEntries, hobliQuery, {
        boostLabel,
        fuzzy: true,
        limit: 8,
      });
      if (hobliMatches.length > 0)
        suggestions.push({ category: "Hoblies", items: hobliMatches });

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

    Object.keys(PLACE_SUGGESTIONS).forEach((category) => {
      const filtered = filterSuggestions(searchQuery, category);
      if (filtered.length > 0) {
        suggestions.push({
          category: CATEGORY_LABELS[category] ?? category,
          items: filtered,
        });
      }
    });

    const merged: { category: string; items: string[] }[] = [];
    for (const cat of suggestions) {
      const existing = merged.find((m) => m.category === cat.category);
      if (existing) existing.items = [...existing.items, ...cat.items];
      else merged.push(cat);
    }

    setLocalSuggestions(merged);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (showSuggestions && selectedSuggestionIndex >= 0) {
        const suggestion = getSuggestionByIndex(selectedSuggestionIndex);
        if (suggestion) selectSuggestion(suggestion);
      } else if (showSuggestions && getTotalSuggestions() > 0) {
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

  const stopVoiceSearch = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  };

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
      .catch(() => true);
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
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        alert("Microphone access was denied. Please allow microphone access to use voice search.");
      }
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
    }
  };

  useEffect(() => () => recognitionRef.current?.abort(), []);

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
          onLiveLocationChange={(active) => setLiveLocationState(active ? "active" : "off")}
          onNavigationUpdate={setNavigationState}
          onRequestDirections={(lat, lon, label) => {
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

        {/* Floating search / Directions bar */}
        {/* items-start (not items-center): this row's height stretches to match its tallest
            child (the directions panel, which grows tall once alternatives/steps are shown) -
            items-center would vertically center every other child (Locate, Draw AOI, profile)
            within that full height, visibly pushing them down away from the top edge once the
            panel got tall. items-start pins every child to the top instead, independent of
            how tall its neighbors are. */}
        <div className="pointer-events-none absolute left-4 right-4 top-4 z-20 flex items-start gap-3">
          {showDirections ? (
            <div
              ref={directionsFormRef}
              className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-md"
            >
              {navigationState ? (
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
                      <X className="h-5 w-5 md:h-4 md:w-4" />
                    </button>
                  </div>

                  <div className="relative h-0.5 overflow-hidden bg-gray-100">
                    {routeLoading && (
                      <div className="directions-loading-bar absolute inset-y-0 w-1/3 bg-atlas-cobalt" />
                    )}
                  </div>

                  <div className="relative px-3 py-3">
                    <div className="pointer-events-none absolute bottom-[34px] left-[26px] top-[34px] flex flex-col items-center justify-between">
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

                  {destinationPoint && (
                    <div className="border-t border-gray-100 p-3">
                      {routeLoading && (
                        <p className="text-sm text-gray-500">Getting directions...</p>
                      )}
                      {routeError && <p className="text-sm text-red-600">{routeError}</p>}

                      {routePreview && (
                        <div>
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
            <div ref={searchWrapperRef} className="pointer-events-auto relative min-w-0 max-w-md flex-1">
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
                  size={1}
                  value={searchQuery}
                  onChange={(e) => {
                    suppressSuggestionsRef.current = false;
                    setSearchQuery(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (selectedSuggestionIndex >= 0) {
                        const suggestion = getSuggestionByIndex(selectedSuggestionIndex);
                        if (suggestion) {
                          selectSuggestion(suggestion);
                        }
                      } else {
                        setShowSuggestions(false);
                        mapViewerRef.current?.search(searchQuery);
                      }
                    } else {
                      handleKeyDown(e);
                    }
                  }}
                  onFocus={() => searchQuery && setShowSuggestions(true)}
                  placeholder="Search location, village, taluk, district..."
                  role="combobox"
                  aria-expanded={showSuggestions}
                  aria-autocomplete="list"
                  aria-controls="search-suggestions-listbox"
                  className="min-w-0 flex-1 bg-transparent py-1.5 text-base focus:outline-none md:py-1 md:text-sm"
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
                <div className="absolute right-2 top-1/2 -mt-5 md:hidden">
                  <UserProfile
                    onMenuToggle={(open) => {
                      if (open) setShowFilters(false);
                    }}
                  />
                </div>
              </div>

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

          {/* Weather layer toolbar - appears beside search bar when weather is active */}
          {showWeatherToolbar && (
            <WeatherLayerToolbar
              activeLayer={weatherToolbarMode}
              onLayerSelect={(layer) => {
                const mode = layer ?? "none";
                mapViewerRef.current?.setWeatherMode(mode as any);
                setWeatherToolbarMode(layer);
              }}
              className="pointer-events-auto flex-shrink-0"
            />
          )}

          {/* Directions Button - desktop only; on mobile it moves into the
              bottom-left stack below so it doesn't crowd the search row. */}
          <button
            type="button"
            onClick={() => (showDirections ? closeDirections() : openDirections())}
            aria-label="Directions"
            aria-pressed={showDirections}
            className={`pointer-events-auto hidden flex-shrink-0 items-center justify-center rounded-full border p-2.5 shadow-md transition-colors md:flex ${
              showDirections
                ? "border-atlas-cobalt bg-atlas-cobalt text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Navigation className="h-4 w-4" />
          </button>

          <div className="hidden flex-1 md:block" />

          {/* My Location Button - desktop only; see mobile stack below. */}
          <button
            type="button"
            onClick={handleToggleLiveLocation}
            aria-label={liveLocationState === "active" ? "Stop tracking my location" : "Show my location"}
            aria-pressed={liveLocationState !== "off"}
            className={`pointer-events-auto hidden flex-shrink-0 items-center justify-center rounded-full border p-2.5 shadow-md transition-colors md:flex ${
              liveLocationState === "active"
                ? "border-atlas-cobalt bg-atlas-cobalt text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <LocateFixed
              className={`h-4 w-4 ${liveLocationState === "locating" ? "animate-pulse" : ""}`}
            />
          </button>

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
              className={`pointer-events-auto flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border shadow-md transition-colors ${
                showLocationEnvironment
                  ? "border-atlas-cobalt bg-atlas-cobalt text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <MapPin className="h-4 w-4 flex-shrink-0" />
            </button>
          )}

          {/* Desktop Draw AOI Button */}
          <div ref={aoiMenuRef} className="pointer-events-auto relative hidden md:block">
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
                {!activeAOITool && (
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-300 ease-in-out ${
                      showAOIMenu ? "rotate-180" : ""
                    }`}
                  />
                )}
              </button>

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

          {/* Desktop User Profile */}
          <div className="pointer-events-auto hidden md:block">
            <UserProfile />
          </div>
        </div>

        {/* Mobile Directions/Locate stack - bottom-left corner, Directions (GPS)
            above Show my location, so both stay reachable by thumb without
            crowding the search row at the top. */}
        <div className="absolute bottom-6 left-4 z-20 flex flex-col gap-3 md:hidden">
          <button
            type="button"
            onClick={() => (showDirections ? closeDirections() : openDirections())}
            aria-label="Directions"
            aria-pressed={showDirections}
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border shadow-md transition-colors ${
              showDirections
                ? "border-atlas-cobalt bg-atlas-cobalt text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Navigation className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={handleToggleLiveLocation}
            aria-label={liveLocationState === "active" ? "Stop tracking my location" : "Show my location"}
            aria-pressed={liveLocationState !== "off"}
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border shadow-md transition-colors ${
              liveLocationState === "active"
                ? "border-atlas-cobalt bg-atlas-cobalt text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <LocateFixed
              className={`h-5 w-5 ${liveLocationState === "locating" ? "animate-pulse" : ""}`}
            />
          </button>
        </div>

        {/* Mobile Tools Button - opens the bottom sheet bundling Weather + Draw AOI */}
        <div className="absolute right-6 top-24 z-20 md:hidden">
          <button
            type="button"
            onClick={() => setShowMobileTools(true)}
            aria-haspopup="dialog"
            aria-expanded={showMobileTools}
            aria-label="Tools"
            className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-md transition-colors ${
              activeAOITool
                ? "border-atlas-cobalt bg-atlas-cobalt text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <ToolsGridIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile Tools bottom sheet - Weather + Draw AOI, opened from the Tools button above */}
        {showMobileTools && (
          <div className="pointer-events-none fixed inset-0 z-40 md:hidden">
            <div
              aria-hidden
              onClick={() => setShowMobileTools(false)}
              className="pointer-events-auto absolute inset-0 bg-black/40"
            />
            <div className="pointer-events-auto scrollbar-hide absolute inset-x-0 bottom-0 h-[50vh] overflow-y-auto rounded-t-2xl border-t border-gray-200 bg-white shadow-xl">
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-300" />
              <div className="flex items-center justify-between px-5 pb-2 pt-3">
                <h3 className="text-base font-semibold text-obsidian-graphite">Tools</h3>
                <button
                  type="button"
                  onClick={() => setShowMobileTools(false)}
                  aria-label="Close"
                  className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="px-5 pb-6">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-atlas-cobalt">
                  Weather
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileTools(false);
                    mapViewerRef.current?.openWeatherMenu();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <CloudSun className="h-5 w-5 flex-shrink-0 text-atlas-cobalt" />
                  Weather layers &amp; conditions
                </button>

                <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-atlas-cobalt">
                  Draw AOI
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {AOI_TOOLS.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setActiveAOITool(id);
                        setShowMobileTools(false);
                        mapViewerRef.current?.setDrawingTool(id);
                      }}
                      className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-3 text-xs transition-colors ${
                        activeAOITool === id
                          ? "border-atlas-cobalt bg-atlas-cobalt text-white"
                          : "border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Desktop Attribute info panel */}
        {attributeInfo && attributePanelOpen && (
          <aside className="attr-panel-in scrollbar-hide absolute right-4 top-20 z-20 hidden max-h-[calc(100vh-120px)] w-80 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl md:block">
            <AttributePanelBody
              info={attributeInfo}
              owners={owners}
              useCase={useCase}
              adjacentPlots={adjacentPlots}
              guidelineValue={guidelineValue}
              onClose={() => {
                setAttributeInfo(null);
                setExportModalOpen(false);
                setSketchUrl(null);
                mapViewerRef.current?.clearAttributeInfo();
              }}
              onExport={() => setExportModalOpen(true)}
              onSketchClick={(url) => setSketchUrl(url)}
            />
          </aside>
        )}

        {/* Survey Sketch panel — exactly centered on screen */}
        {sketchUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onClick={() => setSketchUrl(null)}
          >
            <div
              className="flex flex-col overflow-auto rounded-2xl border border-gray-200 bg-white shadow-2xl"
              style={{ width: "calc(100vh - 120px)", height: "calc(100vh - 120px)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
                <span className="text-sm font-semibold text-slate-700">Survey Sketch</span>
                <button
                  type="button"
                  onClick={() => setSketchUrl(null)}
                  className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <iframe src={sketchUrl} className="h-full w-full border-0" title="Survey Sketch" />
              </div>
            </div>
          </div>
        )}

        {/* Mobile Attribute info bottom sheet */}
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
                useCase={useCase}
                adjacentPlots={adjacentPlots}
                onExport={() => setExportModalOpen(true)}
                onViewRtc={(url) => setRtcImageUrl(url)}
              />
            </div>
          </div>
        )}

        {/* RTC document viewer (mobile only) - opened from "View RTC" in the mobile
            attribute sheet above. Rotates the image 90deg on a portrait phone so the
            wide RTC table renders full-size and legible, matching how it reads on a
            desktop tab (which opens the raw image directly instead of this modal).
            Supports pinch-to-zoom, one-finger pan once zoomed, and double-tap to
            toggle zoom - the pan/zoom transform lives on a wrapper OUTSIDE the
            rotated container so drag deltas stay in plain screen pixels instead of
            needing to be re-projected into the rotated content's local axes. */}
        {rtcImageUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-white md:hidden"
            onClick={() => setRtcImageUrl(null)}
          >
            <button
              type="button"
              onClick={() => setRtcImageUrl(null)}
              aria-label="Close"
              className="absolute right-4 top-4 z-10 rounded-full border border-gray-200 bg-white p-2 text-gray-700 shadow-md hover:bg-gray-50"
            >
              <X className="h-5 w-5" />
            </button>

            <div
              className="flex h-full w-full shrink-0 touch-none items-center justify-center overflow-hidden"
              style={{ transform: `translate(${rtcPan.x}px, ${rtcPan.y}px) scale(${rtcZoom})` }}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={handleRtcTouchStart}
              onTouchMove={handleRtcTouchMove}
              onTouchEnd={handleRtcTouchEnd}
            >
              <div className="flex shrink-0 items-center justify-center portrait:h-[100vw] portrait:w-[100vh] portrait:rotate-90 landscape:h-full landscape:w-full">
                <img
                  src={rtcImageUrl}
                  alt="RTC document"
                  draggable={false}
                  className="h-full w-full select-none object-contain"
                />
              </div>
            </div>

          </div>
        )}

        {/* Mobile View Details Chip */}
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

        {aoiExportOpen && aoiInfo && (
          <ExportFeatureModal
            title="Area of Interest"
            geometry={aoiInfo.geometry}
            properties={(() => {
              if (!aoiInfo.aoiParcel) return aoiInfo.parentProperties;
              const p = aoiInfo.parentProperties ?? {};
              const clean: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(p)) {
                const stripped = k.replace(/^village-cadastrals_/, "");
                if (stripped !== k) clean[stripped] = v;
              }
              return Object.keys(clean).length > 0 ? clean : p;
            })()}
            aoiGeometry={aoiInfo.geometry}
            aoiDistrict={typeof aoiInfo.parentProperties?.["state-districts_dtname"] === "string"
              ? aoiInfo.parentProperties["state-districts_dtname"] as string
              : undefined}
            aoiTaluk={(() => {
              const p = aoiInfo.parentProperties ?? {};
              for (const key of ["district-taluks_KGISTalukName", "district-taluks_subdist_nm", "district-taluks_name", "district-taluks_taluk_name", "district-taluks_TalukName"]) {
                if (typeof p[key] === "string" && p[key]) return p[key] as string;
              }
              return undefined;
            })()}
            aoiHobli={(() => {
              const p = aoiInfo.parentProperties ?? {};
              for (const key of ["taluk-hoblies_KGISHobliName", "taluk-hoblies_hobli_name", "taluk-hoblies_name"]) {
                if (typeof p[key] === "string" && p[key]) return p[key] as string;
              }
              return undefined;
            })()}
            aoiVillage={(() => {
              const p = aoiInfo.parentProperties ?? {};
              for (const key of ["hobli-villages_KGISVillageName", "hobli-villages_village_name", "hobli-villages_Village_Name", "hobli-villages_village", "hobli-villages_name"]) {
                if (typeof p[key] === "string" && p[key]) return p[key] as string;
              }
              return undefined;
            })()}
            aoiParcel={aoiInfo.aoiParcel}
            owners={aoiOwners.status === "idle" || aoiOwners.status === "loading"
              ? { status: "loading" }
              : aoiOwners.status === "ok"
                ? { status: "ok", rows: aoiOwners.rows }
                : { status: "error", message: aoiOwners.message }}
            onClose={() => setAoiExportOpen(false)}
          />
        )}

        {/* Filters drawer / modal */}
        <div
          className={`fixed inset-0 z-20 hidden max-md:block max-md:bg-black/40 max-md:transition-opacity max-md:duration-300 ${
            showFilters ? "max-md:opacity-100" : "max-md:pointer-events-none max-md:opacity-0"
          }`}
          onClick={() => setShowFilters(false)}
          onTouchStart={handleDrawerTouchStart}
          onTouchMove={handleDrawerTouchMove}
          onTouchEnd={handleDrawerTouchEnd}
        />
        <aside
          ref={filtersPanelRef}
          aria-hidden={!showFilters}
          onTouchStart={handleDrawerTouchStart}
          onTouchMove={handleDrawerTouchMove}
          onTouchEnd={handleDrawerTouchEnd}
          style={drawerDragX < 0 ? { transform: `translateX(${drawerDragX}px)`, transition: "none" } : undefined}
          className={`scrollbar-hide absolute left-4 right-4 top-[84px] z-10 max-h-[calc(100vh-200px)] flex-shrink-0 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg md:right-auto md:top-20 md:w-64 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:top-0 max-md:right-auto max-md:z-30 max-md:w-4/5 max-md:max-h-none max-md:rounded-l-none max-md:rounded-r-2xl max-md:border-y-0 max-md:border-l-0 max-md:transition-transform max-md:duration-300 max-md:ease-out max-md:touch-pan-y ${
            showFilters ? "max-md:translate-x-0" : "max-md:-translate-x-full md:hidden"
          }`}
        >
          <div className="p-4">
            <h2 className="mb-4 text-lg font-semibold text-obsidian-graphite md:text-base">Filters</h2>

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
                  {BOUNDARY_LAYER_OPTIONS.map(({ id, label }) => (
                    <div key={id}>
                      <label className="flex items-center text-base text-gray-600 md:text-sm">
                        <input
                          type="checkbox"
                          className="mr-2 accent-atlas-cobalt"
                          checked={selectedBoundaryLayer === id}
                          onChange={() => {
                            setSelectedBoundaryLayer(id);
                            if (id === "find_my_way") {
                              mapViewerRef.current?.setBoundaryLayerMode("none");
                              return;
                            }
                            // Leaving "Find My Way" for another layer - clear whatever place
                            // was selected there (pin, blue name label, boundary outline, and
                            // the info card), same as its own close button does. Otherwise it
                            // stayed on the map/panel indefinitely, looking like it belonged
                            // to the newly-selected layer instead of a leftover from before.
                            setAttributeInfo(null);
                            mapViewerRef.current?.clearAttributeInfo();
                            if (showDirections) closeDirections();
                            mapViewerRef.current?.setBoundaryLayerMode(id);
                            if (id !== "roads") setSelectedRoadsScope("none");
                          }}
                        />
                        {label}
                      </label>
                      {id === "find_my_way" && selectedBoundaryLayer === "find_my_way" && (
                        <div className="ml-6 mt-2">
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

        {/* Drawn AOI Info Bottom Chip */}
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