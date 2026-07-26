"""Serialize FHIR resources for download as CSV or NDJSON.

CSV uses the same inferred, flattened columns the tabular viewer shows (so the
export matches what the user sees). NDJSON preserves full resource fidelity.
Both are generators so large exports stream rather than building one big string.
"""

from __future__ import annotations

import csv
import io
import json
from typing import Any, Dict, Iterable, Iterator, List

from app.services import schema


def _cell(value: Any) -> str:
    """Render one extracted value as a CSV cell."""
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=str)
    return str(value)


def rows_to_csv(resources: List[Dict[str, Any]], columns: Iterable[str]) -> Iterator[str]:
    """Yield CSV text (header first) for ``resources`` over ``columns``.

    ``columns`` are dotted paths like ``code.coding[0].display``; values are
    pulled with the same extractor the schema/table use.
    """
    columns = list(columns)
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    def flush() -> str:
        text = buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)
        return text

    writer.writerow(columns)
    yield flush()

    for resource in resources:
        writer.writerow([_cell(schema._extract_value_by_path(resource, c)) for c in columns])
        yield flush()


def rows_to_ndjson(resources: Iterable[Dict[str, Any]]) -> Iterator[str]:
    """Yield one JSON object per line, preserving the full resource."""
    for resource in resources:
        yield json.dumps(resource, default=str) + "\n"


def columns_for(resources: List[Dict[str, Any]]) -> List[str]:
    """Inferred column set for a CSV export (same logic as the schema sampler)."""
    return schema.infer_columns(resources)
