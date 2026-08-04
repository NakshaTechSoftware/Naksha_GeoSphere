from worker.geospatial.runtime_info import collect_runtime_info


def test_collect_runtime_info_reports_library_versions() -> None:
    info = collect_runtime_info()

    assert info["rasterio_version"]
    assert info["geopandas_version"]
    assert info["shapely_version"]
    assert info["pyproj_version"]
    assert info["fiona_version"]
    assert info["gdal_version"]
    assert isinstance(info["gdal_cli_available"], bool)


def test_collect_runtime_info_never_includes_environment_variables() -> None:
    info = collect_runtime_info()
    assert "env" not in info
    assert "environment" not in info
