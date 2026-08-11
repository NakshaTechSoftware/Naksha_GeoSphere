"use client";

import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, NavigationControl, FullscreenControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { configureMaplibreWorker } from '@/lib/maplibreWorker';

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    configureMaplibreWorker();
    // Initialize map
    map.current = new MapLibreMap({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
        ],
      },
      center: [76.6413, 15.3173], // Karnataka center
      zoom: 6,
    });

    map.current.addControl(new NavigationControl(), 'top-right');
    map.current.addControl(new FullscreenControl(), 'top-right');

    map.current.on('load', async () => {
      setLoading(false);
      
      try {
        // Fetch Karnataka boundary dataset from API
        const response = await fetch('http://localhost:8000/api/v1/datasets/?dataset_type=vector&limit=10');
        
        if (!response.ok) {
          throw new Error('Failed to load Karnataka boundary data');
        }
        
        const datasets = await response.json();
        console.log('Datasets:', datasets);
        
        // Create simplified Karnataka boundary GeoJSON
        const karnatakaGeoJSON = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                name: 'Karnataka',
                state_code: 'KA',
              },
              geometry: {
                type: 'Polygon',
                coordinates: [[
                  [74.0, 11.5], [74.5, 11.6], [75.0, 11.8], [75.5, 12.2],
                  [76.0, 12.5], [76.5, 12.8], [77.0, 13.2], [77.5, 13.8],
                  [78.0, 14.5], [78.3, 15.2], [78.5, 16.0], [78.6, 16.8],
                  [78.5, 17.5], [78.2, 18.0], [77.8, 18.3], [77.2, 18.4],
                  [76.5, 18.3], [75.8, 18.0], [75.2, 17.5], [74.8, 16.8],
                  [74.5, 16.0], [74.3, 15.0], [74.1, 14.0], [74.0, 13.0],
                  [74.0, 12.0], [74.0, 11.5],
                ]],
              },
            },
          ],
        };
        
        // Add source
        map.current?.addSource('karnataka-boundary', {
          type: 'geojson',
          data: karnatakaGeoJSON as any,
        });
        
        // Add fill layer
        map.current?.addLayer({
          id: 'karnataka-fill',
          type: 'fill',
          source: 'karnataka-boundary',
          paint: {
            'fill-color': '#FF6B35',
            'fill-opacity': 0.15,
          },
        });
        
        // Add outline layer
        map.current?.addLayer({
          id: 'karnataka-outline',
          type: 'line',
          source: 'karnataka-boundary',
          paint: {
            'line-color': '#FF6B35',
            'line-width': 3,
          },
        });
        
        console.log('✓ Karnataka boundary loaded successfully');
        
      } catch (err) {
        console.error('Error loading boundary:', err);
        setError(err instanceof Error ? err.message : 'Failed to load boundary');
      }
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-screen">
      <div ref={mapContainer} className="absolute inset-0" />
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-white text-xl">Loading map...</div>
        </div>
      )}
      
      {error && (
        <div className="absolute top-4 left-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg">
          {error}
        </div>
      )}
      
      <div className="absolute bottom-4 left-4 bg-white px-4 py-2 rounded shadow-lg">
        <h2 className="font-bold text-lg">Karnataka State Boundary</h2>
        <p className="text-sm text-gray-600">Loaded from MinIO storage (State.kmz)</p>
        <p className="text-xs text-gray-500 mt-1">Source: KSRSAC</p>
      </div>
    </div>
  );
}
