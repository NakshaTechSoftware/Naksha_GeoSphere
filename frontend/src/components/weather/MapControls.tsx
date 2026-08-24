"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/cn";
import { SearchIcon, MapPinIcon, MaximizeIcon, XIcon } from "./WeatherIcons";

interface MapControlsProps {
  onSearchSelect?: (lat: number, lng: number, name: string) => void;
  onLocateMe?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onToggleFullscreen?: () => void;
  className?: string;
}

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export function MapControls({
  onSearchSelect,
  onLocateMe,
  onZoomIn,
  onZoomOut,
  onToggleFullscreen,
  className,
}: MapControlsProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const searchLocation = useCallback(async (q: string) => {
    if (q.length < 3) {
      setResults([]);
      return;
    }
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`,
        { headers: { "Accept-Language": "en" } }
      );
      if (resp.ok) {
        const data = await resp.json();
        setResults(data);
        setShowResults(true);
      }
    } catch {
      // silently fail
    }
  }, []);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => searchLocation(value), 400);
    },
    [searchLocation]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectResult = (r: SearchResult) => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    const name = r.display_name.split(",").slice(0, 2).join(",").trim();
    setQuery(name);
    setShowResults(false);
    onSearchSelect?.(lat, lng, name);
  };

  return (
    <div className={cn("flex flex-col items-end gap-2", className)}>
      {/* Search bar */}
      <div ref={containerRef} className="relative w-72">
        <div className="flex items-center gap-2 rounded-2xl border border-white/40 bg-white/85 px-3 py-2 shadow-lg backdrop-blur-xl">
          <SearchIcon size={18} className="shrink-0 text-gray-400" />
          <input
            type="text"
            placeholder="Search location..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setResults([]);
                setShowResults(false);
              }}
              className="shrink-0 rounded-lg p-0.5 text-gray-400 hover:text-gray-600"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>

        {/* Search results dropdown */}
        {showResults && results.length > 0 && (
          <div className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
            {results.map((r) => (
              <button
                key={r.place_id}
                onClick={() => selectResult(r)}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors"
              >
                <MapPinIcon size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <span className="text-gray-700 line-clamp-2">{r.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Control buttons */}
      <div className="flex flex-col gap-1.5">
        <ControlButton onClick={onLocateMe} title="My location">
          <MapPinIcon size={18} />
        </ControlButton>
        <ControlButton onClick={onToggleFullscreen} title="Fullscreen">
          <MaximizeIcon size={18} />
        </ControlButton>
        <div className="flex flex-col rounded-2xl border border-white/40 bg-white/85 shadow-lg backdrop-blur-xl overflow-hidden">
          <button
            onClick={onZoomIn}
            className="flex h-9 w-9 items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
            title="Zoom in"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="3" x2="8" y2="13" />
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
          </button>
          <div className="h-px bg-gray-200" />
          <button
            onClick={onZoomOut}
            className="flex h-9 w-9 items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
            title="Zoom out"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/40 bg-white/85 text-gray-600 shadow-lg backdrop-blur-xl transition-colors hover:bg-gray-100"
    >
      {children}
    </button>
  );
}
