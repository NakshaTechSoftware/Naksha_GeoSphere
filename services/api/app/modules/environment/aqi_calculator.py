"""Official CPCB National Air Quality Index calculation.

The data.gov.in real-time feed does **not** include a published final AQI
value or a units field per record (confirmed against the live API — see
`cpcb_client.py`) — only raw pollutant concentrations. Per the project's
data-source rule, we never invent an ad-hoc formula: this module implements
the CPCB's own published National AQI methodology (sub-index breakpoint
table + "AQI = max of sub-indices", with the CPCB's own minimum-data rule),
nothing more.

Breakpoint table source: CPCB "National Air Quality Index" (2014),
concentration units as CPCB publishes them — µg/m³ for PM2.5, PM10, NO2,
O3, SO2, NH3; mg/m³ for CO. The real-time feed does not label units, so
this assumes the feed follows the same CPCB CAAQMS convention its
breakpoint table was published against; flagged as a known limitation
where documented.

CPCB's own rule: AQI is calculated only when sub-indices exist for **at
least 3 pollutants, including at least one of PM2.5 or PM10** — otherwise
publish nothing rather than a misleading partial figure. We apply the same
rule (`_MIN_POLLUTANTS`, `_REQUIRED_ANY_OF`).
"""

from __future__ import annotations

from app.modules.environment.schemas import AqiCategory

# (pollutant_key, [(conc_lo, conc_hi, aqi_lo, aqi_hi), ...] ascending)
# The final band's upper concentration is open-ended (capped at aqi_hi=500).
_BREAKPOINTS: dict[str, list[tuple[float, float, int, int]]] = {
    "PM2.5": [
        (0, 30, 0, 50),
        (30, 60, 50, 100),
        (60, 90, 100, 200),
        (90, 120, 200, 300),
        (120, 250, 300, 400),
        (250, 380, 400, 500),
    ],
    "PM10": [
        (0, 50, 0, 50),
        (50, 100, 50, 100),
        (100, 250, 100, 200),
        (250, 350, 200, 300),
        (350, 430, 300, 400),
        (430, 510, 400, 500),
    ],
    "NO2": [
        (0, 40, 0, 50),
        (40, 80, 50, 100),
        (80, 180, 100, 200),
        (180, 280, 200, 300),
        (280, 400, 300, 400),
        (400, 500, 400, 500),
    ],
    "O3": [
        (0, 50, 0, 50),
        (50, 100, 50, 100),
        (100, 168, 100, 200),
        (168, 208, 200, 300),
        (208, 748, 300, 400),
        (748, 1000, 400, 500),
    ],
    "CO": [
        (0, 1.0, 0, 50),
        (1.0, 2.0, 50, 100),
        (2.0, 10, 100, 200),
        (10, 17, 200, 300),
        (17, 34, 300, 400),
        (34, 50, 400, 500),
    ],
    "SO2": [
        (0, 40, 0, 50),
        (40, 80, 50, 100),
        (80, 380, 100, 200),
        (380, 800, 200, 300),
        (800, 1600, 300, 400),
        (1600, 2100, 400, 500),
    ],
    "NH3": [
        (0, 200, 0, 50),
        (200, 400, 50, 100),
        (400, 800, 100, 200),
        (800, 1200, 200, 300),
        (1200, 1800, 300, 400),
        (1800, 2400, 400, 500),
    ],
}

# Plausibility ceiling per pollutant (well above the top official breakpoint)
# used only to drop obviously bad sensor readings before they can distort a
# station's AQI — not a scientific limit, just a sanity guard.
_PLAUSIBLE_MAX: dict[str, float] = {key: bands[-1][1] * 2 for key, bands in _BREAKPOINTS.items()}

_MIN_POLLUTANTS = 3
_REQUIRED_ANY_OF = ("PM2.5", "PM10")

_CATEGORY_BY_AQI: list[tuple[int, AqiCategory]] = [
    (50, AqiCategory.GOOD),
    (100, AqiCategory.SATISFACTORY),
    (200, AqiCategory.MODERATE),
    (300, AqiCategory.POOR),
    (400, AqiCategory.VERY_POOR),
    (500, AqiCategory.SEVERE),
]


def category_for_aqi(aqi_value: int) -> AqiCategory:
    for ceiling, category in _CATEGORY_BY_AQI:
        if aqi_value <= ceiling:
            return category
    return AqiCategory.SEVERE


def is_plausible_value(pollutant: str, value: float) -> bool:
    ceiling = _PLAUSIBLE_MAX.get(pollutant)
    return value >= 0 and (ceiling is None or value <= ceiling)


def _sub_index(pollutant: str, concentration: float) -> float | None:
    bands = _BREAKPOINTS.get(pollutant)
    if bands is None:
        return None
    for conc_lo, conc_hi, aqi_lo, aqi_hi in bands:
        if conc_lo <= concentration <= conc_hi:
            if conc_hi == conc_lo:
                return float(aqi_lo)
            return ((aqi_hi - aqi_lo) / (conc_hi - conc_lo)) * (concentration - conc_lo) + aqi_lo
    last_lo, last_hi, aqi_lo, aqi_hi = bands[-1]
    if concentration > last_hi:
        return float(aqi_hi)  # cap at 500 rather than extrapolate past the published table
    return None  # negative/unparseable — caller should have filtered already


def calculate_cpcb_aqi(
    pollutant_averages: dict[str, float],
) -> tuple[int | None, AqiCategory | None]:
    """`pollutant_averages` maps CPCB pollutant keys (e.g. "PM2.5", "NO2")
    to their average concentration. Returns (aqi_value, aqi_category), or
    (None, None) if CPCB's own minimum-data rule isn't met."""
    sub_indices: dict[str, float] = {}
    for pollutant, value in pollutant_averages.items():
        if pollutant not in _BREAKPOINTS or not is_plausible_value(pollutant, value):
            continue
        sub_index = _sub_index(pollutant, value)
        if sub_index is not None:
            sub_indices[pollutant] = sub_index

    if len(sub_indices) < _MIN_POLLUTANTS:
        return None, None
    if not any(key in sub_indices for key in _REQUIRED_ANY_OF):
        return None, None

    aqi_value = round(max(sub_indices.values()))
    return aqi_value, category_for_aqi(aqi_value)
