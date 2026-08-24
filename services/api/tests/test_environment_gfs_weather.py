from __future__ import annotations

from datetime import date
from urllib.parse import parse_qs, urlparse

from app.modules.environment import gfs_weather


def test_build_gfs_filter_url_covers_india_subregion_with_all_fields() -> None:
    url = gfs_weather.build_gfs_filter_url(date(2026, 8, 12), 6, 3)
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    assert parsed.scheme == "https"
    assert parsed.netloc == "nomads.ncep.noaa.gov"
    assert parsed.path == "/cgi-bin/filter_gfs_0p25.pl"
    assert query["file"] == ["gfs.t06z.pgrb2.0p25.f003"]
    assert query["dir"] == ["/gfs.20260812/06/atmos"]

    # All-India subregion (west 65 / east 100 / south 5 / north 39).
    assert query["leftlon"] == ["65.0"]
    assert query["rightlon"] == ["100.0"]
    assert query["bottomlat"] == ["5.0"]
    assert query["toplat"] == ["39.0"]

    # One combined GRIB subset carries wind, temperature, rain and clouds.
    assert query["var_UGRD"] == ["on"]
    assert query["var_VGRD"] == ["on"]
    assert query["var_TMP"] == ["on"]
    assert query["var_PRATE"] == ["on"]
    assert query["var_TCDC"] == ["on"]
    assert query["lev_10_m_above_ground"] == ["on"]
    assert query["lev_2_m_above_ground"] == ["on"]
    assert query["lev_surface"] == ["on"]
    assert query["lev_entire_atmosphere"] == ["on"]


def test_cycle_candidates_are_utc_and_descending() -> None:
    from datetime import datetime, timezone

    candidates = gfs_weather.cycle_candidates(
        datetime(2026, 8, 12, 10, 15, tzinfo=timezone.utc)
    )
    assert candidates[0] == (date(2026, 8, 12), 18)
    # Descending by freshness, 4 cycles per day.
    assert all(
        (candidates[i][0], candidates[i][1]) >= (candidates[i + 1][0], candidates[i + 1][1])
        for i in range(len(candidates) - 1)
    )
