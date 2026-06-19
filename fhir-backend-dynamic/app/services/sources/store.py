"""In-memory FHIR resource store backing file-based sources.

Parses an uploaded payload into individual FHIR resources, indexes them by
``resourceType``, and answers paginated searches / single reads in a shape that
mirrors what the live FHIR server path returns (a FHIR ``searchset`` Bundle).
"""

from __future__ import annotations

import json
import logging
from collections import OrderedDict
from typing import Any, Dict, List, Optional

from app.services import fhir

logger = logging.getLogger(__name__)

# Defensive limits so a pathological upload can't exhaust memory.
MAX_PAYLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_RESOURCES = 100_000


class FhirParseError(ValueError):
    """Raised when an uploaded payload cannot be interpreted as FHIR."""


def _is_resource(obj: Any) -> bool:
    return isinstance(obj, dict) and isinstance(obj.get("resourceType"), str)


def _extract_resources(obj: Any) -> List[Dict[str, Any]]:
    """Turn one parsed JSON value into a flat list of FHIR resources."""
    if _is_resource(obj):
        if obj.get("resourceType") == "Bundle":
            # Reuse the same Bundle-unwrapping the live path uses.
            return [r for r in fhir.entries(obj) if _is_resource(r)]
        return [obj]
    if isinstance(obj, list):
        return [r for r in obj if _is_resource(r)]
    return []


def parse_payload(data: bytes, *, filename: str = "") -> List[Dict[str, Any]]:
    """Parse raw upload bytes into FHIR resources.

    Accepts, in order of attempt:
      * a single FHIR resource (``{"resourceType": ...}``),
      * a FHIR Bundle (entries are unwrapped),
      * a JSON array of resources, and
      * NDJSON / JSON-lines (one resource - or Bundle - per line), the format
        produced by FHIR bulk-export (``$export``).

    Raises :class:`FhirParseError` with an actionable message on bad input.
    """
    if data is None or len(data) == 0:
        raise FhirParseError("Uploaded file is empty.")
    if len(data) > MAX_PAYLOAD_BYTES:
        raise FhirParseError(
            f"File is too large ({len(data)} bytes); limit is {MAX_PAYLOAD_BYTES} bytes."
        )

    try:
        text = data.decode("utf-8-sig")  # tolerate a UTF-8 BOM
    except UnicodeDecodeError as exc:
        raise FhirParseError(f"File is not valid UTF-8 text: {exc}") from exc

    stripped = text.strip()
    if not stripped:
        raise FhirParseError("Uploaded file contains only whitespace.")

    resources: List[Dict[str, Any]] = []
    whole_json_error: Optional[str] = None

    # 1) Try to parse the whole payload as a single JSON document.
    try:
        parsed = json.loads(stripped)
        resources = _extract_resources(parsed)
        if not resources:
            raise FhirParseError(
                "JSON parsed but contained no FHIR resources "
                "(expected a resource, a Bundle, or an array of resources)."
            )
    except json.JSONDecodeError as exc:
        whole_json_error = str(exc)

    # 2) Fall back to NDJSON / JSON-lines.
    if whole_json_error is not None:
        for lineno, line in enumerate(stripped.splitlines(), start=1):
            line = line.strip()
            if not line:
                continue
            try:
                parsed_line = json.loads(line)
            except json.JSONDecodeError as exc:
                raise FhirParseError(
                    f"Could not parse file as JSON or NDJSON. "
                    f"Line {lineno} is invalid JSON: {exc}"
                ) from exc
            extracted = _extract_resources(parsed_line)
            if not extracted:
                raise FhirParseError(
                    f"Line {lineno} is valid JSON but is not a FHIR resource."
                )
            resources.extend(extracted)

    if not resources:
        raise FhirParseError("No FHIR resources found in the uploaded file.")
    if len(resources) > MAX_RESOURCES:
        raise FhirParseError(
            f"File contains {len(resources)} resources; limit is {MAX_RESOURCES}."
        )

    logger.info("Parsed %d resources from upload %r", len(resources), filename)
    return resources


class InMemoryFhirStore:
    """Holds parsed resources indexed by type, with stable ordering."""

    def __init__(self, resources: List[Dict[str, Any]]):
        # Preserve insertion order per type; assign synthetic ids when missing
        # so every resource is addressable via ``read``.
        self._by_type: "OrderedDict[str, List[Dict[str, Any]]]" = OrderedDict()
        self._index: Dict[str, Dict[str, Dict[str, Any]]] = {}

        for resource in resources:
            rtype = resource.get("resourceType")
            if not isinstance(rtype, str):
                continue
            bucket = self._by_type.setdefault(rtype, [])
            type_index = self._index.setdefault(rtype, {})

            rid = resource.get("id")
            if not isinstance(rid, str) or not rid:
                rid = f"_idx-{len(bucket)}"
            # Disambiguate duplicate ids so reads stay deterministic.
            if rid in type_index:
                rid = f"{rid}-{len(bucket)}"
            bucket.append(resource)
            type_index[rid] = resource

    @classmethod
    def from_bytes(cls, data: bytes, *, filename: str = "") -> "InMemoryFhirStore":
        return cls(parse_payload(data, filename=filename))

    def resource_types(self) -> List[str]:
        return sorted(self._by_type.keys())

    def count(self, resource_type: str) -> int:
        return len(self._by_type.get(resource_type, []))

    def total(self) -> int:
        return sum(len(v) for v in self._by_type.values())

    def summary(self) -> Dict[str, int]:
        return {rt: len(items) for rt, items in self._by_type.items()}

    def search(self, resource_type: str, *, count: int = 50, offset: int = 0) -> Dict[str, Any]:
        items = self._by_type.get(resource_type, [])
        offset = max(0, offset)
        count = max(0, count)
        page = items[offset: offset + count] if count else []

        bundle: Dict[str, Any] = {
            "resourceType": "Bundle",
            "type": "searchset",
            "total": len(items),
            "entry": [{"resource": r} for r in page],
            "link": [],
        }
        has_next = offset + count < len(items)
        if has_next:
            bundle["link"].append(
                {"relation": "next", "offset": offset + count, "count": count}
            )
        if offset > 0:
            bundle["link"].append(
                {"relation": "prev", "offset": max(0, offset - count), "count": count}
            )
        return bundle

    def read(self, resource_type: str, resource_id: str) -> Optional[Dict[str, Any]]:
        return self._index.get(resource_type, {}).get(resource_id)
