"""
app/services/file_store.py

Parses a FHIR Bundle (JSON) or NDJSON file into a flat in-memory resource map
and emulates the FHIR search Bundle interface used by the rest of the pipeline.

Supports the same shape as a live FHIR Bundle:
  { "resourceType": "Bundle", "total": N, "entry": [...], "link": [] }

Simple param filtering is applied (see FileStore.query).
"""
from __future__ import annotations

import json
import logging
from typing import Dict, List, Any, Optional
from urllib.parse import urlparse, parse_qs

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

def parse_fhir_file(content: bytes) -> Dict[str, List[Dict]]:
    """
    Parse raw file bytes into a flat resource map.

    Accepted formats:
    - Bundle JSON  (single JSON object with "resourceType": "Bundle" and "entry": [...])
    - NDJSON       (one JSON resource per line)

    Returns:
        { "Patient": [...], "Observation": [...], ... }
    """
    text = content.decode("utf-8", errors="replace").strip()
    resource_map: Dict[str, List[Dict]] = {}

    # ---- Try Bundle JSON first ----
    if text.startswith("{"):
        try:
            data = json.loads(text)
            if data.get("resourceType") == "Bundle":
                for entry in data.get("entry", []):
                    resource = entry.get("resource") if isinstance(entry, dict) else None
                    if not resource and isinstance(entry, dict) and entry.get("resourceType"):
                        resource = entry  # inline resource
                    if isinstance(resource, dict) and resource.get("resourceType"):
                        rt = resource["resourceType"]
                        resource_map.setdefault(rt, []).append(resource)
                logger.info(
                    f"Parsed Bundle JSON: {sum(len(v) for v in resource_map.values())} resources "
                    f"across {len(resource_map)} types"
                )
                return resource_map
            else:
                # Single resource (e.g., a Patient)
                rt = data.get("resourceType")
                if rt:
                    resource_map[rt] = [data]
                    return resource_map
        except json.JSONDecodeError:
            pass  # Fall through to NDJSON

    # ---- Try NDJSON ----
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            resource = json.loads(line)
            rt = resource.get("resourceType")
            if rt:
                resource_map.setdefault(rt, []).append(resource)
        except json.JSONDecodeError:
            logger.debug(f"Skipping unparseable NDJSON line: {line[:80]}")

    logger.info(
        f"Parsed NDJSON: {sum(len(v) for v in resource_map.values())} resources "
        f"across {len(resource_map)} types"
    )
    return resource_map


# ---------------------------------------------------------------------------
# FileStore
# ---------------------------------------------------------------------------

class FileStore:
    """
    In-memory store for resources parsed from an uploaded file.

    .query() returns a fake FHIR Bundle dict compatible with fhir.entries()
    and fhir.next_link() so the rest of the pipeline works unchanged.
    """

    def __init__(self, resource_map: Dict[str, List[Dict]]):
        self._map = resource_map

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def resource_counts(self) -> Dict[str, int]:
        return {rt: len(resources) for rt, resources in self._map.items()}

    def all_resources(self, resource_type: str) -> List[Dict]:
        return self._map.get(resource_type, [])

    # ------------------------------------------------------------------
    # FHIR Bundle emulation
    # ------------------------------------------------------------------

    def query(self, url: str, params: Dict[str, Any]) -> Dict:
        """
        Emulate a FHIR search response for the given URL + params.

        Supported params (subset used by existing pipeline):
            _count            int, page size (default 50)
            _getpagesoffset   int, start offset (default 0)
            subject           "Patient/<id>" — filter by patient reference
            patient           "Patient/<id>" — alternative spelling
            _summary          "count" — return total-only bundle

        Unsupported FHIR params (e.g. _sort, birthdate, _has) are silently
        ignored; the entire resource list for that type is returned.
        """
        resource_type = self._extract_resource_type(url)
        all_res = self._map.get(resource_type, [])

        # _summary=count — total only, no entries
        if params.get("_summary") == "count":
            return {
                "resourceType": "Bundle",
                "type": "searchset",
                "total": len(all_res),
                "entry": [],
                "link": [],
            }

        # Patient reference filtering
        patient_id = self._extract_patient_id(params)
        if patient_id and resource_type != "Patient":
            all_res = self._filter_by_patient(all_res, patient_id)

        # Pagination
        try:
            count = int(params.get("_count", 50))
        except (ValueError, TypeError):
            count = 50
        try:
            offset = int(params.get("_getpagesoffset", 0))
        except (ValueError, TypeError):
            offset = 0

        page = all_res[offset: offset + count]
        has_next = (offset + count) < len(all_res)

        links = []
        if has_next:
            next_offset = offset + count
            links.append({
                "relation": "next",
                "url": f"{url}?_count={count}&_getpagesoffset={next_offset}",
            })

        return {
            "resourceType": "Bundle",
            "type": "searchset",
            "total": len(all_res),
            "entry": [{"resource": r} for r in page],
            "link": links,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_resource_type(url: str) -> str:
        """Pull resource type from the last path segment of the URL."""
        path = urlparse(url).path.rstrip("/")
        return path.split("/")[-1]

    @staticmethod
    def _extract_patient_id(params: Dict[str, Any]) -> Optional[str]:
        """Return bare patient ID from subject/patient params, or None."""
        ref = params.get("subject") or params.get("patient")
        if not ref:
            return None
        if isinstance(ref, str) and ref.startswith("Patient/"):
            return ref.split("/", 1)[1]
        return str(ref) if ref else None

    @staticmethod
    def _filter_by_patient(
        resources: List[Dict], patient_id: str
    ) -> List[Dict]:
        """Keep only resources that reference the given patient ID."""
        filtered = []
        for r in resources:
            for field in ("subject", "patient"):
                ref = r.get(field)
                if isinstance(ref, dict):
                    ref_str = ref.get("reference", "")
                    bare_id = ref_str.replace("Patient/", "") if ref_str.startswith("Patient/") else ref_str
                    if bare_id == patient_id:
                        filtered.append(r)
                        break
        return filtered
