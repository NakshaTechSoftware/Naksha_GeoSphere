"use client";

import { useRef, useState, useEffect } from "react";
import type { KeyboardEvent } from "react";
import { IndiaMapViewer, type IndiaMapViewerHandle, type WardSelection } from "./IndiaMapViewer";
import { UserProfile } from "./UserProfile";
import {
  ChevronDown,
  ChevronUp,
  MapPin,
  Search,
  Menu,
  X,
} from "lucide-react";

const BENGALURU_REGIONS = ["Central", "East", "North", "South", "West"] as const;

// Place suggestions data - organized by categories for better UX
const PLACE_SUGGESTIONS = {
  regions: [
    "Bengaluru",
    "Bangalore", 
    "Karnataka",
    "Hyderabad",
    "Chennai",
    "Mumbai",
    "Delhi",
    "Ahmedabad",
  ],
  cities: [
    "Bengaluru Urban",
    "Bengaluru Rural", 
    "Hubli",
    "Mysore",
    "Mangalore",
    "Belagavi",
    "Davangere",
    "Shivamogga",
  ],
  taluks: [
    "Central",
    "East", 
    "North",
    "South",
    "West",
    "North-East",
    "North-West",
    "South-East",
    "South-West",
  ],
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
  return allItems
    .filter(item => item.toLowerCase().includes(searchTerm))
    // Prefix matches ("Ban..." -> "Banaswadi") rank above mid-word matches ("...swadi").
    .sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(searchTerm);
      const bStarts = b.toLowerCase().startsWith(searchTerm);
      if (aStarts === bStarts) return a.localeCompare(b);
      return aStarts ? -1 : 1;
    })
    .slice(0, 6); // Limit to top 6 suggestions per category
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

export function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedWard, setSelectedWard] = useState<WardSelection | null>(null);
  const mapViewerRef = useRef<IndiaMapViewerHandle>(null);
  const [expandedFilters, setExpandedFilters] = useState({
    datasetType: true,
    type: true,
  });
  const [searchSuggestions, setSearchSuggestions] = useState<{category: string, items: string[]}[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

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

  // Generate search suggestions based on current query
  useEffect(() => {
    if (!searchQuery) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const suggestions: {category: string, items: string[]}[] = [];
    
    // Search across all categories
    Object.keys(PLACE_SUGGESTIONS).forEach(category => {
      const filtered = filterSuggestions(searchQuery, category);
      if (filtered.length > 0) {
        suggestions.push({
          category: category.charAt(0).toUpperCase() + category.slice(1),
          items: filtered
        });
      }
    });
    
    setSearchSuggestions(suggestions);
    setShowSuggestions(suggestions.length > 0);
    setSelectedSuggestionIndex(-1);
  }, [searchQuery]);

  // Handle keyboard navigation for suggestions
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          Math.min(prev + 1, getTotalSuggestions() - 1)
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
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
      case 'Escape':
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  };

  const getTotalSuggestions = () => searchSuggestions.reduce((total, cat) => total + cat.items.length, 0);

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
    setExpandedFilters(prev => ({ ...prev, [filter]: !prev[filter] }));
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
    key.split("/").pop()?.replace(/\.kmz$/i, "").replace(/_/g, " ") ?? key;

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
    <div className="flex h-screen flex-col bg-gray-100 overflow-hidden">

      {/* Main Content - map fills the full page, everything else floats on top */}
      <main className="flex-1 relative min-h-0 overflow-hidden">
        <IndiaMapViewer
          ref={mapViewerRef}
          onWardSelected={setSelectedWard}
          onBoundariesCleared={() => setLoadedExtraFiles({})}
          onExtraFileToggled={handleExtraFileToggledFromSearch}
        />

        {/* Floating search bar */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center gap-3">
          {/* Search Bar */}
          <div ref={searchWrapperRef} className="relative flex-1 max-w-md">
            <div className="flex items-center gap-1 bg-white rounded-full shadow-md pl-1 pr-2 py-1">
              <button
                onClick={() => setShowFilters((prev) => !prev)}
                className={`flex-shrink-0 p-2 rounded-full transition-colors ${
                  showFilters ? "bg-gray-100 text-obsidian-graphite" : "text-gray-500 hover:bg-gray-100"
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
                onFocus={() => searchQuery && searchSuggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Search location, village, taluk, district..."
                role="combobox"
                aria-expanded={showSuggestions}
                aria-autocomplete="list"
                aria-controls="search-suggestions-listbox"
                className="flex-1 min-w-0 py-1 text-sm bg-transparent focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="flex-shrink-0 p-2 rounded-full text-gray-500 hover:bg-gray-100"
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
                className="flex-shrink-0 p-2 rounded-full text-gray-500 hover:bg-gray-100"
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
                      <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        {cat.category}
                      </div>
                      {cat.items.map((item, i) => {
                        const idx = offset + i;
                        const isActive = idx === selectedSuggestionIndex;
                        return (
                          <button
                            type="button"
                            key={`${cat.category}-${item}`}
                            role="option"
                            aria-selected={isActive}
                            // Prevents the input's blur (and its click-outside-triggered
                            // dropdown close) from firing before the click is registered.
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSuggestionClick(item)}
                            onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                            className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                              isActive ? "bg-gray-100 text-obsidian-graphite" : "text-gray-700 hover:bg-gray-50"
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
          <button className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-full shadow-md hover:bg-gray-50 whitespace-nowrap">
            <MapPin className="h-4 w-4" />
            Draw AOI
            <ChevronDown className="h-4 w-4" />
          </button>

          {/* User Profile Icon */}
          <UserProfile
            userName="John Doe"
            userEmail="john.doe@example.com"
          />
        </div>

        {/* FLOATING - Filters, toggled via the search bar's menu icon */}
        {showFilters && (
        <aside className="absolute top-20 left-4 z-10 w-64 max-h-[calc(100vh-200px)] flex-shrink-0 bg-white rounded-xl border border-gray-200 shadow-lg overflow-y-auto scrollbar-hide">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-obsidian-graphite">Filters</h2>
              <button className="text-sm text-atlas-cobalt hover:underline">
                Reset all
              </button>
            </div>

            {/* Dataset Type Filter */}
            <div className="mb-4 border-b border-gray-200 pb-4">
              <button
                onClick={() => toggleFilter("datasetType")}
                className="flex items-center justify-between w-full mb-2 text-sm font-semibold text-obsidian-graphite"
              >
                Dataset Type
                {expandedFilters.datasetType ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>
              {expandedFilters.datasetType && (
                <div className="space-y-2">
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2 accent-atlas-cobalt" />
                    DEM / DSM
                  </label>
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2 accent-atlas-cobalt" defaultChecked />
                    Ortho Rectified Image
                  </label>
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2 accent-atlas-cobalt" />
                    Point Cloud Data
                  </label>
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2 accent-atlas-cobalt" />
                    Vector Data
                  </label>
                </div>
              )}
            </div>

            {/* Type Filter: Bengaluru region subfolders */}
            <div className="mb-4 border-b border-gray-200 pb-4">
              <button
                onClick={() => toggleFilter("type")}
                className="flex items-center justify-between w-full mb-2 text-sm font-semibold text-obsidian-graphite"
              >
                Type
                {expandedFilters.type ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>
              {expandedFilters.type && (
                <div className="space-y-1">
                  {BENGALURU_REGIONS.map((region) => (
                    <div key={region}>
                      <button
                        onClick={() => toggleRegion(region)}
                        className="flex items-center justify-between w-full py-1 text-sm text-gray-700 hover:text-obsidian-graphite"
                      >
                        {region}
                        {expandedRegions[region] ? (
                          <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                        )}
                      </button>
                      {expandedRegions[region] && (
                        <div className="ml-3 space-y-1.5 pb-1">
                          {bengaluruFileTree === null ? (
                            <div className="text-xs text-gray-400">Loading files…</div>
                          ) : (bengaluruFileTree[region] ?? []).length === 0 ? (
                            <div className="text-xs text-gray-400">No files found</div>
                          ) : (
                            (bengaluruFileTree[region] ?? []).map((key) => (
                              <label
                                key={key}
                                className="flex items-center text-xs text-gray-600"
                              >
                                <input
                                  type="checkbox"
                                  className="mr-2 accent-atlas-cobalt"
                                  checked={!!loadedExtraFiles[key]}
                                  onChange={(e) => handleToggleExtraFile(key, e.target.checked)}
                                />
                                {filenameFromKey(key)}
                              </label>
                            ))
                          )}
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
      </main>
    </div>
  );
}
