# Naksha GeoSphere - SQL Query Examples

## 📊 Useful SQL Queries for pgAdmin

Connect to your database and run these queries to explore your geospatial data.

---

## 🗺️ Location Queries

### 1. View All Locations (Hierarchical)
```sql
SELECT 
    l1.name AS country,
    l2.name AS state,
    l3.name AS district,
    l3.code AS district_code
FROM locations l1
LEFT JOIN locations l2 ON l2.parent_id = l1.id
LEFT JOIN locations l3 ON l3.parent_id = l2.id
WHERE l1.location_type = 'country'
ORDER BY l1.name, l2.name, l3.name;
```

### 2. Count Locations by Type
```sql
SELECT 
    location_type,
    COUNT(*) AS count
FROM locations
GROUP BY location_type
ORDER BY location_type;
```

### 3. Get All States in India
```sql
SELECT 
    name,
    code,
    description
FROM locations
WHERE location_type = 'state'
    AND parent_id = (SELECT id FROM locations WHERE code = 'IN')
ORDER BY name;
```

### 4. Get All Districts in Karnataka
```sql
SELECT 
    name,
    code,
    description
FROM locations
WHERE location_type = 'district'
    AND parent_id = (SELECT id FROM locations WHERE code = 'IN-KA')
ORDER BY name;
```

---

## 📁 Dataset Queries

### 5. View All Datasets with Location Info
```sql
SELECT 
    d.name AS dataset_name,
    d.dataset_type,
    d.status,
    l.name AS location,
    d.file_format,
    d.resolution_meters,
    ROUND(d.file_size_bytes / 1024.0 / 1024.0, 2) AS size_mb,
    d.price_per_sqkm,
    d.s3_key,
    d.created_at
FROM datasets d
JOIN locations l ON l.id = d.location_id
ORDER BY d.created_at DESC;
```

### 6. Count Datasets by Type
```sql
SELECT 
    dataset_type,
    COUNT(*) AS count,
    ROUND(SUM(file_size_bytes) / 1024.0 / 1024.0 / 1024.0, 2) AS total_gb
FROM datasets
GROUP BY dataset_type
ORDER BY count DESC;
```

### 7. Count Datasets by Location
```sql
SELECT 
    l.name AS location,
    l.location_type,
    COUNT(d.id) AS dataset_count
FROM locations l
LEFT JOIN datasets d ON d.location_id = l.id
GROUP BY l.id, l.name, l.location_type
HAVING COUNT(d.id) > 0
ORDER BY dataset_count DESC;
```

### 8. Get Available Datasets Only
```sql
SELECT 
    name,
    dataset_type,
    file_format,
    ROUND(file_size_bytes / 1024.0 / 1024.0, 2) AS size_mb,
    price_per_sqkm
FROM datasets
WHERE status = 'available'
ORDER BY created_at DESC;
```

### 9. Get Most Expensive Datasets
```sql
SELECT 
    d.name,
    l.name AS location,
    d.price_per_sqkm,
    d.extra_metadata->>'area_sqkm' AS area_sqkm,
    ROUND(
        d.price_per_sqkm * 
        CAST(d.extra_metadata->>'area_sqkm' AS NUMERIC),
        2
    ) AS estimated_full_price
FROM datasets d
JOIN locations l ON l.id = d.location_id
WHERE d.status = 'available'
ORDER BY d.price_per_sqkm DESC
LIMIT 10;
```

### 10. Get Dataset Metadata Details
```sql
SELECT 
    name,
    dataset_type,
    extra_metadata->>'satellite' AS satellite,
    extra_metadata->>'capture_date' AS capture_date,
    extra_metadata->>'cloud_cover_percentage' AS cloud_cover,
    extra_metadata->>'processing_level' AS processing_level,
    extra_metadata->>'license' AS license
FROM datasets
WHERE extra_metadata IS NOT NULL;
```

---

## 🌍 Geospatial Queries (PostGIS)

### 11. Get Dataset Bounding Box as Text
```sql
SELECT 
    name,
    ST_AsText(bounding_box) AS bbox_wkt,
    ST_Area(bounding_box::geography) / 1000000 AS area_sqkm
FROM datasets;
```

### 12. Find Datasets Intersecting with a Point
```sql
-- Example: Find datasets covering Bengaluru city center (77.5946° E, 12.9716° N)
SELECT 
    d.name,
    l.name AS location,
    d.dataset_type
FROM datasets d
JOIN locations l ON l.id = d.location_id
WHERE ST_Intersects(
    d.bounding_box,
    ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)
)
AND d.status = 'available';
```

### 13. Find Datasets Intersecting with a Custom Area
```sql
-- Example: Find datasets covering a custom bounding box
SELECT 
    d.name,
    d.dataset_type,
    l.name AS location
FROM datasets d
JOIN locations l ON l.id = d.location_id
WHERE ST_Intersects(
    d.bounding_box,
    ST_GeomFromText(
        'POLYGON((77.5 12.9, 77.7 12.9, 77.7 13.1, 77.5 13.1, 77.5 12.9))',
        4326
    )
)
AND d.status = 'available';
```

### 14. Calculate Distance Between Dataset Centers
```sql
SELECT 
    d1.name AS dataset1,
    d2.name AS dataset2,
    ROUND(
        ST_Distance(
            ST_Centroid(d1.bounding_box)::geography,
            ST_Centroid(d2.bounding_box)::geography
        ) / 1000,
        2
    ) AS distance_km
FROM datasets d1
CROSS JOIN datasets d2
WHERE d1.id < d2.id
ORDER BY distance_km
LIMIT 10;
```

---

## 📈 Statistics Queries

### 15. Overall Platform Statistics
```sql
SELECT 
    (SELECT COUNT(*) FROM locations WHERE location_type = 'country') AS countries,
    (SELECT COUNT(*) FROM locations WHERE location_type = 'state') AS states,
    (SELECT COUNT(*) FROM locations WHERE location_type = 'district') AS districts,
    (SELECT COUNT(*) FROM datasets) AS total_datasets,
    (SELECT COUNT(*) FROM datasets WHERE status = 'available') AS available_datasets,
    (SELECT ROUND(SUM(file_size_bytes) / 1024.0 / 1024.0 / 1024.0, 2) FROM datasets) AS total_data_gb;
```

### 16. Dataset Status Distribution
```sql
SELECT 
    status,
    COUNT(*) AS count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM datasets
GROUP BY status
ORDER BY count DESC;
```

### 17. Recent Dataset Additions
```sql
SELECT 
    d.name,
    l.name AS location,
    d.dataset_type,
    d.created_at,
    ROUND(d.file_size_bytes / 1024.0 / 1024.0, 2) AS size_mb
FROM datasets d
JOIN locations l ON l.id = d.location_id
WHERE d.created_at >= NOW() - INTERVAL '7 days'
ORDER BY d.created_at DESC;
```

---

## 🔍 Search Queries

### 18. Search Datasets by Name
```sql
SELECT 
    d.name,
    l.name AS location,
    d.dataset_type,
    d.status
FROM datasets d
JOIN locations l ON l.id = d.location_id
WHERE d.name ILIKE '%sentinel%'
ORDER BY d.name;
```

### 19. Find Datasets in a Specific Format
```sql
SELECT 
    name,
    dataset_type,
    file_format,
    s3_key
FROM datasets
WHERE file_format = 'GeoTIFF'
AND status = 'available';
```

### 20. Find High-Resolution Datasets
```sql
SELECT 
    name,
    resolution_meters,
    dataset_type,
    ROUND(file_size_bytes / 1024.0 / 1024.0, 2) AS size_mb
FROM datasets
WHERE resolution_meters IS NOT NULL
    AND resolution_meters <= 10
    AND status = 'available'
ORDER BY resolution_meters ASC;
```

---

## 🛠️ Maintenance Queries

### 21. Find Orphaned Datasets (No Location)
```sql
SELECT 
    d.id,
    d.name,
    d.location_id
FROM datasets d
LEFT JOIN locations l ON l.id = d.location_id
WHERE l.id IS NULL;
```

### 22. Check for Duplicate S3 Keys
```sql
SELECT 
    s3_key,
    COUNT(*) AS count
FROM datasets
GROUP BY s3_key
HAVING COUNT(*) > 1;
```

### 23. Dataset Size Distribution
```sql
SELECT 
    CASE 
        WHEN file_size_bytes < 1048576 THEN '< 1 MB'
        WHEN file_size_bytes < 104857600 THEN '1-100 MB'
        WHEN file_size_bytes < 1073741824 THEN '100 MB - 1 GB'
        WHEN file_size_bytes < 5368709120 THEN '1-5 GB'
        ELSE '> 5 GB'
    END AS size_range,
    COUNT(*) AS count
FROM datasets
GROUP BY size_range
ORDER BY 
    CASE size_range
        WHEN '< 1 MB' THEN 1
        WHEN '1-100 MB' THEN 2
        WHEN '100 MB - 1 GB' THEN 3
        WHEN '1-5 GB' THEN 4
        ELSE 5
    END;
```

---

## 🎯 Business Intelligence Queries

### 24. Revenue Potential by Location
```sql
SELECT 
    l.name AS location,
    COUNT(d.id) AS dataset_count,
    SUM(
        d.price_per_sqkm * 
        CAST(d.extra_metadata->>'area_sqkm' AS NUMERIC)
    ) AS potential_revenue
FROM locations l
JOIN datasets d ON d.location_id = l.id
WHERE d.status = 'available'
    AND d.extra_metadata->>'area_sqkm' IS NOT NULL
GROUP BY l.id, l.name
ORDER BY potential_revenue DESC;
```

### 25. Dataset Coverage by State
```sql
SELECT 
    state.name AS state,
    COUNT(DISTINCT district.id) AS districts_with_data,
    COUNT(d.id) AS total_datasets,
    ROUND(SUM(d.file_size_bytes) / 1024.0 / 1024.0 / 1024.0, 2) AS total_gb
FROM locations state
LEFT JOIN locations district ON district.parent_id = state.id
LEFT JOIN datasets d ON d.location_id = district.id
WHERE state.location_type = 'state'
GROUP BY state.id, state.name
HAVING COUNT(d.id) > 0
ORDER BY total_datasets DESC;
```

---

## 📝 Notes

- Replace `ILIKE '%search%'` with your actual search term
- All coordinates use SRID 4326 (WGS84: longitude, latitude)
- Dates are in UTC timezone
- File sizes are in bytes by default, converted to MB/GB in queries

**Run these queries in pgAdmin Query Tool:**
1. Open pgAdmin
2. Navigate to your database
3. Click Tools → Query Tool
4. Copy and paste any query
5. Click Execute (F5)

