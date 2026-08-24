"""Walks the remote KGIS administrative-boundary source bucket to enumerate
every Karnataka village with its KGIS code.

This is a *separate* MinIO server from the app's own object storage (see
`Settings.kgis_source_minio_endpoint` in `app/core/config.py`) — the same one
`frontend/src/app/api/datasets/hobli-villages/route.ts` already reads from,
just walked here from scratch (every district/taluk/hobli) instead of
resolving one already-known name at a time. The folder-name cleaning logic
mirrors that route's sibling `_folder-match.ts` helper (`clean_folder_name`
below == `cleanFolderName` there) so the two stay readable side by side.

Bucket layout: `Administrative Boundaries/india/<state>/Districts/<folder>/
SubDistricts/<folder>/Hoblis/<folder>/<hobli>_village_boundaries.geojson` —
one GeoJSON per hobli, containing every village in it as a feature. Folder
name variants (`SubDistricts/` vs `Sub_Districts/`, `Hoblis/` vs `Hoblies/`
etc.) are tried in the same order the frontend route already established.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

import aioboto3

from app.core.config import Settings

logger = logging.getLogger(__name__)

_SUBDISTRICT_FOLDER_VARIANTS = ("SubDistricts/", "Sub_Districts/")
_HOBLI_FOLDER_VARIANTS = ("Hoblis/", "Hoblies/", "hoblies/", "hoblis/")

# Candidate property keys tried in order — different source files use
# different schemas (see `village-cadastrals/route.ts`'s own fallback list).
_VILLAGE_CODE_KEYS = (
    "KGISVillageCode",
    "_parent_village_code",
    "UniqueVillageCode",
    "CensusVillageCode",
    "LGD_VillageCode",
    "LGDVillageCode",
    "village_code",
)
_VILLAGE_NAME_KEYS = (
    "KGISVillageName",
    "VillageName",
    "VILLAGE",
    "village_name",
    "Name",
    "NAME",
)


def clean_folder_name(name: str) -> str:
    """Strips a leading numeric code + separator (e.g. "17_Chikkamagaluru")
    and normalizes separators/case — mirrors
    `frontend/src/app/api/datasets/_folder-match.ts`'s `cleanFolderName`."""
    name = re.sub(r"^\d+[-_]", "", name)
    name = name.lower().replace("-", " ").replace("_", " ")
    name = name.replace("(", "").replace(")", "")
    return name.strip()


@dataclass(frozen=True, slots=True)
class KgisFolder:
    prefix: str
    display_name: str  # clean_folder_name'd


@dataclass(frozen=True, slots=True)
class KgisVillage:
    kgis_village_code: str
    village_name: str
    district: str
    taluk: str
    hobli: str


class KgisSourceClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._bucket = settings.kgis_source_bucket

    def client(self):
        """Async context manager yielding the boto3 S3 client for this
        source - use as `async with kgis_source_client.client() as s3:`."""
        session = aioboto3.Session()
        return session.client(
            "s3",
            endpoint_url=f"http://{self._settings.kgis_source_minio_endpoint}",
            aws_access_key_id=self._settings.kgis_source_minio_access_key,
            aws_secret_access_key=self._settings.kgis_source_minio_secret_key,
            region_name="geosphere",
        )

    async def _list_subfolders(self, s3, prefix: str) -> list[KgisFolder]:
        response = await s3.list_objects_v2(Bucket=self._bucket, Prefix=prefix, Delimiter="/")
        folders: list[KgisFolder] = []
        for entry in response.get("CommonPrefixes", []):
            folder_prefix = entry.get("Prefix", "")
            folder_name = folder_prefix.rstrip("/").split("/")[-1]
            folders.append(KgisFolder(prefix=folder_prefix, display_name=clean_folder_name(folder_name)))
        return folders

    async def _list_first_populated(
        self, s3, parent_prefix: str, variants: tuple[str, ...]
    ) -> list[KgisFolder]:
        for variant in variants:
            folders = await self._list_subfolders(s3, f"{parent_prefix}{variant}")
            if folders:
                return folders
        return []

    async def list_districts(self, s3, state: str) -> list[KgisFolder]:
        return await self._list_subfolders(s3, f"Administrative Boundaries/india/{state}/Districts/")

    async def list_taluks(self, s3, district_prefix: str) -> list[KgisFolder]:
        return await self._list_first_populated(s3, district_prefix, _SUBDISTRICT_FOLDER_VARIANTS)

    async def list_hoblis(self, s3, taluk_prefix: str) -> list[KgisFolder]:
        return await self._list_first_populated(s3, taluk_prefix, _HOBLI_FOLDER_VARIANTS)

    async def get_hobli_villages(
        self, s3, hobli_prefix: str, *, district: str, taluk: str, hobli: str
    ) -> list[KgisVillage]:
        """Finds the one `*village*.geojson` file directly under the hobli
        folder (not recursing into per-village cadastral subfolders — that's
        a different, much larger dataset this generator doesn't need) and
        returns every feature in it as a `KgisVillage`."""
        response = await s3.list_objects_v2(Bucket=self._bucket, Prefix=hobli_prefix, Delimiter="/")
        village_key = next(
            (
                obj["Key"]
                for obj in response.get("Contents", [])
                if "village" in obj["Key"].lower() and obj["Key"].lower().endswith(".geojson")
            ),
            None,
        )
        if village_key is None:
            logger.warning("No village boundaries file found under %s", hobli_prefix)
            return []

        obj = await s3.get_object(Bucket=self._bucket, Key=village_key)
        body = await obj["Body"].read()
        geojson = json.loads(body)

        villages: list[KgisVillage] = []
        for feature in geojson.get("features", []):
            props = feature.get("properties", {}) or {}
            code = next((str(props[k]) for k in _VILLAGE_CODE_KEYS if props.get(k)), None)
            name = next((str(props[k]) for k in _VILLAGE_NAME_KEYS if props.get(k)), None)
            if not code or not name:
                continue
            # Some sources suffix the code with a sub-parcel index (e.g.
            # "2403010001_1") - only the base village code is meaningful here.
            code = code.split("_")[0]
            villages.append(
                KgisVillage(
                    kgis_village_code=code,
                    village_name=name,
                    district=district,
                    taluk=taluk,
                    hobli=hobli,
                )
            )
        return villages
