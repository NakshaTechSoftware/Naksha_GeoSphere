"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Download, Info } from "lucide-react";

// India GeoJSON boundary (simplified for display)
const indiaGeoJSON = {
  type: "Feature",
  properties: {
    name: "India",
    area: "3,287,263 km²",
    population: "1.4 billion",
  },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [77.8375, 35.4940],
        [78.9122, 34.3219],
        [78.8117, 33.5061],
        [79.2089, 32.9943],
        [79.1761, 32.4837],
        [78.4583, 32.6181],
        [78.7386, 31.5159],
        [79.7213, 30.8827],
        [81.1112, 30.1839],
        [80.4767, 29.7298],
        [80.0884, 28.7946],
        [81.0573, 28.4166],
        [82.0003, 27.9255],
        [83.3042, 27.3644],
        [84.6750, 27.2349],
        [85.2514, 26.7262],
        [86.0239, 26.6309],
        [87.2272, 26.3978],
        [88.0602, 26.4146],
        [88.1748, 26.8101],
        [88.0431, 27.4458],
        [88.1204, 27.8766],
        [88.7308, 28.0868],
        [88.8142, 27.2993],
        [88.8370, 27.0989],
        [89.0319, 26.4115],
        [89.8328, 26.7194],
        [90.3728, 26.8756],
        [91.2179, 26.8087],
        [92.0330, 26.8383],
        [92.1037, 27.4526],
        [91.6967, 27.7717],
        [92.5033, 27.8966],
        [93.4132, 28.6407],
        [94.5659, 29.2774],
        [95.4048, 29.0317],
        [96.2482, 29.4528],
        [96.5862, 28.8309],
        [96.2488, 28.4112],
        [97.3272, 28.2618],
        [97.4024, 27.8828],
        [97.0519, 27.6990],
        [97.1339, 27.0838],
        [96.4191, 27.2645],
        [95.1245, 26.5735],
        [95.1551, 26.0013],
        [94.6034, 25.1627],
        [94.5526, 24.6755],
        [94.1067, 23.8508],
        [93.3252, 24.0786],
        [93.2862, 23.0435],
        [93.0602, 23.0668],
        [93.1660, 22.2784],
        [92.6726, 22.0412],
        [92.1466, 23.6275],
        [91.8699, 23.6243],
        [91.7064, 22.9854],
        [91.1589, 23.5036],
        [91.4661, 24.0726],
        [91.9151, 24.1304],
        [92.3762, 24.9764],
        [91.7995, 25.1474],
        [90.8722, 25.1327],
        [89.8478, 25.2691],
        [89.8329, 25.9651],
        [89.3550, 26.0144],
        [88.5630, 26.4465],
        [88.2097, 25.7680],
        [88.9312, 25.2386],
        [88.3062, 24.8664],
        [88.0844, 24.5016],
        [88.6999, 24.2337],
        [88.5297, 23.6314],
        [88.8766, 22.8792],
        [89.0319, 22.0556],
        [88.8887, 21.6906],
        [88.2080, 21.7031],
        [86.9757, 21.4956],
        [87.0330, 20.7433],
        [86.4990, 20.1513],
        [85.0602, 19.4785],
        [83.9410, 18.3020],
        [83.1892, 17.6712],
        [82.1929, 17.0166],
        [82.1912, 16.5566],
        [81.6927, 16.3102],
        [80.7919, 15.9519],
        [80.3249, 15.8990],
        [80.0250, 15.1361],
        [80.2332, 13.8358],
        [80.2863, 13.0063],
        [79.8625, 12.0563],
        [79.8575, 10.3573],
        [79.3403, 10.3089],
        [78.8855, 9.5465],
        [79.1897, 9.2166],
        [78.2779, 8.9337],
        [77.9411, 8.2529],
        [77.5399, 8.0806],
        [76.5923, 8.8993],
        [76.1302, 10.2999],
        [75.7464, 11.3085],
        [75.3956, 11.7814],
        [74.8648, 12.7418],
        [74.6163, 13.9929],
        [74.4438, 14.6172],
        [73.5342, 15.9907],
        [73.1194, 17.9281],
        [72.8209, 19.2081],
        [72.8244, 20.4195],
        [72.6305, 21.3561],
        [72.1504, 21.1495],
        [71.1751, 20.7574],
        [70.4704, 20.8772],
        [69.1641, 22.0893],
        [69.6449, 22.4509],
        [69.3491, 22.8433],
        [68.1766, 23.6919],
        [68.8425, 24.3594],
        [71.0432, 24.3565],
        [70.8446, 25.2151],
        [70.2829, 25.7222],
        [70.1689, 26.4919],
        [69.5143, 26.9407],
        [70.6163, 27.9891],
        [71.7779, 27.9131],
        [72.8237, 28.9615],
        [73.4506, 29.9764],
        [74.4213, 30.9798],
        [74.4058, 31.6926],
        [75.2578, 32.2711],
        [74.4516, 32.7648],
        [74.1042, 33.4414],
        [73.7498, 34.3179],
        [74.2403, 34.7488],
        [75.7571, 34.5049],
        [76.8717, 34.6537],
        [77.8375, 35.4940],
      ],
    ],
  },
};

export function IndiaMapViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const updateCanvasSize = () => {
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        drawMap();
      }
    };

    const drawMap = () => {
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background
      ctx.fillStyle = "#d4e4f7";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Get bounds
      const coords = indiaGeoJSON.geometry.coordinates[0];
      if (!coords) return;
      
      const lats = coords.map((c) => c[1]).filter((v): v is number => v !== undefined);
      const lngs = coords.map((c) => c[0]).filter((v): v is number => v !== undefined);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      // Scale and center
      const padding = 40;
      const scaleX = (canvas.width - padding * 2) / (maxLng - minLng);
      const scaleY = (canvas.height - padding * 2) / (maxLat - minLat);
      const scale = Math.min(scaleX, scaleY);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const mapWidth = (maxLng - minLng) * scale;
      const mapHeight = (maxLat - minLat) * scale;

      // Transform coordinates to canvas
      const toCanvasX = (lng: number) => {
        return centerX + (lng - (minLng + maxLng) / 2) * scale;
      };
      const toCanvasY = (lat: number) => {
        return centerY - (lat - (minLat + maxLat) / 2) * scale;
      };

      // Draw India boundary
      ctx.beginPath();
      coords.forEach((coord, i) => {
        if (!coord[0] || !coord[1]) return;
        const x = toCanvasX(coord[0]);
        const y = toCanvasY(coord[1]);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.closePath();

      // Fill
      ctx.fillStyle = "rgba(53, 99, 233, 0.15)";
      ctx.fill();

      // Stroke
      ctx.strokeStyle = "#3563E9";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Add label
      ctx.fillStyle = "#3563E9";
      ctx.font = "bold 24px Arial";
      ctx.textAlign = "center";
      ctx.fillText("INDIA", centerX, centerY);

      setIsLoading(false);
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);

    return () => {
      window.removeEventListener("resize", updateCanvasSize);
    };
  }, []);

  const handleDownloadKML = () => {
    const coordinates = indiaGeoJSON.geometry.coordinates[0];
    if (!coordinates) return;
    
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>India Boundary</name>
    <description>India country boundary</description>
    <Style id="indiaStyle">
      <LineStyle>
        <color>ff3563E9</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>4d3563E9</color>
      </PolyStyle>
    </Style>
    <Placemark>
      <name>India</name>
      <styleUrl>#indiaStyle</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
${coordinates.map((coord) => `              ${coord[0]},${coord[1]},0`).join("\n")}
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "india-boundary.kml";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="mb-1 text-xl font-semibold text-obsidian-graphite">
            India Boundary Dataset
          </h2>
          <p className="text-sm text-gray-600">
            Administrative boundary of India in KML format
          </p>
        </div>
        <button
          onClick={handleDownloadKML}
          className="flex items-center gap-2 rounded-lg bg-atlas-cobalt px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-cobalt-hover)]"
        >
          <Download className="h-4 w-4" />
          Download KML
        </button>
      </div>

      {/* Map Viewer */}
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-gray-200 bg-[#d4e4f7]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="mb-2 inline-block h-8 w-8 animate-spin rounded-full border-4 border-atlas-cobalt border-t-transparent"></div>
              <p className="text-sm text-gray-600">Loading map...</p>
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {/* Info Panel */}
      <div className="mt-6 rounded-lg bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 flex-shrink-0 text-atlas-cobalt" />
          <div>
            <h3 className="mb-2 font-semibold text-obsidian-graphite">
              Dataset Information
            </h3>
            <dl className="space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="font-medium text-gray-700">Format:</dt>
                <dd className="text-gray-600">KML / KMZ</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-gray-700">Area:</dt>
                <dd className="text-gray-600">3,287,263 km²</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-gray-700">Type:</dt>
                <dd className="text-gray-600">Administrative Boundary (Country Level)</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-gray-700">Coordinate System:</dt>
                <dd className="text-gray-600">WGS 84 (EPSG:4326)</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
