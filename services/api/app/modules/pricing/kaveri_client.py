"""Async HTTP client for Karnataka's Kaveri Online Services guideline-value
("SR Rate") portal.

VERIFIED AGAINST THE LIVE PORTAL. The District → Taluk → Hobli → Village →
Road → Rate chain has been exercised against the real
`kaveri.karnataka.gov.in`, and Kaveri's responses use **camelCase** keys
inconsistently between endpoints (`districtCode`, `talukNamee`, `hoblinamee`/
`hoblicode`, `villagecode`, `roadcode`/`roadnamee`). All callers therefore
extract values case-insensitively (see `kaveri_location_resolver.extract_value`)
rather than assuming one casing. `KaveriUnavailableError` remains the single
seam where "the portal is down" and "an unexpected response shape came back"
both surface identically to callers.

Session handling mirrors the shape of the frontend's Bhoomi integration
(`frontend/src/app/api/land-records/_bhoomi.ts` / `rtc/route.ts`'s
`BhoomiSession`) — open once per orchestration call to seed cookies, then
issue the District → Taluk → Hobli → Village → Road → Rate chain against that
same session. The spec doesn't document a login/handshake endpoint, so
`open_session` just GETs the base URL, same as Bhoomi's `open()`.
"""

from __future__ import annotations

import time
import uuid
from decimal import Decimal
from typing import Any

import httpx

from app.modules.pricing.exceptions import KaveriUnavailableError

BASE_URL = "https://kaveri.karnataka.gov.in"

_TIMEOUT = httpx.Timeout(connect=5.0, read=15.0, write=5.0, pool=5.0)


def _dynamic_headers() -> dict[str, str]:
    """X1/X2 per the spec: a fresh timestamp + UUID on every individual
    request, not once per session."""
    return {"X1": str(int(time.time() * 1000)), "X2": str(uuid.uuid4())}


class KaveriSession:
    """One Kaveri portal session, reused across the whole District → Taluk →
    Hobli → Village → Road → Rate chain for a single lookup. Not reused
    across separate lookups — call `open()` again (or construct a new
    instance) per orchestration call, matching Bhoomi's per-request-open
    precedent rather than trying to pool/persist a session across requests.
    """

    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=BASE_URL,
            timeout=_TIMEOUT,
            headers={
                "User-Agent": "NakshaGeoSphere/1.0 (+pricing-module)",
                "Referer": f"{BASE_URL}/",
                "Origin": BASE_URL,
                "Content-Type": "application/json",
            },
        )

    async def __aenter__(self) -> KaveriSession:
        await self.open()
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self._client.aclose()

    async def open(self) -> None:
        """Seeds the session's cookie jar. httpx.AsyncClient persists
        Set-Cookie responses automatically across requests made on the same
        client instance, so nothing else needs to inspect/forward cookies
        manually the way Bhoomi's hand-rolled cookie jar does."""
        try:
            await self._client.get("/")
        except httpx.HTTPError as exc:
            raise KaveriUnavailableError(f"Failed to open Kaveri session: {exc}") from exc

    async def _post(self, path: str, payload: dict[str, Any]) -> Any:
        try:
            response = await self._client.post(path, json=payload, headers=_dynamic_headers())
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            raise KaveriUnavailableError(f"Kaveri request to {path} failed: {exc}") from exc
        except ValueError as exc:
            raise KaveriUnavailableError(f"Kaveri response from {path} was not valid JSON") from exc

    # --- Location hierarchy ------------------------------------------------

    async def get_districts(self) -> list[dict[str, Any]]:
        # Spec's documented payload for this one call is a serialized empty
        # Angular HttpHeaders object, not the location code the name implies —
        # taken verbatim since no district code exists yet at this step.
        payload = {
            "headers": {
                "normalizedNames": {},
                "lazyUpdate": None,
                "headers": {},
                "lazyInit": None,
            }
        }
        result = await self._post("/api/GetDistrictAsync", payload)
        return result if isinstance(result, list) else []

    async def get_taluks(self, district_code: str) -> list[dict[str, Any]]:
        result = await self._post("/api/GetTalukaAsync", {"districtCode": district_code})
        return result if isinstance(result, list) else []

    async def get_hoblis(self, taluk_code: str) -> list[dict[str, Any]]:
        result = await self._post("/api/GetHobliAsync", {"talukaCode": taluk_code})
        return result if isinstance(result, list) else []

    async def get_villages(self, hobli_code: str) -> list[dict[str, Any]]:
        result = await self._post("/api/GetVillageAsync", {"hobliCode": hobli_code})
        return result if isinstance(result, list) else []

    async def get_roads(self, village_code: str) -> list[dict[str, Any]]:
        """Returns e.g. [{"roadcode": 20013, "roadnamee": "Heggadahalli Village"}, ...]."""
        result = await self._post("/api/GetRoadDetailsAsync", {"villagecode": village_code})
        return result if isinstance(result, list) else []

    # --- Rates ---------------------------------------------------------

    async def get_vacant_rate(self, road_code: str) -> list[dict[str, Any]]:
        """Residential/non-agricultural SR Rate. Returns e.g.
        [{"propertytypename": "Residential", "rate": 7000, "openbuildratecode": 2707196}, ...]."""
        result = await self._post("/api/SearchVacantTypeRateDetails", {"roadcode": road_code})
        return result if isinstance(result, list) else []

    async def get_agricultural_rate(self, road_code: str) -> list[dict[str, Any]]:
        """Agricultural SR Rate for one road/locality. VERIFIED against the live
        portal (2026-08-24): this endpoint is keyed by **roadcode**, not
        villagecode — a village-keyed payload silently returns `[]` for every
        village, which is why agricultural rates previously always came back
        empty. Real response shape, e.g. for a Beltangadi taluk village:
        [{"villageCode": 26526, "roadcode": 67450, "propertytype": "Bagayat, Dry",
          "rate": 500000, "agrilandtypeid": 10, "rateagricode": 3669468}, ...].
        Note the response carries no unit field — see
        `app.modules.pricing.land_unit` for the documented per-acre convention
        this module assumes in its absence."""
        result = await self._post("/api/SearchAgriculturalPropertyType", {"roadcode": road_code})
        return result if isinstance(result, list) else []

    async def get_construction_rates(self, village_code: str) -> list[dict[str, Any]]:
        """Returns e.g. [{"floorid": 1, "description": "Ground Floor", "rate": 16963}, ...]."""
        result = await self._post("/api/ConstructionTypeRateDetails", {"villagecode": village_code})
        return result if isinstance(result, list) else []

    async def get_annexure_rules(self, village_code: str) -> list[dict[str, Any]]:
        """Returns e.g. [{"description": "Corner Property", "percentage": 10}, ...].
        The spec gives no explicit payload for this endpoint — assumed
        village-keyed like the construction/road lookups above; unverified."""
        result = await self._post("/api/GetNonAgriculturalAnnexurerules", {"villagecode": village_code})
        return result if isinstance(result, list) else []

    async def get_parking_rate(self, property_value: Decimal, parking_type_id: int) -> list[dict[str, Any]]:
        """Returns e.g. [{"propvaluefrom": 0, "propvalueto": 5000000, "value": 200000, "isfixed": true}, ...]."""
        payload = {"PropValue": float(property_value), "ParkingTypeId": parking_type_id}
        result = await self._post("/api/FlatParkingRateDetails", payload)
        return result if isinstance(result, list) else []

    async def get_floor_rates(self, village_code: str) -> list[dict[str, Any]]:
        """Apartment floor adjustment percentages (e.g. 6th floor: 0.5%). The
        spec gives no explicit payload for this endpoint either — assumed
        village-keyed; unverified."""
        result = await self._post("/api/Getapartmentfloorrates", {"villagecode": village_code})
        return result if isinstance(result, list) else []

    async def get_special_amenities(self, village_code: str) -> list[dict[str, Any]]:
        """The spec gives no explicit payload for this endpoint — assumed
        village-keyed; unverified."""
        result = await self._post("/api/GetRateApartmentSpecialAmenities", {"villagecode": village_code})
        return result if isinstance(result, list) else []
