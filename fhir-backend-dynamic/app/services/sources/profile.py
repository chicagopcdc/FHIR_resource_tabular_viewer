"""Dataset profiling: what is actually in a loaded set of FHIR resources.

Answers the question a researcher asks before using a dataset at all: which
fields are populated, how much they vary, and which values dominate. For each
column this reports completeness (share of resources where the field has a
value), the number of distinct values, and the most common values with counts.

The pure function here works over any list of resources. Disk-backed stores
override it with SQL aggregation so the same numbers can be produced over
millions of rows without loading them into memory.
"""

from __future__ import annotations

import json
from collections import Counter
from typing import Any, Dict, Iterable, List, Optional

from app.services import schema

# Long values are collapsed in the top-value list so one giant blob of JSON
# cannot dominate the display.
MAX_VALUE_CHARS = 120


def normalize_value(value: Any) -> Optional[str]:
    """Render one extracted value for counting, or None when it is absent.

    Empty strings, empty lists and empty objects count as absent: for
    completeness purposes an empty array is not a populated field.
    """
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
    elif isinstance(value, bool):
        text = "true" if value else "false"
    elif isinstance(value, (int, float)):
        text = str(value)
    elif isinstance(value, (list, dict)):
        if not value:
            return None
        text = json.dumps(value, default=str, sort_keys=True)
    else:
        text = str(value)
    # Truncate every rendered value, not just structured ones, so one long
    # string cannot blow up the display.
    if len(text) > MAX_VALUE_CHARS:
        text = text[: MAX_VALUE_CHARS - 3] + "..."
    return text


def profile_column(resources: Iterable[Dict[str, Any]], path: str, *, top_n: int = 5) -> Dict[str, Any]:
    """Completeness, distinct count and top values for one dotted path."""
    counter: Counter = Counter()
    populated = 0
    total = 0

    for resource in resources:
        total += 1
        rendered = normalize_value(schema._extract_value_by_path(resource, path))
        if rendered is None:
            continue
        populated += 1
        counter[rendered] += 1

    return {
        "path": path,
        "total": total,
        "populated": populated,
        "completeness": (populated / total) if total else 0.0,
        "distinct": len(counter),
        # Ties break on the value itself, matching the SQL path's ORDER BY, so
        # both implementations return the same list for the same data.
        "top_values": [
            {"value": v, "count": c}
            for v, c in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))[:top_n]
        ],
    }


def profile_resources(
    resources: List[Dict[str, Any]],
    columns: Optional[List[str]] = None,
    *,
    top_n: int = 5,
    max_columns: int = 25,
) -> List[Dict[str, Any]]:
    """Profile every column across ``resources``, most complete first."""
    if not resources:
        return []
    if columns is None:
        columns = schema.infer_columns(resources)[:max_columns]
    else:
        columns = list(columns)[:max_columns]

    profiles = [profile_column(resources, c, top_n=top_n) for c in columns]
    # Surface the fields a user can actually rely on first.
    profiles.sort(key=lambda p: (-p["completeness"], p["path"]))
    return profiles
