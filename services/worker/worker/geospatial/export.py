"""Pure, Celery-independent GeoJSON-to-GIS-file conversion.

Converts either one feature (the Explore page's single right-click
"Export") or several named layers of features (a hierarchical bulk export
- e.g. a district plus every taluk/hobli/village inside it) into any of
the formats the Explore page offers. Operates entirely on in-memory data
and a caller-managed temp directory - never reads from or writes to any
path outside the one it's given, since this is reachable from an async
task queue.
"""

from __future__ import annotations

import io
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Literal, TypedDict

import geopandas as gpd
from shapely.errors import ShapelyError
from shapely.geometry import MultiLineString, MultiPoint, MultiPolygon, shape
from shapely.geometry.base import BaseGeometry

ExportFormat = Literal["geojson", "shapefile", "kml", "kmz", "gpkg", "gdb"]

# geopandas/Fiona driver name and whether the driver's output is a single
# file or a directory/file-set that must be zipped before it can be sent
# back as one HTTP response body.
_DRIVER_BY_FORMAT: dict[ExportFormat, tuple[str, bool]] = {
    "geojson": ("GeoJSON", False),
    "shapefile": ("ESRI Shapefile", True),
    "kml": ("KML", False),
    "kmz": ("KML", False),  # written as KML, then zipped as .kmz below
    "gpkg": ("GPKG", False),
    "gdb": ("OpenFileGDB", True),  # OpenFileGDB writes a .gdb *directory*
}

_EXTENSION_BY_FORMAT: dict[ExportFormat, str] = {
    "geojson": "geojson",
    "shapefile": "zip",
    "kml": "kml",
    "kmz": "kmz",
    "gpkg": "gpkg",
    "gdb": "zip",
}

_MIMETYPE_BY_FORMAT: dict[ExportFormat, str] = {
    "geojson": "application/geo+json",
    "shapefile": "application/zip",
    "kml": "application/vnd.google-earth.kml+xml",
    "kmz": "application/vnd.google-earth.kmz",
    "gpkg": "application/geopackage+sqlite3",
    "gdb": "application/zip",
}

# gpkg/gdb natively hold multiple named layers in one file/directory, so a bulk
# export keeps each admin level as its own layer with its own schema. Every
# other format is single-layer, so a bulk export falls back to one file per
# level, zipped together.
_MULTI_LAYER_CAPABLE_FORMATS = {"gpkg", "gdb"}


class FeatureExportError(ValueError):
    """Raised for malformed/invalid input or an unsupported format."""


class ExportedFile(TypedDict):
    filename: str
    mimetype: str
    content: bytes


class BulkLayer(TypedDict):
    level: str
    features: list[dict[str, Any]]  # each {"geometry": {...}, "properties": {...}}


def _sanitize_filename_stem(raw: str) -> str:
    stem = "".join(c if c.isalnum() or c in "-_" else "_" for c in raw.strip())
    stem = stem.strip("_")
    return stem[:80] or "export"


def _parse_geometry(geometry: dict[str, Any]) -> BaseGeometry:
    if not isinstance(geometry, dict) or "type" not in geometry:
        raise FeatureExportError("feature.geometry is not a GeoJSON geometry object")
    try:
        parsed = shape(geometry)
    except (ShapelyError, ValueError, TypeError) as exc:
        raise FeatureExportError(f"invalid geometry: {exc}") from exc
    if not parsed.is_valid or parsed.is_empty:
        raise FeatureExportError("geometry is invalid or empty")
    return parsed


# Every feature written to one OGR layer must share a single geometry type - real KGIS
# source data freely mixes Polygon/MultiPolygon (and occasionally an outlier of a different
# family entirely) within what's otherwise "one layer's worth" of boundaries, which drivers
# like OpenFileGDB and Shapefile reject outright ("Unsupported geometry type"). Group by
# broad family (point/line/polygon), upcast everything to that family's Multi* variant, and
# drop any feature whose family doesn't match the layer's majority.
_GEOM_FAMILY: dict[str, str] = {
    "Point": "Point",
    "MultiPoint": "Point",
    "LineString": "LineString",
    "MultiLineString": "LineString",
    "Polygon": "Polygon",
    "MultiPolygon": "Polygon",
}
_MULTI_CTOR: dict[str, type[BaseGeometry]] = {
    "Point": MultiPoint,
    "LineString": MultiLineString,
    "Polygon": MultiPolygon,
}


def _normalize_geometry_family(
    geometries: list[BaseGeometry], rows: list[dict[str, Any]]
) -> tuple[list[BaseGeometry], list[dict[str, Any]]]:
    families = [_GEOM_FAMILY.get(g.geom_type) for g in geometries]
    counts: dict[str, int] = {}
    for family in families:
        if family:
            counts[family] = counts.get(family, 0) + 1
    if not counts:
        return geometries, rows
    majority = max(counts, key=lambda k: counts[k])
    multi_ctor = _MULTI_CTOR[majority]

    out_geometries: list[BaseGeometry] = []
    out_rows: list[dict[str, Any]] = []
    for geometry, row, family in zip(geometries, rows, families, strict=True):
        if family != majority:
            continue
        if not geometry.geom_type.startswith("Multi"):
            geometry = multi_ctor([geometry])
        out_geometries.append(geometry)
        out_rows.append(row)
    return out_geometries, out_rows


def _safe_properties(properties: dict[str, Any]) -> dict[str, Any]:
    # Every value must be a type OGR/GDAL can write to an attribute field -
    # geopandas infers column types from these via pandas, so coerce
    # anything exotic (nested dict/list from a source GeoJSON) to a string
    # rather than letting to_file() fail on the whole export.
    return {
        str(key): (
            value if isinstance(value, (str, int, float, bool)) or value is None else str(value)
        )
        for key, value in (properties or {}).items()
    }


def _build_gdf(features: list[dict[str, Any]], *, strict: bool = True) -> gpd.GeoDataFrame:
    """Builds a GeoDataFrame from GeoJSON-shaped features.

    strict=True (single-feature export, where there is only one row and
    nothing to fall back to) raises on the first invalid geometry.
    strict=False (bulk export, potentially hundreds/thousands of rows from
    real government source data that occasionally has a null/empty
    geometry mixed in) skips just that one row instead of failing the
    whole layer.
    """
    if not features:
        raise FeatureExportError("no features to export")
    geometries: list[BaseGeometry] = []
    rows: list[dict[str, Any]] = []
    for f in features:
        try:
            geometry = _parse_geometry(f.get("geometry") or {})
        except FeatureExportError:
            if strict:
                raise
            continue
        geometries.append(geometry)
        rows.append(_safe_properties(f.get("properties") or {}))
    if not rows:
        raise FeatureExportError("no valid features to export")
    geometries, rows = _normalize_geometry_family(geometries, rows)
    if not rows:
        raise FeatureExportError("no valid features to export")
    return gpd.GeoDataFrame(rows, geometry=geometries, crs="EPSG:4326")


def _write_single_layer(gdf: gpd.GeoDataFrame, export_format: ExportFormat, stem: str) -> ExportedFile:
    """Writes one GeoDataFrame as one single-layer output file (optionally zipped)."""
    driver, is_multi_file = _DRIVER_BY_FORMAT[export_format]
    filename = f"{stem}.{_EXTENSION_BY_FORMAT[export_format]}"

    with tempfile.TemporaryDirectory(prefix="naksha-export-") as tmp:
        tmp_dir = Path(tmp)

        if export_format == "kmz":
            kml_path = tmp_dir / f"{stem}.kml"
            gdf.to_file(kml_path, driver="KML")
            zip_path = tmp_dir / filename
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                zf.write(kml_path, arcname="doc.kml")
            content = zip_path.read_bytes()
        elif export_format == "gdb":
            gdb_path = tmp_dir / f"{stem}.gdb"
            gdf.to_file(gdb_path, driver=driver)
            zip_path = tmp_dir / filename
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for member in gdb_path.rglob("*"):
                    if member.is_file():
                        zf.write(member, arcname=f"{gdb_path.name}/{member.relative_to(gdb_path)}")
            content = zip_path.read_bytes()
        elif is_multi_file:  # shapefile: sibling files sharing one stem
            shp_path = tmp_dir / f"{stem}.shp"
            gdf.to_file(shp_path, driver=driver)
            zip_path = tmp_dir / filename
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for member in tmp_dir.glob(f"{stem}.*"):
                    if member.name != filename:
                        zf.write(member, arcname=member.name)
            content = zip_path.read_bytes()
        else:
            out_path = tmp_dir / filename
            gdf.to_file(out_path, driver=driver)
            content = out_path.read_bytes()

    return ExportedFile(filename=filename, mimetype=_MIMETYPE_BY_FORMAT[export_format], content=content)


def export_feature(
    *,
    geometry: dict[str, Any],
    properties: dict[str, Any],
    export_format: ExportFormat,
    name_hint: str,
) -> ExportedFile:
    """Converts a single GeoJSON feature into the requested format.

    Raises FeatureExportError for bad input; lets any unexpected GDAL/OGR
    failure propagate so the caller (the Celery task) surfaces it as a
    genuine task failure rather than a silently wrong file.
    """
    if export_format not in _DRIVER_BY_FORMAT:
        raise FeatureExportError(f"unsupported export format: {export_format!r}")
    gdf = _build_gdf([{"geometry": geometry, "properties": properties}])
    return _write_single_layer(gdf, export_format, _sanitize_filename_stem(name_hint))


def export_bulk(
    *,
    layers: list[BulkLayer],
    export_format: ExportFormat,
    name_hint: str,
) -> ExportedFile:
    """Converts several named admin-hierarchy levels (state/district/taluk/
    hobli/village) into one download. gpkg/gdb keep every level as its own
    layer in a single file; every other format falls back to one file per
    level zipped together, since those formats can't hold multiple layers.
    """
    if export_format not in _DRIVER_BY_FORMAT:
        raise FeatureExportError(f"unsupported export format: {export_format!r}")

    non_empty = [layer for layer in layers if layer.get("features")]
    if not non_empty:
        raise FeatureExportError("no features to export")

    stem = _sanitize_filename_stem(name_hint)
    driver, _ = _DRIVER_BY_FORMAT[export_format]

    if export_format in _MULTI_LAYER_CAPABLE_FORMATS:
        filename = f"{stem}.{_EXTENSION_BY_FORMAT[export_format]}"
        with tempfile.TemporaryDirectory(prefix="naksha-export-") as tmp:
            tmp_dir = Path(tmp)
            data_path = tmp_dir / (f"{stem}.gdb" if export_format == "gdb" else f"{stem}.gpkg")
            wrote_any = False
            for layer in non_empty:
                try:
                    gdf = _build_gdf(layer["features"], strict=False)
                except FeatureExportError:
                    # This whole level had nothing valid to write (e.g. every feature came
                    # back with a null geometry) - skip it, the other selected levels still
                    # make a legitimate export.
                    continue
                gdf.to_file(
                    data_path,
                    driver=driver,
                    layer=_sanitize_filename_stem(layer["level"]),
                    mode="w" if not wrote_any else "a",
                )
                wrote_any = True
            if not wrote_any:
                raise FeatureExportError("no valid features to export")
            if export_format == "gdb":
                zip_path = tmp_dir / filename
                with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                    for member in data_path.rglob("*"):
                        if member.is_file():
                            zf.write(
                                member, arcname=f"{data_path.name}/{member.relative_to(data_path)}"
                            )
                content = zip_path.read_bytes()
            else:
                content = data_path.read_bytes()
        return ExportedFile(
            filename=filename, mimetype=_MIMETYPE_BY_FORMAT[export_format], content=content
        )

    # Single-layer format: one file per level, all bundled into one outer zip.
    filename = f"{stem}.zip"
    wrote_any = False
    with tempfile.TemporaryDirectory(prefix="naksha-export-") as tmp:
        zip_path = Path(tmp) / filename
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as outer_zip:
            for layer in non_empty:
                level_stem = _sanitize_filename_stem(layer["level"])
                try:
                    gdf = _build_gdf(layer["features"], strict=False)
                except FeatureExportError:
                    continue  # this level had nothing valid to write - skip it, keep the rest
                exported = _write_single_layer(gdf, export_format, level_stem)
                # Shapefile/KMZ per-level exports are themselves a zip (multi-file) - unwrap
                # so the outer zip holds each level's real files, not a zip-inside-a-zip.
                if exported["filename"].endswith(".zip") or exported["filename"].endswith(".kmz"):
                    inner_zip = zipfile.ZipFile(io.BytesIO(exported["content"]))
                    for inner_name in inner_zip.namelist():
                        outer_zip.writestr(f"{level_stem}/{inner_name}", inner_zip.read(inner_name))
                else:
                    outer_zip.writestr(exported["filename"], exported["content"])
                wrote_any = True
        if not wrote_any:
            raise FeatureExportError("no valid features to export")
        content = zip_path.read_bytes()
    return ExportedFile(filename=filename, mimetype="application/zip", content=content)
