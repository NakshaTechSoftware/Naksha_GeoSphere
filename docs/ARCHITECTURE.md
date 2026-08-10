# Architecture

## Why two processing sides are required

The supplied ECW runtime is Windows x64. The FastAPI backend runs in a Linux Docker image. A Linux process cannot execute Windows `.exe` and `.dll` binaries, so decoding is deliberately separated from web serving.

```text
Windows source folder / network share
            |
            v
Windows ECW host worker
  - bundled ECW decoder
  - scans files
  - creates COGs
  - creates TIFF/ECW exports
            |
     shared project folders
   runtime/ and data/
            |
            v
Linux Docker backend
  - PostgreSQL catalog
  - intersection queries
  - XYZ tile mosaic
  - export jobs/downloads
            |
            v
Next.js + MapLibre browser workspace
```

## Initial catalog workflow

1. Backend or frontend queues `scan_catalog` in `runtime/bridge/inbox`.
2. Windows worker recursively finds `.ecw` files under `ECW_SOURCE_ROOT`.
3. It reads GDAL metadata and uses a configured fallback CRS for RAW/LOCAL files.
4. It converts each changed file to a COG under `data/cogs`.
5. It writes one manifest per dataset under `runtime/catalog`.
6. Backend synchronizes manifests into PostgreSQL.
7. The map tile endpoint queries intersecting COG bounding boxes and composites them into one PNG tile.

## Why ECW is converted to COG

Serving the original ECW through a Windows bridge for every map tile would be slow and create thousands of cross-process jobs. COG conversion occurs once and enables efficient range/window reads inside Linux Docker.

Original ECW files remain unchanged.

## Multi-file display

The frontend uses one raster tile source:

```text
/api/v1/maps/mosaic/tiles/{z}/{x}/{y}.png
```

For each XYZ tile, the backend:

1. Calculates the tile bounds.
2. Queries all intersecting raster records.
3. Reads only the needed window from each COG.
4. Warps it to Web Mercator.
5. Composites overlapping imagery.
6. Returns and caches one PNG tile.

This makes many ECW files appear as one continuous map.

## Polygon export

1. Browser sends a GeoJSON Polygon or MultiPolygon in EPSG:4326.
2. Backend validates geometry and area limits.
3. PostgreSQL bounding-box query selects intersecting datasets.
4. Backend writes an `export_mosaic` job containing controlled COG filenames.
5. Windows worker runs one multi-input `gdalwarp` operation with the polygon as a cutline.
6. Result is written to `data/exports`.
7. Backend returns a secure job-specific download URL.

## Storage layout

```text
data/
  cogs/          Derived web rasters
  exports/       User exports
  tile_cache/    Rendered XYZ PNG cache
runtime/
  catalog/       Dataset manifests
  bridge/inbox/  Pending Windows jobs
  bridge/status/ Job progress/result JSON
  bridge/work/   Temporary cutlines and output files
  mailbox/       Development verification links
```
