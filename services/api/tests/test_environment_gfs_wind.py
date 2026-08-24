from __future__ import annotations

from datetime import date, datetime, timezone
from urllib.parse import parse_qs, urlparse

import pytest

from app.modules.environment import gfs_wind
from app.modules.environment.schemas import GfsWindFrameResponse, GfsWindGridBounds


def test_build_gfs_filter_url_uses_official_nomads_subset_pattern() -> None:
    url = gfs_wind.build_gfs_filter_url(date(2026, 8, 12), 6, 3)
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    assert parsed.scheme == "https"
    assert parsed.netloc == "nomads.ncep.noaa.gov"
    assert parsed.path == "/cgi-bin/filter_gfs_0p25.pl"
    assert query["file"] == ["gfs.t06z.pgrb2.0p25.f003"]
    assert query["lev_10_m_above_ground"] == ["on"]
    assert query["var_UGRD"] == ["on"]
    assert query["var_VGRD"] == ["on"]
    assert query["leftlon"] == [str(gfs_wind.GFS_BOUNDS.west)]
    assert query["rightlon"] == [str(gfs_wind.GFS_BOUNDS.east)]
    assert query["toplat"] == [str(gfs_wind.GFS_BOUNDS.north)]
    assert query["bottomlat"] == [str(gfs_wind.GFS_BOUNDS.south)]
    assert query["dir"] == ["/gfs.20260812/06/atmos"]


def test_cycle_candidates_prioritize_latest_same_day_cycles_first() -> None:
    candidates = gfs_wind.cycle_candidates(datetime(2026, 8, 12, 10, 15, tzinfo=timezone.utc))
    assert candidates[:4] == [
        (date(2026, 8, 12), 18),
        (date(2026, 8, 12), 12),
        (date(2026, 8, 12), 6),
        (date(2026, 8, 12), 0),
    ]
    assert candidates[4:] == [
        (date(2026, 8, 11), 18),
        (date(2026, 8, 11), 12),
        (date(2026, 8, 11), 6),
        (date(2026, 8, 11), 0),
    ]


def test_normalize_grid_values_reorients_to_south_north_west_east() -> None:
    values = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]

    assert gfs_wind._normalize_grid_values(  # noqa: SLF001
        values, 3, 2, i_scans_negatively=False, j_scans_positively=False
    ) == [4.0, 5.0, 6.0, 1.0, 2.0, 3.0]
    assert gfs_wind._normalize_grid_values(  # noqa: SLF001
        values, 3, 2, i_scans_negatively=True, j_scans_positively=True
    ) == [3.0, 2.0, 1.0, 6.0, 5.0, 4.0]


@pytest.mark.asyncio
async def test_gfs_wind_endpoint_returns_normalized_canary_frame(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_get_gfs_wind_frame(
        redis: object, forecast_hour: int
    ) -> GfsWindFrameResponse:
        assert forecast_hour == 2
        return GfsWindFrameResponse(
            source=gfs_wind.GFS_SOURCE_NAME,
            model=gfs_wind.GFS_MODEL_NAME,
            run_time=datetime(2026, 8, 12, 6, 0, tzinfo=timezone.utc),
            forecast_time=datetime(2026, 8, 12, 8, 0, tzinfo=timezone.utc),
            forecast_hour=2,
            bounds=GfsWindGridBounds(west=73.5, south=11.0, east=79.5, north=19.5),
            width=3,
            height=2,
            dx=0.25,
            dy=0.25,
            latitudes=[11.0, 11.25],
            longitudes=[73.5, 73.75, 74.0],
            u=[1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
            v=[-1.0, -2.0, -3.0, -4.0, -5.0, -6.0],
            data_status="LIVE",
            fetched_at=datetime(2026, 8, 12, 6, 5, tzinfo=timezone.utc),
        )

    monkeypatch.setattr(gfs_wind, "get_gfs_wind_frame", fake_get_gfs_wind_frame)

    response = await client.get("/api/v1/environment/wind/gfs", params={"forecast_hour": 2})
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "NOAA GFS"
    assert body["forecast_hour"] == 2
    assert body["bounds"] == {"west": 73.5, "south": 11.0, "east": 79.5, "north": 19.5}
    assert body["u"] == [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
    assert body["v"] == [-1.0, -2.0, -3.0, -4.0, -5.0, -6.0]
