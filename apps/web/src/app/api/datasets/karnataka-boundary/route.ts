import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Fetch the dataset info from backend API
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://api:8000';
    
    // Search for Karnataka boundary dataset
    const searchResponse = await fetch(
      `${backendUrl}/api/v1/datasets/?location_id=&dataset_type=vector&limit=10`,
      { cache: 'no-store' }
    );
    
    if (!searchResponse.ok) {
      throw new Error('Failed to fetch dataset from backend');
    }
    
    const datasets = await searchResponse.json();
    
    // Find the Karnataka boundary dataset
    const boundaryDataset = datasets.find(
      (ds: any) => ds.s3_key === 'india/karnataka/state-boundary/State.kmz'
    );
    
    if (!boundaryDataset) {
      return NextResponse.json(
        { error: 'Karnataka boundary dataset not found' },
        { status: 404 }
      );
    }
    
    // For now, return a simplified GeoJSON representation of Karnataka
    // In production, you would convert the KMZ to GeoJSON server-side
    const karnatakaGeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Karnataka',
            state_code: 'KA',
            country: 'India',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [74.0, 11.5],
              [74.5, 11.6],
              [75.0, 11.8],
              [75.5, 12.2],
              [76.0, 12.5],
              [76.5, 12.8],
              [77.0, 13.2],
              [77.5, 13.8],
              [78.0, 14.5],
              [78.3, 15.2],
              [78.5, 16.0],
              [78.6, 16.8],
              [78.5, 17.5],
              [78.2, 18.0],
              [77.8, 18.3],
              [77.2, 18.4],
              [76.5, 18.3],
              [75.8, 18.0],
              [75.2, 17.5],
              [74.8, 16.8],
              [74.5, 16.0],
              [74.3, 15.0],
              [74.1, 14.0],
              [74.0, 13.0],
              [74.0, 12.0],
              [74.0, 11.5],
            ]],
          },
        },
      ],
    };
    
    return NextResponse.json(karnatakaGeoJSON);
    
  } catch (error) {
    console.error('Error loading Karnataka boundary:', error);
    return NextResponse.json(
      { error: 'Failed to load boundary data' },
      { status: 500 }
    );
  }
}
