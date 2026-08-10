# Naksha GeoSphere — ECW Backend and Map Workspace

This package adds the missing backend to the supplied Naksha GeoSphere frontend.

It is designed for the current Windows + Docker workflow:

- ECW source files stay in a local drive or network folder on Windows.
- A bundled Windows worker reads ECW through `naksha-ecw-sdk` without requiring QGIS.
- Each ECW is converted once to a web-optimized Cloud Optimized GeoTIFF (COG).
- The Linux Docker backend serves all converted rasters as one continuous XYZ mosaic.
- A user draws any polygon in the browser and requests a TIFF or ECW export.
- The export worker selects every intersecting source tile, mosaics them, clips the exact polygon, and returns one file.

## Included

- Existing Next.js frontend
- Functional `/explore` MapLibre workspace
- FastAPI backend and OpenAPI documentation
- PostgreSQL catalog and export-job records
- Redis health/rate-limit support
- Multi-COG XYZ tile service
- Windows ECW scan/conversion/export worker
- Bundled `naksha_ecw_sdk-1.1.0-py3-none-win_amd64.whl`
- Docker Compose startup
- Setup, testing, architecture, and API documentation

## First start

1. Extract the ZIP to a normal writable folder.
2. Run `CONFIGURE_ECW_PATH.bat`.
3. Select the parent folder containing all ECW files. Subfolders are scanned recursively.
4. Run `START_GEOSPHERE.bat`.
5. Open `http://localhost:3000/explore`.

The first scan converts each ECW once. Later scans skip unchanged files.

## URLs

- Map workspace: `http://localhost:3000/explore`
- Backend API: `http://localhost:8000`
- Interactive API docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/api/v1/health`

## Important deployment note

The web backend runs in a Linux Docker container, but the proprietary Windows ECW decoder cannot. The included host worker runs on Windows and exchanges controlled jobs and files through the project `runtime` and `data` folders.

QGIS and Global Mapper are not required by the included runtime. This remains an internal test build until the ECW SDK binary redistribution and server-use terms are formally approved for the intended deployment.
