# Naksha GeoSphere - Geospatial Data Storage Architecture

## ✅ Setup Complete!

**Date:** August 4, 2026  
**Architecture:** Hybrid (Metadata in PostgreSQL + Files in S3/MinIO)

---

## 📊 Database Structure

### Tables Created:

1. **`locations`** - Hierarchical location model
   - Stores: Country → State → District hierarchy
   - Fields: id, name, code, location_type, parent_id, boundary (PostGIS geometry), description
   - Indexes: name, location_type, parent_id, spatial index on boundary

2. **`datasets`** - Geospatial dataset catalog (metadata only)
   - Stores: Dataset information WITHOUT the actual files
   - Fields:
     - Basic: id, name, description, dataset_type, status
     - Location: location_id (FK to locations)
     - Geospatial: bounding_box (PostGIS geometry), file_format, coordinate_system, resolution_meters
     - Storage: s3_bucket, s3_key (path to actual file in MinIO/S3), file_size_bytes
     - Pricing: price_per_sqkm
     - Extra: extra_metadata (JSONB for flexible fields)

### Current Data:

```
📍 India (IN)
  └── Karnataka (IN-KA)
      ├── Bengaluru Urban (IN-KA-BLR)
      ├── Mysuru (IN-KA-MYS)
      ├── Mangaluru (IN-KA-MNG)
      ├── Hubballi-Dharwad (IN-KA-HDW)
      ├── Belagavi (IN-KA-BLG)
      ├── Kalaburagi (IN-KA-KLB)
      ├── Tumakuru (IN-KA-TMK)
      └── Shivamogga (IN-KA-SHV)
```

---

## 🗄️ Object Storage Structure (MinIO/S3)

**Bucket:** `geosphere-source-data`

```
geosphere-source-data/
└── india/
    └── karnataka/
        ├── raster/      ← GeoTIFF, satellite imagery, aerial photos
        ├── vector/      ← Shapefiles, GeoJSON, KML files
        ├── lidar/       ← LAS, LAZ point cloud files
        ├── dem/         ← Digital Elevation Models
        └── preview/     ← Thumbnails, preview images
```

**Access via:**
- MinIO Console: http://localhost:9001
- S3 API: http://localhost:9000

---

## 🎯 How It Works

### 1. Uploading Geospatial Data

```python
# Example: Upload a satellite image for Bengaluru

# Step 1: Upload actual file to S3/MinIO
s3_key = "india/karnataka/raster/bengaluru_sentinel_2024.tif"
# Upload 5GB GeoTIFF file to MinIO...

# Step 2: Create metadata record in database
dataset = Dataset(
    name="Bengaluru Sentinel-2 Imagery 2024",
    description="High-resolution satellite imagery of Bengaluru Urban",
    dataset_type=DatasetType.RASTER,
    status=DatasetStatus.AVAILABLE,
    location_id="<karnataka-location-id>",
    bounding_box="POLYGON((...))",  # Bengaluru boundary
    file_format="GeoTIFF",
    coordinate_system="EPSG:4326",
    resolution_meters=10.0,
    s3_bucket="geosphere-source-data",
    s3_key=s3_key,  # ← Points to actual file
    file_size_bytes=5368709120,  # 5GB
    price_per_sqkm=100.00,
    extra_metadata={
        "capture_date": "2024-01-15",
        "satellite": "Sentinel-2",
        "cloud_cover": 5.2,
        "bands": ["red", "green", "blue", "nir"]
    }
)
```

### 2. Searching for Data

```python
# User searches for datasets in Bengaluru
results = await session.execute(
    select(Dataset)
    .where(Dataset.location_id == bengaluru_location_id)
    .where(Dataset.status == DatasetStatus.AVAILABLE)
)
# Returns: metadata records only (fast!)
```

### 3. Downloading Data

```python
# User purchases and downloads
dataset = get_dataset_by_id(...)
# Generate signed URL to actual file in S3
signed_url = generate_s3_signed_url(
    bucket=dataset.s3_bucket,
    key=dataset.s3_key,
    expires_in=900  # 15 minutes
)
# User downloads the actual 5GB file from S3
```

---

## 🔍 View in pgAdmin

### Connection Details:
- Host: `192.168.10.81`
- Port: `5544`
- Database: `naksha_geosphere`
- Username: `geosphere_app`
- Password: `a63ac6ead5e44a838d6e0b562b37272c2a73b04cc1e74b38`

### Navigate to:
```
Servers → Naksha GeoSphere Storage → Databases → naksha_geosphere 
→ Schemas → public → Tables
```

### Tables to Explore:
1. **`locations`** - Right-click → View/Edit Data → All Rows
2. **`datasets`** - Right-click → View/Edit Data → All Rows (currently empty, ready for data)

---

## 📝 Next Steps

### 1. Add More Locations (States/Districts)
```bash
# Edit: services/api/scripts/seed_locations.py
# Add: Maharashtra, Tamil Nadu, etc.
docker exec naksha_geosphere-api-1 python scripts/seed_locations.py
```

### 2. Upload Actual Geospatial Files
- Use MinIO Console: http://localhost:9001
- Or use AWS S3 CLI/SDKs
- Upload to: `geosphere-source-data/india/karnataka/raster/`

### 3. Create Dataset Metadata Records
- After uploading files, create corresponding records in `datasets` table
- Include bounding box, file path, pricing, etc.

### 4. Build APIs
- Create dataset search API (by location, type, bbox)
- Create dataset preview API
- Create purchase/download API with signed URLs

---

## 🔧 Useful Scripts

### Check Current Data:
```bash
docker exec naksha_geosphere-api-1 python verify_setup.py
```

### Add New Locations:
```bash
docker exec naksha_geosphere-api-1 python scripts/seed_locations.py
```

### Reset Database (WARNING: Deletes all data):
```bash
docker exec naksha_geosphere-api-1 alembic downgrade base
docker exec naksha_geosphere-api-1 alembic upgrade head
docker exec naksha_geosphere-api-1 python scripts/seed_locations.py
```

---

## 🏗️ Architecture Benefits

✅ **Fast Searches** - Query metadata in PostgreSQL (milliseconds)  
✅ **Scalable Storage** - Large files in S3/MinIO (unlimited capacity)  
✅ **Geospatial Queries** - PostGIS spatial indexes for bbox searches  
✅ **Cost Effective** - Don't load huge files into database  
✅ **Flexible** - JSONB extra_metadata for custom fields per dataset type  

---

## 📚 Data Types Supported

| Type | File Formats | Storage Location |
|------|-------------|------------------|
| **Raster** | GeoTIFF, JPEG2000, MrSID | `india/karnataka/raster/` |
| **Vector** | Shapefile, GeoJSON, KML, GeoPackage | `india/karnataka/vector/` |
| **LiDAR** | LAS, LAZ, E57 | `india/karnataka/lidar/` |
| **DEM** | GeoTIFF, HGT, SRTM | `india/karnataka/dem/` |

---

## 🎓 Key Concepts

### Why Not Store Files in PostgreSQL?
- ❌ Database bloat (5GB image = 5GB in database)
- ❌ Slow queries when large binary data is involved
- ❌ Expensive backups
- ❌ Limited by database storage capacity

### Why This Hybrid Approach?
- ✅ Database stores small metadata (few KB per dataset)
- ✅ S3/MinIO stores large files (GBs/TBs)
- ✅ Fast metadata queries
- ✅ On-demand file downloads
- ✅ Industry standard (used by AWS, Google Cloud Platform)

---

**Status:** ✅ Ready for dataset ingestion and API development!
