# Naksha GeoSphere - Geospatial Data Architecture

## Overview

Naksha GeoSphere uses a **hybrid storage architecture** for optimal performance and scalability.

## Storage Strategy

### 1. PostgreSQL/PostGIS (Metadata + Small Geometries)

**Schema: `public`** (Application tables)
- `users` - User accounts
- `organizations` - Company/team accounts  
- `datasets` - Dataset catalog (METADATA only)
- `orders` - Purchase orders
- `payments` - Payment transactions
- `licenses` - Usage licenses

**Schema: `geodata`** (Small geospatial data)
- `administrative_boundaries` - Country/state boundaries
- `user_aoi` - User-drawn Areas of Interest (polygons)
- `reference_layers` - Cities, landmarks (< 100 MB)

**Schema: `analytics`** (Aggregated data)
- `dataset_usage_stats`
- `popular_regions`

### 2. Object Storage (Large Files)

**MinIO/S3 Buckets:**

```
geosphere-source-data/
├── raster/
│   ├── satellite/sentinel2/2024/...
│   ├── satellite/landsat8/2024/...
│   └── aerial/drone/...
├── vector/
│   ├── roads/
│   ├── buildings/
│   └── land_use/
└── lidar/
    └── elevation/

geosphere-preview-data/
├── thumbnails/
├── quick_looks/
└── web_tiles/

geosphere-order-output/
└── {order_id}/
    └── clipped_data.zip

geosphere-temporary-data/
└── processing/
```

## Database Schema Design

### Datasets Table (Metadata)

```sql
CREATE TABLE datasets (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    data_type VARCHAR(50), -- 'raster', 'vector', 'lidar'
    file_format VARCHAR(50), -- 'GeoTIFF', 'Shapefile', 'LAS'
    
    -- Spatial metadata (for search)
    bounding_box GEOMETRY(POLYGON, 4326),
    
    -- File info
    file_size_bytes BIGINT,
    resolution_meters DECIMAL(10, 2),
    
    -- Storage location
    s3_bucket VARCHAR(100),
    s3_key TEXT,
    
    -- Pricing
    price_per_sqkm DECIMAL(10, 2),
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_datasets_bounding_box ON datasets USING GIST(bounding_box);
```

### User AOI Table (Small Geometries)

```sql
CREATE TABLE geodata.user_aoi (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    name VARCHAR(255),
    geometry GEOMETRY(POLYGON, 4326),
    area_sqkm DECIMAL(10, 4),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_aoi_geometry ON geodata.user_aoi USING GIST(geometry);
```

### Orders Table

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    dataset_id UUID REFERENCES datasets(id),
    
    -- User's selected area
    aoi_geometry GEOMETRY(POLYGON, 4326),
    
    -- Output location
    output_s3_bucket VARCHAR(100),
    output_s3_key TEXT,
    
    status VARCHAR(50), -- 'pending', 'processing', 'completed'
    total_price DECIMAL(10, 2),
    
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Why This Architecture?

### PostgreSQL/PostGIS Strengths:
- ✅ **Fast spatial queries** (find datasets intersecting user's AOI)
- ✅ **ACID transactions** (reliable orders, payments)
- ✅ **Relationships** (users → orders → datasets)
- ✅ **Small geometries** (boundaries, user AOIs < 100 MB)

### Object Storage Strengths:
- ✅ **Massive files** (satellite imagery: 5-50 GB per scene)
- ✅ **Cost-effective** ($0.02/GB vs database storage)
- ✅ **Scalable** (unlimited storage)
- ✅ **Pre-signed URLs** (secure, time-limited downloads)

## Data Flow

### User Searches for Data:

1. User draws AOI on map (frontend)
2. Frontend sends geometry to API
3. API queries PostgreSQL:
   ```sql
   SELECT * FROM datasets 
   WHERE ST_Intersects(bounding_box, :user_aoi)
   ```
4. Returns matching datasets (metadata only, fast!)

### User Purchases Data:

1. User selects dataset + AOI
2. Order created in PostgreSQL
3. Celery worker:
   - Downloads from S3 (`geosphere-source-data`)
   - Clips to user's AOI using GDAL
   - Uploads to S3 (`geosphere-order-output/{order_id}/`)
4. Generate pre-signed URL (expires in 24 hours)
5. User downloads clipped data

## Schema Guidelines

### Use `public` schema for:
- User accounts
- Orders, payments
- Dataset catalog (metadata)
- Business logic tables

### Use `geodata` schema for:
- Administrative boundaries
- Reference layers
- User AOIs
- Small vector data

### Use Object Storage for:
- Raster imagery (> 1 MB)
- Large vector files (> 50 MB)
- LiDAR point clouds
- Any raw dataset files

## Performance Considerations

1. **Spatial Indexes**: Always create GIST indexes on geometry columns
2. **File Size Limit**: Never store files > 100 MB in PostgreSQL
3. **Bounding Boxes**: Store simplified bounding boxes for fast queries
4. **Thumbnails**: Generate small previews for UI
5. **Lazy Loading**: Load actual data only when user purchases

## Future Scaling

As data grows:
- Add **partitioning** (by date, region)
- Use **PostGIS raster** for small tiles only
- Consider **GeoServer** for WMS/WFS services
- Add **CDN** for preview images
- Implement **caching** (Redis) for frequent queries

---

**Summary**: Metadata in PostgreSQL, actual files in S3/MinIO. Best of both worlds! 🚀
