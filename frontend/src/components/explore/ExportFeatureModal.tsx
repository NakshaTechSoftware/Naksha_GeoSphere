"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, Download, Loader2, X } from "lucide-react";
import type { AdminLevel, AttributeHierarchy } from "./IndiaMapViewer";
import { saveExportFile } from "@/lib/nativeDownload";

export type ExportFormat = "geojson" | "shapefile" | "kml" | "kmz" | "gpkg" | "gdb" | "csv";
type BulkLevel = Exclude<AdminLevel, "state">;

export interface ExportFeatureModalProps {
  title: string;
  geometry?: GeoJSON.Geometry;
  properties?: Record<string, unknown>;
  hierarchy?: AttributeHierarchy;
  onClose: () => void;
}

const EXPORT_FORMAT_OPTIONS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "geojson", label: "GeoJSON", hint: ".geojson" },
  { id: "shapefile", label: "Shapefile", hint: ".zip" },
  { id: "kml", label: "KML", hint: ".kml" },
  { id: "kmz", label: "KMZ", hint: ".kmz" },
  { id: "gpkg", label: "GeoPackage", hint: ".gpkg" },
  { id: "gdb", label: "File Geodatabase", hint: ".zip" },
  { id: "csv", label: "CSV", hint: ".csv" },
];

const LEVEL_LABEL: Record<BulkLevel, string> = {
  district: "District",
  taluk: "Taluk",
  hobli: "Hobli",
  village: "Village",
  survey_plot: "Survey Plot",
};

const LEVEL_ORDER: BulkLevel[] = ["district", "taluk", "hobli", "village", "survey_plot"];

// Levels offered in the checklist: the clicked level itself (for district/taluk/hobli/village -
// a state click has no boundary of its own to include) plus everything below it, in hierarchy
// order. A survey-plot click offers nothing - it's already the leaf, so the dialog falls back
// to the plain single-feature flow below.
function offeredLevels(hierarchy: AttributeHierarchy | undefined): BulkLevel[] {
  if (!hierarchy || hierarchy.level === "survey_plot") return [];
  const startIndex = hierarchy.level === "state" ? 0 : LEVEL_ORDER.indexOf(hierarchy.level);
  return LEVEL_ORDER.slice(startIndex);
}

type Progress = { message: string; current?: number; total?: number };
type ModalState =
  | { status: "idle" }
  | { status: "loading"; progress?: Progress }
  | { status: "success" }
  | { status: "error"; message: string };

// Centered format-picker dialog opened from the attribute panel's "Export" action. For
// district/taluk/hobli boundaries it also offers a hierarchy checklist (that level plus
// everything below it) for a bulk export; picking any of those streams live progress from
// /api/export/bulk instead of the single-shot /api/export used otherwise.
export function ExportFeatureModal({
  title,
  geometry,
  properties,
  hierarchy,
  onClose,
}: ExportFeatureModalProps) {
  const [format, setFormat] = useState<ExportFormat>("geojson");
  const levels = useMemo(() => offeredLevels(hierarchy), [hierarchy]);
  const [selectedLevels, setSelectedLevels] = useState<Set<BulkLevel>>(() => new Set(levels));
  const [state, setState] = useState<ModalState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const toggleLevel = (level: BulkLevel) => {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const handleClose = () => {
    abortRef.current?.abort();
    onClose();
  };

  // Once the export succeeds, show the confirmation for a moment, then close
  // the dialog on its own.
  useEffect(() => {
    if (state.status !== "success") return;
    const timer = setTimeout(() => onClose(), 2500);
    return () => clearTimeout(timer);
  }, [state.status, onClose]);

  const runSingleExport = async () => {
    if (!geometry) {
      setState({ status: "error", message: "This feature has no geometry to export." });
      return;
    }
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportFormat: format, geometry, properties: properties ?? {}, nameHint: title }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Export failed (${response.status})`);
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `${title || "export"}.${format}`;
      const blob = await response.blob();
      // Native app: writes to cache and opens the OS save/share sheet; web: a
      // plain browser download. In the WebView the old <a download> click did
      // nothing, so the file never reached the phone's file system.
      await saveExportFile({
        blob,
        filename,
        mimetype: response.headers.get("Content-Type") ?? undefined,
      });
      setState({ status: "success" });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Export failed" });
    }
  };

  const runBulkExport = async () => {
    if (!hierarchy || selectedLevels.size === 0) {
      setState({ status: "error", message: "Pick at least one boundary level to export." });
      return;
    }
    setState({ status: "loading" });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/export/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exportFormat: format,
          state: hierarchy.state,
          district: hierarchy.district,
          taluk: hierarchy.taluk,
          hobli: hierarchy.hobli,
          village: hierarchy.village,
          clickedLevel: hierarchy.level,
          selectedLevels: LEVEL_ORDER.filter((l) => selectedLevels.has(l)),
          nameHint: title,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Export failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice("data: ".length)) as
            | { type: "progress"; message: string; current?: number; total?: number }
            | { type: "done"; filename: string; mimetype: string; downloadUrl: string }
            | { type: "error"; message: string };

          if (event.type === "progress") {
            setState({
              status: "loading",
              progress: { message: event.message, current: event.current, total: event.total },
            });
          } else if (event.type === "done") {
            // The finished file is streamed from a dedicated download route rather
            // than embedded here - a whole-district export can be hundreds of MB,
            // past what's safe to hold as one base64 string/Blob in the browser.
            // Fetch that stream, then save it through the shared helper so the
            // native app lands it on the phone (web keeps the browser download).
            const fileResponse = await fetch(event.downloadUrl);
            if (!fileResponse.ok) {
              throw new Error("Failed to download the exported file");
            }
            const blob = await fileResponse.blob();
            await saveExportFile({
              blob,
              filename: event.filename,
              mimetype: event.mimetype,
            });
            setState({ status: "success" });
            return;
          } else {
            throw new Error(event.message);
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ status: "error", message: error instanceof Error ? error.message : "Export failed" });
    }
  };

  const handleExport = () => {
    if (levels.length > 0) void runBulkExport();
    else void runSingleExport();
  };

  const isLoading = state.status === "loading";
  const progress = state.status === "loading" ? state.progress : undefined;
  const progressPct =
    progress?.current !== undefined && progress.total ? Math.round((progress.current / progress.total) * 100) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={handleClose} />
      <div className="relative z-10 w-[22rem] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-100">Export</p>
            <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close export dialog"
            className="flex-shrink-0 rounded-full p-1 text-blue-100 transition-colors hover:bg-white/15 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {state.status === "success" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <CheckCircle2 className="h-9 w-9 text-green-500" />
            <p className="text-base font-semibold text-slate-900">Export complete.</p>
            <p className="text-xs text-slate-400">Your file has been saved.</p>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">{progress?.message ?? "Exporting…"}</p>
              <p className="text-xs text-slate-400">This can take a moment for larger areas.</p>
            </div>
            {progressPct !== undefined && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="px-5 py-4">
            {levels.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Include
                </p>
                <div className="space-y-1">
                  {levels.map((level) => {
                    const checked = selectedLevels.has(level);
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => toggleLevel(level)}
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          checked
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <span className="flex items-center gap-2 font-medium text-slate-900">
                          {level === hierarchy?.level && (
                            <ChevronRight className="h-3.5 w-3.5 text-blue-500" />
                          )}
                          {LEVEL_LABEL[level]}
                          {level === hierarchy?.level && (
                            <span className="text-xs font-normal text-slate-400">(this feature)</span>
                          )}
                        </span>
                        {checked ? (
                          <CheckCircle2 className="h-4 w-4 text-blue-600" />
                        ) : (
                          <span className="h-4 w-4 rounded-full border border-gray-300" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Format</p>
            <div className="mb-4 grid grid-cols-2 gap-1.5">
              {EXPORT_FORMAT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFormat(option.id)}
                  className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors ${
                    format === option.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-sm font-medium text-slate-900">{option.label}</span>
                  <span className="text-xs text-slate-400">{option.hint}</span>
                </button>
              ))}
            </div>

            {state.status === "error" && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {state.message}
              </p>
            )}

            <button
              type="button"
              onClick={handleExport}
              disabled={levels.length > 0 && selectedLevels.size === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
