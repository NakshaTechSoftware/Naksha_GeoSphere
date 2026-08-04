"use client";

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Initialize map
    map.current = new maplibregl.Map({
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

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.current.addControl(new maplibregl.FullscreenControl(), 'top-right');

    map.current.on('load', async () => {
      setLoading(false);
      
      try {
        // Fetch Karnataka boundary dataset from API
        const response = await fetch('/api/datasets/karnataka-boundary');
        
        if (!response.ok) {
          throw new Error('Failed to load Karnataka boundary data');
        }
        
        const geojson = await response.json();
        
        // Add source
        map.current?.addSource('karnataka-boundary', {
          type: 'geojson',
          data: geojson,
        });
        
        // Add fill layer
        map.current?.addLayer({
          id: 'karnataka-fill',
          type: 'fill',
          source: 'karnataka-boundary',
          paint: {
            'fill-color': '#088',
            'fill-opacity': 0.2,
          },
        });
        
        // Add outline layer
        map.current?.addLayer({
          id: 'karnataka-outline',
          type: 'line',
          source: 'karnataka-boundary',
          paint: {
            'line-color': '#088',
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
        <div className="absolute top-4 left-4 bg-red-500 text-white px-4 py-2 rounded">
          {error}
        </div>
      )}
      
      <div className="absolute bottom-4 left-4 bg-white px-4 py-2 rounded shadow-lg">
        <h2 className="font-bold">Karnataka State Boundary</h2>
        <p className="text-sm text-gray-600">Loaded from MinIO storage</p>
      </div>
    </div>
  );
}
