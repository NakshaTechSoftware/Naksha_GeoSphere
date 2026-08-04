"use client";

import { useState } from "react";
import { DashboardHeader } from "@/components/home/DashboardHeader";
import { IndiaMapViewer } from "./IndiaMapViewer";
import { 
  ChevronDown, 
  ChevronUp, 
  X, 
  ShoppingCart,
  Eye,
  Download,
  Calendar,
  MapPin,
  Cloud,
  Layers
} from "lucide-react";

interface Dataset {
  id: string;
  name: string;
  thumbnail: string;
  format: string;
  size: string;
  date: string;
  cloudCover: string;
  price: number;
  premium: boolean;
  badge?: string;
}

export function ExplorePage() {
  const [selectedArea, setSelectedArea] = useState("Downtown District, USA");
  const [areaSize, setAreaSize] = useState("12.45 km²");
  const [cartItems, setCartItems] = useState<string[]>([]);
  const [expandedFilters, setExpandedFilters] = useState({
    datasetType: true,
    resolution: true,
    format: true,
  });

  // Sample datasets (you'll replace with real API data)
  const datasets: Dataset[] = [
    {
      id: "1",
      name: "Orthophoto (True Color)",
      thumbnail: "/api/placeholder/80/80",
      format: "GeoTIFF",
      size: "12.45 km²",
      date: "May 15, 2024",
      cloudCover: "2.1%",
      price: 249.00,
      premium: true,
      badge: "NEW"
    },
    {
      id: "2",
      name: "Digital Surface Model (DSM)",
      thumbnail: "/api/placeholder/80/80",
      format: "GDS",
      size: "12.45 km²",
      date: "May 15, 2024",
      cloudCover: "2.1%",
      price: 189.00,
      premium: true,
    },
    {
      id: "3",
      name: "LiDAR Point Cloud",
      thumbnail: "/api/placeholder/80/80",
      format: "LAS / LAZ",
      size: "12.45 km²",
      date: "May 30, 2024",
      cloudCover: "3.4%",
      price: 349.00,
      premium: false,
    },
    {
      id: "4",
      name: "Vector Boundaries (Roads)",
      thumbnail: "/api/placeholder/80/80",
      format: "SHP / KML",
      size: "12.45 km²",
      date: "Apr 20, 2024",
      cloudCover: "-",
      price: 89.00,
      premium: false,
      badge: "SALE"
    },
  ];

  const toggleFilter = (filter: keyof typeof expandedFilters) => {
    setExpandedFilters(prev => ({ ...prev, [filter]: !prev[filter] }));
  };

  const addToCart = (datasetId: string) => {
    if (!cartItems.includes(datasetId)) {
      setCartItems([...cartItems, datasetId]);
    }
  };

  const removeFromCart = (datasetId: string) => {
    setCartItems(cartItems.filter(id => id !== datasetId));
  };

  const cartTotal = datasets
    .filter(d => cartItems.includes(d.id))
    .reduce((sum, d) => sum + d.price, 0);

  const totalSize = datasets
    .filter(d => cartItems.includes(d.id))
    .length;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <DashboardHeader />

      {/* Main Content - 3 Column Layout */}
      <main className="flex-1 flex">
        {/* LEFT SIDEBAR - Filters */}
        <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-obsidian-graphite">Filters</h2>
              <button className="text-sm text-atlas-cobalt hover:underline">
                Reset all
              </button>
            </div>

            {/* Dataset Type Filter */}
            <div className="mb-4 border-b border-gray-200 pb-4">
              <button
                onClick={() => toggleFilter("datasetType")}
                className="flex items-center justify-between w-full mb-2 text-sm font-medium text-gray-700"
              >
                Dataset Type
                {expandedFilters.datasetType ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {expandedFilters.datasetType && (
                <div className="space-y-2 ml-1">
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2" defaultChecked />
                    Orthophoto Imagery
                  </label>
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2" defaultChecked />
                    Satellite Imagery
                  </label>
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2" />
                    DEM / DSM
                  </label>
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2" />
                    LiDAR LAS / LAZ
                  </label>
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2" />
                    Contours
                  </label>
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2" />
                    Vector Data
                  </label>
                </div>
              )}
            </div>

            {/* Resolution Filter */}
            <div className="mb-4 border-b border-gray-200 pb-4">
              <button
                onClick={() => toggleFilter("resolution")}
                className="flex items-center justify-between w-full mb-2 text-sm font-medium text-gray-700"
              >
                Resolution (GSD)
                {expandedFilters.resolution ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {expandedFilters.resolution && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button className="px-3 py-1 text-xs bg-atlas-cobalt text-white rounded-full">
                      &lt; 10 cm
                    </button>
                    <button className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200">
                      10 - 30 cm
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200">
                      30 - 50 cm
                    </button>
                    <button className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200">
                      1 m - 5 m
                    </button>
                  </div>
                  <button className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200">
                    &gt; 5 m
                  </button>
                </div>
              )}
            </div>

            {/* Format Filter */}
            <div className="mb-4 pb-4">
              <button
                onClick={() => toggleFilter("format")}
                className="flex items-center justify-between w-full mb-2 text-sm font-medium text-gray-700"
              >
                Format
                {expandedFilters.format ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {expandedFilters.format && (
                <div className="space-y-2 ml-1">
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2" />
                    GeoTIFF
                  </label>
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2" />
                    Shapefile (SHP)
                  </label>
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2" />
                    LAS / LAZ
                  </label>
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2" />
                    KML / KMZ
                  </label>
                  <label className="flex items-center text-sm text-gray-600">
                    <input type="checkbox" className="mr-2" />
                    PDF Maps
                  </label>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* CENTER - Map Canvas */}
        <div className="flex-1 flex flex-col">
          {/* Map Container */}
          <div className="flex-1 relative">
            <IndiaMapViewer />
          </div>

          {/* Bottom Cart Bar */}
          {cartItems.length > 0 && (
            <div className="bg-white border-t border-gray-200 p-4">
              <div className="max-w-6xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-sm">
                    <span className="font-semibold text-obsidian-graphite">
                      {totalSize} item{totalSize !== 1 ? 's' : ''}
                    </span>
                    <span className="text-gray-600 ml-2">• 24.90 km²</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Estimated Total</div>
                    <div className="text-xl font-bold text-obsidian-graphite">
                      ${cartTotal.toFixed(2)}
                    </div>
                  </div>
                  <button className="flex items-center gap-2 px-6 py-3 bg-atlas-cobalt text-white rounded-lg hover:bg-[var(--color-cobalt-hover)] font-semibold transition-colors">
                    Proceed to Download / Checkout
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR - Selected Area & Datasets */}
        <aside className="w-80 bg-white border-l border-gray-200 overflow-y-auto">
          <div className="p-4">
            {/* Selected Area Info */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Selected Area</h3>
                <button className="text-xs text-atlas-cobalt hover:underline">
                  Clear AOI
                </button>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-obsidian-graphite">
                      {selectedArea}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Premium Imagery
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200">
                  <div>
                    <div className="text-xs text-gray-500">Area</div>
                    <div className="text-sm font-medium">{areaSize}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Resolution</div>
                    <div className="text-sm font-medium">10-30 cm / m</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Date Captured</div>
                    <div className="text-sm font-medium">May 15, 2024</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Cloud Cover</div>
                    <div className="text-sm font-medium">2.1%</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Available Datasets */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Available Datasets ({datasets.length})
                </h3>
                <select className="text-xs border border-gray-200 rounded px-2 py-1">
                  <option>Relevance</option>
                  <option>Price: Low to High</option>
                  <option>Price: High to Low</option>
                  <option>Date: Newest</option>
                </select>
              </div>

              <div className="space-y-3">
                {datasets.map((dataset) => (
                  <div
                    key={dataset.id}
                    className="border border-gray-200 rounded-lg p-3 hover:border-atlas-cobalt transition-colors"
                  >
                    <div className="flex gap-3">
                      <div className="w-16 h-16 bg-gray-200 rounded flex-shrink-0">
                        {/* Placeholder for thumbnail */}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="text-sm font-medium text-obsidian-graphite line-clamp-2">
                            {dataset.name}
                          </h4>
                          {dataset.badge && (
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                              dataset.badge === 'NEW' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              {dataset.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 space-y-0.5">
                          <div>{dataset.format}</div>
                          <div>{dataset.size} • {dataset.date}</div>
                          {dataset.cloudCover !== '-' && (
                            <div className="flex items-center gap-1">
                              <Cloud className="h-3 w-3" />
                              {dataset.cloudCover} Cloud
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <div>
                        <div className="text-lg font-bold text-obsidian-graphite">
                          ${dataset.price.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {dataset.size}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="p-2 border border-gray-200 rounded hover:bg-gray-50">
                          <Eye className="h-4 w-4 text-gray-600" />
                        </button>
                        {cartItems.includes(dataset.id) ? (
                          <button
                            onClick={() => removeFromCart(dataset.id)}
                            className="px-3 py-2 bg-green-100 text-green-700 rounded text-xs font-semibold hover:bg-green-200"
                          >
                            Added ✓
                          </button>
                        ) : (
                          <button
                            onClick={() => addToCart(dataset.id)}
                            className="px-3 py-2 bg-atlas-cobalt text-white rounded text-xs font-semibold hover:bg-[var(--color-cobalt-hover)]"
                          >
                            Add to Cart
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
